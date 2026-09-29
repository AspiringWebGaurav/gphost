"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  File as FileIcon,
  Trash2,
  Share2,
  Info,
  Clock,
  Copy,
  Check,
  Link2,
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
  Zap,
  Activity,
  ExternalLink,
  EyeOff,
  MessageSquare,
  Lightbulb,
  QrCode,
  Send,
  Mail,
  Terminal,
  Shield,
  ShieldCheck,
  Users,
  Flame,
  RotateCcw,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { formatTimeRemaining } from "@/lib/storage/expiry";
import { storageEvents } from "@/lib/storage/events";
import { downloadFilesAsZip } from "@/lib/storage/bundle-zip";
import { FileAnalyticsModal } from "@/components/dashboard/file-analytics-modal";
import { ExpiryStatusBadge } from "@/components/ui/expiry-status-badge";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ZipViewerModal } from "@/components/dashboard/zip-viewer-modal";
import { TerminalUploadModal } from "@/components/dashboard/terminal-upload-modal";
import { HtmlHostModal } from "@/components/dashboard/html-host-modal";
import { FileShareLinksModal } from "@/components/dashboard/file-share-links-modal";
import { authFetch } from "@/lib/auth/client-fetch";
import { getFriendlyFileType } from "@/lib/storage/file-type";
import { getShareDomainConfig } from "@/lib/share/constants";
import { useSlugValidation } from "@/lib/hooks/use-slug-validation";

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
  if (lowerMime.includes("html") || lowerName.endsWith(".html") || lowerName.endsWith(".htm")) {
    return {
      type: "website",
      label: "GP-SITE",
      icon: Globe,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10 border-emerald-500/20",
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
  share_slug?: string | null;
  is_site?: boolean;
  xurl_short_url?: string | null;
  xurl_status?: string | null;
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
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Modals state
  const [selectedFileForDetails, setSelectedFileForDetails] = useState<SafeFileItem | null>(null);
  const [selectedFileForShare, setSelectedFileForShare] = useState<SafeFileItem | null>(null);
  const [selectedFileForDelete, setSelectedFileForDelete] = useState<SafeFileItem | null>(null);
  const [selectedFileForAnalytics, setSelectedFileForAnalytics] = useState<SafeFileItem | null>(null);
  const [selectedFileForZip, setSelectedFileForZip] = useState<{ filename: string; url: string } | null>(null);
  const [showTerminalModal, setShowTerminalModal] = useState<boolean>(false);
  const [showHtmlHostModal, setShowHtmlHostModal] = useState<boolean>(false);
  const [openingZipId, setOpeningZipId] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [zippingProgress, setZippingProgress] = useState<{ current: number; total: number; filename: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleOpenZipViewer = async (file: SafeFileItem) => {
    setOpeningZipId(file.id);
    try {
      const res = await fetch(`/api/files/${file.id}/download`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch download link for archive");
      setSelectedFileForZip({ filename: file.sanitized_name, url: data.downloadUrl });
    } catch (err) {
      console.error("Failed to open zip archive:", err);
      alert("Could not load archive for inspection.");
    } finally {
      setOpeningZipId(null);
    }
  };

  // Share form state
  const [shareExpiresIn, setShareExpiresIn] = useState<string>("file_expiry");
  const [shareMaxDownloads, setShareMaxDownloads] = useState<string>("");
  const [shareIsSingleUse, setShareIsSingleUse] = useState<boolean>(false);
  const [shareOnePerMember, setShareOnePerMember] = useState<boolean>(false);
  const [shareBurnAfterPreview, setShareBurnAfterPreview] = useState<boolean>(false);
  const [shareDirectDownload, setShareDirectDownload] = useState<boolean>(false);
  const [shareDisablePreview, setShareDisablePreview] = useState<boolean>(false);
  const [shareRecipientNote, setShareRecipientNote] = useState<string>("");
  const [showRecipientNote, setShowRecipientNote] = useState<boolean>(false);
  const [sharePassword, setSharePassword] = useState<string>("");
  const [sharePasswordHint, setSharePasswordHint] = useState<string>("");
  const [shareCustomSlug, setShareCustomSlug] = useState<string>("");
  const [shareEnableXurl, setShareEnableXurl] = useState<boolean>(false);
  const [creatingShare, setCreatingShare] = useState<boolean>(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [showQrCode, setShowQrCode] = useState<boolean>(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState<boolean>(false);

  const shareDomainConfig = getShareDomainConfig(shareEnableXurl);
  const shareSlugValidation = useSlugValidation(shareCustomSlug, Boolean(selectedFileForShare));

  const handleOpenShare = (file: SafeFileItem) => {
    setSelectedFileForShare(file);
    setShareResult(null);
    setShareError(null);
    setShareCustomSlug("");
    setShareExpiresIn("file_expiry");
    setShareMaxDownloads("");
    setShareIsSingleUse(false);
    setShareOnePerMember(false);
    setShareBurnAfterPreview(false);
    setShareDirectDownload(false);
    setShareDisablePreview(false);
    setShareRecipientNote("");
    setShowRecipientNote(false);
    setSharePassword("");
    setSharePasswordHint("");
    setShareEnableXurl(false);
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
    one_per_member?: boolean;
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
  const [copiedLinkSlug, setCopiedLinkSlug] = useState<string | null>(null);
  const [xurlStatus, setXurlStatus] = useState<{
    configured: boolean;
    valid: boolean;
    status: string;
    plan: string;
    message: string;
  } | null>(null);
  const [retryingXurl, setRetryingXurl] = useState<boolean>(false);
  const [xurlRetryError, setXurlRetryError] = useState<string | null>(null);
  const [checkingXurlLive, setCheckingXurlLive] = useState<boolean>(false);

  const checkXurlLiveStatus = useCallback(async (force: boolean = false) => {
    setCheckingXurlLive(true);
    try {
      const start = Date.now();
      const res = await authFetch(`/api/xurl/status${force ? "?fresh=1" : ""}`);
      const data = res.ok ? await res.json() : null;
      const elapsed = Date.now() - start;
      if (elapsed < 450) {
        await new Promise((r) => setTimeout(r, 450 - elapsed));
      }
      if (data && data.success) {
        setXurlStatus(data);
      }
    } catch (err) {
      console.error("Failed to probe XURL status:", err);
    } finally {
      setCheckingXurlLive(false);
    }
  }, []);


  const handleToggleXurl = (checked: boolean) => {
    setShareEnableXurl(checked);
    if (checked) {
      checkXurlLiveStatus(true);
    }
  };

  const handleRetryXurl = async () => {
    if (!shareResult?.slug) return;
    setRetryingXurl(true);
    setXurlRetryError(null);
    try {
      const res = await authFetch(`/api/share/${shareResult.slug}/xurl`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.shortUrl) {
        setShareResult((prev) =>
          prev
            ? {
                ...prev,
                xurl: {
                  shortUrl: data.shortUrl,
                  status: "active",
                },
              }
            : prev
        );
      } else {
        setXurlRetryError(data.error || "Failed to generate XURL shortlink");
      }
    } catch (err: unknown) {
      setXurlRetryError(err instanceof Error ? err.message : "Failed to retry XURL shortlink");
    } finally {
      setRetryingXurl(false);
    }
  };

  const handleCopyLink = (slug: string, isSite?: boolean) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const targetUrl = isSite ? `${origin}/site/${slug}` : `${origin}/f/${slug}`;
    navigator.clipboard.writeText(targetUrl);
    setCopiedLinkSlug(slug);
    setTimeout(() => setCopiedLinkSlug(null), 2000);
  };

  // Share Links Modal State
  const [selectedFileForLinks, setSelectedFileForLinks] = useState<SafeFileItem | null>(null);

  // Extend Expiry Modal State
  const [selectedFileForExtend, setSelectedFileForExtend] = useState<SafeFileItem | null>(null);
  const [extendPreset, setExtendPreset] = useState<string>("30d");
  const [isExtending, setIsExtending] = useState<boolean>(false);
  const [extendError, setExtendError] = useState<string | null>(null);

  // Direct Download State
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadCooldownIds, setDownloadCooldownIds] = useState<Set<string>>(new Set());
  const [activeDownload, setActiveDownload] = useState<{
    id: string;
    filename: string;
    progress: number;
    status: string;
    completed: boolean;
  } | null>(null);

  const handleDirectDownload = async (file: SafeFileItem) => {
    if (downloadingId === file.id || downloadCooldownIds.has(file.id)) {
      return;
    }

    setDownloadingId(file.id);
    setDownloadCooldownIds((prev) => new Set(prev).add(file.id));
    setTimeout(() => {
      setDownloadCooldownIds((prev) => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
    }, 4000);

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
          ? { ...prev, progress: 65, status: "Connecting to secure storage..." }
          : prev
      );
    }, 150);

    try {
      const res = await fetch(`/api/files/${file.id}/download`);
      clearTimeout(t1);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setActiveDownload(null);
        alert(errData.error || "Too many download requests. Please wait a moment.");
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

  // Skip redundant initial fetch on mount (page 1 is already server-rendered in initialFiles)
  const isInitialMount = useRef(true);

  // Trigger search on query / filter change with debounce
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
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
        : shareOnePerMember
        ? shareMaxDownloads.trim() && parseInt(shareMaxDownloads.trim(), 10) > 1
          ? parseInt(shareMaxDownloads.trim(), 10)
          : null
        : shareMaxDownloads.trim()
        ? parseInt(shareMaxDownloads.trim(), 10)
        : null;

      const payload: Record<string, unknown> = {
        fileId: selectedFileForShare.id,
        expiresInPreset: shareExpiresIn,
        expiresIn: shareExpiresIn,
        maxDownloads: maxDownloadsNum,
        isSingleUse: Boolean(shareIsSingleUse),
        onePerMember: Boolean(!shareIsSingleUse && shareOnePerMember),
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
        if (!shareSlugValidation.isValid) {
          setShareError(shareSlugValidation.message || "Please provide a valid, available custom slug.");
          return;
        }
        payload.customSlug = shareCustomSlug.trim();
      }

      const res = await authFetch("/api/share/create", {
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
        one_per_member: shareData.one_per_member,
        burn_after_preview: shareData.burn_after_preview,
        direct_download: shareData.direct_download,
        disable_preview: shareData.disable_preview,
        recipient_note: shareData.recipient_note,
        password_hint: shareData.password_hint,
        is_custom_slug: shareData.is_custom_slug || data.is_custom_slug,
        is_premium: shareData.is_premium || data.is_premium,
        xurl: shareData.xurl || data.xurl,
      });
      storageEvents.emit("storage:updated", {
        storageUsedBytes: 0,
        source: "local_optimistic",
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
      id: "websites",
      name: "GP-Sites",
      count: files.filter(
        (f) =>
          f.mime_type === "text/html" ||
          f.sanitized_name?.toLowerCase().endsWith(".html") ||
          f.sanitized_name?.toLowerCase().endsWith(".htm") ||
          Boolean(f.is_site)
      ).length,
    },
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
          (f.mime_type?.includes("pdf") ||
            f.mime_type?.includes("text") ||
            f.mime_type?.includes("document")) &&
          f.mime_type !== "text/html"
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
    <div className="space-y-3 sm:space-y-5">
      {/* 1. Suggested Folders Section (Google Drive & Windows 11 Style) */}
      <div className="space-y-1.5 sm:space-y-2">
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

        <div className="flex items-center gap-2 overflow-x-auto pb-1.5 no-scrollbar sm:grid sm:grid-cols-3 md:grid-cols-6 sm:overflow-visible">
          {FOLDERS.map((f) => {
            const isSelected = category === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setCategory(f.id)}
                className={`shrink-0 p-2 sm:p-3 rounded-xl sm:rounded-2xl border text-left transition-all duration-150 flex items-center gap-2 sm:gap-2.5 cursor-pointer group select-none min-w-[130px] sm:min-w-0 ${
                  isSelected
                    ? "bg-blue-500/10 border-blue-500/40 text-blue-600 dark:text-blue-400 shadow-2xs font-semibold ring-1 ring-blue-500/30"
                    : "bg-card hover:bg-muted/40 border-border text-foreground hover:border-border/80 shadow-2xs"
                }`}
              >
                <div
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                  }`}
                >
                  {isSelected ? (
                    <FolderOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  ) : (
                    <Folder className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current/20" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs sm:text-sm font-semibold truncate">{f.name}</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground truncate">
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
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted/40 border border-border text-sm text-muted-foreground font-mono select-none">
          <span className="flex items-center gap-1 text-foreground font-medium">
            <Folder className="w-4 h-4 text-amber-500 fill-amber-500/20" />
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
              className="w-full pl-9 pr-7 py-2 rounded-xl bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500 transition"
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

            {/* Host HTML Webpage Button */}
            <button
              onClick={() => setShowHtmlHostModal(true)}
              className="px-2.5 py-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0 font-medium"
              title="Host static HTML webpage with custom domain and slug"
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px] font-semibold">Host Webpage</span>
            </button>

            {/* Terminal Upload cURL Quick Launcher */}
            <button
              onClick={() => setShowTerminalModal(true)}
              className="p-1.5 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0"
              title="Upload via Terminal (cURL / PowerShell)"
            >
              <Terminal className="w-3.5 h-3.5 text-blue-500" />
              <span className="hidden md:inline font-mono text-[11px]">cURL</span>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
            {files.map((file) => {
              const isExpired =
                file.status === "EXPIRED" ||
                (file.expires_at !== null && new Date(file.expires_at).getTime() <= currentTime);
              const fileType = getFileTypeDetails(file.mime_type, file.sanitized_name);
              const FileTypeIcon = fileType.icon;
              return (
                <div
                  key={file.id}
                  className={`relative rounded-2xl border ${
                    isExpired ? "border-rose-500/35 bg-rose-500/[0.02]" : "border-border bg-card"
                  } p-3.5 shadow-2xs hover:shadow-md hover:border-border/80 transition-all duration-200 group flex flex-col justify-between overflow-hidden`}
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
                        <span className="text-[10px] font-medium text-muted-foreground truncate max-w-[120px]">{getFriendlyFileType(file.mime_type, file.sanitized_name)}</span>
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
                        <span className="text-[10px] font-medium text-muted-foreground">PDF Document</span>
                      </div>
                    ) : fileType.type === "media" ? (
                      <div className="flex flex-col items-center gap-1.5 text-sky-600 dark:text-sky-400">
                        <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Film className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground truncate max-w-[120px]">{getFriendlyFileType(file.mime_type, file.sanitized_name)}</span>
                      </div>
                    ) : fileType.type === "archive" ? (
                      <div className="flex flex-col items-center gap-1.5 text-amber-600 dark:text-amber-400">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Archive className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {file.sanitized_name.toLowerCase().endsWith(".zip") ? "ZIP Archive" : "Archive"}
                        </span>
                      </div>
                    ) : fileType.type === "website" ? (
                      <div className="flex flex-col items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Globe className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 truncate max-w-[120px]">
                          Webpage
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 text-blue-600 dark:text-blue-400">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <FileTypeIcon className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground truncate max-w-[120px]">{getFriendlyFileType(file.mime_type, file.sanitized_name)}</span>
                      </div>
                    )}

                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 dark:group-hover:bg-white/5 transition flex items-center justify-center opacity-0 group-hover:opacity-100 gap-1.5 p-2">
                      <span className="px-2 py-1 rounded-md bg-background/90 backdrop-blur-xs border border-border text-[10px] font-medium text-foreground shadow-xs">
                        Details
                      </span>
                      {(file.sanitized_name.toLowerCase().endsWith(".zip") || file.mime_type.includes("zip")) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleOpenZipViewer(file);
                          }}
                          disabled={openingZipId === file.id}
                          className="px-2 py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-medium shadow-xs transition flex items-center gap-1 cursor-pointer"
                          title="Inspect files inside ZIP archive"
                        >
                          {openingZipId === file.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Archive className="w-3 h-3" />
                          )}
                          <span>Browse</span>
                        </button>
                      )}
                      {(file.sanitized_name.toLowerCase().endsWith(".html") || file.mime_type.includes("html") || file.is_site) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenShare(file);
                          }}
                          className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-medium shadow-xs transition flex items-center gap-1 cursor-pointer"
                          title="Host as live webpage"
                        >
                          <Globe className="w-3 h-3" />
                          <span>Live Site</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Hosted Site Badge OR Share Link Badge */}
                  {file.is_site ? (
                    <div className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs mb-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <span className="font-semibold truncate text-[11px]">
                          {file.share_slug ? `/site/${file.share_slug}` : "GP-Site Live"}
                        </span>
                      </div>
                      {file.share_slug ? (
                        <a
                          href={`/site/${file.share_slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-background/80 hover:bg-background border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-mono text-[10px] font-medium transition cursor-pointer shadow-2xs"
                          title="Open live site in new tab"
                        >
                          <span>Visit</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenShare(file);
                          }}
                          className="shrink-0 text-[10px] font-semibold underline hover:text-emerald-500 cursor-pointer"
                        >
                          Configure
                        </button>
                      )}
                    </div>
                  ) : file.share_slug ? (
                    <div className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs mb-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Link2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span className="font-semibold truncate text-[11px] font-mono text-blue-600 dark:text-blue-400">
                          /f/{file.share_slug}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <a
                          href={`/f/${file.share_slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="px-2 py-0.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium text-[10px] transition cursor-pointer shadow-2xs inline-flex items-center gap-0.5"
                          title="Open public share page in new tab"
                        >
                          <span>Open</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                        <a
                          href={file.is_site ? `/site/${file.share_slug}` : `/raw/${file.share_slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="px-2 py-0.5 rounded-md bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-700 dark:text-purple-300 font-medium text-[10px] transition cursor-pointer shadow-2xs inline-flex items-center gap-0.5"
                          title={file.is_site ? "Open live website" : "Open direct raw CDN embed stream"}
                        >
                          <span>{file.is_site ? "Site" : "Embed"}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFileForLinks(file);
                          }}
                          className="px-2 py-0.5 rounded-md bg-background/90 hover:bg-background border border-border text-foreground font-semibold text-[10px] transition cursor-pointer shadow-2xs inline-flex items-center gap-1"
                          title="View all link channels (Default, Embed, XURL)"
                        >
                          <span>Links</span>
                          <Sparkles className="w-2.5 h-2.5 text-emerald-500" />
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* Card Metadata */}
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 pb-2 border-b border-border/60 gap-2 min-w-0">
                    <span className="font-mono font-medium text-foreground/80 shrink-0 whitespace-nowrap">
                      {formatBytes(file.byte_size)}
                    </span>
                    <div className="min-w-0 shrink-0">
                      <ExpiryStatusBadge expiresAt={file.expires_at} status={file.status} size="xs" />
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="flex items-center gap-1.5 pt-2.5 mt-auto">
                    {isExpired ? (
                      <button
                        onClick={() => {
                          setSelectedFileForExtend(file);
                          setExtendPreset("30d");
                          setExtendError(null);
                        }}
                        className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition shadow-xs cursor-pointer"
                        title="Extend file expiration"
                      >
                        <RotateCw className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Extend</span>
                      </button>
                    ) : file.share_slug ? (
                      <div className="flex-1 min-w-0 flex items-center gap-1">
                        {file.is_site ? (
                          <a
                            href={`/site/${file.share_slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 min-w-0 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-xs cursor-pointer"
                            title="Open live site in new tab"
                          >
                            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">Visit</span>
                          </a>
                        ) : (
                          <a
                            href={`/f/${file.share_slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 min-w-0 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition shadow-xs cursor-pointer"
                            title="Open public share page in new tab"
                          >
                            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">Open Link</span>
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCopyLink(file.share_slug!, file.is_site)}
                          className="px-2 py-1.5 rounded-xl border border-border bg-background hover:bg-muted text-foreground text-xs font-medium transition cursor-pointer shrink-0"
                          title={file.is_site ? "Copy live site URL" : "Copy share link"}
                        >
                          {copiedLinkSlug === file.share_slug ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleOpenShare(file)}
                        className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition shadow-xs cursor-pointer"
                        title="Share file"
                      >
                        <Share2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Share</span>
                      </button>
                    )}

                    <div className="flex items-center gap-1 shrink-0">
                      {file.share_slug && (
                        <button
                          onClick={() => setSelectedFileForLinks(file)}
                          className="w-7 h-7 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 border border-blue-500/25 flex items-center justify-center transition cursor-pointer shrink-0 shadow-2xs"
                          title="View All Share Links (Default, Embed, XURL)"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        onClick={() => handleDirectDownload(file)}
                        disabled={downloadingId === file.id || downloadCooldownIds.has(file.id)}
                        className="w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 flex items-center justify-center transition cursor-pointer shrink-0 disabled:opacity-50"
                        title={downloadCooldownIds.has(file.id) ? "Download cooling down..." : "Download file"}
                      >
                        {downloadingId === file.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        onClick={() => setSelectedFileForAnalytics(file)}
                        className="w-7 h-7 rounded-lg text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 border border-purple-500/20 flex items-center justify-center transition cursor-pointer shrink-0"
                        title="View File Analytics"
                        data-testid={`file-manager-grid-analytics-${file.id}`}
                      >
                        <Activity className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => setSelectedFileForDetails(file)}
                        className="w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 flex items-center justify-center transition cursor-pointer shrink-0"
                        title="View file details"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => setSelectedFileForDelete(file)}
                        className="w-7 h-7 rounded-lg text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center transition cursor-pointer shrink-0"
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-foreground truncate max-w-sm sm:max-w-md">
                          {file.sanitized_name}
                        </h3>
                        {file.share_slug && file.is_site && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Live Site
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        {file.is_site && file.share_slug ? (
                          <a
                            href={`/site/${file.share_slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400 hover:underline font-mono text-[11px]"
                            title="Open live site in new tab"
                          >
                            <span>/site/{file.share_slug}</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                          </a>
                        ) : file.share_slug ? (
                          <a
                            href={`/f/${file.share_slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 font-medium text-blue-600 dark:text-blue-400 hover:underline font-mono text-[11px]"
                            title="Open public share page in new tab"
                          >
                            <span>/f/{file.share_slug}</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                          </a>
                        ) : (
                          <span className="font-medium text-foreground/80">{getFriendlyFileType(file.mime_type, file.sanitized_name)}</span>
                        )}
                        <span>&bull;</span>
                        <span className="font-mono">{formatBytes(file.byte_size)}</span>
                        <span>&bull;</span>
                        <ExpiryStatusBadge expiresAt={file.expires_at} status={file.status} size="xs" />
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

                    {file.share_slug ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {file.is_site ? (
                          <a
                            href={`/site/${file.share_slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-xs cursor-pointer"
                            title="Open live site in new tab"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Visit</span>
                          </a>
                        ) : (
                          <a
                            href={`/f/${file.share_slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition shadow-xs cursor-pointer"
                            title="Open public share page in new tab"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Open Link</span>
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCopyLink(file.share_slug!, file.is_site)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-medium transition cursor-pointer"
                          title={file.is_site ? "Copy live site URL" : "Copy share URL"}
                        >
                          {copiedLinkSlug === file.share_slug ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold hidden sm:inline">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="hidden sm:inline">Copy Link</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedFileForLinks(file)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-blue-500/25 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-semibold transition cursor-pointer"
                          title="View all link channels (Default, Embed/Direct, XURL)"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Links</span>
                          <Sparkles className="w-2.5 h-2.5 text-emerald-500" />
                        </button>
                      </div>
                    ) : isExpired ? (
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
                      disabled={downloadingId === file.id || downloadCooldownIds.has(file.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer disabled:opacity-50"
                      title={downloadCooldownIds.has(file.id) ? "Download cooling down..." : "Download file"}
                    >
                      {downloadingId === file.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <button
                      onClick={() => setSelectedFileForAnalytics(file)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/15 text-purple-600 dark:text-purple-400 text-xs font-medium transition cursor-pointer"
                      title="View File Analytics & Downloads"
                      data-testid={`file-manager-analytics-${file.id}`}
                    >
                      <Activity className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Analytics</span>
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
                  <div className="text-muted-foreground mb-0.5">File Type</div>
                  <div className="text-foreground font-medium truncate">
                    {getFriendlyFileType(selectedFileForDetails.mime_type, selectedFileForDetails.sanitized_name)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-muted-foreground mb-0.5">Status</div>
                  <ExpiryStatusBadge expiresAt={selectedFileForDetails.expires_at} status={selectedFileForDetails.status} />
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
                      ? `${new Date(selectedFileForDetails.expires_at).toLocaleString()}`
                      : "Permanent Storage (Never Expire)"}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-border flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const target = selectedFileForDetails;
                    setSelectedFileForDetails(null);
                    setSelectedFileForAnalytics(target);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 text-xs font-semibold transition cursor-pointer"
                  data-testid="file-details-analytics-btn"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>View Analytics</span>
                </button>

                {(selectedFileForDetails.sanitized_name.toLowerCase().endsWith(".zip") || selectedFileForDetails.mime_type.includes("zip")) && (
                  <button
                    type="button"
                    onClick={() => {
                      const file = selectedFileForDetails;
                      setSelectedFileForDetails(null);
                      void handleOpenZipViewer(file);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-xs font-semibold transition cursor-pointer"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>Browse ZIP Files</span>
                  </button>
                )}
              </div>

              <button
                onClick={() => setSelectedFileForDetails(null)}
                className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-xs font-semibold text-foreground transition cursor-pointer"
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

        const isBrowser = typeof window !== "undefined";
        const origin = isBrowser ? window.location.origin : "https://gphost.eu.cc";
        const isLocal =
          isBrowser &&
          (window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1" ||
            window.location.hostname === "::1" ||
            window.location.hostname === "0.0.0.0" ||
            window.location.hostname.startsWith("192.168.") ||
            window.location.hostname.startsWith("10.") ||
            window.location.hostname.endsWith(".local") ||
            window.location.hostname.endsWith(".localhost"));

        const publicGphostOrigin = (
          (isBrowser && window.location.protocol === "https:" ? window.location.origin : null) ||
          (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.startsWith("https://")
            ? process.env.NEXT_PUBLIC_APP_URL
            : null) ||
          "https://gphost.eu.cc"
        ).replace(/\/+$/, "");

        const activeSlug = shareResult
          ? shareResult.slug || (shareResult as unknown as { share?: { slug?: string } }).share?.slug || ""
          : "";

        const displayShareUrl = activeSlug ? `${publicGphostOrigin}/f/${activeSlug}` : shareResult?.shareUrl || "";
        const openShareUrl = activeSlug
          ? isLocal
            ? `${origin}/f/${activeSlug}`
            : displayShareUrl
          : shareResult?.shareUrl || "";

        const displayRawUrl = activeSlug ? `${publicGphostOrigin}/raw/${activeSlug}` : shareResult?.rawUrl || "";
        const openRawUrl = activeSlug
          ? isLocal
            ? `${origin}/raw/${activeSlug}`
            : displayRawUrl
          : shareResult?.rawUrl || "";

        const rawXurl = shareResult
          ? shareResult.xurl?.shortUrl ||
            (shareResult as unknown as { share?: { xurl?: { shortUrl?: string } } }).share?.xurl?.shortUrl
          : null;

        const formattedXurl = rawXurl
          ? rawXurl.startsWith("http://") || rawXurl.startsWith("https://")
            ? rawXurl
            : `https://${rawXurl}`
          : null;

        const preferredShareUrl = formattedXurl || displayShareUrl;

        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
            <div className="w-full max-w-4xl xl:max-w-5xl rounded-2xl bg-card border border-border p-3.5 sm:p-4.5 shadow-2xl relative space-y-2.5 sm:space-y-3 max-h-[96vh] overflow-y-auto sm:overflow-visible scrollbar-none transition-all">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Share2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground leading-tight">Create Share Link</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">Customize your link, add protection, and choose delivery options.</p>
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 py-1.5 px-3 rounded-xl bg-muted/40 border border-border">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-md bg-background border border-border/80 text-blue-500 flex items-center justify-center shrink-0">
                    <FileIcon className="w-3 h-3" />
                  </div>
                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                    <div className="text-xs font-semibold text-foreground truncate max-w-[260px] sm:max-w-[360px]" title={selectedFileForShare.sanitized_name}>
                      {selectedFileForShare.sanitized_name}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-mono">
                      <span>{formatBytes(selectedFileForShare.byte_size)}</span>
                      <span>&bull;</span>
                      {selectedFileForShare.expires_at ? (
                        isFileExpired ? (
                          <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 inline" />
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

              {shareEnableXurl && (
                checkingXurlLive ? (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 text-xs shrink-0 self-start sm:self-auto shadow-2xs animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                    <span className="font-semibold text-[10px]">Checking XURL Service...</span>
                    <span className="inline-flex items-center gap-1 text-[8.5px] text-blue-500 font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                      Live
                    </span>
                  </div>
                ) : xurlStatus?.valid ? (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/25 text-blue-600 dark:text-blue-400 text-xs shrink-0 self-start sm:self-auto shadow-2xs animate-in fade-in duration-200">
                    <Sparkles className="w-3 h-3 text-blue-500 shrink-0" />
                    <span className="font-semibold text-[10px]">XURL Premium Plan</span>
                    <span className="text-[9px] text-blue-500/80 dark:text-blue-400/80">
                      &bull; Custom name unlocked
                    </span>
                    <span className="inline-flex items-center gap-1 px-1 py-0.2 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[8.5px] font-semibold">
                      <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                      Live Service
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-xs shrink-0 self-start sm:self-auto animate-in fade-in duration-200">
                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                    <span className="font-semibold text-[10px]">XURL Notice</span>
                    <span className="text-[9px] text-amber-600/80 dark:text-amber-400/80">
                      &bull; Verify API key
                    </span>
                  </div>
                )
              )}
            </div>            {shareResult ? (
              <div className="space-y-3.5">
                {/* Top Success Banner */}
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <Check className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold leading-tight flex items-center gap-1.5">
                        <span>Your Share Link is Active!</span>
                        {shareResult.is_custom_slug && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                            Custom Alias
                          </span>
                        )}
                      </h4>
                      <p className="text-[11px] text-emerald-600/90 dark:text-emerald-400/90 truncate">
                        Share link created successfully. Copy and send it to your recipients.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {selectedFileForShare && (
                      <button
                        type="button"
                        onClick={() => {
                          const target = selectedFileForShare;
                          setSelectedFileForShare(null);
                          setSelectedFileForAnalytics(target);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 transition cursor-pointer"
                        title="View File Analytics"
                      >
                        <Activity className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Analytics</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* TOP HERO: The Created Links Card */}
                <div className="p-4 rounded-2xl bg-card border-2 border-blue-500/40 shadow-sm space-y-3 relative overflow-hidden">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                        <span className="text-xs font-bold text-foreground">Created Share Link</span>
                        <span className="text-[10px] font-semibold font-mono px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                          Primary Link
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground hidden sm:inline">
                        Direct preview &amp; download page
                      </span>
                    </div>

                    {/* Main Link Input + Copy & Open Buttons */}
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={displayShareUrl}
                        className="flex-1 min-w-0 h-10 px-3.5 rounded-xl bg-muted/40 hover:bg-muted/60 border border-border text-xs sm:text-sm text-foreground font-mono font-medium select-all focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (displayShareUrl) {
                            navigator.clipboard.writeText(displayShareUrl);
                            setCopiedDirect(true);
                            setTimeout(() => setCopiedDirect(false), 2000);
                          }
                        }}
                        className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 transition cursor-pointer shadow-sm hover:shadow-blue-500/25 active:scale-95 shrink-0"
                      >
                        {copiedDirect ? <Check className="w-4 h-4 stroke-[2.5]" /> : <Copy className="w-4 h-4" />}
                        <span>{copiedDirect ? "Copied!" : "Copy Link"}</span>
                      </button>
                      {openShareUrl && (
                        <a
                          href={openShareUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-10 px-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 transition cursor-pointer flex items-center justify-center shrink-0"
                          title="Open share link in new tab"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Validity & Security Status Badges Strip */}
                  <div className="pt-2 border-t border-border/60 flex flex-wrap items-center gap-2 text-xs">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/60 border border-border/80 text-foreground font-medium">
                      <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span>Validity:</span>
                      <ExpiryStatusBadge expiresAt={shareResult.expires_at} />
                    </div>

                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/60 border border-border/80 text-foreground font-medium">
                      <Download className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span>Limit:</span>
                      <strong className="text-foreground font-mono">
                        {shareResult.is_single_use
                          ? "1 (Single-Use)"
                          : shareResult.max_downloads
                          ? `${shareResult.max_downloads} downloads`
                          : "Unlimited"}
                      </strong>
                    </div>

                    {shareResult.password_hint && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 font-semibold">
                        <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span>Password Protected</span>
                      </div>
                    )}

                    {shareResult.burn_after_preview && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 font-semibold">
                        <Flame className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <span>Burns After View</span>
                      </div>
                    )}

                    {shareResult.direct_download && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-600 dark:text-purple-400 font-semibold">
                        <Zap className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                        <span>Direct Download Mode</span>
                      </div>
                    )}
                  </div>

                  {/* Dynamic XURL Short Link (if requested or available) */}
                  {(formattedXurl || shareEnableXurl || shareResult.xurl) && (
                    <div className="mt-2 pt-3 border-t border-blue-500/20 space-y-2">
                      {formattedXurl ? (
                        <div className="p-3 rounded-xl bg-indigo-500/[0.08] border border-indigo-500/30 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <Globe className="w-3.5 h-3.5 text-indigo-500" />
                              <span className="text-xs font-bold text-foreground">XURL Vanity Shortlink</span>
                              <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                                Live Synced
                              </span>
                            </div>
                            <a
                              href="https://xurl.eu.cc"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium inline-flex items-center gap-0.5"
                            >
                              <span>xurl.eu.cc</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              readOnly
                              value={formattedXurl}
                              className="flex-1 min-w-0 h-9 px-3 rounded-lg bg-background border border-indigo-500/30 text-xs sm:text-sm text-indigo-600 dark:text-indigo-400 font-mono font-medium select-all focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (formattedXurl) {
                                  navigator.clipboard.writeText(formattedXurl);
                                  setCopiedXurl(true);
                                  setTimeout(() => setCopiedXurl(false), 2000);
                                }
                              }}
                              className="h-9 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs shrink-0"
                            >
                              {copiedXurl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedXurl ? "Copied!" : "Copy Shortlink"}</span>
                            </button>
                            <a
                              href={formattedXurl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="h-9 px-2.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 transition cursor-pointer flex items-center justify-center shrink-0"
                              title="Open XURL link in new tab"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>
                      ) : shareEnableXurl ? (
                        <div className="p-3 rounded-xl bg-amber-500/[0.08] border border-amber-500/30 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span className="text-xs font-semibold text-foreground">XURL Shortlink Notice</span>
                              <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 uppercase">
                                {shareResult.xurl?.status || "Pending"}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={handleRetryXurl}
                              disabled={retryingXurl}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold transition cursor-pointer disabled:opacity-50 shadow-2xs"
                            >
                              {retryingXurl ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                              <span>{retryingXurl ? "Retrying..." : "Retry XURL Link"}</span>
                            </button>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            {xurlRetryError || shareResult.xurl?.error || "XURL shortlink could not be generated automatically. Direct link above works normally."}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* SECONDARY SECTION: "belo that other n all" */}
                <div className="space-y-3">
                  {/* 1-Click Instant Sharing Strip */}
                  <div className="p-3 rounded-xl bg-muted/30 border border-border/80 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Send className="w-3.5 h-3.5 text-blue-500" />
                        <span>1-Click Instant Sharing</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground hidden sm:inline">
                        Shares {formattedXurl ? "compact XURL" : "direct link"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                          `Download "${selectedFileForShare?.sanitized_name}" securely on GPHost: ${preferredShareUrl}`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 text-xs font-medium transition cursor-pointer"
                        title="Share via WhatsApp"
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span>WhatsApp</span>
                      </a>

                      <a
                        href={`https://t.me/share/url?url=${encodeURIComponent(
                          preferredShareUrl
                        )}&text=${encodeURIComponent(
                          `Download "${selectedFileForShare?.sanitized_name}" securely on GPHost`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/25 text-xs font-medium transition cursor-pointer"
                        title="Share via Telegram"
                      >
                        <span className="w-2 h-2 rounded-full bg-sky-500" />
                        <span>Telegram</span>
                      </a>

                      <a
                        href={`mailto:?subject=${encodeURIComponent(
                          `Download: ${selectedFileForShare?.sanitized_name}`
                        )}&body=${encodeURIComponent(
                          `Hi,\n\nI have shared "${selectedFileForShare?.sanitized_name}" with you via GPHost.\n\nYou can access or download it here:\n${preferredShareUrl}\n\nThis link will automatically expire based on security settings.\n`
                        )}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground border border-border text-xs font-medium transition cursor-pointer"
                        title="Share via Email"
                      >
                        <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Email</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`[${selectedFileForShare?.sanitized_name}](${preferredShareUrl})`);
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

                      <button
                        type="button"
                        onClick={() => setShowQrCode(!showQrCode)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                          showQrCode
                            ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
                            : "bg-muted hover:bg-muted/80 text-foreground border-border"
                        }`}
                      >
                        <QrCode className="w-3.5 h-3.5 text-blue-500" />
                        <span>{showQrCode ? "Hide QR" : "Show QR Code"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Instant Client-Side QR Code */}
                  {showQrCode && (
                    <div className="p-4 rounded-xl bg-card border border-border shadow-xs flex flex-col sm:flex-row items-center gap-4 animate-in fade-in duration-200">
                      <div className="p-2.5 bg-white rounded-xl shadow-xs border border-neutral-200 shrink-0">
                        <QRCodeSVG
                          value={preferredShareUrl}
                          size={120}
                          level="M"
                          includeMargin={false}
                          className="w-[110px] h-[110px]"
                        />
                      </div>
                      <div className="space-y-1.5 text-center sm:text-left min-w-0">
                        <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-semibold text-foreground">
                          <QrCode className="w-4 h-4 text-blue-500" />
                          <span>Instant Mobile QR Code</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Point your mobile phone camera at this QR code to instantly open or download this file on your mobile device.
                        </p>
                        <div className="text-[10.5px] font-mono text-blue-600 dark:text-blue-400 truncate max-w-[250px] sm:max-w-md">
                          {preferredShareUrl}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Direct Media Link (CDN Raw Stream) for Embedding */}
                  <div className="p-3 rounded-xl bg-purple-500/[0.06] border border-purple-500/25 space-y-2">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                        <label className="text-xs font-semibold text-purple-700 dark:text-purple-300">
                          Direct Media Hotlink (Raw Stream)
                        </label>
                        <span className="text-[9.5px] font-medium text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0.2 rounded border border-purple-500/20">
                          Direct Stream
                        </span>
                      </div>
                      <span className="text-[10.5px] text-muted-foreground hidden sm:inline">
                        Pure file link to embed in Discord, blogs &amp; READMEs
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={displayRawUrl}
                        className="flex-1 min-w-0 h-8.5 px-3 rounded-lg bg-background border border-purple-500/30 text-xs text-foreground font-mono select-all focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (displayRawUrl) {
                            navigator.clipboard.writeText(displayRawUrl);
                            setCopiedRaw(true);
                            setTimeout(() => setCopiedRaw(false), 2000);
                          }
                        }}
                        className="h-8.5 px-3.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs shrink-0"
                      >
                        {copiedRaw ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedRaw ? "Copied!" : "Copy"}</span>
                      </button>
                      {openRawUrl && (
                        <a
                          href={openRawUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-8.5 px-2.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 transition cursor-pointer flex items-center justify-center shrink-0"
                          title="Open raw media stream"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="pt-2 border-t border-border flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    Links can be managed or revoked at any time from Links tab.
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedFileForShare(null)}
                    className="px-5 py-2 rounded-xl bg-foreground text-background text-xs font-semibold hover:opacity-90 transition cursor-pointer shadow-sm"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateShare} className="space-y-2.5 sm:space-y-3">
                {/* Expired File Warning Banner */}
                {isFileExpired && (
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 flex items-start gap-2 animate-in fade-in duration-200">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="space-y-0.5 text-xs">
                      <div className="font-semibold">File Has Expired</div>
                      <div className="text-[11px] text-rose-600/90 dark:text-rose-400/90">
                        This file has expired, so new share links cannot be created.
                      </div>
                    </div>
                  </div>
                )}

                {creatingShare && (
                  <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center gap-2.5 text-xs text-blue-600 dark:text-blue-400 font-semibold shadow-xs animate-pulse">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
                    <span>Locking options &amp; generating your share link...</span>
                  </div>
                )}

                <fieldset
                  disabled={isFileExpired || creatingShare}
                  className={`space-y-2.5 sm:space-y-3 border-0 p-0 m-0 ${
                    isFileExpired || creatingShare ? "opacity-50 pointer-events-none select-none" : ""
                  }`}
                >
                  {/* Section 1: 4 Core Settings in Balanced 2x2 Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
                    {/* Expiry Selector */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[11.5px] font-semibold text-foreground/90 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-blue-500" />
                          <span>Link Expiration</span>
                          <InfoTooltip
                            title="Automatic Expiration"
                            content="This link stays active as long as the file does. When the file expires, this link automatically closes."
                          />
                        </label>
                        {selectedFileForShare.expires_at && !isFileExpired && (
                          <span className="text-[9.5px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-1.5 py-0.2 rounded-full border border-emerald-500/20">
                            <Check className="w-2.5 h-2.5" />
                            <span>Auto-expires</span>
                          </span>
                        )}
                      </div>

                      <div className="relative group">
                        <select
                          value="file_expiry"
                          disabled
                          className="w-full h-8.5 px-3 rounded-lg bg-muted/30 border border-border/80 text-xs text-foreground/90 font-medium cursor-not-allowed appearance-none select-none pr-8 disabled:opacity-90"
                        >
                          <option value="file_expiry">
                            {selectedFileForShare.expires_at
                              ? isFileExpired
                                ? "File Expired"
                                : `Same as file (expires in ${formatExpiry(selectedFileForShare.expires_at, currentTime)})`
                              : "Permanent (Never expires)"}
                          </option>
                        </select>
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                        </div>
                      </div>

                      <p className="text-[10px] text-muted-foreground/75 truncate">
                        {selectedFileForShare.expires_at
                          ? isFileExpired
                            ? "Target file has expired. Sharing is locked."
                            : `Link will automatically expire in ${formatExpiry(selectedFileForShare.expires_at, currentTime)}.`
                          : "Permanent file — link will never expire."}
                      </p>
                    </div>

                    {/* Password Protection */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[11.5px] font-semibold text-foreground/90 flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>Password Protection</span>
                          <span className="text-[10px] font-normal text-muted-foreground">(Optional)</span>
                          <InfoTooltip
                            title="Password Protection"
                            content="Require visitors to enter a password before viewing or downloading this file. Leave blank for a public link."
                          />
                        </label>
                        <span className="text-[9.5px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.2 rounded border border-border/60">
                          Encrypted
                        </span>
                      </div>
                      <input
                        type="password"
                        placeholder="Leave blank for public access"
                        value={sharePassword}
                        onChange={(e) => setSharePassword(e.target.value)}
                        maxLength={128}
                        className="w-full h-8.5 px-3 rounded-lg bg-background/90 hover:bg-background border border-border/80 hover:border-blue-500/60 dark:hover:border-blue-400/60 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none text-xs text-foreground placeholder:text-muted-foreground/50 transition-all shadow-2xs"
                      />

                      {/* Smooth Accordion: Password Hint */}
                      {sharePassword.length > 0 && (
                        <div className="pt-0.5 animate-in fade-in slide-in-from-top-1 duration-150 space-y-0.5">
                          <div className="flex items-center justify-between">
                            <label className="text-[10.5px] font-semibold text-muted-foreground flex items-center gap-1">
                              <Lightbulb className="w-2.5 h-2.5 text-amber-500" />
                              <span>Password Hint (Optional)</span>
                            </label>
                            <span className="text-[9.5px] text-muted-foreground">Shown to recipient</span>
                          </div>
                          <input
                            type="text"
                            placeholder="e.g. Office Wi-Fi password"
                            value={sharePasswordHint}
                            onChange={(e) => setSharePasswordHint(e.target.value)}
                            maxLength={100}
                            className="w-full h-7.5 px-2.5 rounded-lg bg-background/90 border border-border/80 text-xs text-foreground placeholder:text-muted-foreground/50"
                          />
                        </div>
                      )}

                      <p className="text-[10px] text-muted-foreground/75 truncate">
                        Visitors must enter this password to view or download.
                      </p>
                    </div>
                  </div>

                  {/* Section 2: Custom Link URL (Dynamic Localhost / GPHost / XURL with Live Validation) */}
                  <div className="space-y-1 p-2 sm:p-2.5 rounded-xl bg-card border border-border/80 shadow-2xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <label className="text-[11.5px] font-semibold text-foreground/90 flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-blue-500" />
                        <span>Custom Link URL (Slug)</span>
                        <span className="text-[10px] font-normal text-muted-foreground">(Optional)</span>
                      </label>
                      <div>
                        {shareCustomSlug.trim() ? (
                          shareSlugValidation.status === "checking" ? (
                            <span className="text-[9.5px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/25 flex items-center gap-1 animate-pulse">
                              <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-500" />
                              <span>Checking availability...</span>
                            </span>
                          ) : shareSlugValidation.status === "available" ? (
                            <span className="text-[9.5px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/25 flex items-center gap-1 shadow-2xs">
                              <Check className="w-2.5 h-2.5 text-emerald-500" />
                              <span>Slug Available</span>
                            </span>
                          ) : shareSlugValidation.status === "taken" ? (
                            <span className="text-[9.5px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/25 flex items-center gap-1 shadow-2xs">
                              <X className="w-2.5 h-2.5 text-rose-500" />
                              <span>Slug Already Taken</span>
                            </span>
                          ) : shareSlugValidation.status === "reserved" ? (
                            <span className="text-[9.5px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/25 flex items-center gap-1">
                              <AlertTriangle className="w-2.5 h-2.5 text-amber-500" />
                              <span>Reserved Slug</span>
                            </span>
                          ) : shareSlugValidation.status === "too_short" ? (
                            <span className="text-[9.5px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/25 flex items-center gap-1">
                              <AlertCircle className="w-2.5 h-2.5 text-amber-500" />
                              <span>Min 3 Characters</span>
                            </span>
                          ) : (
                            <span className="text-[9.5px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/25 flex items-center gap-1">
                              <AlertCircle className="w-2.5 h-2.5 text-amber-500" />
                              <span>{shareSlugValidation.message || "Invalid Format"}</span>
                            </span>
                          )
                        ) : shareEnableXurl ? (
                          checkingXurlLive ? (
                            <span className="text-[9.5px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/25 flex items-center gap-1 animate-pulse">
                              <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-500" />
                              <span>Detecting XURL Plan...</span>
                            </span>
                          ) : xurlStatus?.valid ? (
                            <span className="text-[9.5px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/25 flex items-center gap-1 shadow-2xs">
                              <Sparkles className="w-2.5 h-2.5 text-emerald-500" />
                              <span>✨ XURL Vanity Route</span>
                            </span>
                          ) : (
                            <span className="text-[9.5px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/25 flex items-center gap-1">
                              <AlertTriangle className="w-2.5 h-2.5 text-amber-500" />
                              <span>API Key Required</span>
                            </span>
                          )
                        ) : shareDomainConfig.isLocal ? (
                          <span className="text-[9.5px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span>Localhost Native Link</span>
                          </span>
                        ) : (
                          <span className="text-[9.5px] font-medium text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            <span>GPHost Legacy Link</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div
                        className={`flex items-center h-8.5 rounded-lg border transition-all duration-200 overflow-hidden group ${
                          shareCustomSlug.trim() && !shareSlugValidation.isValid && shareSlugValidation.status !== "checking"
                            ? "bg-rose-500/[0.03] border-rose-500/50 focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-500/20"
                            : shareSlugValidation.status === "available"
                            ? "bg-emerald-500/[0.03] border-emerald-500/50 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/20"
                            : shareSlugValidation.status === "checking"
                            ? "bg-blue-500/[0.03] border-blue-500/40 focus-within:border-blue-500"
                            : "bg-background/90 hover:bg-background border-border/80 hover:border-blue-500/60 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/20"
                        }`}
                      >
                        {/* Attached Domain Prefix */}
                        <div className="h-full flex items-center px-2.5 bg-muted/40 text-[11.5px] text-muted-foreground font-mono font-medium border-r border-border/80 select-none gap-0.5 shrink-0 max-w-[210px] sm:max-w-none overflow-hidden">
                          <span className="hidden xs:inline text-muted-foreground/60">{shareDomainConfig.protocol}</span>
                          <span className="font-semibold text-blue-600 dark:text-blue-400 truncate">
                            {shareDomainConfig.host}
                          </span>
                          <span className="text-muted-foreground/80">{shareDomainConfig.path}</span>
                        </div>

                        {/* Editable Custom Slug Input */}
                        <input
                          type="text"
                          disabled={creatingShare || isFileExpired || (shareEnableXurl && (!xurlStatus?.valid || checkingXurlLive))}
                          placeholder={
                            shareEnableXurl && checkingXurlLive
                              ? "Detecting XURL Plan entitlements..."
                              : shareEnableXurl && !xurlStatus?.valid
                              ? "Verify XURL API key to unlock"
                              : "e.g. my-project-deck (leave blank for random)"
                          }
                          value={shareCustomSlug}
                          onChange={(e) =>
                            setShareCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
                          }
                          maxLength={48}
                          className="w-full h-full px-2.5 text-xs text-foreground font-mono font-medium bg-transparent focus:outline-none placeholder:text-muted-foreground/50 placeholder:font-sans placeholder:font-normal disabled:cursor-not-allowed"
                        />

                        {/* Inline Status Icons & Clear Button */}
                        <div className="flex items-center gap-1 pr-2 shrink-0">
                          {shareSlugValidation.status === "checking" && (
                            <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                          )}
                          {shareSlugValidation.status === "available" && (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          )}
                          {(shareSlugValidation.status === "taken" ||
                            shareSlugValidation.status === "reserved" ||
                            shareSlugValidation.status === "invalid_chars" ||
                            shareSlugValidation.status === "too_short") && (
                            <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                          )}
                          {shareCustomSlug && (
                            <button
                              type="button"
                              onClick={() => setShareCustomSlug("")}
                              className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-md cursor-pointer transition-colors shrink-0"
                              aria-label="Clear custom slug"
                              title="Clear custom slug"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Live Domain Attachment Preview */}
                      <div className="text-[10px] text-muted-foreground flex items-center justify-between gap-1.5 truncate">
                        <div className="flex items-center gap-1.5 truncate min-w-0">
                          <span className="font-medium text-foreground shrink-0">Attached URL:</span>
                          <span className="font-mono text-blue-600 dark:text-blue-400 font-medium truncate">
                            {shareDomainConfig.fullBaseUrl}{shareCustomSlug || "auto-generated-slug"}
                          </span>
                        </div>
                        {shareCustomSlug && (
                          <span className="text-[9.5px] font-mono text-muted-foreground/60 shrink-0 hidden sm:inline">
                            {shareCustomSlug.length}/48
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Delivery & Security Options */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="text-[11.5px] font-semibold text-foreground/90 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                        <span>Delivery &amp; Security Options</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">Select options to apply to this link</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {/* Option 1: XURL Shortlink */}
                      <label
                        className={`sm:col-span-2 lg:col-span-1 flex flex-col justify-between p-2 sm:p-2.5 rounded-xl border transition-all duration-150 cursor-pointer select-none relative space-y-1 ${
                          shareEnableXurl
                            ? "bg-blue-500/[0.08] border-blue-500/50 ring-1 ring-blue-500/25 shadow-xs"
                            : "bg-card hover:bg-muted/40 border-border/80 hover:border-blue-500/40 hover:shadow-2xs"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="text-xs font-bold text-foreground truncate">XURL Shortlink</span>
                            <span onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
                              <InfoTooltip
                                title="XURL Shortlink"
                                content="Makes your link short and clean (like xurl.eu.cc/notes) so it's super easy to copy, text to friends on WhatsApp, or write down."
                                side="top"
                                align="start"
                                variant="info"
                                iconClassName="w-3 h-3 text-muted-foreground/60 hover:text-blue-500"
                              />
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            checked={shareEnableXurl}
                            onChange={(e) => handleToggleXurl(e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600 shrink-0"
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-snug line-clamp-1">
                          Branded vanity shortlink via xurl.eu.cc.
                        </p>
                        <div className="flex items-center justify-between gap-1 pt-0.5">
                          {checkingXurlLive ? (
                            <span className="text-[9px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 animate-pulse">
                              <Loader2 className="w-2 h-2 animate-spin" />
                              <span>Checking...</span>
                            </span>
                          ) : xurlStatus?.valid ? (
                            <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span>Live Ready</span>
                            </span>
                          ) : (
                            <span className="text-[9px] text-muted-foreground">Shortener</span>
                          )}
                          <a
                            href="https://xurl.eu.cc"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[9.5px] text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
                          >
                            <span>xurl.eu.cc</span>
                            <ExternalLink className="w-2 h-2" />
                          </a>
                        </div>
                      </label>

                      {/* Option 2: Direct Download */}
                      <label
                        className={`flex flex-col justify-between p-2 sm:p-2.5 rounded-xl border transition-all duration-150 cursor-pointer select-none relative space-y-1 ${
                          shareDirectDownload
                            ? "bg-purple-500/[0.08] border-purple-500/50 ring-1 ring-purple-500/25 shadow-xs"
                            : "bg-card hover:bg-muted/40 border-border/80 hover:border-purple-500/40 hover:shadow-2xs"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Zap className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                            <span className="text-xs font-bold text-foreground truncate">Direct Download</span>
                            <span onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
                              <InfoTooltip
                                title="Direct Download"
                                content="When someone opens this link, the file saves immediately to their device! They skip the web preview page and download button."
                                side="top"
                                align="center"
                                variant="purple"
                                iconClassName="w-3 h-3 text-muted-foreground/60 hover:text-purple-500"
                              />
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            checked={shareDirectDownload}
                            onChange={(e) => setShareDirectDownload(e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600 shrink-0"
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-snug line-clamp-1">
                          Bypasses preview page to download directly.
                        </p>
                        <div className="flex items-center justify-between gap-1 pt-0.5">
                          <span className="text-[9px] font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1">
                            <Zap className="w-2.5 h-2.5" />
                            <span>Direct Stream</span>
                          </span>
                          <span className="text-[9px] text-muted-foreground">Skip Preview</span>
                        </div>
                      </label>

                      {/* Option 3: Single-Use Link */}
                      <label
                        className={`flex flex-col justify-between p-2 sm:p-2.5 rounded-xl border transition-all duration-150 cursor-pointer select-none relative space-y-1 ${
                          shareIsSingleUse
                            ? "bg-blue-500/[0.08] border-blue-500/50 ring-1 ring-blue-500/25 shadow-xs"
                            : "bg-card hover:bg-muted/40 border-border/80 hover:border-blue-500/40 hover:shadow-2xs"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Shield className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="text-xs font-bold text-foreground truncate">Single-Use Link</span>
                            <span onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
                              <InfoTooltip
                                title="Single-Use Link"
                                content="Like a secret mission message that burns after reading! Only 1 person can download it once. The moment that single download completes, the link disappears forever."
                                side="top"
                                align="end"
                                variant="info"
                                iconClassName="w-3 h-3 text-muted-foreground/60 hover:text-blue-500"
                              />
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            checked={shareIsSingleUse}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setShareIsSingleUse(checked);
                              if (checked) {
                                setShareOnePerMember(false);
                              }
                            }}
                            className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600 shrink-0"
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-snug line-clamp-1">
                          Link closes permanently after 1 download.
                        </p>
                        <div className="flex items-center justify-between gap-1 pt-0.5">
                          <span className="text-[9px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                            <Shield className="w-2.5 h-2.5" />
                            <span>1-Time Burner</span>
                          </span>
                          <span className="text-[9px] text-muted-foreground">Auto-Delete</span>
                        </div>
                      </label>

                      {/* Option 4: Auto-Expire on View */}
                      <label
                        className={`flex flex-col justify-between p-2 sm:p-2.5 rounded-xl border transition-all duration-150 cursor-pointer select-none relative space-y-1 ${
                          shareBurnAfterPreview
                            ? "bg-rose-500/[0.08] border-rose-500/50 ring-1 ring-rose-500/25 shadow-xs"
                            : "bg-card hover:bg-muted/40 border-border/80 hover:border-rose-500/40 hover:shadow-2xs"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Clock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            <span className="text-xs font-bold text-foreground truncate">Auto-Expire on Open</span>
                            <span onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
                              <InfoTooltip
                                title="Auto-Expire on Open"
                                content="Starts a 60-second self-destruct countdown the moment someone opens the link. They have 1 minute to save the file before the link vanishes. Your file in storage stays safe."
                                side="top"
                                align="start"
                                variant="amber"
                                iconClassName="w-3 h-3 text-muted-foreground/60 hover:text-rose-500"
                              />
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            checked={shareBurnAfterPreview}
                            onChange={(e) => setShareBurnAfterPreview(e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-rose-600 focus:ring-rose-500 cursor-pointer accent-rose-600 shrink-0"
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-snug line-clamp-1">
                          Deletes link 60s after first open. File stays safe.
                        </p>
                        <div className="flex items-center justify-between gap-1 pt-0.5">
                          <span className="text-[9px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            <span>60s Self-Destruct</span>
                          </span>
                          <span className="text-[9px] text-muted-foreground">Auto-Purge</span>
                        </div>
                      </label>

                      {/* Option 5: Force Download (Hide Preview) */}
                      <label
                        className={`flex flex-col justify-between p-2 sm:p-2.5 rounded-xl border transition-all duration-150 cursor-pointer select-none relative space-y-1 ${
                          shareDisablePreview
                            ? "bg-amber-500/[0.08] border-amber-500/50 ring-1 ring-amber-500/25 shadow-xs"
                            : "bg-card hover:bg-muted/40 border-border/80 hover:border-amber-500/40 hover:shadow-2xs"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <EyeOff className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span className="text-xs font-bold text-foreground truncate">Force Download Only</span>
                            <span onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
                              <InfoTooltip
                                title="Force Download Only"
                                content="Turns off in-browser media players. If you share a video or song, the browser won't play it in the tab—it forces the recipient to save the actual file to their device."
                                side="top"
                                align="center"
                                variant="amber"
                                iconClassName="w-3 h-3 text-muted-foreground/60 hover:text-amber-500"
                              />
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            checked={shareDisablePreview}
                            onChange={(e) => setShareDisablePreview(e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-amber-600 focus:ring-amber-500 cursor-pointer accent-amber-600 shrink-0"
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-snug line-clamp-1">
                          Hides media players. Recipient must download file.
                        </p>
                        <div className="flex items-center justify-between gap-1 pt-0.5">
                          <span className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <EyeOff className="w-2.5 h-2.5" />
                            <span>Raw Save Only</span>
                          </span>
                          <span className="text-[9px] text-muted-foreground">No Players</span>
                        </div>
                      </label>

                      {/* Option 6: Download Quota (Slider + Number) & 1 Download / Person (Lifetime) */}
                      <div className="p-2 sm:p-2.5 rounded-xl bg-card border border-border/80 flex flex-col justify-between space-y-1 relative">
                        {/* Header: Title + Dynamic Badge */}
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {shareOnePerMember ? (
                              <Users className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            ) : (
                              <Download className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            )}
                            <span className="text-xs font-bold text-foreground truncate">
                              {shareOnePerMember ? "People Limit & Access" : "Download Quota"}
                            </span>
                            <span onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
                              <InfoTooltip
                                title={shareOnePerMember ? "People Limit & Access" : "Download Quota"}
                                content={
                                  shareOnePerMember
                                    ? "With 1 Download / Person enabled, unlimited different people can download this file (each person gets 1 download). Slide or enter a number only if you want to cap the total people who can claim."
                                    : "Sets the total times this file can be downloaded before the link locks up. Slide to any number or slide all the way left for Unlimited."
                                }
                                side="top"
                                align="end"
                                variant={shareOnePerMember ? "purple" : "info"}
                                iconClassName={`w-3 h-3 text-muted-foreground/60 ${shareOnePerMember ? "hover:text-indigo-500" : "hover:text-blue-500"}`}
                              />
                            </span>
                          </div>
                          <span className="text-[9.5px] font-mono font-semibold px-1.5 py-0.5 rounded bg-muted/80 text-foreground border border-border/60 shrink-0">
                            {shareIsSingleUse
                              ? "1 max"
                              : shareOnePerMember
                              ? shareMaxDownloads && parseInt(shareMaxDownloads, 10) > 1
                                ? `${shareMaxDownloads} max (1 each)`
                                : "1 download each"
                              : shareMaxDownloads
                              ? `${shareMaxDownloads} max`
                              : "Unlimited"}
                          </span>
                        </div>

                        {/* Quota Slider & Manual Input */}
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="0"
                            max="50"
                            step="1"
                            value={
                              shareIsSingleUse
                                ? 1
                                : shareOnePerMember
                                ? shareMaxDownloads && parseInt(shareMaxDownloads, 10) > 1
                                  ? Math.min(parseInt(shareMaxDownloads, 10), 50)
                                  : 0
                                : shareMaxDownloads
                                ? Math.min(parseInt(shareMaxDownloads, 10) || 0, 50)
                                : 0
                            }
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              setShareMaxDownloads(val <= (shareOnePerMember ? 1 : 0) ? "" : val.toString());
                            }}
                            disabled={shareIsSingleUse}
                            className={`w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer ${shareOnePerMember ? "accent-indigo-600" : "accent-blue-600"} disabled:opacity-50`}
                            title={
                              shareOnePerMember
                                ? "Slide to set total limit (0 or 1 = 1 download each)"
                                : "Slide to set download quota (0 = Unlimited)"
                            }
                          />
                          <input
                            type="number"
                            min={shareOnePerMember ? "2" : "1"}
                            placeholder="∞"
                            value={shareIsSingleUse ? "1" : shareMaxDownloads}
                            onChange={(e) => setShareMaxDownloads(e.target.value)}
                            disabled={shareIsSingleUse}
                            className="w-10 h-5.5 px-1 rounded bg-background border border-border/80 text-center font-mono text-[10.5px] text-foreground placeholder:text-muted-foreground/50 disabled:opacity-50 shrink-0 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            title={
                              shareOnePerMember
                                ? "Enter limit (leave empty or 0 for 1 download each)"
                                : "Enter exact quota (leave empty for unlimited)"
                            }
                          />
                        </div>

                        {/* 1 Download / Person Switch */}
                        <div
                          className="flex items-center justify-between gap-1 pt-1 border-t border-border/40 select-none"
                        >
                          <label
                            htmlFor="file-manager-one-per-member"
                            className="flex items-center gap-1 min-w-0 cursor-pointer"
                          >
                            <Users className="w-3 h-3 text-indigo-500 shrink-0" />
                            <span className="text-[10.5px] font-semibold text-foreground truncate">1 Download / Person</span>
                          </label>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <InfoTooltip
                              title="1 Download / Person"
                              content="Each person can download this file only once. Once downloaded on their device, repeat downloads are locked."
                              side="top"
                              align="end"
                              variant="purple"
                              iconClassName="w-3 h-3 text-muted-foreground/60 hover:text-indigo-500"
                            />
                            <input
                              id="file-manager-one-per-member"
                              type="checkbox"
                              checked={shareOnePerMember}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setShareOnePerMember(checked);
                                if (checked) {
                                  setShareIsSingleUse(false);
                                }
                              }}
                              className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600 shrink-0"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 4: Private Note / Memo for Recipient (Optional Expander) */}
                  <div>
                    {!showRecipientNote ? (
                      <button
                        type="button"
                        onClick={() => setShowRecipientNote(true)}
                        className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 flex items-center gap-1.5 transition cursor-pointer hover:underline"
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>+ Add private note or message for recipient (Optional)</span>
                      </button>
                    ) : (
                      <div className="p-2 sm:p-2.5 rounded-xl bg-muted/30 border border-border/80 space-y-1 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between">
                          <label className="text-[11.5px] font-semibold text-foreground/90 flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                            <span>Private Note for Recipient</span>
                            <span className="text-[9.5px] text-muted-foreground font-normal">
                              (Shown as memo banner on download page)
                            </span>
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setShowRecipientNote(false);
                              setShareRecipientNote("");
                            }}
                            className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
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
                          className="w-full h-8 px-2.5 rounded-md bg-background/90 hover:bg-background border border-border/80 hover:border-blue-500/50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none text-xs text-foreground placeholder:text-muted-foreground/50 transition-all font-sans"
                        />
                        <div className="flex justify-between items-center text-[9.5px] text-muted-foreground">
                          <span>Recipient sees this above the file name.</span>
                          <span>{shareRecipientNote.length}/280</span>
                        </div>
                      </div>
                    )}
                  </div>
                </fieldset>

                {shareError && (
                  <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
                    {shareError}
                  </div>
                )}

                <div className="pt-2 border-t border-border flex items-center justify-between">
                  <p className="text-[10.5px] text-muted-foreground hidden sm:block">
                    {isFileExpired
                      ? "Expired files cannot have share links generated."
                      : "Links automatically close when the file expires."}
                  </p>
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => setSelectedFileForShare(null)}
                      disabled={creatingShare}
                      className={`px-3.5 py-1.5 rounded-lg bg-muted/60 hover:bg-muted text-xs font-medium text-foreground hover:text-foreground border border-border/60 hover:border-border transition-all duration-150 shadow-2xs active:scale-[0.98] ${
                        creatingShare ? "opacity-50 pointer-events-none cursor-not-allowed" : "cursor-pointer"
                      }`}
                    >
                      {isFileExpired ? "Close" : "Cancel"}
                    </button>
                    <button
                      type="submit"
                      disabled={
                        creatingShare ||
                        isFileExpired ||
                        (Boolean(shareCustomSlug.trim()) &&
                          (!shareSlugValidation.isValid || shareSlugValidation.status === "checking"))
                      }
                      className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 shadow-sm ${
                        isFileExpired ||
                        (Boolean(shareCustomSlug.trim()) &&
                          (!shareSlugValidation.isValid || shareSlugValidation.status === "checking")) ||
                        creatingShare
                          ? "bg-muted text-muted-foreground cursor-not-allowed border border-border"
                          : "bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white hover:shadow-md hover:shadow-blue-500/20 active:scale-[0.98] cursor-pointer"
                      }`}
                    >
                      {creatingShare ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Generating Link...</span>
                        </>
                      ) : isFileExpired ? (
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

      {/* Client-Side In-Browser ZIP Archive Inspector Modal */}
      {selectedFileForZip && (
        <ZipViewerModal
          filename={selectedFileForZip.filename}
          fileSource={selectedFileForZip.url}
          onClose={() => setSelectedFileForZip(null)}
        />
      )}

      {/* Minimal Developer Terminal / cURL Upload Modal */}
      <TerminalUploadModal
        isOpen={showTerminalModal}
        onClose={() => setShowTerminalModal(false)}
      />

      {/* Dedicated HTML Host Modal with Domain & Custom Slug */}
      <HtmlHostModal
        isOpen={showHtmlHostModal}
        onClose={() => setShowHtmlHostModal(false)}
        onSuccess={() => void fetchFiles(page, searchQuery, category, sortBy, sortOrder)}
        canCreatePermanent={isPremium}
      />

      {/* File Share Links Multi-Channel Modal */}
      <FileShareLinksModal
        isOpen={Boolean(selectedFileForLinks)}
        onClose={() => setSelectedFileForLinks(null)}
        file={
          selectedFileForLinks
            ? {
                id: selectedFileForLinks.id,
                sanitized_name: selectedFileForLinks.sanitized_name,
                byte_size: selectedFileForLinks.byte_size,
                mime_type: selectedFileForLinks.mime_type,
                share_slug: selectedFileForLinks.share_slug!,
                is_site: selectedFileForLinks.is_site,
                xurl_short_url: selectedFileForLinks.xurl_short_url,
                xurl_status: selectedFileForLinks.xurl_status,
              }
            : null
        }
        onXurlGenerated={(fileId, _slug, shortUrl) => {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileId ? { ...f, xurl_short_url: shortUrl, xurl_status: "active" } : f
            )
          );
          setSelectedFileForLinks((prev) =>
            prev && prev.id === fileId
              ? { ...prev, xurl_short_url: shortUrl, xurl_status: "active" }
              : prev
          );
        }}
      />
    </div>
  );
}
