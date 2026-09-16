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
} from "lucide-react";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import {
  formatTimeRemaining,
} from "@/lib/storage/expiry";

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
  const [isDeleting, setIsDeleting] = useState(false);

  // Share form state
  const [shareExpiresIn, setShareExpiresIn] = useState<string>("file_expiry");
  const [shareMaxDownloads, setShareMaxDownloads] = useState<string>("");
  const [shareIsSingleUse, setShareIsSingleUse] = useState<boolean>(false);
  const [sharePassword, setSharePassword] = useState<string>("");
  const [shareCustomSlug, setShareCustomSlug] = useState<string>("");
  const [shareEnableXurl, setShareEnableXurl] = useState<boolean>(true);
  const [creatingShare, setCreatingShare] = useState<boolean>(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const handleOpenShare = (file: SafeFileItem) => {
    setSelectedFileForShare(file);
    setShareResult(null);
    setShareError(null);
    setShareCustomSlug("");
    setShareExpiresIn("file_expiry");
    setShareMaxDownloads("");
    setShareIsSingleUse(false);
    setSharePassword("");
    setShareEnableXurl(true);
  };
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
        <div className="flex flex-wrap items-center gap-2 flex-1 sm:justify-end">
          {/* Search Input */}
          <div className="relative flex-1 sm:max-w-xs min-w-[180px]">
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

      {/* 3. Section Title */}
      <div className="flex items-center justify-between text-xs text-muted-foreground font-medium px-0.5 pt-1">
        <span className="font-semibold text-foreground">
          {category === "all" ? "Suggested files" : `${category.charAt(0).toUpperCase() + category.slice(1)} files`}
        </span>
        <span>{files.length} {files.length === 1 ? "file" : "files"}</span>
      </div>

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
              const fileType = getFileTypeDetails(file.mime_type, file.sanitized_name);
              const FileTypeIcon = fileType.icon;
              return (
                <div
                  key={file.id}
                  className="rounded-2xl border border-border bg-card p-3.5 shadow-2xs hover:shadow-md hover:border-border/80 transition-all duration-200 group flex flex-col justify-between"
                >
                  {/* Card Top: Type badge & Name */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
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
                    <span className="inline-flex items-center gap-1 text-muted-foreground font-mono">
                      <Clock className="w-3 h-3 text-amber-500" />
                      <span>{formatExpiry(file.expires_at, currentTime)}</span>
                    </span>
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
                      <button
                        onClick={() => handleOpenShare(file)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition shadow-xs cursor-pointer"
                      >
                        <Share2 className="w-3 h-3" />
                        <span>Share</span>
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
              const fileType = getFileTypeDetails(file.mime_type, file.sanitized_name);
              const FileTypeIcon = fileType.icon;
              return (
                <div
                  key={file.id}
                  className="p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/40 transition group"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
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
                        <span className="inline-flex items-center gap-1 text-muted-foreground font-mono">
                          <Clock className="w-3 h-3 text-amber-500" />
                          {formatExpiry(file.expires_at, currentTime)}
                        </span>
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

                    <button
                      onClick={() => handleOpenShare(file)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition shadow-xs cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Share</span>
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
      {selectedFileForShare && (() => {
        const fileRemainingMs = selectedFileForShare.expires_at
          ? new Date(selectedFileForShare.expires_at).getTime() - currentTime
          : null;
        const isFileExpired = fileRemainingMs !== null && fileRemainingMs <= 0;

        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-2xl lg:max-w-3xl rounded-2xl bg-card border border-border p-5 md:p-6 shadow-2xl relative space-y-4 max-h-[94vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-border pb-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Share2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Share File</h3>
                    <p className="text-[11px] text-muted-foreground">Configure custom link, access restrictions, and strict expiry sync</p>
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-muted/40 border border-border">
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
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>Share link active! Anyone with this link can access the file within the expiration window.</span>
                </div>

                {/* Synced Expiration & Metadata Card */}
                <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      <span>Synced Expiration:</span>
                    </span>
                    <span className="font-semibold text-foreground font-mono">
                      {formatExpiry(shareResult.expires_at || null, currentTime)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1.5 border-t border-border/60">
                    <span>Target &amp; Short Link Sync:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      <span>Strict Backend Immutability Verified</span>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shadow-xs shrink-0"
                      >
                        {copiedDirect ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedDirect ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                  </div>

                  {/* XURL Shortlink */}
                  {(shareResult.xurl?.shortUrl || (shareResult as { share?: { xurl?: { shortUrl?: string } } }).share?.xurl?.shortUrl) ? (
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
                          className="px-3 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-medium flex items-center gap-1.5 border border-border transition cursor-pointer shrink-0"
                        >
                          {copiedXurl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedXurl ? "Copied" : "Copy"}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">Short Link Status</label>
                      <div className="p-2 rounded-xl bg-muted/20 border border-border text-[11px] text-muted-foreground flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span>Short link was not requested for this share.</span>
                      </div>
                    </div>
                  )}
                </div>

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
              <form onSubmit={handleCreateShare} className="space-y-4">
                {/* Expired File Warning Banner */}
                {isFileExpired && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 flex items-start gap-2.5 animate-in fade-in duration-200">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="space-y-0.5 text-xs">
                      <div className="font-semibold">File Has Expired — Share Link Creation Locked</div>
                      <div className="text-[11px] text-rose-600/90 dark:text-rose-400/90">
                        This file has reached the end of its retention lifecycle. Share links cannot be created for expired files.
                      </div>
                    </div>
                  </div>
                )}

                <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${isFileExpired ? "opacity-45 pointer-events-none select-none" : ""}`}>
                  {/* Left Column: Link Settings */}
                  <div className="space-y-3.5">
                    {/* Expiry Selector strictly synchronized with file upload */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-blue-500" />
                          <span>Link Expiration</span>
                        </label>
                        {selectedFileForShare.expires_at && !isFileExpired && (
                          <span className="text-[10px] font-mono font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            <span>Strict Sync</span>
                          </span>
                        )}
                        {selectedFileForShare.expires_at && isFileExpired && (
                          <span className="text-[10px] font-mono font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Expired</span>
                          </span>
                        )}
                      </div>

                      <div className="relative">
                        <select
                          value="file_expiry"
                          disabled
                          className="w-full px-3 py-2.5 rounded-xl bg-muted/20 border border-border text-xs text-foreground font-medium cursor-not-allowed appearance-none select-none pr-9 disabled:opacity-90"
                        >
                          <option value="file_expiry">
                            {selectedFileForShare.expires_at
                              ? isFileExpired
                                ? "File Expired (Cannot create share link)"
                                : `Strictly Synced with File Lifecycle (${formatExpiry(selectedFileForShare.expires_at, currentTime)})`
                              : "Permanent / Matches File (Never Expire)"}
                          </option>
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground flex items-center gap-1">
                          <Lock className="w-3.5 h-3.5" />
                        </div>
                      </div>

                      <div className="text-[11px] text-muted-foreground pt-0.5">
                        {selectedFileForShare.expires_at ? (
                          isFileExpired ? (
                            <span className="text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span>Target file has expired. Sharing is locked.</span>
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                              <Check className="w-3.5 h-3.5 shrink-0" />
                              <span>XURL &amp; GPHost links strictly expire in {formatExpiry(selectedFileForShare.expires_at, currentTime)}.</span>
                            </span>
                          )
                        ) : (
                          <span>Target file is permanent. XURL &amp; GPHost links strictly inherit permanent retention.</span>
                        )}
                      </div>
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
                                className="p-1.5 mr-1 text-muted-foreground hover:text-foreground cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          {shareCustomSlug && (
                            <div className="text-[10px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5">
                              <span className="font-medium text-foreground">Sync:</span>
                              <span className="font-mono text-blue-600 dark:text-blue-400 truncate max-w-[170px]">
                                gphost.eu.cc/f/{shareCustomSlug}
                              </span>
                              {shareEnableXurl && (
                                <>
                                  <span className="text-muted-foreground">&bull;</span>
                                  <span className="font-mono text-indigo-500 dark:text-indigo-400 truncate max-w-[140px]">
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

                    {/* Max Downloads (Strict Backend Enforcement) */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-muted-foreground font-medium">Max Downloads (Optional)</label>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {shareIsSingleUse ? "Single-Use: 1" : shareMaxDownloads ? `${shareMaxDownloads} max` : "Unlimited"}
                        </span>
                      </div>
                      <input
                        type="number"
                        min="1"
                        placeholder={shareIsSingleUse ? "1 (Single-Use Link Locked)" : "Unlimited (e.g. 5, 10, 50)"}
                        value={shareIsSingleUse ? "1" : shareMaxDownloads}
                        onChange={(e) => setShareMaxDownloads(e.target.value)}
                        disabled={shareIsSingleUse}
                        className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500 font-mono disabled:opacity-50"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {shareIsSingleUse ? (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            Strictly immutable: link destroys itself immediately after first download.
                          </span>
                        ) : (
                          <span>Owner can set a download limit enforced by backend database locks, or leave empty for unlimited.</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Right Column: Security & Sync Options */}
                  <div className="space-y-3.5">
                    {/* Password Protection */}
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Password (Optional)</span>
                      </label>
                      <input
                        type="password"
                        placeholder="Set a password for this link"
                        value={sharePassword}
                        onChange={(e) => setSharePassword(e.target.value)}
                        maxLength={128}
                        className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {/* Single Use Toggle */}
                    <label className="flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/60 border border-border cursor-pointer transition select-none">
                      <div>
                        <div className="text-xs font-medium text-foreground">Single-Use Link</div>
                        <div className="text-[11px] text-muted-foreground">Expires automatically after 1st download</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={shareIsSingleUse}
                        onChange={(e) => setShareIsSingleUse(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </label>

                    {/* XURL Toggle */}
                    <label className="flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/60 border border-border cursor-pointer transition select-none">
                      <div>
                        <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-blue-500" />
                          <span>Shorten &amp; Sync Link</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">Creates clean synchronized xurl.eu.cc short link (synced expiry)</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={shareEnableXurl}
                        onChange={(e) => setShareEnableXurl(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>

                {shareError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
                    {shareError}
                  </div>
                )}

                <div className="pt-3 border-t border-border flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground hidden sm:block">
                    {isFileExpired
                      ? "Expired files cannot have share links generated."
                      : "Share links inherit synchronized lifecycle with target files."}
                  </p>
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => setSelectedFileForShare(null)}
                      className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-xs font-medium text-foreground transition cursor-pointer"
                    >
                      {isFileExpired ? "Close" : "Cancel"}
                    </button>
                    <button
                      type="submit"
                      disabled={creatingShare || isFileExpired}
                      className={`inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold transition shadow-xs ${
                        isFileExpired
                          ? "bg-muted text-muted-foreground cursor-not-allowed border border-border"
                          : "bg-blue-600 hover:bg-blue-500 text-white cursor-pointer disabled:opacity-50"
                      }`}
                    >
                      {creatingShare && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {isFileExpired ? (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>Sharing Locked (File Expired)</span>
                        </>
                      ) : (
                        <span>Create Link</span>
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
    </div>
  );
}
