"use client";

import React, { useState } from "react";
import {
  Link as LinkIcon,
  Copy,
  Check,
  Globe,
  Lock,
  Flame,
  Clock,
  Trash2,
} from "lucide-react";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";

export interface ShareLinkItem {
  id: string;
  slug: string;
  file_name: string;
  byte_size: number;
  download_count: number;
  max_downloads: number | null;
  is_single_use: boolean;
  is_password_protected: boolean;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  xurl_short_url?: string | null;
  xurl_status?: string | null;
}

interface LinksTableProps {
  initialLinks: ShareLinkItem[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function LinksTable({ initialLinks }: LinksTableProps) {
  const [links, setLinks] = useState<ShareLinkItem[]>(initialLinks);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [linkToDelete, setLinkToDelete] = useState<ShareLinkItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const copyToClipboard = (text: string, slug: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const handleDeleteConfirm = async () => {
    if (!linkToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      // Nuclear permanent deletion via DELETE endpoint
      const res = await fetch(`/api/share/${linkToDelete.slug}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setLinks((prev) => prev.filter((l) => l.id !== linkToDelete.id));
        setLinkToDelete(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error || "Failed to delete share link");
      }
    } catch (err) {
      console.error("Failed to delete share link:", err);
      setDeleteError("Network error deleting share link");
    } finally {
      setIsDeleting(false);
    }
  };

  const appUrl = typeof window !== "undefined" ? window.location.origin : "https://gphost.eu.cc";

  if (links.length === 0) {
    return (
      <div className="p-10 text-center rounded-2xl border border-border bg-card shadow-2xs text-muted-foreground">
        <LinkIcon className="w-9 h-9 mx-auto mb-2.5 opacity-30" />
        <p className="text-sm font-medium text-foreground">No active share links</p>
        <p className="text-xs mt-0.5">Create a share link from your files to share them with others.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden">
      <div className="divide-y divide-border">
        {links.map((link) => {
          const directUrl = `${appUrl}/f/${link.slug}`;

          return (
            <div
              key={link.id}
              className="p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-muted/40 transition"
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground text-sm truncate max-w-sm">
                    {link.file_name}
                  </span>
                  <span className="text-xs text-muted-foreground">({formatBytes(link.byte_size)})</span>
                </div>

                {/* URL and Badges */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                    /f/{link.slug}
                  </span>

                  {link.is_single_use && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                      <Flame className="w-3 h-3" />
                      <span>Single-Use</span>
                    </span>
                  )}

                  {link.is_password_protected && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      <Lock className="w-3 h-3" />
                      <span>Protected</span>
                    </span>
                  )}

                  <span className="text-muted-foreground">
                    Downloads:{" "}
                    <strong className="text-foreground">
                      {link.download_count}
                      {link.max_downloads ? ` / ${link.max_downloads}` : " (unlimited)"}
                    </strong>
                  </span>

                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>
                      {link.expires_at ? new Date(link.expires_at).toLocaleDateString() : "Never"}
                    </span>
                  </span>
                </div>

                {/* XURL Alias if active */}
                {link.xurl_short_url && (
                  <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 pt-1">
                    <Globe className="w-3.5 h-3.5" />
                    <span className="font-mono text-[11px]">{link.xurl_short_url}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                <button
                  onClick={() => copyToClipboard(directUrl, link.slug)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-xs font-medium text-foreground transition cursor-pointer"
                >
                  {copiedSlug === link.slug ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedSlug === link.slug ? "Copied" : "Copy"}</span>
                </button>

                {link.xurl_short_url && (
                  <button
                    onClick={() => copyToClipboard(link.xurl_short_url!, `xurl-${link.slug}`)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 text-xs font-medium transition cursor-pointer"
                  >
                    {copiedSlug === `xurl-${link.slug}` ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>Short Link</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setDeleteError(null);
                    setLinkToDelete(link);
                  }}
                  className="p-2 rounded-lg text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                  title="Delete link"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation Modal for Nuclear Share Link Deletion */}
      <ConfirmationModal
        isOpen={Boolean(linkToDelete)}
        onClose={() => !isDeleting && setLinkToDelete(null)}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
        title="Delete Share Link?"
        description={
          <div className="space-y-2">
            <p>
              Are you sure you want to delete the share link for{" "}
              <strong className="text-foreground">{linkToDelete?.file_name}</strong>?
            </p>
            <p className="font-mono text-[11px] bg-muted/60 p-1.5 rounded border border-border text-foreground truncate">
              /f/{linkToDelete?.slug}
            </p>
            <p className="text-[11px] text-rose-600 dark:text-rose-400">
              This will permanently revoke access. Anyone with this link will immediately be unable to download the file.
            </p>
            {deleteError && (
              <p className="text-xs text-red-500 font-medium bg-red-500/10 p-2 rounded border border-red-500/20">
                {deleteError}
              </p>
            )}
          </div>
        }
        confirmText="Yes, Delete Link"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}
