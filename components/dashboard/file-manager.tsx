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
  AlertTriangle,
  LayoutGrid,
  List as ListIcon,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  FileText,
  Film,
  Archive,
  RotateCw,
  Download,
  AlertCircle,
  CheckCircle2,
  Flame,
  Zap,
  Activity,
  ExternalLink,
  EyeOff,
  MessageSquare,
  Lightbulb,
  QrCode,
  Send,
  Mail,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  formatTimeRemaining,
} from "@/lib/storage/expiry";
import { storageEvents } from "@/lib/storage/events";
import { downloadFilesAsZip } from "@/lib/storage/bundle-zip";
import { FileAnalyticsModal } from "@/components/dashboard/file-analytics-modal";

function getFileTypeDetails(mimeType: string, filename: string) {
  const lowerMime = (mimeType || "").toLowerCase();
  const lowerName = (filename || "").toLowerCase();

  if (lowerMime.includes("pdf") || lowerName.endsWith(".pdf")) {
    return {
      type: "pdf",
      label: "PDF",
      icon: FileText,
      color: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-500/10 border-rose-500/20",
    };
  }
  if (lowerMime.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/.test(lowerName)) {
    return {
      type: "image",
      label: "IMAGE",
      icon: ImageIcon,
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-500/10 border-purple-500/20",
    };
  }
  if (lowerMime.startsWith("video/") || lowerMime.startsWith("audio/") || /\.(mp4|mkv|webm|mov|mp3|wav|ogg)$/.test(lowerName)) {
    return {
      type: "media",
      label: "MEDIA",
      icon: Film,
      color: "text-sky-600 dark:text-sky-400",
      bg: "bg-sky-500/10 border-sky-500/20",
    };
  }
  if (
    lowerMime.includes("zip") ||
    lowerMime.includes("tar") ||
    lowerMime.includes("gzip") ||
    lowerMime.includes("compressed") ||
    /\.(zip|tar|gz|7z|rar)$/.test(lowerName)
  ) {
    return {
      type: "archive",
      label: "ARCHIVE",
      icon: Archive,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/10 border-amber-500/20",
    };
  }
  if (
    lowerMime.includes("text") ||
    lowerMime.includes("word") ||
    lowerMime.includes("document") ||
    /\.(doc|docx|txt|md|csv)$/.test(lowerName)
  ) {
    return {
      type: "document",
      label: "DOC",
      icon: FileText,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10 border-emerald-500/20",
    };
  }

  return {
    type: "file",
    label: "FILE",
    icon: FileIcon,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
  };
}

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

function formatExpiry(expiresAt: string | null, baseTime?: number): string {
  return formatTimeRemaining(expiresAt, baseTime);
}

