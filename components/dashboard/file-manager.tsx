"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  File as FileIcon,
  Trash2,
  Share2,
  Info,
  Clock,
  Copy,
  Check,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  Lock,
  Globe,
  Sparkles,
} from "lucide-react";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";

export interface SafeFileItem {
  id: string;
  filename: string;
  sanitized_name: string;
  byte_size: number;
  mime_type: string;
  status: string;
  expiry_preset?: string;
  expires_at: string | null;
  created_at: string;
}

interface FileManagerProps {
  initialFiles: SafeFileItem[];
  initialTotalCount: number;
  initialTotalPages: number;
  canCreatePermanent?: boolean;
  isPremium?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return "Permanent";
  const date = new Date(expiresAt);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();

  if (diffMs <= 0) return "Expired";
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const diffHours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

  if (diffDays > 0) {
    return `${diffDays}d ${diffHours}h left`;
  }
  return `${diffHours}h left`;
}

export function FileManager({
  initialFiles,
  initialTotalCount,
  initialTotalPages,
  canCreatePermanent = false,
  isPremium = false,
}: FileManagerProps) {
  const [files, setFiles] = useState<SafeFileItem[]>(initialFiles);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sortBy, setSortBy] = useState<"created_at" | "byte_size" | "sanitized_name" | "expires_at">("created_at");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [loading, setLoading] = useState(false);

  // Modals state
  const [selectedFileForDetails, setSelectedFileForDetails] = useState<SafeFileItem | null>(null);
  const [selectedFileForShare, setSelectedFileForShare] = useState<SafeFileItem | null>(null);
  const [selectedFileForDelete, setSelectedFileForDelete] = useState<SafeFileItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Share form state
  const [shareExpiresIn, setShareExpiresIn] = useState<"24h" | "7d" | "30d" | "90d" | "never">("30d");
  const [shareMaxDownloads, setShareMaxDownloads] = useState<string>("");
  const [shareIsSingleUse, setShareIsSingleUse] = useState<boolean>(false);
  const [sharePassword, setSharePassword] = useState<string>("");
  const [shareCustomSlug, setShareCustomSlug] = useState<string>("");
  const [shareEnableXurl, setShareEnableXurl] = useState<boolean>(true);
  const [creatingShare, setCreatingShare] = useState<boolean>(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareResult, setShareResult] = useState<{
    slug?: string;
    shareUrl: string;
    expires_at?: string | null;
    is_custom_slug?: boolean;
    is_premium?: boolean;
    xurl?: { shortUrl?: string; status: string; error?: string };
  } | null>(null);
  const [copiedDirect, setCopiedDirect] = useState(false);
  const [copiedXurl, setCopiedXurl] = useState(false);

  // Fetch paginated files with server-side query
  const fetchFiles = useCallback(
    async (p: number, q: string, cat: string, sort: string, order: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: p.toString(),
          pageSize: "20",
          q,
          category: cat,
          sortBy: sort,
          sortOrder: order,
        });
        const res = await fetch(`/api/files?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setFiles(data.files);
          setTotalCount(data.totalCount);
          setTotalPages(data.totalPages);
          setPage(data.page);
        }
      } catch (err) {
        console.error("Failed to fetch files:", err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Trigger search on query / filter change with debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      fetchFiles(1, searchQuery, category, sortBy, sortOrder);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery, category, sortBy, sortOrder, fetchFiles]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchFiles(newPage, searchQuery, category, sortBy, sortOrder);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedFileForDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/files/${selectedFileForDelete.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        // Refresh page
        fetchFiles(page, searchQuery, category, sortBy, sortOrder);
        setSelectedFileForDelete(null);
      }
    } catch (err) {
      console.error("Failed to delete file:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFileForShare) return;

    setCreatingShare(true);
    setShareError(null);
    try {
      const maxDownloadsNum = shareIsSingleUse
        ? 1
        : shareMaxDownloads.trim()
        ? parseInt(shareMaxDownloads.trim(), 10)
        : null;

      const payload: Record<string, unknown> = {
        fileId: selectedFileForShare.id,
        expiresInPreset: shareExpiresIn,
        expiresIn: shareExpiresIn,
        maxDownloads: maxDownloadsNum,
        isSingleUse: shareIsSingleUse,
        password: sharePassword.trim() || undefined,
        shortenWithXurl: shareEnableXurl,
        enableXurl: shareEnableXurl,
      };

      if (shareCustomSlug.trim()) {
        payload.customSlug = shareCustomSlug.trim();
      }

      const res = await fetch("/api/share/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setShareError(data.error || "Failed to create share link");
        return;
      }

      const shareData = data.share || data;
      setShareResult({
        slug: shareData.slug || data.slug,
        shareUrl: shareData.shareUrl || data.shareUrl || "",
        expires_at: shareData.expires_at || data.expires_at,
        is_custom_slug: shareData.is_custom_slug || data.is_custom_slug,
        is_premium: shareData.is_premium || data.is_premium,
        xurl: shareData.xurl || data.xurl,
      });
    } catch (err) {
      console.error("Failed to create share link:", err);
      setShareError("Network error creating share link");
    } finally {
      setCreatingShare(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search files by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl border border-border overflow-x-auto">
          {["all", "images", "documents", "media", "archives"].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition whitespace-nowrap ${
                category === cat
                  ? "bg-background text-foreground shadow-2xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Sort Dropdown & Order Toggle */}
        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) =>
              setSortBy(
                e.target.value as
                  | "created_at"
                  | "byte_size"
                  | "sanitized_name"
                  | "expires_at"
              )
            }
            className="px-2.5 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:border-blue-500"
          >
            <option value="created_at">Date</option>
            <option value="byte_size">Size</option>
            <option value="sanitized_name">Name</option>
            <option value="expires_at">Expiry</option>
          </select>

          <button
            type="button"
            onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
            className="px-2.5 py-2 rounded-xl bg-background border border-border text-xs text-muted-foreground hover:text-foreground transition font-mono uppercase"
            title="Toggle sort order"
          >
            {sortOrder}
          </button>
        </div>
      </div>

      {/* Files List / Table Container */}
      <div className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-10 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            <span className="text-xs">Loading files...</span>
          </div>
        ) : files.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            <FileIcon className="w-9 h-9 mx-auto mb-2.5 opacity-30" />
            <p className="text-sm font-medium text-foreground">No files found</p>
            <p className="text-xs mt-0.5">Try a different search or upload a new file.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {files.map((file) => (
              <div
                key={file.id}
                className="p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/40 transition group"
              >
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <FileIcon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground truncate max-w-sm sm:max-w-md">
                      {file.sanitized_name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span>{formatBytes(file.byte_size)}</span>
                      <span>&bull;</span>
                      <span className="truncate max-w-[120px]">{file.mime_type}</span>
                      <span>&bull;</span>
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {formatExpiry(file.expires_at)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <button
                    onClick={() => setSelectedFileForDetails(file)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition text-xs flex items-center gap-1"
                    title="View file details"
                  >
                    <Info className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Details</span>
                  </button>

                  <button
                    onClick={() => {
                      setSelectedFileForShare(file);
                      setShareResult(null);
                      setShareError(null);
                      setShareCustomSlug("");
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition shadow-xs cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share</span>
                  </button>

                  <button
                    onClick={() => setSelectedFileForDelete(file)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition"
                    title="Delete file"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Bar (Pinned Bottom) */}
        {totalPages > 1 && (
          <div className="p-2.5 sm:p-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground bg-muted/20 shrink-0">
            <div>
              Page <span className="font-semibold text-foreground">{page}</span> of{" "}
              <span className="font-semibold text-foreground">{totalPages}</span> ({totalCount} files)
            </div>

            <div className="flex items-center gap-1.5">
              <button
                disabled={page <= 1}
                onClick={() => handlePageChange(page - 1)}
                className="p-1 rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => handlePageChange(page + 1)}
                className="p-1 rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* FILE DETAILS MODAL */}
      {selectedFileForDetails && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-card border border-border p-6 shadow-2xl relative space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-500" />
                <span>File Details</span>
              </h3>
              <button
                onClick={() => setSelectedFileForDetails(null)}
                className="text-muted-foreground hover:text-foreground transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <div className="text-muted-foreground mb-0.5">Filename</div>
                <div className="font-mono text-foreground break-all">{selectedFileForDetails.sanitized_name}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-muted-foreground mb-0.5">File Size</div>
                  <div className="text-foreground font-semibold">
                    {formatBytes(selectedFileForDetails.byte_size)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">MIME Type</div>
                  <div className="text-foreground font-mono truncate">
                    {selectedFileForDetails.mime_type}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-muted-foreground mb-0.5">Status</div>
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    {selectedFileForDetails.status}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Uploaded On</div>
                  <div className="text-foreground">
                    {new Date(selectedFileForDetails.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
              <div>
                <div className="text-muted-foreground mb-0.5">Expiration</div>
                <div className="text-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>
                    {selectedFileForDetails.expires_at
                      ? `${new Date(selectedFileForDetails.expires_at).toLocaleString()} (${formatExpiry(
                          selectedFileForDetails.expires_at
                        )})`
                      : "Permanent Storage (Never Expire)"}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-border flex justify-end">
              <button
                onClick={() => setSelectedFileForDetails(null)}
                className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-xs font-semibold text-foreground transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SHARE MODAL */}
      {selectedFileForShare && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-card border border-border p-6 shadow-2xl relative space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Share2 className="w-4 h-4 text-blue-500" />
                <span>Share File</span>
              </h3>
              <button
                onClick={() => setSelectedFileForShare(null)}
                className="text-muted-foreground hover:text-foreground transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {shareResult ? (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>Share link active! Anyone with this link can access the file.</span>
                </div>

                {/* Synced Expiration & Metadata Card */}
                <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      <span>Synced Expiration:</span>
                    </span>
                    <span className="font-semibold text-foreground font-mono">
                      {formatExpiry(shareResult.expires_at || null)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1.5 border-t border-border/60">
                    <span>Target &amp; Short Link Sync:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      <span>Synchronized Lifecycle</span>
                    </span>
                  </div>
                </div>

                {/* Direct Link */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-medium text-foreground">Direct Link</label>
                      {shareResult.is_custom_slug && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                          Custom Slug
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">Primary Link</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={shareResult.shareUrl || (shareResult as { share?: { shareUrl?: string } }).share?.shareUrl || ""}
                      className="flex-1 px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground font-mono select-all"
                    />
                    <button
                      onClick={() => {
                        const url = shareResult.shareUrl || (shareResult as { share?: { shareUrl?: string } }).share?.shareUrl || "";
                        if (url) {
                          navigator.clipboard.writeText(url);
                          setCopiedDirect(true);
                          setTimeout(() => setCopiedDirect(false), 2000);
                        }
                      }}
                      className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                    >
                      {copiedDirect ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedDirect ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                </div>

                {/* XURL Shortlink */}
                {(shareResult.xurl?.shortUrl || (shareResult as { share?: { xurl?: { shortUrl?: string } } }).share?.xurl?.shortUrl) && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs font-medium text-foreground">Short Link</label>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                          Synced
                        </span>
                      </div>
                      <span className="text-[10px] text-blue-500 font-mono">xurl.eu.cc</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={shareResult.xurl?.shortUrl || (shareResult as { share?: { xurl?: { shortUrl?: string } } }).share?.xurl?.shortUrl || ""}
                        className="flex-1 px-3 py-2 rounded-xl bg-background border border-border text-xs text-blue-600 dark:text-blue-400 font-mono select-all"
                      />
                      <button
                        onClick={() => {
                          const shortUrl = shareResult.xurl?.shortUrl || (shareResult as { share?: { xurl?: { shortUrl?: string } } }).share?.xurl?.shortUrl;
                          if (shortUrl) {
                            navigator.clipboard.writeText(shortUrl);
                            setCopiedXurl(true);
                            setTimeout(() => setCopiedXurl(false), 2000);
                          }
                        }}
                        className="px-3 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-medium flex items-center gap-1.5 border border-border transition cursor-pointer"
                      >
                        {copiedXurl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedXurl ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-border flex justify-end">
                  <button
                    onClick={() => setSelectedFileForShare(null)}
                    className="px-4 py-2 rounded-xl bg-foreground text-background text-xs font-semibold hover:opacity-90 transition cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateShare} className="space-y-4">
                {/* Plan Detection Indicator */}
                {isPremium ? (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                      </span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                        <span>Premium Plan Detected</span>
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground font-medium">Custom slug unlocked</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/40 border border-border text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                      <span className="font-medium text-foreground">Standard Plan</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">Custom slugs require Premium</span>
                  </div>
                )}

                <div className="text-xs text-muted-foreground">
                  File: <span className="text-foreground font-medium">{selectedFileForShare.sanitized_name}</span>
                </div>

                {/* Expiry Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Link Expiration</label>
                  <select
                    value={shareExpiresIn}
                    onChange={(e) =>
                      setShareExpiresIn(
                        e.target.value as "24h" | "7d" | "30d" | "90d" | "never"
                      )
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:border-blue-500"
                  >
                    <option value="24h">24 Hours</option>
                    <option value="7d">7 Days</option>
                    <option value="30d">30 Days (Default)</option>
                    <option value="90d">90 Days</option>
                    {canCreatePermanent && <option value="never">Never Expire</option>}
                  </select>
                </div>

                {/* Custom Slug Option */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      <span>Custom Link Slug</span>
                      {isPremium ? (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                          PRO
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" />
                          <span>PRO ONLY</span>
                        </span>
                      )}
                    </label>
                    <span className="text-[10px] text-muted-foreground">
                      {isPremium ? "Letters, numbers, dashes" : "Upgrade to unlock"}
                    </span>
                  </div>

                  {isPremium ? (
                    <div className="space-y-1">
                      <div className="flex items-center rounded-xl bg-background border border-border focus-within:border-blue-500 transition overflow-hidden">
                        <span className="px-3 py-2 bg-muted/40 text-[11px] text-muted-foreground border-r border-border font-mono select-none">
                          /f/
                        </span>
                        <input
                          type="text"
                          placeholder="my-custom-slug"
                          value={shareCustomSlug}
                          onChange={(e) =>
                            setShareCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
                          }
                          maxLength={48}
                          className="w-full px-3 py-2 text-xs text-foreground bg-transparent focus:outline-none font-mono placeholder:text-muted-foreground"
                        />
                        {shareCustomSlug && (
                          <button
                            type="button"
                            onClick={() => setShareCustomSlug("")}
                            className="p-1.5 mr-1 text-muted-foreground hover:text-foreground"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {shareCustomSlug && (
                        <div className="text-[10px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5">
                          <span className="font-medium text-foreground">Sync Preview:</span>
                          <span className="font-mono text-blue-600 dark:text-blue-400">
                            gphost.eu.cc/f/{shareCustomSlug}
                          </span>
                          {shareEnableXurl && (
                            <>
                              <span className="text-muted-foreground">&bull;</span>
                              <span className="font-mono text-indigo-500 dark:text-indigo-400">
                                xurl.eu.cc/{shareCustomSlug}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center rounded-xl bg-muted/20 border border-border overflow-hidden opacity-60 cursor-not-allowed">
                      <span className="px-3 py-2 bg-muted/40 text-[11px] text-muted-foreground border-r border-border font-mono select-none">
                        /f/
                      </span>
                      <input
                        type="text"
                        disabled
                        placeholder="Upgrade to Premium to set custom slugs"
                        className="w-full px-3 py-2 text-xs text-muted-foreground bg-transparent focus:outline-none font-mono cursor-not-allowed"
                      />
                    </div>
                  )}
                </div>

                {/* Max Downloads */}
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Max Downloads (Optional)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Unlimited"
                    value={shareMaxDownloads}
                    onChange={(e) => setShareMaxDownloads(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                {/* Single Use Toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border">
                  <div>
                    <div className="text-xs font-medium text-foreground">Single-Use Link</div>
                    <div className="text-[11px] text-muted-foreground">Expires automatically after the first download</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={shareIsSingleUse}
                    onChange={(e) => setShareIsSingleUse(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                </div>

                {/* Password Protection */}
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Password (Optional)</span>
                  </label>
                  <input
                    type="password"
                    placeholder="Set a password for this link"
                    value={sharePassword}
                    onChange={(e) => setSharePassword(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* XURL Toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border">
                  <div>
                    <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-blue-500" />
                      <span>Shorten &amp; Sync Link</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">Creates a clean, synchronized xurl.eu.cc short link</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={shareEnableXurl}
                    onChange={(e) => setShareEnableXurl(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                </div>

                {shareError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
                    {shareError}
                  </div>
                )}

                <div className="pt-2 border-t border-border flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedFileForShare(null)}
                    className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-xs font-medium text-foreground transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingShare}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {creatingShare && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Create Link</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      <ConfirmationModal
        isOpen={Boolean(selectedFileForDelete)}
        onClose={() => !isDeleting && setSelectedFileForDelete(null)}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
        title="Delete File?"
        description={
          <div className="space-y-1.5">
            <p>
              Are you sure you want to delete{" "}
              <strong className="text-foreground">{selectedFileForDelete?.sanitized_name}</strong>?
            </p>
            <p className="text-[11px] text-muted-foreground">
              Your storage quota will be instantly restored and all share links for this file will stop working permanently.
            </p>
          </div>
        }
        confirmText="Yes, Delete File"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}
