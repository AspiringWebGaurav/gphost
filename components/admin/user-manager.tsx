"use client";

import React, { useState } from "react";
import {
  Search,
  Filter,
  Shield,
  User,
  CheckCircle,
  XCircle,
  Clock,
  Ban,
  Edit2,
  X,
  AlertTriangle,
  Loader2,
  Crown,
} from "lucide-react";

export interface AdminUserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: "user" | "admin";
  status: "pending" | "approved" | "rejected" | "revoked";
  quota_bytes: number;
  storage_used_bytes: number;
  reserved_bytes: number;
  can_create_permanent: boolean;
  created_at: string;
}

interface UserManagerProps {
  initialUsers: AdminUserProfile[];
  currentUserId: string;
  isOwner: boolean;
  ownerEmail: string;
}

function formatBytes(bytes: number): string {
  if (bytes === -1) return "Unlimited";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function UserManager({
  initialUsers,
  currentUserId,
  isOwner,
  ownerEmail,
}: UserManagerProps) {
  const [users, setUsers] = useState<AdminUserProfile[]>(initialUsers);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // Edit Modal State
  const [editingUser, setEditingUser] = useState<AdminUserProfile | null>(null);
  const [editRole, setEditRole] = useState<"user" | "admin">("user");
  const [editStatus, setEditStatus] = useState<
    "pending" | "approved" | "rejected" | "revoked"
  >("approved");
  const [editCanPermanent, setEditCanPermanent] = useState(false);
  const [isUnlimitedQuota, setIsUnlimitedQuota] = useState(false);
  const [editQuotaMB, setEditQuotaMB] = useState(1024);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.full_name && u.full_name.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === "all" || u.status === statusFilter;
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesStatus && matchesRole;
  });

  const openEditModal = (target: AdminUserProfile) => {
    setEditingUser(target);
    setEditRole(target.role);
    setEditStatus(target.status);
    setEditCanPermanent(target.can_create_permanent);
    setIsUnlimitedQuota(target.quota_bytes === -1);
    setEditQuotaMB(
      target.quota_bytes === -1
        ? 1024
        : Math.round(target.quota_bytes / (1024 * 1024))
    );
    setActionError(null);
    setActionSuccess(null);
  };

  const closeEditModal = () => {
    setEditingUser(null);
    setActionError(null);
    setActionSuccess(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    const isTargetPermanentOwner =
      editingUser.email.toLowerCase() === ownerEmail.toLowerCase();
    const isSelf = editingUser.id === currentUserId;

    // Invariant check on quota
    const newQuotaBytes = isUnlimitedQuota ? -1 : editQuotaMB * 1024 * 1024;
    const totalCommitted =
      Number(editingUser.storage_used_bytes) + Number(editingUser.reserved_bytes);

    if (newQuotaBytes !== -1 && totalCommitted > newQuotaBytes) {
      setActionError(
        `Quota cannot be set lower than currently committed storage (${formatBytes(
          totalCommitted
        )}).`
      );
      setIsSubmitting(false);
      return;
    }

    // Build payload
    const payload: {
      quota_bytes?: number;
      role?: "user" | "admin";
      status?: "pending" | "approved" | "rejected" | "revoked";
      can_create_permanent?: boolean;
    } = {};

    if (newQuotaBytes !== editingUser.quota_bytes) {
      payload.quota_bytes = newQuotaBytes;
    }

    if (editStatus !== editingUser.status) {
      if (isTargetPermanentOwner && editStatus !== "approved") {
        setActionError("Permanent owner status cannot be modified.");
        setIsSubmitting(false);
        return;
      }
      if (isSelf && editStatus !== "approved") {
        setActionError("Self-lockout prevented: You cannot revoke your own account.");
        setIsSubmitting(false);
        return;
      }
      payload.status = editStatus;
    }

    if (editRole !== editingUser.role) {
      if (!isOwner) {
        setActionError("Owner authority required to modify admin roles.");
        setIsSubmitting(false);
        return;
      }
      if (isTargetPermanentOwner && editRole !== "admin") {
        setActionError("Permanent owner role cannot be demoted.");
        setIsSubmitting(false);
        return;
      }
      if (isSelf && editRole !== "admin") {
        setActionError("Self-demotion prevented: You cannot demote your own account.");
        setIsSubmitting(false);
        return;
      }
      payload.role = editRole;
    }

    if (editCanPermanent !== editingUser.can_create_permanent) {
      payload.can_create_permanent = editCanPermanent;
    }

    if (Object.keys(payload).length === 0) {
      closeEditModal();
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update user profile");
      }

      // Update local state
      setUsers((prev) =>
        prev.map((u) => {
          if (u.id === editingUser.id) {
            return {
              ...u,
              quota_bytes:
                payload.quota_bytes !== undefined
                  ? payload.quota_bytes
                  : u.quota_bytes,
              role: payload.role || u.role,
              status: payload.status || u.status,
              can_create_permanent:
                payload.can_create_permanent !== undefined
                  ? payload.can_create_permanent
                  : u.can_create_permanent,
            };
          }
          return u;
        })
      );

      setActionSuccess("User profile successfully updated.");
      setTimeout(() => {
        closeEditModal();
      }, 1000);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by email or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-neutral-400">
            <Filter className="w-3.5 h-3.5 text-neutral-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent border-none text-xs text-neutral-300 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-neutral-900">All Statuses</option>
              <option value="approved" className="bg-neutral-900">Approved</option>
              <option value="pending" className="bg-neutral-900">Pending</option>
              <option value="rejected" className="bg-neutral-900">Rejected</option>
              <option value="revoked" className="bg-neutral-900">Revoked</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-neutral-400">
            <Shield className="w-3.5 h-3.5 text-neutral-500" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-transparent border-none text-xs text-neutral-300 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-neutral-900">All Roles</option>
              <option value="user" className="bg-neutral-900">User</option>
              <option value="admin" className="bg-neutral-900">Admin</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-950/40 text-neutral-400 font-semibold">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Committed / Quota</th>
                <th className="px-4 py-3">Permanent Links</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-neutral-500">
                    No users matching criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isPermanentOwner =
                    u.email.toLowerCase() === ownerEmail.toLowerCase();
                  const totalCommitted =
                    Number(u.storage_used_bytes) + Number(u.reserved_bytes);
                  const quotaPercent =
                    u.quota_bytes === -1
                      ? 0
                      : Math.min(100, Math.round((totalCommitted / u.quota_bytes) * 100));

                  return (
                    <tr key={u.id} className="hover:bg-neutral-800/30 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center font-bold text-neutral-300 overflow-hidden shrink-0 border border-neutral-700">
                            {u.avatar_url ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={u.avatar_url}
                                alt={u.email}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User className="w-4 h-4 text-neutral-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 font-medium text-white truncate">
                              <span>{u.full_name || "Unnamed User"}</span>
                              {isPermanentOwner && (
                                <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              )}
                            </div>
                            <div className="text-[11px] text-neutral-500 truncate">
                              {u.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {u.role === "admin" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            <Shield className="w-3 h-3" />
                            Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-neutral-800 text-neutral-400">
                            User
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {u.status === "approved" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle className="w-3 h-3" />
                            Approved
                          </span>
                        )}
                        {u.status === "pending" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Clock className="w-3 h-3" />
                            Pending
                          </span>
                        )}
                        {u.status === "rejected" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                            <XCircle className="w-3 h-3" />
                            Rejected
                          </span>
                        )}
                        {u.status === "revoked" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-neutral-800 text-neutral-400 border border-neutral-700">
                            <Ban className="w-3 h-3" />
                            Revoked
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="space-y-1 max-w-[160px]">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-neutral-300 font-mono">
                              {formatBytes(totalCommitted)}
                            </span>
                            <span className="text-neutral-500 font-mono">
                              / {formatBytes(u.quota_bytes)}
                            </span>
                          </div>
                          {u.quota_bytes !== -1 && (
                            <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  quotaPercent > 90
                                    ? "bg-red-500"
                                    : quotaPercent > 70
                                    ? "bg-amber-500"
                                    : "bg-emerald-500"
                                }`}
                                style={{ width: `${quotaPercent}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {u.can_create_permanent ? (
                          <span className="text-emerald-400 font-medium">Enabled</span>
                        ) : (
                          <span className="text-neutral-500">Disabled</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-neutral-500 font-mono text-[11px]">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openEditModal(u)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white transition text-[11px] font-medium"
                        >
                          <Edit2 className="w-3 h-3" />
                          Manage
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-950/50">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-semibold text-white">
                  Manage User Account
                </h3>
              </div>
              <button
                onClick={closeEditModal}
                className="text-neutral-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
              {/* Target info */}
              <div className="p-3 bg-neutral-950/60 rounded-xl border border-neutral-800/80 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400 font-medium">User:</span>
                  <span className="text-white font-semibold">
                    {editingUser.full_name || "Unnamed"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400 font-medium">Email:</span>
                  <span className="text-neutral-300 font-mono">{editingUser.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400 font-medium">Committed Storage:</span>
                  <span className="text-neutral-300 font-mono">
                    {formatBytes(
                      Number(editingUser.storage_used_bytes) +
                        Number(editingUser.reserved_bytes)
                    )}
                  </span>
                </div>
              </div>

              {actionError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              {actionSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{actionSuccess}</span>
                </div>
              )}

              {/* Status */}
              <div className="space-y-1.5">
                <label className="text-neutral-300 font-medium">Account Status</label>
                <select
                  value={editStatus}
                  onChange={(e) =>
                    setEditStatus(
                      e.target.value as "pending" | "approved" | "rejected" | "revoked"
                    )
                  }
                  disabled={
                    editingUser.email.toLowerCase() === ownerEmail.toLowerCase() ||
                    editingUser.id === currentUserId
                  }
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-200 focus:outline-none focus:border-purple-500 disabled:opacity-50"
                >
                  <option value="approved">Approved</option>
                  <option value="pending">Pending Review</option>
                  <option value="rejected">Rejected</option>
                  <option value="revoked">Revoked</option>
                </select>
                {editingUser.email.toLowerCase() === ownerEmail.toLowerCase() && (
                  <p className="text-[11px] text-amber-400">
                    Permanent owner account status cannot be modified.
                  </p>
                )}
                {editingUser.id === currentUserId && (
                  <p className="text-[11px] text-neutral-500">
                    Self-lockout protection: You cannot revoke your own account.
                  </p>
                )}
              </div>

              {/* Role (Owner Exclusive) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-neutral-300 font-medium">System Role</label>
                  {!isOwner && (
                    <span className="text-[10px] text-amber-400/90 font-medium">
                      Owner-Only Authority
                    </span>
                  )}
                </div>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as "user" | "admin")}
                  disabled={
                    !isOwner ||
                    editingUser.email.toLowerCase() === ownerEmail.toLowerCase() ||
                    editingUser.id === currentUserId
                  }
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-200 focus:outline-none focus:border-purple-500 disabled:opacity-50"
                >
                  <option value="user">User (Standard Access)</option>
                  <option value="admin">Admin (Operational Authority)</option>
                </select>
                {!isOwner ? (
                  <p className="text-[11px] text-neutral-500">
                    Only the platform owner ({ownerEmail}) can promote or demote admin roles.
                  </p>
                ) : editingUser.email.toLowerCase() === ownerEmail.toLowerCase() ? (
                  <p className="text-[11px] text-amber-400">
                    Permanent owner role is immutable.
                  </p>
                ) : null}
              </div>

              {/* Quota Management */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-neutral-300 font-medium">Storage Quota</label>
                  <label className="flex items-center gap-1.5 text-neutral-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isUnlimitedQuota}
                      onChange={(e) => setIsUnlimitedQuota(e.target.checked)}
                      className="rounded border-neutral-700 bg-neutral-950 text-purple-600 focus:ring-purple-500"
                    />
                    <span>Unlimited Quota</span>
                  </label>
                </div>

                {!isUnlimitedQuota && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={1048576}
                      value={editQuotaMB}
                      onChange={(e) => setEditQuotaMB(Number(e.target.value))}
                      className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-200 focus:outline-none focus:border-purple-500 font-mono"
                    />
                    <span className="text-neutral-400 font-medium px-2">MB</span>
                  </div>
                )}
                <p className="text-[11px] text-neutral-500">
                  New quota must not be less than committed storage (
                  {formatBytes(
                    Number(editingUser.storage_used_bytes) +
                      Number(editingUser.reserved_bytes)
                  )}
                  ).
                </p>
              </div>

              {/* Permanent Links Permission */}
              <div className="flex items-center justify-between p-3 bg-neutral-950/40 rounded-xl border border-neutral-800/60">
                <div>
                  <div className="text-neutral-200 font-medium">
                    Can Create Permanent Links
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    Allows selecting &quot;Never Expire&quot; on upload
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={editCanPermanent}
                  onChange={(e) => setEditCanPermanent(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-700 bg-neutral-950 text-purple-600 focus:ring-purple-500 cursor-pointer"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-neutral-400 hover:text-white transition font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium transition disabled:opacity-50 shadow-lg shadow-purple-600/20"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