export function FileManager({
  initialFiles,
  initialTotalCount,
  initialTotalPages,
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

  // Google Drive & Windows 11 View Mode: "grid" (default) or "list"
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("gphost_file_view_mode");
        if (saved === "grid" || saved === "list") {
          return saved;
        }
      } catch {}
    }
    return "grid";
  });

  const handleViewModeChange = (mode: "grid" | "list") => {
    setViewMode(mode);
    try {
      localStorage.setItem("gphost_file_view_mode", mode);
    } catch {}
  };

  // Live real-time ticker for dynamic expiration countdowns (35m -> 34m -> etc.)
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Modals state
  const [selectedFileForDetails, setSelectedFileForDetails] = useState<SafeFileItem | null>(null);
  const [selectedFileForShare, setSelectedFileForShare] = useState<SafeFileItem | null>(null);
  const [selectedFileForDelete, setSelectedFileForDelete] = useState<SafeFileItem | null>(null);
  const [selectedFileForAnalytics, setSelectedFileForAnalytics] = useState<SafeFileItem | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [zippingProgress, setZippingProgress] = useState<{ current: number; total: number; filename: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Share form state
  const [shareExpiresIn, setShareExpiresIn] = useState<string>("file_expiry");
  const [shareMaxDownloads, setShareMaxDownloads] = useState<string>("");
  const [shareIsSingleUse, setShareIsSingleUse] = useState<boolean>(false);
  const [shareBurnAfterPreview, setShareBurnAfterPreview] = useState<boolean>(false);
  const [shareDirectDownload, setShareDirectDownload] = useState<boolean>(false);
  const [shareDisablePreview, setShareDisablePreview] = useState<boolean>(false);
  const [shareRecipientNote, setShareRecipientNote] = useState<string>("");
  const [showRecipientNote, setShowRecipientNote] = useState<boolean>(false);
  const [sharePassword, setSharePassword] = useState<string>("");
  const [sharePasswordHint, setSharePasswordHint] = useState<string>("");
  const [shareCustomSlug, setShareCustomSlug] = useState<string>("");
  const [shareEnableXurl, setShareEnableXurl] = useState<boolean>(true);
  const [creatingShare, setCreatingShare] = useState<boolean>(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [showQrCode, setShowQrCode] = useState<boolean>(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState<boolean>(false);

  const handleOpenShare = (file: SafeFileItem) => {
    setSelectedFileForShare(file);
    setShareResult(null);
    setShareError(null);
    setShareCustomSlug("");
    setShareExpiresIn("file_expiry");
    setShareMaxDownloads("");
    setShareIsSingleUse(false);
    setShareBurnAfterPreview(false);
    setShareDirectDownload(false);
    setShareDisablePreview(false);
    setShareRecipientNote("");
    setShowRecipientNote(false);
    setSharePassword("");
    setSharePasswordHint("");
    setShareEnableXurl(true);
    setShowQrCode(false);
    setCopiedRaw(false);
    setCopiedDirect(false);
    setCopiedXurl(false);
    setCopiedMarkdown(false);
  };
  const [shareResult, setShareResult] = useState<{
    slug?: string;
    shareUrl: string;
    rawUrl?: string;
    expires_at?: string | null;
    max_downloads?: number | null;
    is_single_use?: boolean;
    burn_after_preview?: boolean;
    direct_download?: boolean;
    disable_preview?: boolean;
    recipient_note?: string | null;
    password_hint?: string | null;
    is_custom_slug?: boolean;
    is_premium?: boolean;
    xurl?: { shortUrl?: string; status: string; error?: string };
  } | null>(null);
  const [copiedDirect, setCopiedDirect] = useState(false);
  const [copiedXurl, setCopiedXurl] = useState(false);
  const [copiedRaw, setCopiedRaw] = useState(false);

  // Extend Expiry Modal State
  const [selectedFileForExtend, setSelectedFileForExtend] = useState<SafeFileItem | null>(null);
  const [extendPreset, setExtendPreset] = useState<string>("30d");
  const [isExtending, setIsExtending] = useState<boolean>(false);
  const [extendError, setExtendError] = useState<string | null>(null);

  // Direct Download State
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [activeDownload, setActiveDownload] = useState<{
    id: string;
    filename: string;
    progress: number;
    status: string;
    completed: boolean;
  } | null>(null);

  const handleDirectDownload = async (file: SafeFileItem) => {
    setDownloadingId(file.id);
    setActiveDownload({
      id: file.id,
      filename: file.sanitized_name,
      progress: 30,
      status: "Securing direct edge lease...",
      completed: false,
    });

    const t1 = setTimeout(() => {
      setActiveDownload((prev) =>
        prev && prev.id === file.id
          ? { ...prev, progress: 65, status: "Connecting to Cloudflare R2..." }
          : prev
      );
    }, 150);

    try {
      const res = await fetch(`/api/files/${file.id}/download`);
      clearTimeout(t1);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setActiveDownload(null);
        alert(errData.error || "Failed to download file");
        return;
      }
      const data = await res.json();
      if (data.downloadUrl) {
        setActiveDownload((prev) =>
          prev && prev.id === file.id
            ? { ...prev, progress: 90, status: "Dispatching stream to browser..." }
            : prev
        );

        const a = document.createElement("a");
        a.href = data.downloadUrl;
        a.download = file.sanitized_name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setActiveDownload((prev) =>
          prev && prev.id === file.id
            ? { ...prev, progress: 100, status: "Direct download active!", completed: true }
            : prev
        );

        setTimeout(() => {
          setActiveDownload((prev) => (prev && prev.id === file.id ? null : prev));
        }, 3200);
      }
    } catch (err) {
      clearTimeout(t1);
      console.error("Direct download failed:", err);
      setActiveDownload(null);
      alert("Network error starting download");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleExtendConfirm = async () => {
    if (!selectedFileForExtend) return;
    setIsExtending(true);
    setExtendError(null);
    try {
      const res = await fetch(`/api/files/${selectedFileForExtend.id}/extend`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: extendPreset }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to extend file expiry");
      }
      setFiles((prev) =>
        prev.map((f) =>
          f.id === selectedFileForExtend.id
            ? { ...f, status: data.file.status, expires_at: data.file.expires_at }
            : f
        )
      );
      setSelectedFileForExtend(null);
    } catch (err: unknown) {
      setExtendError(err instanceof Error ? err.message : "Failed to extend expiry");
    } finally {
      setIsExtending(false);
    }
  };

  const handleBatchZipDownload = async () => {
    const selectedFiles = files.filter((f) => selectedFileIds.has(f.id));
    if (selectedFiles.length === 0) return;

    try {
      await downloadFilesAsZip(
        selectedFiles.map((f) => ({
          id: f.id,
          name: f.sanitized_name,
          size: f.byte_size,
        })),
        `gphost-bundle-${Date.now()}.zip`,
        (progress) => {
          setZippingProgress(progress);
        }
      );
      setSelectedFileIds(new Set());
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to generate batch ZIP");
    } finally {
      setZippingProgress(null);
    }
  };

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
        const deletedId = selectedFileForDelete.id;
        const deletedSize = selectedFileForDelete.byte_size;
        setSelectedFileForDelete(null);
        fetchFiles(page, searchQuery, category, sortBy, sortOrder);
        storageEvents.emit("file:lifecycle", {
          fileId: deletedId,
          size: deletedSize,
          action: "deleted",
        });
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

    if (selectedFileForShare.expires_at && new Date(selectedFileForShare.expires_at).getTime() <= currentTime) {
      setShareError("This file has expired. Share links cannot be created for expired files.");
      return;
    }

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
        burnAfterPreview: shareBurnAfterPreview,
        directDownload: shareDirectDownload,
        disablePreview: shareDisablePreview,
        recipientNote: shareRecipientNote.trim() || undefined,
        password: sharePassword.trim() || undefined,
        passwordHint: sharePassword.trim() && sharePasswordHint.trim() ? sharePasswordHint.trim() : undefined,
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
        rawUrl: shareData.rawUrl || data.rawUrl || "",
        expires_at: shareData.expires_at || data.expires_at,
        max_downloads: shareData.max_downloads,
        is_single_use: shareData.is_single_use,
        burn_after_preview: shareData.burn_after_preview,
        direct_download: shareData.direct_download,
        disable_preview: shareData.disable_preview,
        recipient_note: shareData.recipient_note,
        password_hint: shareData.password_hint,
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

  const FOLDERS = [
    { id: "all", name: "All Files", count: totalCount },
    {
      id: "images",
      name: "Images",
      count: files.filter((f) => f.mime_type?.startsWith("image/")).length,
    },
    {
      id: "documents",
      name: "Documents",
      count: files.filter(
        (f) =>
          f.mime_type?.includes("pdf") ||
          f.mime_type?.includes("text") ||
          f.mime_type?.includes("document")
      ).length,
    },
    {
      id: "media",
      name: "Media",
      count: files.filter(
        (f) => f.mime_type?.startsWith("video/") || f.mime_type?.startsWith("audio/")
      ).length,
    },
    {
      id: "archives",
      name: "Archives",
      count: files.filter(
        (f) =>
          f.mime_type?.includes("zip") ||
          f.mime_type?.includes("tar") ||
          f.mime_type?.includes("compressed")
      ).length,
    },
  ];

  return (
    <div className="space-y-5">
      {/* 1. Suggested Folders Section (Google Drive & Windows 11 Style) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium px-0.5">
          <span className="flex items-center gap-1.5 font-semibold text-foreground">
            <Folder className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20" />
            <span>Suggested folders</span>
          </span>
          {category !== "all" && (
            <button
              onClick={() => setCategory("all")}
              className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1 font-medium"
            >
              <span>View all files</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
          {FOLDERS.map((f) => {
            const isSelected = category === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setCategory(f.id)}
                className={`p-3 rounded-2xl border text-left transition-all duration-150 flex items-center gap-2.5 cursor-pointer group select-none ${
                  isSelected
                    ? "bg-blue-500/10 border-blue-500/40 text-blue-600 dark:text-blue-400 shadow-2xs font-semibold ring-1 ring-blue-500/30"
                    : "bg-card hover:bg-muted/40 border-border text-foreground hover:border-border/80 shadow-2xs"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                  }`}
                >
                  {isSelected ? (
                    <FolderOpen className="w-4 h-4" />
                  ) : (
                    <Folder className="w-4 h-4 fill-current/20" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold truncate">{f.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {f.id === "all" ? `${totalCount} total` : `${f.count} shown`}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Windows 11 Breadcrumb & Search / View Switcher Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
        {/* Windows 11 Breadcrumb / Address Bar */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground font-mono select-none">
          <span className="flex items-center gap-1 text-foreground font-medium">
            <Folder className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20" />
            <span>Storage</span>
          </span>
          <span>/</span>
          <span className="text-blue-600 dark:text-blue-400 font-semibold capitalize">
            {category === "all" ? "All Files" : category}
          </span>
        </div>

        {/* Search, Sort, and View Switcher */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 sm:justify-end">
          {/* Search Input */}
          <div className="relative w-full sm:max-w-xs">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-7 py-1.5 rounded-xl bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2">
            {/* Sort Dropdown & Order Toggle */}
            <div className="flex items-center gap-1">
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
                className="px-2.5 py-1.5 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="created_at">Date</option>
                <option value="byte_size">Size</option>
                <option value="sanitized_name">Name</option>
                <option value="expires_at">Expiry</option>
              </select>

              <button
                type="button"
                onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
                className="px-2 py-1.5 rounded-xl bg-background border border-border text-xs text-muted-foreground hover:text-foreground transition font-mono uppercase cursor-pointer"
                title="Toggle sort order"
              >
                {sortOrder}
              </button>
            </div>

            {/* Google Drive View Mode Switcher [ ≡ List | ⊞ Grid ] */}
            <div className="flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-xl border border-border">
              <button
                onClick={() => handleViewModeChange("list")}
                title="List view"
                className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
                  viewMode === "list"
                    ? "bg-background text-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ListIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleViewModeChange("grid")}
                title="Grid view"
                className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
                  viewMode === "grid"
                    ? "bg-background text-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Section Title */}
      <div className="flex items-center justify-between text-xs text-muted-foreground font-medium px-0.5 pt-1">
        <span className="font-semibold text-foreground">
          {category === "all" ? "Suggested files" : `${category.charAt(0).toUpperCase() + category.slice(1)} files`}
        </span>
        <span>{files.length} {files.length === 1 ? "file" : "files"}</span>
      </div>

      {/* Batch Selection Toolbar */}
      {selectedFileIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-xs text-foreground shadow-sm animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {selectedFileIds.size} {selectedFileIds.size === 1 ? "file" : "files"} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleBatchZipDownload}
              disabled={zippingProgress !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition cursor-pointer shadow-xs disabled:opacity-50"
            >
              {zippingProgress ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>
                    Zipping {zippingProgress.current}/{zippingProgress.total}...
                  </span>
                </>
              ) : (
                <>
                  <Archive className="w-3.5 h-3.5" />
                  <span>Download ZIP ({selectedFileIds.size})</span>
                </>
              )}
            </button>
            <button
              onClick={() => setSelectedFileIds(new Set())}
              className="px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* 4. Files Container (Grid or List View) */}
      {loading ? (
        <div className="p-12 flex flex-col items-center justify-center gap-3 text-muted-foreground rounded-2xl border border-border bg-card shadow-2xs">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          <span className="text-xs">Loading files...</span>
        </div>
      ) : files.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-border bg-card shadow-2xs text-muted-foreground">
          <FileIcon className="w-9 h-9 mx-auto mb-2.5 opacity-30" />
          <p className="text-sm font-medium text-foreground">No files found</p>
          <p className="text-xs mt-0.5">
            {category !== "all"
              ? `No ${category} found in this category.`
              : "Upload files or try another search."}
          </p>
          {category !== "all" && (
            <button
              onClick={() => setCategory("all")}
              className="mt-3 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
            >
              Back to All Files
            </button>
          )}
        </div>
      ) : viewMode === "grid" ? (
        /* GRID / CARD VIEW (Google Drive & Windows 11 style) */
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
            {files.map((file) => {
              const isExpired =
                file.status === "EXPIRED" ||
                (file.expires_at !== null && new Date(file.expires_at).getTime() <= currentTime);
              const fileType = getFileTypeDetails(file.mime_type, file.sanitized_name);
              const FileTypeIcon = fileType.icon;
              return (
                <div
                  key={file.id}
                  className={`rounded-2xl border ${
                    isExpired ? "border-rose-500/35 bg-rose-500/[0.02]" : "border-border bg-card"
                  } p-3.5 shadow-2xs hover:shadow-md hover:border-border/80 transition-all duration-200 group flex flex-col justify-between`}
                >
                  {/* Card Top: Type badge & Name */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedFileIds.has(file.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          const next = new Set(selectedFileIds);
                          if (next.has(file.id)) next.delete(file.id);
                          else next.add(file.id);
                          setSelectedFileIds(next);
                        }}
                        className="w-3.5 h-3.5 rounded border-border text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                      />
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${fileType.bg} ${fileType.color}`}>
                        <FileTypeIcon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-semibold text-foreground truncate" title={file.sanitized_name}>
                        {file.sanitized_name}
                      </span>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase shrink-0 border ${fileType.bg} ${fileType.color}`}>
                      {fileType.label}
                    </span>
                  </div>

                  {/* Center Visual Preview Canvas (Google Drive style tile) */}
                  <div
                    onClick={() => setSelectedFileForDetails(file)}
                    className="h-28 rounded-xl bg-muted/30 hover:bg-muted/50 border border-border/60 flex flex-col items-center justify-center relative overflow-hidden transition cursor-pointer group-hover:border-border my-2"
                  >
                    {fileType.type === "image" ? (
                      <div className="flex flex-col items-center gap-1.5 text-purple-600 dark:text-purple-400">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <ImageIcon className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground uppercase">{file.mime_type.split("/")[1] || "Image"}</span>
                      </div>
                    ) : fileType.type === "pdf" ? (
                      <div className="flex flex-col items-center gap-1.5 text-rose-600 dark:text-rose-400">
                        <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="space-y-0.5 w-16">
                          <div className="h-1 bg-rose-500/20 rounded-full w-full" />
                          <div className="h-1 bg-rose-500/20 rounded-full w-3/4" />
                          <div className="h-1 bg-rose-500/20 rounded-full w-1/2" />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground uppercase">PDF</span>
                      </div>
                    ) : fileType.type === "media" ? (
                      <div className="flex flex-col items-center gap-1.5 text-sky-600 dark:text-sky-400">
                        <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Film className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground uppercase">{file.mime_type.split("/")[1] || "Media"}</span>
                      </div>
                    ) : fileType.type === "archive" ? (
                      <div className="flex flex-col items-center gap-1.5 text-amber-600 dark:text-amber-400">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Archive className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground uppercase">Compressed</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 text-blue-600 dark:text-blue-400">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <FileTypeIcon className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground uppercase">{file.mime_type}</span>
                      </div>
                    )}

                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 dark:group-hover:bg-white/5 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <span className="px-2 py-1 rounded-md bg-background/90 backdrop-blur-xs border border-border text-[10px] font-medium text-foreground shadow-xs">
                        Details
                      </span>
                    </div>
                  </div>

                  {/* Card Metadata */}
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 pb-2 border-b border-border/60">
                    <span className="font-mono">{formatBytes(file.byte_size)}</span>
                    {isExpired ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono uppercase bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                        <AlertCircle className="w-3 h-3" />
                        <span>EXPIRED</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground font-mono">
                        <Clock className="w-3 h-3 text-amber-500" />
                        <span>{formatExpiry(file.expires_at, currentTime)}</span>
                      </span>
                    )}
                  </div>

                  {/* Card Actions */}
                  <div className="flex items-center justify-between gap-1.5 pt-2">
                    <button
                      onClick={() => setSelectedFileForDetails(file)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition text-xs flex items-center gap-1 cursor-pointer"
                      title="View file details"
                    >
                      <Info className="w-3.5 h-3.5" />
                      <span className="text-[11px]">Details</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      {isExpired ? (
                        <button
                          onClick={() => {
                            setSelectedFileForExtend(file);
                            setExtendPreset("30d");
                            setExtendError(null);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition shadow-xs cursor-pointer"
                          title="Extend file expiration"
                        >
                          <RotateCw className="w-3 h-3" />
                          <span>Extend</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleOpenShare(file)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition shadow-xs cursor-pointer"
                        >
                          <Share2 className="w-3 h-3" />
                          <span>Share</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleDirectDownload(file)}
                        disabled={downloadingId === file.id}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
                        title="Download file"
                      >
                        {downloadingId === file.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        onClick={() => setSelectedFileForAnalytics(file)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-500/10 transition cursor-pointer"
                        title="Edge Analytics & Geo Heatmap"
                      >
                        <Activity className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => setSelectedFileForDelete(file)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                        title="Delete file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Bar for Grid View */}
          {totalPages > 1 && (
            <div className="p-3 rounded-2xl border border-border bg-card shadow-2xs flex items-center justify-between text-xs text-muted-foreground">
              <div>
                Page <span className="font-semibold text-foreground">{page}</span> of{" "}
                <span className="font-semibold text-foreground">{totalPages}</span> ({totalCount} files)
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  disabled={page <= 1}
                  onClick={() => handlePageChange(page - 1)}
                  className="p-1 rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => handlePageChange(page + 1)}
                  className="p-1 rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden">
          <div className="divide-y divide-border">
            {files.map((file) => {
              const isExpired =
                file.status === "EXPIRED" ||
                (file.expires_at !== null && new Date(file.expires_at).getTime() <= currentTime);
              const fileType = getFileTypeDetails(file.mime_type, file.sanitized_name);
              const FileTypeIcon = fileType.icon;
              return (
                <div
                  key={file.id}
                  className={`p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition group ${
                    isExpired
                      ? "bg-rose-500/[0.02] dark:bg-rose-500/[0.04] hover:bg-rose-500/[0.06] border-l-2 border-l-rose-500/60"
                      : "hover:bg-muted/40 border-l-2 border-l-transparent"
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedFileIds.has(file.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        const next = new Set(selectedFileIds);
                        if (next.has(file.id)) next.delete(file.id);
                        else next.add(file.id);
                        setSelectedFileIds(next);
                      }}
                      className="w-3.5 h-3.5 rounded border-border text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0 mt-1 sm:mt-0"
                    />
                    <div className={`w-9 h-9 rounded-xl border ${fileType.bg} ${fileType.color} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}>
                      <FileTypeIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-foreground truncate max-w-sm sm:max-w-md">
                        {file.sanitized_name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span className="font-mono">{formatBytes(file.byte_size)}</span>
                        <span>&bull;</span>
                        <span className="truncate max-w-[120px]">{file.mime_type}</span>
                        <span>&bull;</span>
                        {isExpired ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                            <AlertCircle className="w-3 h-3" />
                            <span>EXPIRED</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground font-mono">
                            <Clock className="w-3 h-3 text-amber-500" />
                            {formatExpiry(file.expires_at, currentTime)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      onClick={() => setSelectedFileForDetails(file)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition text-xs flex items-center gap-1 cursor-pointer"
                      title="View file details"
                    >
                      <Info className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Details</span>
                    </button>

                    {isExpired ? (
                      <button
                        onClick={() => {
                          setSelectedFileForExtend(file);
                          setExtendPreset("30d");
                          setExtendError(null);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition shadow-xs cursor-pointer"
                        title="Extend file expiration"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>Extend</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleOpenShare(file)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition shadow-xs cursor-pointer"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>Share</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleDirectDownload(file)}
                      disabled={downloadingId === file.id}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
                      title="Download file"
                    >
                      {downloadingId === file.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <button
                      onClick={() => setSelectedFileForAnalytics(file)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-500/10 transition cursor-pointer"
                      title="Edge Analytics & Geo Heatmap"
                    >
                      <Activity className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => setSelectedFileForDelete(file)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                      title="Delete file"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Bar for List View */}
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
                  className="p-1 rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => handlePageChange(page + 1)}
                  className="p-1 rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FILE DETAILS MODAL */}
      {selectedFileForDetails && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-card border border-border p-5 sm:p-6 shadow-2xl relative space-y-5">
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
      {selectedFileForShare && (() => {
        const fileRemainingMs = selectedFileForShare.expires_at
          ? new Date(selectedFileForShare.expires_at).getTime() - currentTime
          : null;
        const isFileExpired = fileRemainingMs !== null && fileRemainingMs <= 0;

        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
            <div className="w-full max-w-4xl xl:max-w-5xl rounded-2xl bg-card border border-border p-4 sm:p-5 md:p-6 shadow-2xl relative space-y-3 sm:space-y-3.5 max-h-[95vh] overflow-y-auto transition-all">
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Share2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Create Share Link</h3>
                    <p className="text-[11px] text-muted-foreground">Customize your link, add protection, and choose delivery options.</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedFileForShare(null)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Compact File & Plan Status Strip with Realtime Expiration Ticker */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 px-3 rounded-xl bg-muted/40 border border-border">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-background border border-border/80 text-blue-500 flex items-center justify-center shrink-0">
                    <FileIcon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-foreground truncate max-w-[280px] sm:max-w-[360px]" title={selectedFileForShare.sanitized_name}>
                      {selectedFileForShare.sanitized_name}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-2 font-mono">
                      <span>{formatBytes(selectedFileForShare.byte_size)}</span>
                      <span>&bull;</span>
                      {selectedFileForShare.expires_at ? (
                        isFileExpired ? (
                          <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 inline" />
                            <span>Expired</span>
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            Expires {formatExpiry(selectedFileForShare.expires_at, currentTime)}
                          </span>
                        )
                      ) : (
                        <span className="text-purple-600 dark:text-purple-300 font-medium">
                          Permanent
                        </span>
                      )}
                    </div>
                  </div>
                </div>

              {isPremium ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs shrink-0 self-start sm:self-auto">
                  <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                  <span className="font-semibold text-[11px]">Premium Plan</span>
                  <span className="text-[10px] text-blue-500/80 dark:text-blue-400/80">&bull; Custom slug unlocked</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted border border-border text-muted-foreground text-xs shrink-0 self-start sm:self-auto">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                  <span className="font-medium text-[11px] text-foreground">Standard Plan</span>
                  <span className="text-[10px] text-muted-foreground">&bull; PRO for custom slug</span>
                </div>
              )}
            </div>

            {shareResult ? (
              <div className="space-y-3.5">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>Share link active! Anyone with this link can access the file within the expiration window.</span>
                </div>

                {/* Realtime Stats & QR Code Action Strip */}
                <div className="p-3 rounded-xl bg-muted/40 border border-border flex flex-wrap items-center justify-between gap-2.5 text-xs">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      <span>Expires:</span>
                      <strong className="text-foreground font-mono font-semibold">
                        {formatExpiry(shareResult.expires_at || null, currentTime)}
                      </strong>
                    </span>
                    <span className="text-muted-foreground/40">•</span>
                    <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                      <Download className="w-3.5 h-3.5 text-blue-500" />
                      <span>Limit:</span>
                      <strong className="text-foreground font-mono font-semibold">
                        {shareResult.is_single_use
                          ? "1 (Single-Use)"
                          : shareResult.max_downloads
                          ? `${shareResult.max_downloads} max`
                          : "Unlimited"}
                      </strong>
                    </span>
                    {shareResult.direct_download && (
                      <>
                        <span className="text-muted-foreground/40">•</span>
                        <span className="text-purple-600 dark:text-purple-400 font-semibold flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          <span>Direct Download Mode</span>
                        </span>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowQrCode(!showQrCode)}
                    className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer w-full sm:w-auto ${
                      showQrCode
                        ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
                        : "bg-background hover:bg-muted text-foreground border-border hover:border-blue-500/40 shadow-2xs"
                    }`}
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>{showQrCode ? "Hide QR Code" : "Show QR Code"}</span>
                  </button>
                </div>

                {/* Instant Client-Side Bug-Free SVG QR Code */}
                {showQrCode && (
                  <div className="p-4 rounded-2xl bg-card border border-border shadow-xs flex flex-col sm:flex-row items-center gap-4 animate-in fade-in duration-200">
                    <div className="p-3 bg-white rounded-xl shadow-xs border border-neutral-200 shrink-0">
                      <QRCodeSVG
                        value={shareResult.shareUrl}
                        size={130}
                        level="M"
                        includeMargin={false}
                        className="w-[120px] h-[120px]"
                      />
                    </div>
                    <div className="space-y-1.5 text-center sm:text-left min-w-0">
                      <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-semibold text-foreground">
                        <QrCode className="w-4 h-4 text-blue-500" />
                        <span>Instant Mobile QR Code</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Point your mobile phone camera at this QR code to instantly open or download this file on mobile. Computed 100% in your browser without any network delays.
                      </p>
                      <div className="text-[10.5px] font-mono text-blue-600 dark:text-blue-400 truncate max-w-[250px] sm:max-w-sm">
                        {shareResult.shareUrl}
                      </div>
                    </div>
                  </div>
                )}

                {/* 1-Click Instant Social & Chat Share Bar */}
                <div className="p-3 rounded-xl bg-muted/20 border border-border/80 space-y-2">
                  <div className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Send className="w-3 h-3 text-blue-500" />
                    <span>1-Click Instant Sharing</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* WhatsApp */}
                    <a
                      href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                        `Download "${selectedFileForShare.sanitized_name}" securely on GPHost: ${shareResult.shareUrl}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 text-xs font-medium transition cursor-pointer"
                      title="Share via WhatsApp"
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>WhatsApp</span>
                    </a>

                    {/* Telegram */}
                    <a
                      href={`https://t.me/share/url?url=${encodeURIComponent(
                        shareResult.shareUrl
                      )}&text=${encodeURIComponent(
                        `Download "${selectedFileForShare.sanitized_name}" securely on GPHost`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/25 text-xs font-medium transition cursor-pointer"
                      title="Share via Telegram"
                    >
                      <span className="w-2 h-2 rounded-full bg-sky-500" />
                      <span>Telegram</span>
                    </a>

                    {/* Email */}
                    <a
                      href={`mailto:?subject=${encodeURIComponent(
                        `Download: ${selectedFileForShare.sanitized_name}`
                      )}&body=${encodeURIComponent(
                        `Hi,\n\nI have shared "${selectedFileForShare.sanitized_name}" with you via GPHost.\n\nYou can access or download it here:\n${shareResult.shareUrl}\n\nThis link will automatically expire based on the security settings.\n`
                      )}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground border border-border text-xs font-medium transition cursor-pointer"
                      title="Share via Email"
                    >
                      <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Email</span>
                    </a>

                    {/* Copy Discord / Markdown */}
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `[${selectedFileForShare.sanitized_name}](${shareResult.shareUrl})`
                        );
                        setCopiedMarkdown(true);
                        setTimeout(() => setCopiedMarkdown(false), 2000);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground border border-border text-xs font-medium transition cursor-pointer"
                      title="Copy Markdown link formatted for Discord or GitHub"
                    >
                      {copiedMarkdown ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                      <span>{copiedMarkdown ? "Copied Markdown!" : "Discord / Markdown"}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Direct Link (Interactive Preview Page) */}
                  <div className="space-y-2 p-3.5 rounded-xl bg-card border border-border/90 hover:border-blue-500/40 shadow-xs transition-colors flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <div className="flex items-center gap-1.5">
                          <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                            <span>Direct Link</span>
                            <InfoTooltip
                              variant="info"
                              title="Direct Share Page (Interactive Preview)"
                              content="The rich landing page for human recipients. Includes in-browser media players (video streaming, PDF viewer, image gallery, audio player), file size, download button, view analytics, and rich Discord/WhatsApp link previews."
                            />
                          </label>
                          {shareResult.is_custom_slug && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                              Custom Slug
                              <InfoTooltip
                                title="Custom Vanity Alias"
                                content="A memorable, customized URL path chosen by you (e.g. /f/my-project-deck) instead of an auto-generated random string."
                              />
                            </span>
                          )}
                        </div>
                        <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 font-medium bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20 font-mono">
                          Primary Link
                          <InfoTooltip
                            title="Primary Sharing URL"
                            content="The standard share link to send to clients, team members, or friends via chat apps and email."
                          />
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug mb-2">
                        Interactive web page with rich media preview &amp; download controls.
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <input
                          readOnly
                          value={shareResult.shareUrl || (shareResult as { share?: { shareUrl?: string } }).share?.shareUrl || ""}
                          className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-muted/40 border border-border text-xs text-foreground font-mono select-all focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                          className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs shrink-0"
                        >
                          {copiedDirect ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedDirect ? "Copied" : "Copy"}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Direct Raw / CDN Asset URL */}
                  {(shareResult.rawUrl || (shareResult as { share?: { rawUrl?: string } }).share?.rawUrl) && (
                    <div className="space-y-2 p-3.5 rounded-xl bg-purple-500/8 border border-purple-500/25 hover:border-purple-500/40 shadow-xs transition-colors flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <div className="flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                            <label className="text-xs font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-1">
                              <span>Direct Raw / CDN URL</span>
                              <InfoTooltip
                                variant="purple"
                                title="Direct Raw / CDN Hotlink"
                                content="Pure asset streaming with zero HTML wrapper or website branding. Streams raw binary bytes directly from Cloudflare R2 edge servers with instant edge caching. Perfect for markdown images ![](url), HTML <img> tags, video players, and software downloads."
                              />
                            </label>
                          </div>
                          <span className="inline-flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400 font-mono font-medium bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20">
                            0 Vercel Egress
                            <InfoTooltip
                              variant="purple"
                              title="Zero Vercel Egress (No Bandwidth Cost)"
                              content="Zero bandwidth cost on your Vercel hosting bill! All file downloads stream directly from Cloudflare R2's global edge network without passing through your Vercel serverless compute."
                            />
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-snug mb-2">
                          Permanent hotlink to embed directly in Discord, GitHub READMEs, or blogs.
                        </p>
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <input
                            readOnly
                            value={shareResult.rawUrl || (shareResult as { share?: { rawUrl?: string } }).share?.rawUrl || ""}
                            className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-background border border-purple-500/30 text-xs text-foreground font-mono select-all focus:outline-none focus:ring-1 focus:ring-purple-500"
                          />
                          <button
                            onClick={() => {
                              const rUrl = shareResult.rawUrl || (shareResult as { share?: { rawUrl?: string } }).share?.rawUrl || "";
                              if (rUrl) {
                                navigator.clipboard.writeText(rUrl);
                                setCopiedRaw(true);
                                setTimeout(() => setCopiedRaw(false), 2000);
                              }
                            }}
                            className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs shrink-0"
                          >
                            {copiedRaw ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedRaw ? "Copied" : "Copy"}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* XURL Shortlink */}
                  {(shareResult.xurl?.shortUrl || (shareResult as { share?: { xurl?: { shortUrl?: string } } }).share?.xurl?.shortUrl) ? (
                    <div className="space-y-2 p-3.5 rounded-xl bg-card border border-border/90 hover:border-indigo-500/40 shadow-xs transition-colors flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Globe className="w-3.5 h-3.5 text-blue-500" />
                            <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                              <span>XURL Short Link</span>
                              <InfoTooltip
                                variant="info"
                                title="XURL (3rd-Party Vanity Shortlink)"
                                content="An ultra-short vanity link powered by the external 3rd-party service XURL (https://xurl.eu.cc), automatically synchronized with your file share. Ideal for SMS, Twitter/X, and printed QR codes."
                              />
                            </label>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 uppercase tracking-wide">
                              3rd-Party
                            </span>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                              Synced
                            </span>
                          </div>
                          <a
                            href="https://xurl.eu.cc"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition cursor-pointer"
                            title="Visit live XURL website"
                          >
                            <span>xurl.eu.cc</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-snug mb-2">
                          Compact vanity redirect URL powered by third-party partner XURL.
                        </p>
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <input
                            readOnly
                            value={shareResult.xurl?.shortUrl || (shareResult as { share?: { xurl?: { shortUrl?: string } } }).share?.xurl?.shortUrl || ""}
                            className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-background border border-border text-xs text-blue-600 dark:text-blue-400 font-mono select-all focus:outline-none"
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
                            className="px-3.5 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold flex items-center gap-1.5 border border-border transition cursor-pointer shrink-0"
                          >
                            {copiedXurl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedXurl ? "Copied" : "Copy"}</span>
                          </button>
                          <a
                            href={shareResult.xurl?.shortUrl || (shareResult as { share?: { xurl?: { shortUrl?: string } } }).share?.xurl?.shortUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 transition cursor-pointer shrink-0"
                            title="Open short link in new tab"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                  ) : (shareResult.xurl || (shareResult as { share?: { xurl?: unknown } }).share?.xurl) ? (
                    <div className="space-y-1.5 p-3 rounded-xl bg-destructive/8 border border-destructive/20 text-xs">
                      <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                        <span>Short Link Status</span>
                        <InfoTooltip
                          variant="amber"
                          title="Shortlink Registration Status"
                          content="Indicates whether the external XURL service was able to create the shortened vanity alias."
                        />
                      </label>
                      <div className="flex items-center gap-2 text-[11px] text-destructive">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Short link creation failed (see audit logs for details).</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5 p-3 rounded-xl bg-muted/20 border border-border text-xs">
                      <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                        <span>Short Link Status</span>
                        <InfoTooltip
                          title="Shortlink Configuration"
                          content="Short links can be toggled on during share generation to automatically create an xurl.eu.cc vanity alias."
                        />
                      </label>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span>Short link was not requested for this share.</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* XURL Non-Active Status Notice */}
                {(shareResult.xurl || (shareResult as { share?: { xurl?: { status?: string; error?: string } } }).share?.xurl) &&
                  (shareResult.xurl?.status || (shareResult as { share?: { xurl?: { status?: string } } }).share?.xurl?.status) !== "active" && (
                    <div className="p-2.5 rounded-xl bg-muted/60 border border-border text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-1.5 font-medium text-foreground">
                        <span>Shortener:</span>
                        <span className="uppercase font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground">
                          {shareResult.xurl?.status || (shareResult as { share?: { xurl?: { status?: string } } }).share?.xurl?.status}
                        </span>
                      </div>
                      <p className="mt-0.5 text-muted-foreground">
                        {shareResult.xurl?.error || (shareResult as { share?: { xurl?: { error?: string } } }).share?.xurl?.error || "Shortlink pending. Direct link works normally."}
                      </p>
                    </div>
                  )}

                <div className="pt-2 border-t border-border flex justify-end">
                  <button
                    onClick={() => setSelectedFileForShare(null)}
                    className="px-5 py-2 rounded-xl bg-foreground text-background text-xs font-semibold hover:opacity-90 transition cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateShare} className="space-y-3 sm:space-y-3.5">
                {/* Expired File Warning Banner */}
                {isFileExpired && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 flex items-start gap-2 animate-in fade-in duration-200">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="space-y-0.5 text-xs">
                      <div className="font-semibold">File Has Expired</div>
                      <div className="text-[11px] text-rose-600/90 dark:text-rose-400/90">
                        This file has expired, so new share links cannot be created.
                      </div>
                    </div>
                  </div>
                )}

                <div className={`space-y-3.5 ${isFileExpired ? "opacity-45 pointer-events-none select-none" : ""}`}>
                  {/* Section 1: 4 Core Settings in Balanced 2x2 Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {/* Expiry Selector */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[12px] font-semibold text-foreground/90 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-blue-500" />
                          <span>Link Expiration</span>
                          <InfoTooltip
                            title="Automatic Expiration"
                            content="This link stays active as long as the file does. When the file expires, this link automatically closes."
                          />
                        </label>
                        {selectedFileForShare.expires_at && !isFileExpired && (
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            <Check className="w-3 h-3" />
                            <span>Auto-expires</span>
                          </span>
                        )}
                      </div>

                      <div className="relative group">
                        <select
                          value="file_expiry"
                          disabled
                          className="w-full h-10 px-3.5 rounded-xl bg-muted/30 border border-border/80 hover:border-border text-xs sm:text-[13px] text-foreground/90 font-medium cursor-not-allowed appearance-none select-none pr-9 disabled:opacity-90 transition-all duration-200"
                        >
                          <option value="file_expiry">
                            {selectedFileForShare.expires_at
                              ? isFileExpired
                                ? "File Expired"
                                : `Same as file (expires in ${formatExpiry(selectedFileForShare.expires_at, currentTime)})`
                              : "Permanent (Never expires)"}
                          </option>
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground flex items-center gap-1">
                          <Lock className="w-3.5 h-3.5" />
                        </div>
                      </div>

                      <p className="text-[11px] text-muted-foreground/75 truncate">
                        {selectedFileForShare.expires_at
                          ? isFileExpired
                            ? "Target file has expired. Sharing is locked."
                            : `Link will automatically expire in ${formatExpiry(selectedFileForShare.expires_at, currentTime)}.`
                          : "Permanent file — link will never expire."}
                      </p>
                    </div>

                    {/* Password Protection */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[12px] font-semibold text-foreground/90 flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>Password Protection</span>
                          <span className="text-[10.5px] font-normal text-muted-foreground">(Optional)</span>
                          <InfoTooltip
                            title="Password Protection"
                            content="Require visitors to enter a password before viewing or downloading this file. Leave blank for a public link."
                          />
                        </label>
                        <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md border border-border/60">
                          Encrypted
                        </span>
                      </div>
                      <input
                        type="password"
                        placeholder="Leave blank for public access"
                        value={sharePassword}
                        onChange={(e) => setSharePassword(e.target.value)}
                        maxLength={128}
                        className="w-full h-10 px-3.5 rounded-xl bg-background/90 hover:bg-background border border-border/80 hover:border-blue-500/60 dark:hover:border-blue-400/60 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none text-xs sm:text-[13px] text-foreground font-sans placeholder:font-sans placeholder:text-muted-foreground/50 placeholder:font-normal transition-all duration-200 shadow-2xs hover:shadow-xs focus:shadow-xs"
                      />

                      {/* Smooth Accordion: Password Hint (Appears when password is typed) */}
                      {sharePassword.length > 0 && (
                        <div className="pt-1 animate-in fade-in slide-in-from-top-1 duration-150 space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                              <Lightbulb className="w-3 h-3 text-amber-500" />
                              <span>Password Hint (Optional)</span>
                            </label>
                            <span className="text-[10px] text-muted-foreground">Shown to recipient</span>
                          </div>
                          <input
                            type="text"
                            placeholder="e.g. Office Wi-Fi password, project code name"
                            value={sharePasswordHint}
                            onChange={(e) => setSharePasswordHint(e.target.value)}
                            maxLength={100}
                            className="w-full h-8 px-3 rounded-lg bg-background/90 hover:bg-background border border-border/80 hover:border-amber-500/50 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 focus:outline-none text-xs text-foreground placeholder:text-muted-foreground/50 transition-all font-sans"
                          />
                        </div>
                      )}

                      <p className="text-[11px] text-muted-foreground/75 truncate">
                        Visitors must enter this password to view or download.
                      </p>
                    </div>

                    {/* Custom Link Name */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[12px] font-semibold text-foreground/90 flex items-center gap-1.5">
                          <span>Custom Link Name</span>
                          {isPremium ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 tracking-wider">
                              PRO
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border flex items-center gap-0.5">
                              <Lock className="w-2.5 h-2.5" />
                              <span>PRO</span>
                            </span>
                          )}
                          <InfoTooltip
                            title="Custom Link Name"
                            content="Choose a clean, memorable address for your link (e.g. gphost.eu.cc/f/project-deck) instead of random letters."
                          />
                        </label>
                        <span className="text-[10.5px] text-muted-foreground">
                          {isPremium ? "letters, numbers, dashes" : "Upgrade to unlock"}
                        </span>
                      </div>

                      {isPremium ? (
                        <div className="space-y-1">
                          <div className="flex items-center h-10 rounded-xl bg-background/90 hover:bg-background border border-border/80 hover:border-blue-500/60 dark:hover:border-blue-400/60 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all duration-200 shadow-2xs hover:shadow-xs focus-within:shadow-xs overflow-hidden group">
                            <span className="h-full flex items-center px-3 bg-muted/40 group-hover:bg-muted/60 text-xs text-muted-foreground font-mono font-medium border-r border-border/80 group-hover:border-blue-500/30 group-focus-within:border-blue-500/40 select-none transition-colors duration-200">
                              /f/
                            </span>
                            <input
                              type="text"
                              placeholder="e.g. my-project-files"
                              value={shareCustomSlug}
                              onChange={(e) =>
                                setShareCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
                              }
                              maxLength={48}
                              className="w-full h-full px-3 text-xs sm:text-[13px] text-foreground font-mono tracking-tight font-medium bg-transparent focus:outline-none placeholder:text-muted-foreground/50 placeholder:font-sans placeholder:font-normal placeholder:tracking-normal"
                            />
                            {shareCustomSlug && (
                              <button
                                type="button"
                                onClick={() => setShareCustomSlug("")}
                                className="p-1 mr-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg cursor-pointer transition-colors"
                                aria-label="Clear custom slug"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          {shareCustomSlug && (
                            <div className="text-[10.5px] text-muted-foreground flex items-center gap-1.5 truncate">
                              <span className="font-medium text-foreground">Your link:</span>
                              <span className="font-mono text-blue-600 dark:text-blue-400 font-medium truncate">
                                {typeof window !== "undefined" ? window.location.host : "gphost.eu.cc"}/f/{shareCustomSlug}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center h-10 rounded-xl bg-muted/20 border border-border/70 overflow-hidden opacity-60 cursor-not-allowed">
                          <span className="h-full flex items-center px-3 bg-muted/40 text-xs text-muted-foreground border-r border-border/70 font-mono select-none">
                            /f/
                          </span>
                          <input
                            type="text"
                            disabled
                            placeholder="Upgrade to Premium to set custom names"
                            className="w-full h-full px-3 text-xs text-muted-foreground bg-transparent focus:outline-none font-sans cursor-not-allowed placeholder:font-sans"
                          />
                        </div>
                      )}
                    </div>

                    {/* Download Limit */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[12px] font-semibold text-foreground/90 flex items-center gap-1.5">
                          <span>Download Limit</span>
                          <span className="text-[10.5px] font-normal text-muted-foreground">(Optional)</span>
                          <InfoTooltip
                            title="Download Limit"
                            content="Set how many times this file can be downloaded before the link turns off. Leave blank if anyone can download it without limits."
                          />
                        </label>
                        <span className="text-[10.5px] text-muted-foreground font-mono font-medium">
                          {shareIsSingleUse ? "Single-Use: 1" : shareMaxDownloads ? `${shareMaxDownloads} max` : "Unlimited"}
                        </span>
                      </div>
                      <input
                        type="number"
                        min="1"
                        placeholder={shareIsSingleUse ? "1 (Single-Use Link Locked)" : "No limit (e.g. 5, 10, 50)"}
                        value={shareIsSingleUse ? "1" : shareMaxDownloads}
                        onChange={(e) => setShareMaxDownloads(e.target.value)}
                        disabled={shareIsSingleUse}
                        className="w-full h-10 px-3.5 rounded-xl bg-background/90 hover:bg-background border border-border/80 hover:border-blue-500/60 dark:hover:border-blue-400/60 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none text-xs sm:text-[13px] text-foreground font-mono font-medium tracking-tight placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-muted-foreground/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border/80 disabled:hover:bg-background/80 disabled:hover:shadow-none transition-all duration-200 shadow-2xs hover:shadow-xs focus:shadow-xs"
                      />
                      <p className="text-[11px] text-muted-foreground/75 truncate">
                        {shareIsSingleUse ? (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            Locked to 1 download (Single-Use enabled).
                          </span>
                        ) : (
                          <span>Leave empty for unlimited downloads, or enter a number.</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Private Note / Memo for Recipient (Optional Expander) */}
                  <div className="pt-0.5">
                    {!showRecipientNote ? (
                      <button
                        type="button"
                        onClick={() => setShowRecipientNote(true)}
                        className="text-[11.5px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 flex items-center gap-1.5 transition cursor-pointer hover:underline"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>+ Add private note or message for recipient (Optional)</span>
                      </button>
                    ) : (
                      <div className="p-3 rounded-xl bg-muted/30 border border-border/80 space-y-1.5 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between">
                          <label className="text-[12px] font-semibold text-foreground/90 flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                            <span>Private Note for Recipient</span>
                            <span className="text-[10px] text-muted-foreground font-normal">
                              (Shown as memo banner on download page)
                            </span>
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setShowRecipientNote(false);
                              setShareRecipientNote("");
                            }}
                            className="text-[10.5px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="e.g. Here is the revised draft for review — please keep confidential."
                          value={shareRecipientNote}
                          onChange={(e) => setShareRecipientNote(e.target.value)}
                          maxLength={280}
                          className="w-full h-9 px-3 rounded-lg bg-background/90 hover:bg-background border border-border/80 hover:border-blue-500/50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none text-xs text-foreground placeholder:text-muted-foreground/50 transition-all font-sans"
                        />
                        <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                          <span>Recipient sees this above the file name.</span>
                          <span>{shareRecipientNote.length}/280</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Section 2: 5 Delivery & Security Feature Cards in Balanced Responsive Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 pt-0.5">
                    {/* Card 1: One-Time Download */}
                    <label className={`flex flex-col justify-between p-3.5 rounded-xl border transition-all duration-200 cursor-pointer select-none group relative overflow-hidden ${
                      shareIsSingleUse
                        ? "bg-blue-500/[0.08] border-blue-500/60 ring-1 ring-blue-500/30 shadow-xs"
                        : "bg-muted/30 hover:bg-muted/60 border-border/80 hover:border-blue-500/50 hover:shadow-xs"
                    }`}>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-[12.5px] font-semibold text-foreground flex items-center gap-1.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            <span>One-Time</span>
                            <InfoTooltip
                              title="One-Time Download"
                              content="The link works for exactly 1 download, then automatically deletes itself forever."
                            />
                          </div>
                          <input
                            type="checkbox"
                            checked={shareIsSingleUse}
                            onChange={(e) => setShareIsSingleUse(e.target.checked)}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600 shrink-0 transition-transform duration-200 group-hover:scale-110"
                          />
                        </div>
                        <div className="inline-flex">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/80">
                            Burn after 1
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground/85 leading-snug">
                          Deletes link after 1 successful download.
                        </p>
                      </div>
                    </label>

                    {/* Card 2: Disappearing Link (Self-Destruct) */}
                    <label className={`flex flex-col justify-between p-3.5 rounded-xl border transition-all duration-200 cursor-pointer select-none group relative overflow-hidden ${
                      shareBurnAfterPreview
                        ? "bg-rose-500/[0.08] border-rose-500/60 ring-1 ring-rose-500/30 shadow-xs"
                        : "bg-muted/30 hover:bg-muted/60 border-border/80 hover:border-rose-500/50 hover:shadow-xs"
                    }`}>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-[12.5px] font-semibold text-foreground flex items-center gap-1.5 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
                            <Flame className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            <span>Self-Destruct</span>
                            <InfoTooltip
                              variant="purple"
                              title="Disappearing Share Link (60s Burn)"
                              content="When recipient opens the link, a 60-second countdown begins, after which this share link is destroyed. Your original file in storage is 100% untouched."
                            />
                          </div>
                          <input
                            type="checkbox"
                            checked={shareBurnAfterPreview}
                            onChange={(e) => setShareBurnAfterPreview(e.target.checked)}
                            className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer accent-rose-600 shrink-0 transition-transform duration-200 group-hover:scale-110"
                          />
                        </div>
                        <div className="inline-flex">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            Burns Link (60s)
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground/85 leading-snug">
                          Deletes 60s after first open. File is safe.
                        </p>
                      </div>
                    </label>

                    {/* Card 3: Direct Download Mode */}
                    <label className={`flex flex-col justify-between p-3.5 rounded-xl border transition-all duration-200 cursor-pointer select-none group relative overflow-hidden ${
                      shareDirectDownload
                        ? "bg-purple-500/[0.08] border-purple-500/60 ring-1 ring-purple-500/30 shadow-xs"
                        : "bg-muted/30 hover:bg-muted/60 border-border/80 hover:border-purple-500/50 hover:shadow-xs"
                    }`}>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-[12.5px] font-semibold text-foreground flex items-center gap-1.5 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                            <Zap className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                            <span>Direct Download</span>
                            <InfoTooltip
                              variant="purple"
                              title="Direct Download Mode"
                              content="Skips the preview landing page entirely. When recipient opens the link, the file immediately begins downloading via HTTP 302 directly to Cloudflare R2 (0 Vercel bandwidth used)."
                            />
                          </div>
                          <input
                            type="checkbox"
                            checked={shareDirectDownload}
                            onChange={(e) => setShareDirectDownload(e.target.checked)}
                            className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600 shrink-0 transition-transform duration-200 group-hover:scale-110"
                          />
                        </div>
                        <div className="inline-flex">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                            Zero Egress • Instant
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground/85 leading-snug">
                          Bypasses preview. Directly triggers download.
                        </p>
                      </div>
                    </label>

                    {/* Card 4: Disable In-Browser Preview */}
                    <label className={`flex flex-col justify-between p-3.5 rounded-xl border transition-all duration-200 cursor-pointer select-none group relative overflow-hidden ${
                      shareDisablePreview
                        ? "bg-amber-500/[0.08] border-amber-500/60 ring-1 ring-amber-500/30 shadow-xs"
                        : "bg-muted/30 hover:bg-muted/60 border-border/80 hover:border-amber-500/50 hover:shadow-xs"
                    }`}>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-[12.5px] font-semibold text-foreground flex items-center gap-1.5 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                            <EyeOff className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span>Disable Preview</span>
                            <InfoTooltip
                              variant="amber"
                              title="Disable In-Browser Preview"
                              content="Suppresses embedded video streaming, audio players, image previews, and PDF viewers. Requires recipient to click Download to inspect the file."
                            />
                          </div>
                          <input
                            type="checkbox"
                            checked={shareDisablePreview}
                            onChange={(e) => setShareDisablePreview(e.target.checked)}
                            className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer accent-amber-600 shrink-0 transition-transform duration-200 group-hover:scale-110"
                          />
                        </div>
                        <div className="inline-flex">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            Force Download
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground/85 leading-snug">
                          Hides in-browser media players and streaming.
                        </p>
                      </div>
                    </label>

                    {/* Card 5: Shorten with XURL (3rd-Party) */}
                    <label className={`flex flex-col justify-between p-3.5 rounded-xl border transition-all duration-200 cursor-pointer select-none group relative overflow-hidden ${
                      shareEnableXurl
                        ? "bg-blue-500/[0.08] border-blue-500/60 ring-1 ring-blue-500/30 shadow-xs"
                        : "bg-muted/30 hover:bg-muted/60 border-border/80 hover:border-blue-500/50 hover:shadow-xs"
                    }`}>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-[12.5px] font-semibold text-foreground flex items-center gap-1.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span>XURL Shortlink</span>
                            <InfoTooltip
                              variant="info"
                              title="XURL (3rd-Party URL Shortener Integration)"
                              content="XURL (https://xurl.eu.cc) is an external third-party URL shortening service integrated with GPHost. Enabling this creates an extra-compact, easy-to-share link (e.g. xurl.eu.cc/abc) that redirects to your file. GPHost automatically syncs expiration with XURL so the short link closes when your file expires."
                            />
                          </div>
                          <input
                            type="checkbox"
                            checked={shareEnableXurl}
                            onChange={(e) => setShareEnableXurl(e.target.checked)}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600 shrink-0 transition-transform duration-200 group-hover:scale-110"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25 uppercase tracking-wider">
                            3rd-Party
                          </span>
                          <a
                            href="https://xurl.eu.cc"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline transition cursor-pointer px-1.5 py-0.5 rounded hover:bg-blue-500/10"
                            title="Visit xurl.eu.cc in new tab"
                          >
                            <span>xurl.eu.cc</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                        <p className="text-[11px] text-muted-foreground/85 leading-snug">
                          Creates vanity shortlink synced with file expiry.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {shareError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
                    {shareError}
                  </div>
                )}

                <div className="pt-2.5 border-t border-border flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground hidden sm:block">
                    {isFileExpired
                      ? "Expired files cannot have share links generated."
                      : "Links automatically close when the file expires."}
                  </p>
                  <div className="flex items-center gap-2.5 ml-auto">
                    <button
                      type="button"
                      onClick={() => setSelectedFileForShare(null)}
                      className="px-4 py-2 rounded-xl bg-muted/60 hover:bg-muted text-xs font-medium text-foreground hover:text-foreground border border-border/60 hover:border-border transition-all duration-150 cursor-pointer shadow-2xs active:scale-[0.98]"
                    >
                      {isFileExpired ? "Close" : "Cancel"}
                    </button>
                    <button
                      type="submit"
                      disabled={creatingShare || isFileExpired}
                      className={`inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 shadow-sm ${
                        isFileExpired
                          ? "bg-muted text-muted-foreground cursor-not-allowed border border-border"
                          : "bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white hover:shadow-md hover:shadow-blue-500/20 active:scale-[0.98] cursor-pointer"
                      }`}
                    >
                      {creatingShare && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {isFileExpired ? (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>Sharing Locked (Expired)</span>
                        </>
                      ) : (
                        <span>Create Share Link</span>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      ); })()}

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

      {/* EXTEND EXPIRY MODAL */}
      {selectedFileForExtend && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl p-5 md:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <RotateCw className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-foreground">Extend File Expiry</h4>
                  <p className="text-[11px] text-muted-foreground">Restore status to ACTIVE and resume secure access</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedFileForExtend(null)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Target File Info */}
            <div className="p-3 rounded-xl bg-muted/40 border border-border flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-background border border-border/80 text-amber-500 flex items-center justify-center shrink-0">
                <FileIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground truncate">{selectedFileForExtend.sanitized_name}</p>
                <p className="text-[11px] text-muted-foreground font-mono">{formatBytes(selectedFileForExtend.byte_size)}</p>
              </div>
            </div>

            {/* Explanatory Callout */}
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>What happens when you extend?</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                This file is currently expired and locked from public access. Extending it restores status to <strong className="text-amber-800 dark:text-amber-200">ACTIVE</strong>, recalculates its countdown, and allows sharing once again.
              </p>
            </div>

            {/* Preset Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">New Expiration Duration</label>
              <select
                value={extendPreset}
                onChange={(e) => setExtendPreset(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition"
              >
                <option value="1h">1 Hour from now</option>
                <option value="2h">2 Hours from now</option>
                <option value="5h">5 Hours from now</option>
                <option value="12h">12 Hours from now</option>
                <option value="24h">24 Hours (1 Day)</option>
                <option value="7d">7 Days</option>
                <option value="30d">30 Days (Recommended)</option>
                <option value="90d">90 Days</option>
                {isPremium && <option value="never">Permanent (Never Expire)</option>}
              </select>
            </div>

            {extendError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
                {extendError}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setSelectedFileForExtend(null)}
                disabled={isExtending}
                className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExtendConfirm}
                disabled={isExtending}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 active:scale-[0.98] text-white font-semibold text-xs transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isExtending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Re-activating...</span>
                  </>
                ) : (
                  <>
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Re-activate File</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Active Download Progress Pill */}
      {activeDownload && (
        <div className="fixed bottom-6 right-6 z-50 w-80 sm:w-96 rounded-2xl bg-card/95 border border-emerald-500/30 p-4 shadow-2xl shadow-emerald-500/10 backdrop-blur-md space-y-2.5 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                {activeDownload.completed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Download className="w-4 h-4 animate-bounce text-emerald-500" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">
                  {activeDownload.filename}
                </p>
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 truncate">
                  {activeDownload.status}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {activeDownload.progress}%
              </span>
              <button
                type="button"
                onClick={() => setActiveDownload(null)}
                className="p-1 text-muted-foreground hover:text-foreground rounded-md transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="relative w-full h-2 rounded-full bg-muted/70 dark:bg-zinc-800 p-0.5 border border-border/70 overflow-hidden">
            <div
              className="relative h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(16,185,129,0.5)] overflow-hidden"
              style={{ width: `${Math.max(4, activeDownload.progress)}%` }}
            >
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent animate-progress-shimmer" />
            </div>
          </div>
        </div>
      )}

      {/* Edge Telemetry & Analytics Modal */}
      {selectedFileForAnalytics && (
        <FileAnalyticsModal
          fileId={selectedFileForAnalytics.id}
          filename={selectedFileForAnalytics.sanitized_name}
          onClose={() => setSelectedFileForAnalytics(null)}
        />
      )}
    </div>
  );
}
