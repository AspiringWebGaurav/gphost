"use client";

import React, { useState } from "react";
import {
  Search,
  Filter,
  Trash2,
  AlertTriangle,
  Loader2,
  X,
  Clock,
  CheckCircle,
  Share2,
  FileText,
  Image as ImageIcon,
  Archive,
  Film,
  Music,
} from "lucide-react";

export interface AdminFileItem {
  id: string;
  sanitized_name: string;
  byte_size: number;
  mime_type: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  owner_email: string;
  active_shares_count: number;
}

interface AdminFileAuditProps {
  initialFiles: AdminFileItem[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function getFileIcon(mime: string) {
  if (mime.startsWith("image/")) return <ImageIcon className="w-4 h-4 text-sky-400" />;
  if (mime.startsWith("video/")) return <Film className="w-4 h-4 text-purple-400" />;
  if (mime.startsWith("audio/")) return <Music className="w-4 h-4 text-pink-400" />;
  if (mime.includes("zip") || mime.includes("tar") || mime.includes("rar") || mime.includes("gzip"))
    return <Archive className="w-4 h-4 text-amber-400" />;
  return <FileText className="w-4 h-4 text-neutral-400" />;
}

export function AdminFileAudit({ initialFiles }: AdminFileAuditProps) {
  const [files, setFiles] = useState<AdminFileItem[]>(initialFiles);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Deletion Modal
  const [deletingFile, setDeletingFile] = useState<AdminFileItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const filteredFiles = files.filter((f) => {
    const matchesSearch =
      f.sanitized_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.owner_email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || f.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleForceDelete = async () => {
    if (!deletingFile) return;
    setIsDeleting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`/api/admin/files/${deletingFile.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to force delete file");
      }

      // Update state locally
      setFiles((prev) =>
        prev.map((f) =>
          f.id === deletingFile.id
            ? { ...f, status: "DELETE_PENDING", active_shares_count: 0 }
            : f
        )
      );

      setActionSuccess(
        `File successfully transitioned to DELETE_PENDING. Storage quota reclaimed (${data.quota_action}).`
      );
      setTimeout(() => {
        setDeletingFile(null);
        setActionSuccess(null);
      }, 1200);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Deletion failed");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {actionError && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by filename or owner email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-background border border-border rounded-xl pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-background border border-border rounded-xl px-3 py-1.5 text-xs text-muted-foreground">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-transparent border-none text-xs text-foreground focus:outline-none cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="UPLOADING">UPLOADING</option>
            <option value="EXPIRING">EXPIRING</option>
            <option value="EXPIRED">EXPIRED</option>
            <option value="DELETE_PENDING">DELETE_PENDING</option>
            <option value="PURGED">PURGED</option>
          </select>
        </div>
      </div>

      {/* Files Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Shares</th>
                <th className="px-4 py-3">Expires At</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-muted-foreground">
              {filteredFiles.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-muted-foreground">
                    No files found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredFiles.map((file) => {
                  const isDeletable =
                    file.status !== "DELETE_PENDING" && file.status !== "PURGED";

                  return (
                    <tr key={file.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0 text-foreground">
                            {getFileIcon(file.mime_type)}
                          </div>
                          <div className="min-w-0 max-w-[200px]">
                            <div className="font-medium text-foreground truncate" title={file.sanitized_name}>
                              {file.sanitized_name}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono truncate">
                              {file.mime_type}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span className="text-foreground font-mono text-[11px]">
                          {file.owner_email}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        {file.status === "ACTIVE" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                            <CheckCircle className="w-3 h-3" />
                            ACTIVE
                          </span>
                        )}
                        {file.status === "UPLOADING" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">
                            <Clock className="w-3 h-3" />
                            UPLOADING
                          </span>
                        )}
                        {file.status === "EXPIRING" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                            <Clock className="w-3 h-3" />
                            EXPIRING
                          </span>
                        )}
                        {file.status === "EXPIRED" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20">
                            EXPIRED
                          </span>
                        )}
                        {file.status === "DELETE_PENDING" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                            DELETE_PENDING
                          </span>
                        )}
                        {file.status === "PURGED" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-muted/60 text-muted-foreground/60 border border-border">
                            PURGED
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px] text-foreground">
                        {formatBytes(file.byte_size)}
                      </td>

                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Share2 className="w-3 h-3 text-muted-foreground" />
                          {file.active_shares_count}
                        </span>
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                        {file.expires_at
                          ? new Date(file.expires_at).toLocaleDateString()
                          : "Permanent"}
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                        {new Date(file.created_at).toLocaleDateString()}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {isDeletable ? (
                          <button
                            onClick={() => {
                              setDeletingFile(file);
                              setActionError(null);
                              setActionSuccess(null);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 text-muted-foreground font-medium text-[11px] transition border border-border cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Force Delete</span>
                          </button>
                        ) : (
                          <span className="text-muted-foreground/60 text-[11px] italic">
                            Purging
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Force Delete Confirmation Modal */}
      {deletingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-xs">
          <div className="bg-card border border-border text-card-foreground rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-red-500" />
                <h3 className="text-sm font-semibold text-foreground">
                  Force Delete File
                </h3>
              </div>
              <button
                onClick={() => setDeletingFile(null)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
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

            <div className="p-3.5 bg-muted/40 rounded-xl border border-border/80 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">File:</span>
                <span className="text-foreground font-medium truncate max-w-[220px]">
                  {deletingFile.sanitized_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Size:</span>
                <span className="text-foreground font-mono">
                  {formatBytes(deletingFile.byte_size)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Owner:</span>
                <span className="text-foreground font-mono">
                  {deletingFile.owner_email}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current Status:</span>
                <span className="text-amber-600 dark:text-amber-400 font-mono">{deletingFile.status}</span>
              </div>
            </div>

            <p className="text-muted-foreground text-[11px] leading-relaxed">
              This action atomically reclaims the owner&apos;s storage quota according to the authoritative accounting matrix, revokes all active share links, and schedules the physical R2 object for purging while preserving active 90-second download claim leases.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={() => setDeletingFile(null)}
                disabled={isDeleting}
                className="px-3.5 py-1.5 rounded-xl text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleForceDelete}
                disabled={isDeleting}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium transition cursor-pointer disabled:opacity-50"
              >
                {isDeleting && <Loader2 className="w-3 h-3 animate-spin" />}
                <span>Confirm Force Deletion</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
