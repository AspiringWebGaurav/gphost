"use client";

import React, { useState, useEffect } from "react";
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
  FileBox,
  HardDrive,
  RotateCw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

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
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Realtime Live Synchronization on profiles table (0 polling)
  useEffect(() => {
    const supabase = createClient();
    const channelName = `admin-users-live-${currentUserId}`;

    const existingChannel = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
    if (existingChannel) {
      supabase.removeChannel(existingChannel);
    }

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
        },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            const updated = payload.new as Partial<AdminUserProfile>;
            setUsers((prev) =>
              prev.map((u) =>
                u.id === updated.id
                  ? {
                      ...u,
                      ...updated,
                      quota_bytes: Number(updated.quota_bytes ?? u.quota_bytes),
                      storage_used_bytes: Number(updated.storage_used_bytes ?? u.storage_used_bytes),
                      reserved_bytes: Number(updated.reserved_bytes ?? u.reserved_bytes),
                    }
                  : u
              )
            );
          } else if (payload.eventType === "INSERT") {
            const inserted = payload.new as AdminUserProfile;
            setUsers((prev) => {
              if (prev.some((u) => u.id === inserted.id)) return prev;
              return [
                {
                  ...inserted,
                  quota_bytes: Number(inserted.quota_bytes),
                  storage_used_bytes: Number(inserted.storage_used_bytes),
                  reserved_bytes: Number(inserted.reserved_bytes),
                },
                ...prev,
              ];
            });
          } else if (payload.eventType === "DELETE") {
            const deleted = payload.old as { id: string };
            setUsers((prev) => prev.filter((u) => u.id !== deleted.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  // Edit Modal State
  const [editingUser, setEditingUser] = useState<AdminUserProfile | null>(null);
  const [editRole, setEditRole] = useState<"user" | "admin">("user");
  const [editStatus, setEditStatus] = useState<
    "pending" | "approved" | "rejected" | "revoked"
  >("approved");
  const [editCanPermanent, setEditCanPermanent] = useState(false);
  const [isUnlimitedQuota, setIsUnlimitedQuota] = useState(false);
  const [editQuotaMB, setEditQuotaMB] = useState(1024);
  const [isUnlimitedFiles, setIsUnlimitedFiles] = useState(true);
  const [editMaxFiles, setEditMaxFiles] = useState(10);
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
    setIsUnlimitedFiles(true);
    setEditMaxFiles(10);
    setActionError(null);
    setActionSuccess(null);
  };

  const closeEditModal = () => {
    setEditingUser(null);
    setActionError(null);
    setActionSuccess(null);
  };

  // Full-lifecycle robust status change (Approve, Revoke, Reject, Restore)
  const handleQuickStatusChange = async (
    target: AdminUserProfile,
    newStatus: "approved" | "rejected" | "revoked"
  ) => {
    const isTargetPermanentOwner =
      target.email.toLowerCase() === ownerEmail.toLowerCase();
    const isSelf = target.id === currentUserId;

    if (isTargetPermanentOwner) {
      alert("The permanent owner account cannot be modified.");
      return;
    }
    if (isSelf && (newStatus === "revoked" || newStatus === "rejected")) {
      alert("You cannot revoke or reject your own administrative account.");
      return;
    }

    if (newStatus === "revoked") {
      if (
        !confirm(
          `Are you sure you want to revoke access for ${target.email}? The user will be immediately logged out and forbidden from uploading files.`
        )
      ) {
        return;
      }
    } else if (newStatus === "rejected") {
      if (
        !confirm(`Are you sure you want to reject access for ${target.email}?`)
      ) {
        return;
      }
    }

    const previousStatus = target.status;
    setProcessingUserId(target.id);

    // Optimistic Update (0ms instant response)
    setUsers((prev) =>
      prev.map((u) => (u.id === target.id ? { ...u, status: newStatus } : u))
    );

    try {
      const res = await fetch(`/api/admin/users/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || `Failed to update status to ${newStatus}`);
      }

      setFeedbackToast(
        newStatus === "approved"
          ? `Access approved successfully for ${target.email}!`
          : newStatus === "revoked"
          ? `Access revoked for ${target.email}. Session terminated.`
          : `Access rejected for ${target.email}.`
      );
      setTimeout(() => setFeedbackToast(null), 4000);
    } catch (err: unknown) {
      // Rollback on error
      setUsers((prev) =>
        prev.map((u) => (u.id === target.id ? { ...u, status: previousStatus } : u))
      );
      alert(err instanceof Error ? err.message : "Failed to update user status");
    } finally {
      setProcessingUserId(null);
    }
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
      max_files?: number | null;
      role?: "user" | "admin";
      status?: "pending" | "approved" | "rejected" | "revoked";
      can_create_permanent?: boolean;
    } = {};

    if (newQuotaBytes !== editingUser.quota_bytes) {
      payload.quota_bytes = newQuotaBytes;
    }

    payload.max_files = isUnlimitedFiles ? null : editMaxFiles;

    if (editRole !== editingUser.role) {
      if (!isOwner) {
        setActionError("Only the platform owner can modify user roles.");
        setIsSubmitting(false);
        return;
      }
      if (isTargetPermanentOwner) {
        setActionError("The permanent owner role cannot be demoted.");
        setIsSubmitting(false);
        return;
      }
      if (isSelf) {
        setActionError("You cannot modify your own administrative role.");
        setIsSubmitting(false);
        return;
      }
      payload.role = editRole;
    }

    if (editStatus !== editingUser.status) {
      if (isTargetPermanentOwner) {
        setActionError("The permanent owner account status cannot be modified.");
        setIsSubmitting(false);
        return;
      }
      if (isSelf && editStatus !== "approved") {
        setActionError("Self-lockout protection: You cannot revoke or reject your own account.");
        setIsSubmitting(false);
        return;
      }
      payload.status = editStatus;
    }

    if (editCanPermanent !== editingUser.can_create_permanent) {
      payload.can_create_permanent = editCanPermanent;
    }

    if (Object.keys(payload).length === 0) {
      setActionError("No changes were made.");
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
        throw new Error(data.message || data.error || "Failed to update user profile");
      }

      // Update local state
      setUsers((prev) =>
        prev.map((u) => {
          if (u.id === editingUser.id) {
            return {
              ...u,
              role: payload.role !== undefined ? payload.role : u.role,
              status: payload.status !== undefined ? payload.status : u.status,
              quota_bytes:
                payload.quota_bytes !== undefined ? payload.quota_bytes : u.quota_bytes,
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
      }, 1200);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Feedback Notification */}
      {feedbackToast && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-xs flex items-center justify-between shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{feedbackToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackToast(null)}
            className="text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative max-w-sm w-full">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search email or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-background border border-border rounded-xl pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30 transition"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-background border border-border rounded-xl px-3 py-1.5 text-xs text-muted-foreground">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent border-none text-xs text-foreground focus:outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
              <option value="revoked">Revoked</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-background border border-border rounded-xl px-3 py-1.5 text-xs text-muted-foreground">
            <Shield className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-transparent border-none text-xs text-foreground focus:outline-none cursor-pointer"
            >
              <option value="all">All Roles</option>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Container: Responsive Cards on Mobile (< md), Full Table on Desktop (md+) */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xs">
        {/* MOBILE CARD VIEW (< md) */}
        <div className="md:hidden divide-y divide-border">
          {filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">
              No users matching criteria.
            </div>
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
                <div key={u.id} className="p-4 space-y-3">
                  {/* Top: Avatar, Name, Email, Badges */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center font-bold text-foreground overflow-hidden shrink-0 border border-border">
                        {u.avatar_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={u.avatar_url}
                            alt={u.email}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 font-semibold text-foreground text-xs truncate">
                          <span>{u.full_name || "Unnamed User"}</span>
                          {isPermanentOwner && (
                            <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate font-mono">
                          {u.email}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {u.role === "admin" ? (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                          <Shield className="w-2.5 h-2.5" />
                          Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                          User
                        </span>
                      )}

                      {u.status === "approved" && (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                          <CheckCircle className="w-2.5 h-2.5" />
                          Approved
                        </span>
                      )}
                      {u.status === "pending" && (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                          <Clock className="w-2.5 h-2.5" />
                          Pending
                        </span>
                      )}
                      {u.status === "rejected" && (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-medium bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20">
                          <XCircle className="w-2.5 h-2.5" />
                          Rejected
                        </span>
                      )}
                      {u.status === "revoked" && (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                          <Ban className="w-2.5 h-2.5" />
                          Revoked
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Middle: Quota Progress & Details */}
                  <div className="p-2.5 rounded-xl bg-muted/30 border border-border/60 space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between text-muted-foreground font-mono">
                      <span>Committed Storage</span>
                      <span className="font-semibold text-foreground">
                        {formatBytes(totalCommitted)} / {u.quota_bytes === -1 ? "Unlimited" : formatBytes(u.quota_bytes)}
                      </span>
                    </div>

                    {u.quota_bytes !== -1 && (
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            quotaPercent > 90
                              ? "bg-rose-500"
                              : quotaPercent > 75
                              ? "bg-amber-500"
                              : "bg-blue-500"
                          }`}
                          style={{ width: `${quotaPercent}%` }}
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
                      <span>Permanent links: {u.can_create_permanent ? <strong className="text-emerald-600 dark:text-emerald-400">Allowed</strong> : "Standard"}</span>
                      <span>Joined {new Date(u.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="flex items-center justify-end gap-2 pt-0.5">
                    {u.email.toLowerCase() !== ownerEmail.toLowerCase() &&
                      u.id !== currentUserId && (
                        <>
                          {u.status === "pending" && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleQuickStatusChange(u, "approved")}
                                disabled={processingUserId === u.id}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-[0.98] text-emerald-600 dark:text-emerald-400 font-semibold text-xs transition border border-emerald-500/25 cursor-pointer disabled:opacity-50"
                              >
                                {processingUserId === u.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                )}
                                <span>Approve</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleQuickStatusChange(u, "rejected")}
                                disabled={processingUserId === u.id}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 active:scale-[0.98] text-red-600 dark:text-red-400 font-medium text-xs transition border border-red-500/20 cursor-pointer disabled:opacity-50"
                              >
                                <XCircle className="w-3.5 h-3.5 text-red-500" />
                                <span>Reject</span>
                              </button>
                            </>
                          )}

                          {u.status === "approved" && (
                            <button
                              type="button"
                              onClick={() => handleQuickStatusChange(u, "revoked")}
                              disabled={processingUserId === u.id}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 active:scale-[0.98] text-rose-600 dark:text-rose-400 font-medium text-xs transition border border-rose-500/20 cursor-pointer disabled:opacity-50"
                            >
                              {processingUserId === u.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Ban className="w-3.5 h-3.5 text-rose-500" />
                              )}
                              <span>Revoke</span>
                            </button>
                          )}

                          {(u.status === "revoked" || u.status === "rejected") && (
                            <button
                              type="button"
                              onClick={() => handleQuickStatusChange(u, "approved")}
                              disabled={processingUserId === u.id}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-[0.98] text-emerald-600 dark:text-emerald-400 font-medium text-xs transition border border-emerald-500/25 cursor-pointer disabled:opacity-50"
                            >
                              {processingUserId === u.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <RotateCw className="w-3.5 h-3.5 text-emerald-500" />
                              )}
                              <span>Restore</span>
                            </button>
                          )}
                        </>
                      )}

                    <button
                      type="button"
                      onClick={() => openEditModal(u)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-medium text-xs transition border border-border cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Edit</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* DESKTOP TABLE VIEW (hidden on mobile, block on md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Committed / Quota</th>
                <th className="px-4 py-3">Permanent Links</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-muted-foreground">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted-foreground">
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
                    <tr key={u.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center font-bold text-foreground overflow-hidden shrink-0 border border-border">
                            {u.avatar_url ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={u.avatar_url}
                                alt={u.email}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 font-medium text-foreground truncate">
                              <span>{u.full_name || "Unnamed User"}</span>
                              {isPermanentOwner && (
                                <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate font-mono">
                              {u.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {u.role === "admin" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                            <Shield className="w-3 h-3" />
                            Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                            User
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {u.status === "approved" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                            <CheckCircle className="w-3 h-3" />
                            Approved
                          </span>
                        )}
                        {u.status === "pending" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                            <Clock className="w-3 h-3" />
                            Pending
                          </span>
                        )}
                        {u.status === "rejected" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20">
                            <XCircle className="w-3 h-3" />
                            Rejected
                          </span>
                        )}
                        {u.status === "revoked" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                            <Ban className="w-3 h-3" />
                            Revoked
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px]">
                        <div className="space-y-1 max-w-[140px]">
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span>{formatBytes(totalCommitted)}</span>
                            <span>{u.quota_bytes === -1 ? "∞" : formatBytes(u.quota_bytes)}</span>
                          </div>
                          {u.quota_bytes !== -1 && (
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  quotaPercent > 90
                                    ? "bg-rose-500"
                                    : quotaPercent > 75
                                    ? "bg-amber-500"
                                    : "bg-blue-500"
                                }`}
                                style={{ width: `${quotaPercent}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {u.can_create_permanent ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            Allowed
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Standard</span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Owner / Self accounts cannot be revoked or modified via quick actions */}
                          {u.email.toLowerCase() !== ownerEmail.toLowerCase() &&
                            u.id !== currentUserId && (
                              <>
                                {/* 1. PENDING USER ACTIONS: Approve or Reject */}
                                {u.status === "pending" && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleQuickStatusChange(u, "approved")}
                                      disabled={processingUserId === u.id}
                                      title="Approve user and grant access immediately"
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-[0.98] text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] transition border border-emerald-500/25 cursor-pointer shadow-2xs disabled:opacity-50"
                                    >
                                      {processingUserId === u.id ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <CheckCircle className="w-3 h-3 text-emerald-500" />
                                      )}
                                      <span>Approve</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleQuickStatusChange(u, "rejected")}
                                      disabled={processingUserId === u.id}
                                      title="Reject user request"
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 active:scale-[0.98] text-red-600 dark:text-red-400 font-medium text-[11px] transition border border-red-500/20 cursor-pointer shadow-2xs disabled:opacity-50"
                                    >
                                      <XCircle className="w-3 h-3 text-red-500" />
                                      <span>Reject</span>
                                    </button>
                                  </>
                                )}

                                {/* 2. APPROVED USER ACTIONS: Revoke */}
                                {u.status === "approved" && (
                                  <button
                                    type="button"
                                    onClick={() => handleQuickStatusChange(u, "revoked")}
                                    disabled={processingUserId === u.id}
                                    title="Revoke access and terminate session immediately"
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 active:scale-[0.98] text-rose-600 dark:text-rose-400 font-medium text-[11px] transition border border-rose-500/20 cursor-pointer shadow-2xs disabled:opacity-50"
                                  >
                                    {processingUserId === u.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Ban className="w-3 h-3 text-rose-500" />
                                    )}
                                    <span>Revoke</span>
                                  </button>
                                )}

                                {/* 3. REVOKED / REJECTED USER ACTIONS: Re-activate / Restore */}
                                {(u.status === "revoked" || u.status === "rejected") && (
                                  <button
                                    type="button"
                                    onClick={() => handleQuickStatusChange(u, "approved")}
                                    disabled={processingUserId === u.id}
                                    title="Re-activate access for this user"
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-[0.98] text-emerald-600 dark:text-emerald-400 font-medium text-[11px] transition border border-emerald-500/25 cursor-pointer shadow-2xs disabled:opacity-50"
                                  >
                                    {processingUserId === u.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <RotateCw className="w-3 h-3 text-emerald-500" />
                                    )}
                                    <span>Restore</span>
                                  </button>
                                )}
                              </>
                            )}
                          <button
                            type="button"
                            onClick={() => openEditModal(u)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground font-medium text-[11px] transition border border-border cursor-pointer shadow-2xs"
                          >
                            <Edit2 className="w-3 h-3 text-muted-foreground" />
                            <span>Edit</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* EDIT USER MODAL */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-xs">
          <div className="bg-card border border-border text-card-foreground rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <h3 className="text-sm font-semibold text-foreground">
                  Administer User Account
                </h3>
              </div>
              <button
                onClick={closeEditModal}
                className="text-muted-foreground hover:text-foreground transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4 text-xs overflow-y-auto">
              {/* Target info */}
              <div className="p-3 bg-muted/40 rounded-xl border border-border/80 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-medium">User:</span>
                  <span className="text-foreground font-semibold">
                    {editingUser.full_name || "Unnamed"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-medium">Email:</span>
                  <span className="text-foreground font-mono">{editingUser.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-medium">Committed Storage:</span>
                  <span className="text-foreground font-mono">
                    {formatBytes(
                      Number(editingUser.storage_used_bytes) +
                        Number(editingUser.reserved_bytes)
                    )}
                  </span>
                </div>
              </div>

              {actionError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              {actionSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{actionSuccess}</span>
                </div>
              )}

              {/* Status */}
              <div className="space-y-1.5">
                <label className="text-foreground font-medium">Account Status</label>
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
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30 disabled:opacity-50 cursor-pointer"
                >
                  <option value="approved">Approved</option>
                  <option value="pending">Pending Review</option>
                  <option value="rejected">Rejected</option>
                  <option value="revoked">Revoked</option>
                </select>
              </div>

              {/* Role (Owner Exclusive) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-foreground font-medium">System Role</label>
                  {!isOwner && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
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
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30 disabled:opacity-50 cursor-pointer"
                >
                  <option value="user">User (Standard Access)</option>
                  <option value="admin">Admin (Operational Authority)</option>
                </select>
              </div>

              {/* Max Active Files Limit */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-foreground font-medium flex items-center gap-1.5">
                    <FileBox className="w-3.5 h-3.5 text-purple-500" />
                    <span>Max Active Files Limit</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isUnlimitedFiles}
                      onChange={(e) => setIsUnlimitedFiles(e.target.checked)}
                      className="rounded border-border text-purple-600 focus:ring-purple-500"
                    />
                    <span>Unlimited Files</span>
                  </label>
                </div>

                {!isUnlimitedFiles && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={editMaxFiles}
                      onChange={(e) => setEditMaxFiles(Math.max(1, Number(e.target.value)))}
                      className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30 font-mono"
                    />
                    <span className="text-muted-foreground font-medium px-1">active files</span>
                  </div>
                )}
              </div>

              {/* Quota Management */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-foreground font-medium flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-blue-500" />
                    <span>Storage Quota</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isUnlimitedQuota}
                      onChange={(e) => setIsUnlimitedQuota(e.target.checked)}
                      className="rounded border-border text-purple-600 focus:ring-purple-500"
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
                      className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30 font-mono"
                    />
                    <span className="text-muted-foreground font-medium px-2">MB</span>
                  </div>
                )}
              </div>

              {/* Permanent Links Permission */}
              <div className="flex items-center justify-between p-3 bg-muted/40 rounded-xl border border-border/70">
                <div>
                  <div className="text-foreground font-medium">
                    Can Create Permanent Links
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Allows selecting &quot;Never Expire&quot; on upload
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={editCanPermanent}
                  onChange={(e) => setEditCanPermanent(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-purple-600 focus:ring-purple-500 cursor-pointer"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-muted-foreground hover:text-foreground transition font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium transition disabled:opacity-50 shadow-sm cursor-pointer"
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
