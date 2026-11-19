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
  ShieldAlert,
  Ban,
  Users,
  Flame,
  RotateCcw,
  Package,
  FolderPlus,
  FolderInput,
  FolderTree,
  CornerLeftUp,
  Edit2,
  Move,
  MoreVertical,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import {
  sanitizeFolderName,
  normalizeFolderPath,
  getFolderNameFromPath,
  getFolderParentPath,
  getFolderDepth,
  getBreadcrumbs,
  type FolderItem,
  type FolderTreeNode,
} from "@/lib/storage/folder-utils";
import { QRCodeSVG } from "qrcode.react";
import {
  downloadQrCodePng,
  downloadQrCodeSvg,
  copyQrCodeImage,
} from "@/lib/utils/qr-export";
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
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

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
  // Owner API Release & Bucket metadata
  is_api_upload?: boolean;
  folder?: string | null;
  sha256?: string | null;
  is_release_locked?: boolean;
  r2_key?: string | null;
}

interface FileManagerProps {
  initialFiles: SafeFileItem[];
  initialTotalCount: number;
  initialTotalPages: number;
  initialCustomFolders?: string[];
  initialFolderTree?: FolderTreeNode[];
  canCreatePermanent?: boolean;
  isPremium?: boolean;
  currentUserId?: string;
}

export type FileSortOption =
  | "recent"
  | "created_at"
  | "byte_size"
  | "sanitized_name"
  | "expires_at";

export function sortFiles(
  items: SafeFileItem[],
  sort: FileSortOption,
  order: "desc" | "asc"
): SafeFileItem[] {
  return [...items].sort((a, b) => {
    if (sort === "recent") {
      const timeA = new Date(a.created_at).getTime() || 0;
      const timeB = new Date(b.created_at).getTime() || 0;
      return order === "asc" ? timeA - timeB : timeB - timeA;
    }
    if (sort === "created_at") {
      const timeA = new Date(a.created_at).getTime() || 0;
      const timeB = new Date(b.created_at).getTime() || 0;
      return order === "asc" ? timeA - timeB : timeB - timeA;
    }
    if (sort === "byte_size") {
      return order === "asc" ? a.byte_size - b.byte_size : b.byte_size - a.byte_size;
    }
    if (sort === "sanitized_name") {
      const cmp = a.sanitized_name.localeCompare(b.sanitized_name);
      return order === "asc" ? cmp : -cmp;
    }
    if (sort === "expires_at") {
      const timeA = a.expires_at ? new Date(a.expires_at).getTime() : Infinity;
      const timeB = b.expires_at ? new Date(b.expires_at).getTime() : Infinity;
      return order === "asc" ? timeA - timeB : timeB - timeA;
    }
    return 0;
  });
}

export function filterByFileType(items: SafeFileItem[], type: string): SafeFileItem[] {
  if (type === "all") return items;
  if (type === "images") {
    return items.filter(
      (f) =>
        f.mime_type?.startsWith("image/") ||
        /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff)$/i.test(f.sanitized_name || f.filename || "")
    );
  }
  if (type === "documents") {
    return items.filter(
      (f) =>
        [
          "text/html",
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "text/plain",
          "text/csv",
          "text/markdown",
        ].includes(f.mime_type) ||
        /\.(pdf|doc|docx|txt|csv|md|json|xml|rtf|epub)$/i.test(f.sanitized_name || f.filename || "")
    );
  }
  if (type === "media") {
    return items.filter(
      (f) =>
        f.mime_type?.startsWith("video/") ||
        f.mime_type?.startsWith("audio/") ||
        /\.(mp4|mkv|webm|mov|avi|flv|wmv|mp3|wav|ogg|flac|aac|m4a)$/i.test(
          f.sanitized_name || f.filename || ""
        )
    );
  }
  if (type === "archives") {
    return items.filter(
      (f) =>
        [
          "application/zip",
          "application/x-tar",
          "application/gzip",
          "application/x-7z-compressed",
          "application/vnd.rar",
          "application/x-zip-compressed",
        ].includes(f.mime_type) ||
        /\.(zip|tar|gz|7z|rar|bz2|xz)$/i.test(f.sanitized_name || f.filename || "")
    );
  }
  if (type === "websites") {
    return items.filter(
      (f) =>
        f.is_site ||
        f.mime_type === "text/html" ||
        /\.(html|htm)$/i.test(f.sanitized_name || f.filename || "")
    );
  }
  if (type === "executables") {
    return items.filter(
      (f) =>
        [
          "application/vnd.android.package-archive",
          "application/x-msdownload",
          "application/x-executable",
          "application/octet-stream",
        ].includes(f.mime_type) ||
        /\.(exe|apk|dmg|pkg|msi|deb|rpm|bin|appimage|iso)$/i.test(
          f.sanitized_name || f.filename || ""
        )
    );
  }
  return items;
}

export function isBinaryContainer(file: SafeFileItem | null | undefined): boolean {
  if (!file) return false;
  const name = (file.sanitized_name || file.filename || "").toLowerCase();
  const folder = (file.folder || "").toLowerCase();
  const r2Key = (file.r2_key || "").toLowerCase();
  return (
    name.endsWith(".bin") ||
    folder.includes(".dynamic.ota/new") ||
    folder.includes(".dynamic.ota/old") ||
    r2Key.includes(".dynamic.ota/new") ||
    r2Key.includes(".dynamic.ota/old")
  );
}

export function mapDbToFileItem(
  raw: Record<string, unknown>,
  existingShareSlug?: string | null
): SafeFileItem {
  const sanitizedName = (raw.sanitized_name || raw.filename || "file") as string;
  const filename = (raw.filename || raw.sanitized_name || "file") as string;
  const isApiUpload = Boolean(
    raw.sha256 ||
    raw.is_release_locked ||
    raw.is_api_upload
  );
  const mimeType = (raw.mime_type || "application/octet-stream") as string;
  const isSite =
    mimeType === "text/html" ||
    sanitizedName.toLowerCase().endsWith(".html") ||
    sanitizedName.toLowerCase().endsWith(".htm") ||
    Boolean(raw.is_site);

  return {
    id: (raw.id as string) || crypto.randomUUID(),
    filename,
    sanitized_name: sanitizedName,
    byte_size: Number(raw.byte_size || 0),
    mime_type: mimeType,
    status: (raw.status as string) || "ACTIVE",
    expiry_preset: raw.expiry_preset as string | undefined,
    expires_at: (raw.expires_at as string | null) || null,
    created_at: (raw.created_at as string) || new Date().toISOString(),
    share_slug: existingShareSlug ?? ((raw.share_slug as string | null) || null),
    is_site: isSite,
    xurl_short_url: (raw.xurl_short_url as string | null) || null,
    xurl_status: (raw.xurl_status as string | null) || null,
    is_api_upload: isApiUpload,
    folder: (raw.folder as string | null) || null,
    sha256: (raw.sha256 as string | null) || null,
    is_release_locked: Boolean(raw.is_release_locked),
    r2_key: (raw.r2_key as string | null) || null,
  };
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
  initialCustomFolders = [],
  initialFolderTree = [],
  canCreatePermanent = false,
  isPremium = false,
  currentUserId,
}: FileManagerProps) {
  const router = useRouter();
  const deletedFolderPathsRef = useRef<Set<string>>(new Set());

  // Master pool storing all known files in local memory across all folders and navigations
  const masterFilesMapRef = useRef<Map<string, SafeFileItem>>(
    new Map(initialFiles.map((f) => [f.id, f]))
  );
  const folderDataCacheRef = useRef<
    Map<
      string,
      {
        subfolders: FolderItem[];
        breadcrumbs: { name: string; path: string }[];
        totalSubfolders: number;
        totalFiles: number;
      }
    >
  >(new Map());

  // Non-blocking silent revalidation indicator (zero layout shift, zero spinner)
  const [isRevalidating, setIsRevalidating] = useState(false);

  // Browser History & In-App Navigation Stack
  const navHistoryRef = useRef<string[]>(["all"]);
  const navIndexRef = useRef<number>(0);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  // Sort State: Deterministic SSR default ("recent"), restored after hydration
  const [sortBy, setSortBy] = useState<FileSortOption>("recent");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  // Files state initialized with automatic recency sort
  const [files, setFiles] = useState<SafeFileItem[]>(() =>
    sortFiles(initialFiles, "recent", "desc")
  );
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [customFolders, setCustomFolders] = useState<string[]>(initialCustomFolders);

  // Google Drive & Windows 11 View Mode: Deterministic SSR default ("grid"), restored after hydration
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Live real-time ticker for dynamic expiration countdowns (deterministic 0 on SSR)
  const [currentTime, setCurrentTime] = useState(0);

  // Client mount effect: load persisted user preferences safely after hydration completes
  useEffect(() => {
    setCurrentTime(Date.now());

    try {
      const savedSort = localStorage.getItem("gphost_file_sort_by");
      if (
        savedSort &&
        ["recent", "created_at", "byte_size", "sanitized_name", "expires_at"].includes(savedSort)
      ) {
        setSortBy(savedSort as FileSortOption);
      }
    } catch {}

    try {
      const savedView = localStorage.getItem("gphost_file_view_mode");
      if (savedView === "grid" || savedView === "list") {
        setViewMode(savedView);
      }
    } catch {}

    try {
      const savedFolders = localStorage.getItem("gphost_custom_folders");
      if (savedFolders) {
        const parsed = JSON.parse(savedFolders);
        if (Array.isArray(parsed)) {
          // Reconcile: Only retain folders confirmed by server OR actively containing files in initialFiles
          const activeFileFolders = new Set<string>();
          for (const f of initialFiles) {
            if (f.folder) {
              const top = f.folder.split("/")[0];
              if (top) activeFileFolders.add(top);
              activeFileFolders.add(f.folder);
            }
          }
          const serverSet = new Set(initialCustomFolders || []);
          const validFolders = parsed.filter(
            (folderName: string) => serverSet.has(folderName) || activeFileFolders.has(folderName)
          );
          // Permanently purge deleted/ghost folders from localStorage
          localStorage.setItem("gphost_custom_folders", JSON.stringify(validFolders));
          setCustomFolders(Array.from(new Set([...(initialCustomFolders || []), ...validFolders])));
        }
      } else if (initialCustomFolders && initialCustomFolders.length > 0) {
        localStorage.setItem("gphost_custom_folders", JSON.stringify(initialCustomFolders));
        setCustomFolders(initialCustomFolders);
      }
    } catch {}
  }, []);

  // Sync custom folders when initialCustomFolders changes (e.g. from server refresh)
  useEffect(() => {
    if (initialCustomFolders) {
      setCustomFolders((prev) => {
        const activeFileFolders = new Set<string>();
        for (const f of files) {
          if (f.folder && !deletedFolderPathsRef.current.has(f.folder)) {
            const top = f.folder.split("/")[0];
            if (top && !deletedFolderPathsRef.current.has(top)) activeFileFolders.add(top);
            activeFileFolders.add(f.folder);
          }
        }
        const serverFiltered = initialCustomFolders.filter(
          (f) => !deletedFolderPathsRef.current.has(f) && !deletedFolderPathsRef.current.has(f.split("/")[0])
        );
        const serverSet = new Set(serverFiltered);
        const valid = prev.filter(
          (f) => !deletedFolderPathsRef.current.has(f) && !deletedFolderPathsRef.current.has(f.split("/")[0]) && (serverSet.has(f) || activeFileFolders.has(f))
        );
        const merged = Array.from(new Set([...serverFiltered, ...valid]));
        try {
          localStorage.setItem("gphost_custom_folders", JSON.stringify(merged));
        } catch {}
        return merged;
      });
    }
  }, [initialCustomFolders]);

  // Keep master pool, files, totalCount, and totalPages in sync when Server Component re-renders
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
      for (const f of initialFiles) {
        masterFilesMapRef.current.set(f.id, f);
      }
      setFiles(sortFiles(Array.from(masterFilesMapRef.current.values()), sortBy, sortOrder));
      setTotalCount(initialTotalCount);
      setTotalPages(initialTotalPages);
    }
  }, [initialFiles, initialTotalCount, initialTotalPages, sortBy, sortOrder]);

  // Real-time live dynamic update tracking
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const [lastLiveAction, setLastLiveAction] = useState<{ message: string; timestamp: number } | null>(
    null
  );

  const handleSortChange = (newSort: FileSortOption) => {
    setSortBy(newSort);
    try {
      localStorage.setItem("gphost_file_sort_by", newSort);
    } catch {}

    if (newSort === "recent") {
      setSortOrder("desc");
      setFiles((prev) => sortFiles(prev, "recent", "desc"));
      setLastLiveAction({
        message: "Sorted by Recent",
        timestamp: Date.now(),
      });
    } else {
      setFiles((prev) => sortFiles(prev, newSort, sortOrder));
    }
  };

  const handleViewModeChange = (mode: "grid" | "list") => {
    setViewMode(mode);
    try {
      localStorage.setItem("gphost_file_view_mode", mode);
    } catch {}
    setLastLiveAction({
      message: mode === "list" ? "List View" : "Grid View",
      timestamp: Date.now(),
    });
  };

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
  const [selectedFolderPaths, setSelectedFolderPaths] = useState<Set<string>>(new Set());
  const [zippingProgress, setZippingProgress] = useState<{ current: number; total: number; filename: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  const handleToggleFileStatus = async (file: SafeFileItem, newStatus: "ACTIVE" | "DISABLED") => {
    setIsTogglingStatus(true);
    try {
      const res = await authFetch(`/api/v1/files/${file.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setFiles((prev) =>
          prev.map((f) => (f.id === file.id ? { ...f, status: newStatus } : f))
        );
        if (selectedFileForDetails && selectedFileForDetails.id === file.id) {
          setSelectedFileForDetails((prev) => (prev ? { ...prev, status: newStatus } : null));
        }
        setLastLiveAction({
          message: `Binary status changed to ${newStatus}`,
          timestamp: Date.now(),
        });
      } else {
        alert(data.error || "Failed to update binary status");
      }
    } catch {
      alert("Network error updating status");
    } finally {
      setIsTogglingStatus(false);
    }
  };

  // Hierarchical Folder Management State
  const [folderTree, setFolderTree] = useState<FolderTreeNode[]>(initialFolderTree);
  const [currentFolderData, setCurrentFolderData] = useState<{
    subfolders: FolderItem[];
    breadcrumbs: { name: string; path: string }[];
    totalSubfolders: number;
    totalFiles: number;
  } | null>(null);
  const [isLoadingFolderContents, setIsLoadingFolderContents] = useState(false);

  // Folder Modals
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderNameInput, setNewFolderNameInput] = useState("");
  const [newFolderError, setNewFolderError] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const [folderToRename, setFolderToRename] = useState<FolderItem | null>(null);
  const [renameFolderNameInput, setRenameFolderNameInput] = useState("");
  const [renameFolderError, setRenameFolderError] = useState<string | null>(null);
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);

  const [folderToDelete, setFolderToDelete] = useState<FolderItem | null>(null);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);
  const [deleteFolderError, setDeleteFolderError] = useState<string | null>(null);

  const [folderToMove, setFolderToMove] = useState<FolderItem | null>(null);
  const [folderMoveTarget, setFolderMoveTarget] = useState("");
  const [isMovingFolder, setIsMovingFolder] = useState(false);

  // Bulk Delete & Move State
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState<{ current: number; total: number } | null>(null);
  const [showMoveFolderModal, setShowMoveFolderModal] = useState(false);
  const [targetMoveFolder, setTargetMoveFolder] = useState("");
  const [isMovingFiles, setIsMovingFiles] = useState(false);

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
  const qrSectionRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (showQrCode && qrSectionRef.current) {
      const timer = setTimeout(() => {
        qrSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [showQrCode]);

  const [copiedQrImg, setCopiedQrImg] = useState<boolean>(false);
  const [isDownloadingQr, setIsDownloadingQr] = useState<boolean>(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState<boolean>(false);

  const shareDomainConfig = getShareDomainConfig(shareEnableXurl);
  const shareSlugValidation = useSlugValidation(shareCustomSlug, Boolean(selectedFileForShare));

  const handleOpenShare = (file: SafeFileItem) => {
    if (isBinaryContainer(file)) {
      alert("Public share links cannot be created for in-process OTA binary containers.");
      return;
    }
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
      checkXurlLiveStatus(false);
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

  const [copiedCustomKey, setCopiedCustomKey] = useState<string | null>(null);
  const handleCopyCustomUrl = (pathOrText: string, key: string, isFullUrl: boolean = false) => {
    const textToCopy = isFullUrl
      ? pathOrText
      : typeof window !== "undefined"
      ? `${window.location.origin}${pathOrText}`
      : pathOrText;
    navigator.clipboard.writeText(textToCopy);
    setCopiedCustomKey(key);
    setTimeout(() => setCopiedCustomKey(null), 2000);
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
    if (isBinaryContainer(file)) {
      alert("Binary container downloads are disabled in the web UI. This OTA artifact is strictly consumed in-process by the application updater daemon.");
      return;
    }
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

    const eligibleFiles = selectedFiles.filter((f) => !isBinaryContainer(f));
    if (eligibleFiles.length === 0) {
      alert("Selected items contain only in-process binary containers which cannot be downloaded via the web UI.");
      return;
    }

    try {
      await downloadFilesAsZip(
        eligibleFiles.map((f) => ({
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

  // Fetch paginated files with server-side query (ultra-fresh, merges into local memory)
  const fetchFiles = useCallback(
    async (
      p: number,
      q: string,
      cat: string,
      sort: string,
      order: string,
      isBackgroundSync = false
    ) => {
      // Never block UI with loading spinner if we already have files in local memory
      if (!isBackgroundSync && masterFilesMapRef.current.size === 0) {
        setLoading(true);
      } else {
        setIsRevalidating(true);
      }

      try {
        const params = new URLSearchParams({
          page: p.toString(),
          pageSize: "50",
          q,
          category: cat,
          sortBy: sort,
          sortOrder: order,
          _t: Date.now().toString(),
        });
        const res = await fetch(`/api/files?${params.toString()}`, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
          },
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.files)) {
            for (const f of data.files) {
              masterFilesMapRef.current.set(f.id, f);
            }
            const allFiles = Array.from(masterFilesMapRef.current.values());
            setFiles(sortFiles(allFiles, sort as FileSortOption, order as "desc" | "asc"));
          }
          setTotalCount(data.totalCount);
          setTotalPages(data.totalPages);
          setPage(data.page);
        }
      } catch (err) {
        console.error("Failed to fetch files:", err);
      } finally {
        setLoading(false);
        setIsRevalidating(false);
      }
    },
    []
  );

  // Hierarchical Folder Fetchers
  const fetchFolderTree = useCallback(async () => {
    try {
      const res = await authFetch(`/api/v1/folders?tree=true&_t=${Date.now()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.tree) {
          setFolderTree(data.tree);
        }
      }
    } catch (err) {
      console.warn("Notice: failed to load folder tree:", err);
    }
  }, []);

  const fetchFolderContents = useCallback(async (path: string) => {
    const isSystemCategory = [
      "all",
      "websites",
      "images",
      "documents",
      "media",
      "archives",
    ].includes(path);

    const endpoint = isSystemCategory
      ? `/api/v1/folders?_t=${Date.now()}`
      : `/api/v1/folders?path=${encodeURIComponent(path)}&_t=${Date.now()}`;

    try {
      const res = await authFetch(endpoint, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        const folderData = {
          subfolders: data.subfolders || [],
          breadcrumbs:
            data.breadcrumbs ||
            (isSystemCategory ? [{ name: "Storage", path: "" }] : getBreadcrumbs(path)),
          totalSubfolders: data.totalSubfolders || 0,
          totalFiles: data.totalFiles || 0,
        };
        folderDataCacheRef.current.set(path, folderData);
        setCurrentFolderData(folderData);
      }
    } catch (err) {
      console.warn("Notice: failed to fetch folder contents:", err);
    }
  }, []);

  // Google Drive-style instant local navigation with zero-flicker background sync & History API
  const navigateToFolder = useCallback(
    (
      targetPath: string,
      options?: { pushHistory?: boolean; fromPopState?: boolean }
    ) => {
      const cleanPath = targetPath.trim() || "all";
      const shouldPush = options?.pushHistory !== false;
      const isPop = Boolean(options?.fromPopState);

      setCategory(cleanPath);
      setPage(1);

      // 1. History Stack Synchronization
      if (isPop) {
        const hist = navHistoryRef.current;
        const curr = navIndexRef.current;
        if (curr > 0 && hist[curr - 1] === cleanPath) {
          navIndexRef.current = curr - 1;
        } else if (curr < hist.length - 1 && hist[curr + 1] === cleanPath) {
          navIndexRef.current = curr + 1;
        } else {
          const matchIdx = hist.lastIndexOf(cleanPath);
          if (matchIdx !== -1) {
            navIndexRef.current = matchIdx;
          } else {
            hist.push(cleanPath);
            navIndexRef.current = hist.length - 1;
          }
        }
        setCanGoBack(navIndexRef.current > 0);
        setCanGoForward(navIndexRef.current < navHistoryRef.current.length - 1);
      } else if (shouldPush) {
        const nextHist = navHistoryRef.current.slice(0, navIndexRef.current + 1);
        if (nextHist[nextHist.length - 1] !== cleanPath) {
          nextHist.push(cleanPath);
        }
        navHistoryRef.current = nextHist;
        navIndexRef.current = nextHist.length - 1;
        setCanGoBack(nextHist.length > 1);
        setCanGoForward(false);

        // Update browser URL query and history state
        if (typeof window !== "undefined") {
          try {
            const currentUrl = new URL(window.location.href);
            if (cleanPath === "all") {
              currentUrl.searchParams.delete("folder");
            } else {
              currentUrl.searchParams.set("folder", cleanPath);
            }
            window.history.pushState({ folder: cleanPath }, "", currentUrl.toString());
          } catch {}
        }
      }

      // 2. Instant optimistic breadcrumbs (0ms)
      const immediateCrumbs =
        cleanPath === "all" ? [{ name: "Storage", path: "" }] : getBreadcrumbs(cleanPath);

      // 3. Instant optimistic folder data from local cache or local state (0ms)
      const cached = folderDataCacheRef.current.get(cleanPath);
      if (cached) {
        setCurrentFolderData(cached);
      } else {
        // Build immediate optimistic subfolders from known files & tree in local memory
        const optimisticSubfolders: FolderItem[] = [];
        if (cleanPath === "all") {
          const rootSet = new Set<string>();
          for (const f of masterFilesMapRef.current.values()) {
            if (f.folder) {
              const top = f.folder.split("/")[0];
              if (top) rootSet.add(top);
            }
          }
          for (const r of Array.from(rootSet)) {
            if (!deletedFolderPathsRef.current.has(r)) {
              optimisticSubfolders.push({
                id: r,
                name: getFolderNameFromPath(r),
                path: r,
                parent_path: null,
                depth: 1,
              });
            }
          }
        } else {
          const subSet = new Set<string>();
          const prefix = `${cleanPath}/`;
          for (const f of masterFilesMapRef.current.values()) {
            if (f.folder && f.folder.startsWith(prefix)) {
              const rest = f.folder.slice(prefix.length);
              const segment = rest.split("/")[0];
              if (segment) subSet.add(`${cleanPath}/${segment}`);
            }
          }
          for (const s of Array.from(subSet)) {
            if (!deletedFolderPathsRef.current.has(s)) {
              optimisticSubfolders.push({
                id: s,
                name: getFolderNameFromPath(s),
                path: s,
                parent_path: cleanPath,
                depth: getFolderDepth(s),
              });
            }
          }
        }

        setCurrentFolderData({
          subfolders: optimisticSubfolders,
          breadcrumbs: immediateCrumbs,
          totalSubfolders: optimisticSubfolders.length,
          totalFiles: 0,
        });
      }

      // 4. Silent non-blocking background sync (never flashes spinner)
      void fetchFolderContents(cleanPath);
      void fetchFiles(1, searchQuery, cleanPath, sortBy, sortOrder, true);
    },
    [fetchFolderContents, fetchFiles, searchQuery, sortBy, sortOrder]
  );

  const handleNavBack = useCallback(() => {
    if (navIndexRef.current > 0) {
      window.history.back();
    } else if (category !== "all") {
      const parent = getFolderParentPath(category) || "all";
      navigateToFolder(parent);
    }
  }, [category, navigateToFolder]);

  const handleNavForward = useCallback(() => {
    if (navIndexRef.current < navHistoryRef.current.length - 1) {
      window.history.forward();
    }
  }, []);

  // Popstate Listener (Physical browser back/forward buttons & window.history)
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check URL on initial mount (e.g. user refreshed or shared link with ?folder=...)
    const initialParams = new URLSearchParams(window.location.search);
    const initialFolder = initialParams.get("folder");
    if (initialFolder && initialFolder !== "all") {
      navigateToFolder(initialFolder, { pushHistory: false, fromPopState: false });
      navHistoryRef.current = ["all", initialFolder];
      navIndexRef.current = 1;
      setCanGoBack(true);
      setCanGoForward(false);
      window.history.replaceState({ folder: initialFolder }, "", window.location.href);
    } else {
      window.history.replaceState({ folder: "all" }, "", window.location.href);
    }

    const handlePopState = (e: PopStateEvent) => {
      let targetFolder = "all";
      if (e.state && typeof e.state.folder === "string") {
        targetFolder = e.state.folder;
      } else {
        const params = new URLSearchParams(window.location.search);
        targetFolder = params.get("folder") || "all";
      }

      navigateToFolder(targetFolder, { pushHistory: false, fromPopState: true });
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [navigateToFolder]);

  // Desktop Keyboard Shortcuts (Alt+Left, Alt+Right, Alt+Up)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        handleNavBack();
      } else if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        handleNavForward();
      } else if (e.altKey && e.key === "ArrowUp") {
        e.preventDefault();
        if (category !== "all") {
          const parent = getFolderParentPath(category) || "all";
          navigateToFolder(parent);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNavBack, handleNavForward, category, navigateToFolder]);

  // Single-file enrich helper for live events with ID only
  const fetchSingleFileEnrich = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/files/${id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.file) {
            const safe = mapDbToFileItem(data.file, data.file.share_slug || data.file.slug);
            setFiles((prev) => {
              const exists = prev.findIndex((f) => f.id === safe.id);
              let next: SafeFileItem[];
              if (exists >= 0) {
                next = [...prev];
                next[exists] = { ...next[exists], ...safe };
              } else {
                next = [safe, ...prev];
                setTotalCount((c) => c + 1);
              }
              return sortFiles(next, sortBy, sortOrder);
            });
            setHighlightedIds((prev) => new Set(prev).add(safe.id));
            setTimeout(() => {
              setHighlightedIds((prev) => {
                const next = new Set(prev);
                next.delete(safe.id);
                return next;
              });
            }, 4000);
          }
        }
      } catch (err) {
        console.warn("Failed to enrich file live:", err);
      }
    },
    [sortBy, sortOrder]
  );

  // Google Drive-style Pure Push Real-Time Dynamic Engine (Zero Polling)
  useEffect(() => {
    // 1. Subscribe to typed StorageEventBus (local window, cross-tab BroadcastChannel, and StorageProvider WebSocket relay)
    const unsubLifecycle = storageEvents.on("file:lifecycle", (payload) => {
      if (payload.action === "deleted") {
        setFiles((prev) => prev.filter((f) => f.id !== payload.fileId));
        setTotalCount((c) => Math.max(0, c - 1));
        setLastLiveAction({
          message: "File deleted live",
          timestamp: Date.now(),
        });
        return;
      }

      if (payload.action === "created" || payload.action === "updated") {
        let item: SafeFileItem | null = null;
        if (payload.fileItem) {
          item = payload.fileItem as SafeFileItem;
        } else if (payload.rawRecord) {
          item = mapDbToFileItem(payload.rawRecord);
        }

        if (!item && payload.fileId) {
          void fetchSingleFileEnrich(payload.fileId);
          return;
        }

        if (item) {
          const incoming = item;
          setFiles((prev) => {
            const existingIdx = prev.findIndex((f) => f.id === incoming.id);
            let nextList: SafeFileItem[];
            if (existingIdx >= 0) {
              nextList = [...prev];
              nextList[existingIdx] = {
                ...nextList[existingIdx],
                ...incoming,
                share_slug: incoming.share_slug || nextList[existingIdx].share_slug,
              };
            } else {
              nextList = [incoming, ...prev];
              setTotalCount((c) => c + 1);
            }
            return sortFiles(nextList, sortBy, sortOrder);
          });

          setHighlightedIds((prev) => new Set(prev).add(incoming.id));
          setTimeout(() => {
            setHighlightedIds((prev) => {
              const next = new Set(prev);
              next.delete(incoming.id);
              return next;
            });
          }, 4000);

          setLastLiveAction({
            message:
              payload.action === "created"
                ? "New file pushed live • Shuffled to top"
                : "File updated in real-time",
            timestamp: Date.now(),
          });
        }
      }
    });

    // 2. Subscribe to Share link lifecycle events (dynamic slug generation & revocation)
    const unsubShare = storageEvents.on("share:lifecycle", (payload) => {
      const fileId = (payload.shareLink?.file_id || payload.oldShareLink?.file_id) as string;
      if (!fileId) return;

      if (
        payload.action === "created" ||
        payload.action === "updated" ||
        payload.action === "insert" ||
        payload.action === "update"
      ) {
        const slug = (payload.shareLink?.slug as string) || null;
        const isActive = payload.shareLink?.is_active !== false;
        if (slug && isActive) {
          setFiles((prev) =>
            prev.map((f) => (f.id === fileId ? { ...f, share_slug: slug } : f))
          );
        }
      } else if (payload.action === "deleted" || payload.action === "delete") {
        setFiles((prev) =>
          prev.map((f) => (f.id === fileId ? { ...f, share_slug: null } : f))
        );
      }
    });

    // 3. Direct Supabase Realtime channel redundancy (guarantees push even if tab was dormant)
    const supabase = createClient();
    let directChannel: ReturnType<typeof supabase.channel> | null = null;
    if (currentUserId) {
      const channelName = `files-live-sync-${currentUserId}`;
      const existing = supabase
        .getChannels()
        .find((c: { topic: string }) => c.topic === `realtime:${channelName}`);
      if (existing) {
        supabase.removeChannel(existing);
      }

      directChannel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "files",
            filter: `user_id=eq.${currentUserId}`,
          },
          (payload: {
            eventType: string;
            new?: Record<string, unknown>;
            old?: Record<string, unknown>;
          }) => {
            if (payload.eventType === "INSERT" && payload.new) {
              const incoming = mapDbToFileItem(payload.new as Record<string, unknown>);
              setFiles((prev) => {
                if (prev.some((f) => f.id === incoming.id)) return prev;
                const nextList = [incoming, ...prev];
                setTotalCount((c) => c + 1);
                return sortFiles(nextList, sortBy, sortOrder);
              });
              setHighlightedIds((prev) => new Set(prev).add(incoming.id));
              setTimeout(() => {
                setHighlightedIds((prev) => {
                  const next = new Set(prev);
                  next.delete(incoming.id);
                  return next;
                });
              }, 4000);
              setLastLiveAction({
                message: "New file pushed live • Shuffled to top",
                timestamp: Date.now(),
              });
            } else if (payload.eventType === "UPDATE" && payload.new) {
              const incoming = mapDbToFileItem(payload.new as Record<string, unknown>);
              setFiles((prev) => {
                const idx = prev.findIndex((f) => f.id === incoming.id);
                if (idx === -1) return prev;
                const nextList = [...prev];
                nextList[idx] = {
                  ...nextList[idx],
                  ...incoming,
                  share_slug: incoming.share_slug || nextList[idx].share_slug,
                };
                return sortFiles(nextList, sortBy, sortOrder);
              });
            } else if (payload.eventType === "DELETE" && payload.old) {
              const oldId = payload.old.id as string;
              setFiles((prev) => prev.filter((f) => f.id !== oldId));
              setTotalCount((c) => Math.max(0, c - 1));
              setLastLiveAction({
                message: "File deleted live",
                timestamp: Date.now(),
              });
            }
          }
        )
        .subscribe();
    }

    // 4. Listen to global navbar screen refresh trigger
    const unsubScreenRefresh = storageEvents.on("screen:refresh", () => {
      void fetchFiles(page, searchQuery, category, sortBy, sortOrder);
      void fetchFolderTree();
      void fetchFolderContents(category);
      setLastLiveAction({
        message: "Screen refreshed live",
        timestamp: Date.now(),
      });
    });

    return () => {
      unsubLifecycle();
      unsubShare();
      unsubScreenRefresh();
      if (directChannel) {
        supabase.removeChannel(directChannel);
      }
    };
  }, [currentUserId, sortBy, sortOrder, fetchSingleFileEnrich, fetchFiles, page, searchQuery, category, fetchFolderTree, fetchFolderContents]);

  // Skip redundant initial fetch on mount (page 1 and folders are already server-rendered)
  const isInitialMount = useRef(true);

  // Trigger search on query change with debounce
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const handler = setTimeout(() => {
      void fetchFiles(1, searchQuery, category, sortBy, sortOrder, true);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery, sortBy, sortOrder, category, fetchFiles]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchFiles(newPage, searchQuery, category, sortBy, sortOrder);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedFileForDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    const targetFile = selectedFileForDelete;
    try {
      const res = await authFetch(`/api/files/${targetFile.id}?force=true`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmReleaseDeletion: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSelectedFileForDelete(null);
        setDeleteError(null);
        // Optimistically remove immediately from local master pool and state
        masterFilesMapRef.current.delete(targetFile.id);
        setFiles(Array.from(masterFilesMapRef.current.values()));
        setTotalCount((c) => Math.max(0, c - 1));
        setLastLiveAction({
          message: `Deleted "${targetFile.sanitized_name}"`,
          timestamp: Date.now(),
        });
        if (typeof data.storageUsedBytes === "number") {
          storageEvents.emit("storage:updated", {
            storageUsedBytes: data.storageUsedBytes,
            activeFilesCount: data.activeFilesCount,
            source: "local_optimistic",
          });
        }
        storageEvents.emit("file:lifecycle", {
          fileId: targetFile.id,
          size: targetFile.byte_size,
          action: "deleted",
        });
      } else {
        console.error("Failed to delete file:", data);
        setDeleteError(data.error || "Failed to delete file.");
        if (res.status === 404 || data.status === "PURGED") {
          setSelectedFileForDelete(null);
          setDeleteError(null);
          setFiles((prev) => prev.filter((f) => f.id !== targetFile.id));
          setTotalCount((c) => Math.max(0, c - 1));
        }
      }
    } catch (err) {
      console.error("Failed to delete file:", err);
      setDeleteError("Network error occurred while deleting file.");
    } finally {
      setIsDeleting(false);
    }
  };

  const isBaseInstaller = useCallback(
    (file: SafeFileItem) =>
      file.share_slug === "gpn-app" ||
      file.share_slug === "gpn-app-sig" ||
      file.sanitized_name === "Gaurav_Personal_Notes_v0.0.0_x64-setup.exe" ||
      file.sanitized_name === "cpsetup.exe" ||
      file.sanitized_name === "DownexSetup.exe" ||
      file.sanitized_name === "GpnSetup.exe" ||
      file.sanitized_name === "ScheduleMeSetup.exe" ||
      file.sanitized_name === "Send2MeSetup.exe" ||
      (file.folder || "").toLowerCase().includes(".dynamic.ota/base") ||
      (file.r2_key || "").toLowerCase().includes(".dynamic.ota/base"),
    []
  );

  // Strictly hierarchical files display matching Google Drive & Windows File Explorer:
  // - Root ("Storage" / category === "all"): only files that are directly at the root (no folder).
  // - Inside a folder (e.g. category === "gaurav"): only files directly in that folder.
  // - Search mode: matches across all folders with location indicators.
  const displayedFiles = React.useMemo(() => {
    // 1. Search Query active: search across all files
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      let res = files.filter(
        (f) =>
          f.sanitized_name?.toLowerCase().includes(q) ||
          f.filename?.toLowerCase().includes(q) ||
          f.folder?.toLowerCase().includes(q)
      );
      if (typeFilter !== "all") {
        res = filterByFileType(res, typeFilter);
      }
      return sortFiles(res, sortBy, sortOrder);
    }

    // 2. Base files strictly filtered by folder hierarchy
    let baseFiles: SafeFileItem[] = [];

    if (category === "all" || !category) {
      // Root folder: STRICTLY files with NO folder.
      // Never show files that belong inside subfolders (e.g. cp-immutable-base, gaurav, etc.)
      baseFiles = files.filter((f) => !f.folder || f.folder === "");
    } else if (category === "websites") {
      baseFiles = files.filter((f) => f.is_site || f.mime_type === "text/html" || f.sanitized_name?.toLowerCase().endsWith(".html") || f.sanitized_name?.toLowerCase().endsWith(".htm"));
    } else if (category === "images") {
      baseFiles = files.filter((f) => f.mime_type?.startsWith("image/"));
    } else if (category === "documents") {
      baseFiles = filterByFileType(files, "documents");
    } else if (category === "media") {
      baseFiles = files.filter((f) => f.mime_type?.startsWith("video/") || f.mime_type?.startsWith("audio/"));
    } else if (category === "archives") {
      baseFiles = filterByFileType(files, "archives");
    } else {
      // Inside a specific folder: STRICTLY files directly inside this folder.
      // Never show files from deeper nested subfolders!
      baseFiles = files.filter((f) => f.folder === category);
    }

    // 3. Apply type filter if selected
    if (typeFilter !== "all") {
      baseFiles = filterByFileType(baseFiles, typeFilter);
    }

    // 4. Always sort reactively according to active sortBy & sortOrder
    return sortFiles(baseFiles, sortBy, sortOrder);
  }, [files, category, searchQuery, typeFilter, sortBy, sortOrder]);

  const selectedFiles = React.useMemo(
    () => displayedFiles.filter((f) => selectedFileIds.has(f.id)),
    [displayedFiles, selectedFileIds]
  );

  const protectedFiles = React.useMemo(
    () => selectedFiles.filter((f) => isBaseInstaller(f)),
    [selectedFiles, isBaseInstaller]
  );

  const deletableFiles = React.useMemo(
    () => selectedFiles.filter((f) => !isBaseInstaller(f)),
    [selectedFiles, isBaseInstaller]
  );

  const handleBulkDeleteConfirm = async () => {
    const totalItems = deletableFiles.length + selectedFolderPaths.size;
    if (totalItems === 0) {
      setShowBulkDeleteModal(false);
      return;
    }

    setIsBulkDeleting(true);
    setBulkDeleteProgress({ current: 0, total: totalItems });

    let completed = 0;
    const deletedFolderList: string[] = [];

    // Purge selected folders recursively
    for (const folderPath of Array.from(selectedFolderPaths)) {
      try {
        const res = await authFetch(
          `/api/v1/folders?path=${encodeURIComponent(folderPath)}&recursive=true`,
          { method: "DELETE" }
        );
        if (res.ok || res.status === 404) {
          deletedFolderList.push(folderPath);
          const data = await res.json().catch(() => ({}));
          if (typeof data.storageUsedBytes === "number") {
            storageEvents.emit("storage:updated", {
              storageUsedBytes: data.storageUsedBytes,
              activeFilesCount: data.activeFilesCount,
              source: "local_optimistic",
            });
          }
        }
      } catch (err) {
        console.error(`Failed to delete folder ${folderPath}:`, err);
      } finally {
        completed++;
        setBulkDeleteProgress({ current: completed, total: totalItems });
      }
    }

    if (deletedFolderList.length > 0) {
      for (const df of deletedFolderList) {
        deletedFolderPathsRef.current.add(df);
        const top = df.split("/")[0];
        if (top) deletedFolderPathsRef.current.add(top);
      }
      setCustomFolders((prev) => {
        const next = prev.filter((f) => !deletedFolderList.some((df) => f === df || f.startsWith(`${df}/`)));
        try {
          localStorage.setItem("gphost_custom_folders", JSON.stringify(next));
        } catch {}
        return next;
      });
      setFiles((prev) =>
        prev.filter((f) => !deletedFolderList.some((df) => f.folder === df || f.folder?.startsWith(`${df}/`)))
      );
      setCurrentFolderData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          subfolders: prev.subfolders.filter(
            (sf) => !deletedFolderList.some((df) => sf.path === df || sf.path.startsWith(`${df}/`))
          ),
          totalSubfolders: Math.max(0, prev.totalSubfolders - deletedFolderList.length),
        };
      });
      setFolderTree((prev) =>
        prev.filter((node) => !deletedFolderList.some((df) => node.path === df || node.path.startsWith(`${df}/`)))
      );
      router.refresh();
      setFolderTree((prev) =>
        prev.filter((node) => !deletedFolderList.some((df) => node.path === df || node.path.startsWith(`${df}/`)))
      );
      setSelectedFolderPaths(new Set());
    }

    const deletedIds: string[] = [];
    for (const file of deletableFiles) {
      try {
        const forceParam = file.is_release_locked ? "?force=true" : "";
        const res = await authFetch(`/api/files/${file.id}${forceParam}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmReleaseDeletion: true }),
        });
        if (res.ok || res.status === 404) {
          deletedIds.push(file.id);
          storageEvents.emit("file:lifecycle", {
            fileId: file.id,
            size: file.byte_size,
            action: "deleted",
          });
        }
      } catch (err) {
        console.error(`Failed to delete file ${file.id}:`, err);
      } finally {
        completed++;
        setBulkDeleteProgress({ current: completed, total: totalItems });
      }
    }

    if (deletedIds.length > 0) {
      const deletedSet = new Set(deletedIds);
      setFiles((prev) => prev.filter((f) => !deletedSet.has(f.id)));
      setTotalCount((c) => Math.max(0, c - deletedIds.length));
      setSelectedFileIds(new Set());
    }

    if (deletedFolderList.length > 0 || deletedIds.length > 0) {
      const parts: string[] = [];
      if (deletedFolderList.length > 0) {
        parts.push(`${deletedFolderList.length} ${deletedFolderList.length === 1 ? "folder" : "folders"}`);
      }
      if (deletedIds.length > 0) {
        parts.push(`${deletedIds.length} ${deletedIds.length === 1 ? "file" : "files"}`);
      }
      setLastLiveAction({
        message: `Deleted ${parts.join(" and ")}`,
        timestamp: Date.now(),
      });
      void fetchFolderTree();
      void fetchFolderContents(category);
    }

    setIsBulkDeleting(false);
    setBulkDeleteProgress(null);
    setShowBulkDeleteModal(false);
  };

  const handleMoveFilesToFolder = async (folderName: string) => {
    const cleanFolder = sanitizeFolderName(folderName);
    if (!cleanFolder || selectedFiles.length === 0) return;

    setIsMovingFiles(true);
    const movedIds: string[] = [];

    for (const file of selectedFiles) {
      try {
        const res = await authFetch(`/api/files/${file.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder: cleanFolder, moveFolder: cleanFolder }),
        });
        if (res.ok) {
          movedIds.push(file.id);
        }
      } catch (err) {
        console.error(`Failed to move file ${file.id}:`, err);
      }
    }

    if (movedIds.length > 0) {
      const movedSet = new Set(movedIds);
      setFiles((prev) =>
        prev.map((f) => (movedSet.has(f.id) ? { ...f, folder: cleanFolder } : f))
      );
      setCustomFolders((prev) => {
        const next = Array.from(new Set([...prev, cleanFolder]));
        try {
          localStorage.setItem("gphost_custom_folders", JSON.stringify(next));
        } catch {}
        return next;
      });
      setSelectedFileIds(new Set());
      setLastLiveAction({
        message: `Moved ${movedIds.length} ${movedIds.length === 1 ? "file" : "files"} to ${cleanFolder}`,
        timestamp: Date.now(),
      });
    }

    setIsMovingFiles(false);
    setShowMoveFolderModal(false);
    setTargetMoveFolder("");
  };

  const handleCreateNewFolder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isCreatingFolder) return;

    const rawInput = newFolderNameInput.trim();
    if (!rawInput) {
      setNewFolderError("Please enter a folder name");
      return;
    }

    const isSystemCategory = [
      "all",
      "websites",
      "images",
      "documents",
      "media",
      "archives",
    ].includes(category);

    let targetPath = rawInput;
    if (!rawInput.includes("/") && !isSystemCategory && category) {
      targetPath = `${category}/${rawInput}`;
    }

    setIsCreatingFolder(true);
    setNewFolderError(null);

    try {
      const normalized = normalizeFolderPath(targetPath);
      const res = await authFetch("/api/v1/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: normalized }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNewFolderError(data.error || "Failed to create folder");
        return;
      }

      setCustomFolders((prev) => {
        const next = Array.from(new Set([...prev, normalized]));
        try {
          localStorage.setItem("gphost_custom_folders", JSON.stringify(next));
        } catch {}
        return next;
      });

      // Keep loader lock active until folder tree and UI are refreshed
      await Promise.all([
        fetchFolderTree(),
        fetchFolderContents(category),
        fetchFiles(page, searchQuery, category, sortBy, sortOrder),
      ]);

      setShowNewFolderModal(false);
      setNewFolderNameInput("");
      setNewFolderError(null);
      setLastLiveAction({
        message: `Folder '${getFolderNameFromPath(normalized)}' created`,
        timestamp: Date.now(),
      });
    } catch (err: unknown) {
      setNewFolderError(err instanceof Error ? err.message : "Failed to create folder");
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleRenameFolderConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderToRename) return;
    const newName = renameFolderNameInput.trim();
    if (!newName) {
      setRenameFolderError("Please enter a new folder name");
      return;
    }

    setIsRenamingFolder(true);
    setRenameFolderError(null);
    try {
      const res = await authFetch("/api/v1/folders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: folderToRename.path,
          newName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRenameFolderError(data.error || "Failed to rename folder");
        setIsRenamingFolder(false);
        return;
      }

      const oldPath = folderToRename.path;
      const newPath = data.newPath as string;

      setCustomFolders((prev) => {
        const next = prev.map((f) => {
          if (f === oldPath) return newPath;
          if (f.startsWith(`${oldPath}/`)) return `${newPath}${f.substring(oldPath.length)}`;
          return f;
        });
        try {
          localStorage.setItem("gphost_custom_folders", JSON.stringify(next));
        } catch {}
        return next;
      });

      if (category === oldPath) {
        setCategory(newPath);
      } else if (category.startsWith(`${oldPath}/`)) {
        setCategory(`${newPath}${category.substring(oldPath.length)}`);
      }

      setFiles((prev) =>
        prev.map((f) => {
          if (f.folder === oldPath) {
            return { ...f, folder: newPath };
          }
          if (f.folder && f.folder.startsWith(`${oldPath}/`)) {
            return { ...f, folder: `${newPath}${f.folder.substring(oldPath.length)}` };
          }
          return f;
        })
      );

      setFolderToRename(null);
      setRenameFolderNameInput("");
      void fetchFolderTree();
      void fetchFolderContents(category === oldPath ? newPath : category);
      setLastLiveAction({
        message: `Folder renamed to '${newName}'`,
        timestamp: Date.now(),
      });
    } catch (err: unknown) {
      setRenameFolderError(err instanceof Error ? err.message : "Failed to rename folder");
    } finally {
      setIsRenamingFolder(false);
    }
  };

  const handleDeleteFolderConfirm = async () => {
    if (!folderToDelete) return;
    setIsDeletingFolder(true);
    setDeleteFolderError(null);
    try {
      const res = await authFetch(
        `/api/v1/folders?path=${encodeURIComponent(folderToDelete.path)}&recursive=true`,
        {
          method: "DELETE",
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setDeleteFolderError(data.error || "Failed to delete folder");
        setIsDeletingFolder(false);
        return;
      }

      if (typeof data.storageUsedBytes === "number") {
        storageEvents.emit("storage:updated", {
          storageUsedBytes: data.storageUsedBytes,
          activeFilesCount: data.activeFilesCount,
          source: "local_optimistic",
        });
      } else if (typeof data.reclaimedBytes === "number" && data.reclaimedBytes > 0) {
        storageEvents.emit("storage:updated", {
          deltaBytes: -data.reclaimedBytes,
          source: "local_optimistic",
        });
      }

      const deletedPath = folderToDelete.path;
      deletedFolderPathsRef.current.add(deletedPath);
      const topDeleted = deletedPath.split("/")[0];
      if (topDeleted) deletedFolderPathsRef.current.add(topDeleted);

      setCustomFolders((prev) => {
        const next = prev.filter((f) => f !== deletedPath && !f.startsWith(`${deletedPath}/`));
        try {
          localStorage.setItem("gphost_custom_folders", JSON.stringify(next));
        } catch {}
        return next;
      });

      setFiles((prev) =>
        prev.filter(
          (f) =>
            f.folder !== deletedPath && (!f.folder || !f.folder.startsWith(`${deletedPath}/`))
        )
      );

      setCurrentFolderData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          subfolders: prev.subfolders.filter(
            (sf) => sf.path !== deletedPath && !sf.path.startsWith(`${deletedPath}/`)
          ),
          totalSubfolders: Math.max(0, prev.totalSubfolders - 1),
        };
      });

      setFolderTree((prev) =>
        prev.filter((node) => node.path !== deletedPath && !node.path.startsWith(`${deletedPath}/`))
      );

      setSelectedFolderPaths((prev) => {
        const next = new Set(prev);
        next.delete(deletedPath);
        return next;
      });

      if (category === deletedPath || category.startsWith(`${deletedPath}/`)) {
        const parent = getFolderParentPath(deletedPath);
        setCategory(parent || "all");
      }

      setFolderToDelete(null);
      void fetchFolderTree();
      void fetchFolderContents(category === deletedPath ? "all" : category);
      void fetchFiles(page, searchQuery, category === deletedPath ? "all" : category, sortBy, sortOrder);
      router.refresh();
      setLastLiveAction({
        message: `Folder '${deletedPath}' deleted`,
        timestamp: Date.now(),
      });
    } catch (err: unknown) {
      setDeleteFolderError(err instanceof Error ? err.message : "Failed to delete folder");
    } finally {
      setIsDeletingFolder(false);
    }
  };

  const handleMoveFolderConfirm = async (destinationParent: string) => {
    if (!folderToMove) return;
    setIsMovingFolder(true);
    try {
      const res = await authFetch("/api/v1/folders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: folderToMove.path,
          destinationParent: destinationParent || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to move folder");
        setIsMovingFolder(false);
        return;
      }

      const oldPath = folderToMove.path;
      const newPath = data.newPath as string;

      setCustomFolders((prev) => {
        const next = prev.map((f) => {
          if (f === oldPath) return newPath;
          if (f.startsWith(`${oldPath}/`)) return `${newPath}${f.substring(oldPath.length)}`;
          return f;
        });
        try {
          localStorage.setItem("gphost_custom_folders", JSON.stringify(next));
        } catch {}
        return next;
      });

      setFiles((prev) =>
        prev.map((f) => {
          if (f.folder === oldPath) {
            return { ...f, folder: newPath };
          }
          if (f.folder && f.folder.startsWith(`${oldPath}/`)) {
            return { ...f, folder: `${newPath}${f.folder.substring(oldPath.length)}` };
          }
          return f;
        })
      );

      if (category === oldPath) {
        setCategory(newPath);
      } else if (category.startsWith(`${oldPath}/`)) {
        setCategory(`${newPath}${category.substring(oldPath.length)}`);
      }

      setFolderToMove(null);
      setFolderMoveTarget("");
      void fetchFolderTree();
      void fetchFolderContents(category === oldPath ? newPath : category);
      setLastLiveAction({
        message: `Folder moved to '${newPath}'`,
        timestamp: Date.now(),
      });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to move folder");
    } finally {
      setIsMovingFolder(false);
    }
  };

  const handleDeleteCustomFolder = (folderName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFolderToDelete({
      id: folderName,
      name: getFolderNameFromPath(folderName),
      path: folderName,
      parentPath: getFolderParentPath(folderName),
      depth: folderName.split("/").length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalFiles: files.filter((f) => f.folder === folderName).length,
      totalBytes: 0,
      totalSubfolders: 0,
    });
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
      storageEvents.emit("share:lifecycle", {
        action: "created",
        shareLink: shareData,
      });
    } catch (err) {
      console.error("Failed to create share link:", err);
      setShareError("Network error creating share link");
    } finally {
      setCreatingShare(false);
    }
  };

  const allDynamicFolders = React.useMemo(() => {
    const system = new Set(["all", "websites", "images", "documents", "media", "archives"]);
    const set = new Set<string>();
    for (const f of customFolders) {
      if (!system.has(f) && !deletedFolderPathsRef.current.has(f)) {
        const top = f.split("/")[0];
        if (top && !deletedFolderPathsRef.current.has(top)) set.add(top);
      }
    }
    for (const f of files) {
      if (f.folder && !system.has(f.folder)) {
        const top = f.folder.split("/")[0];
        if (top && !deletedFolderPathsRef.current.has(top) && !deletedFolderPathsRef.current.has(f.folder)) {
          set.add(top);
        }
      }
    }
    if (folderTree && folderTree.length > 0) {
      for (const node of folderTree) {
        const topPath = node.path ? node.path.split("/")[0] : (node.parent_path ? null : node.name);
        if (
          topPath &&
          !system.has(topPath) &&
          !deletedFolderPathsRef.current.has(topPath)
        ) {
          set.add(topPath);
        }
      }
    }
    return Array.from(set);
  }, [customFolders, files, folderTree]);

  const currentLevelFolders = React.useMemo(() => {
    const isAtRoot = category === "all";

    if (isAtRoot) {
      const folderMap = new Map<
        string,
        {
          id: string;
          name: string;
          path: string;
          parentPath: string | null;
          fileCount: number;
          subfolderCount: number;
          totalBytes?: number;
          isSpecial?: boolean;
          icon?: React.ElementType;
          color?: string;
          bg?: string;
        }
      >();

      // Add root subfolders returned from API
      if (currentFolderData?.subfolders) {
        for (const sf of currentFolderData.subfolders) {
          const p = sf.path;
          const isRootFolder = (!sf.parent_path && !sf.parentPath) || !p.includes("/");
          if (
            isRootFolder &&
            !p.includes("/") &&
            !deletedFolderPathsRef.current.has(p) &&
            !["all", "websites", "images", "documents", "media", "archives"].includes(p)
          ) {
            const matchingFiles = files.filter(
              (file) => file.folder === p || file.folder?.startsWith(`${p}/`)
            );
            const serverFiles = sf.totalFiles ?? sf.file_count ?? 0;
            const fileCount = Math.max(serverFiles, matchingFiles.length);
            const serverBytes = sf.totalBytes ?? sf.total_bytes ?? 0;
            const localBytes = matchingFiles.reduce((acc, f) => acc + (f.byte_size || 0), 0);
            const totalBytes = Math.max(serverBytes, localBytes);

            folderMap.set(p, {
              id: sf.id || p,
              name: sf.name || p,
              path: p,
              parentPath: null,
              fileCount,
              subfolderCount: sf.totalSubfolders ?? sf.subfolder_count ?? 0,
              totalBytes,
            });
          }
        }
      }

      // Add root dynamic folders discovered from files or customFolders
      for (const f of allDynamicFolders) {
        if (
          !f.includes("/") &&
          !folderMap.has(f) &&
          !deletedFolderPathsRef.current.has(f) &&
          !["all", "websites", "images", "documents", "media", "archives"].includes(f)
        ) {
          const matchingFiles = files.filter(
            (file) => file.folder === f || file.folder?.startsWith(`${f}/`)
          );
          // Calculate subfolder count at root
          const subfoldersUnderRoot = new Set<string>();
          for (const item of files) {
            if (item.folder && item.folder.startsWith(`${f}/`)) {
              const seg = item.folder.slice(`${f}/`.length).split("/")[0];
              if (seg) subfoldersUnderRoot.add(seg);
            }
          }
          folderMap.set(f, {
            id: f,
            name: f,
            path: f,
            parentPath: null,
            fileCount: matchingFiles.length,
            subfolderCount: subfoldersUnderRoot.size,
            totalBytes: matchingFiles.reduce((acc, file) => acc + (file.byte_size || 0), 0),
          });
        }
      }

      const all = Array.from(folderMap.values());
      const filtered = searchQuery.trim()
        ? all.filter(
            (folder) =>
              folder.name.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
              folder.path.toLowerCase().includes(searchQuery.toLowerCase().trim())
          )
        : all;

      return [...filtered].sort((a, b) => {
        if (sortBy === "sanitized_name") {
          return sortOrder === "asc"
            ? a.name.localeCompare(b.name, undefined, { numeric: true })
            : b.name.localeCompare(a.name, undefined, { numeric: true });
        }
        if (sortBy === "byte_size") {
          return sortOrder === "asc" ? a.fileCount - b.fileCount : b.fileCount - a.fileCount;
        }
        return sortOrder === "asc"
          ? a.name.localeCompare(b.name, undefined, { numeric: true })
          : b.name.localeCompare(a.name, undefined, { numeric: true });
      });
    }

    // Inside a specific subfolder (e.g. send2me.dynamic.ota or gpn.dynamic.ota)
    const subMap = new Map<
      string,
      {
        id: string;
        name: string;
        path: string;
        parentPath: string | null;
        fileCount: number;
        subfolderCount: number;
        totalBytes?: number;
        isSpecial?: boolean;
        icon?: React.ElementType;
        color?: string;
        bg?: string;
      }
    >();

    if (currentFolderData?.subfolders) {
      for (const sf of currentFolderData.subfolders) {
        const p = sf.path;
        if (!p || subMap.has(p) || deletedFolderPathsRef.current.has(p)) continue;
        // MUST be an immediate direct child of current category
        const isChild =
          sf.parent_path === category ||
          sf.parentPath === category ||
          (p.startsWith(`${category}/`) && p.slice(`${category}/`.length).split("/").length === 1);
        if (!isChild) continue;

        const matchingFiles = files.filter(
          (f) => f.folder === p || f.folder?.startsWith(`${p}/`)
        );
        const serverFiles = sf.totalFiles ?? sf.file_count ?? 0;
        const fileCount = Math.max(serverFiles, matchingFiles.length);
        const serverBytes = sf.totalBytes ?? sf.total_bytes ?? 0;
        const localBytes = matchingFiles.reduce((acc, f) => acc + (f.byte_size || 0), 0);
        const totalBytes = Math.max(serverBytes, localBytes);

        subMap.set(p, {
          id: sf.id || p,
          name: sf.name || getFolderNameFromPath(p),
          path: p,
          parentPath: sf.parent_path || sf.parentPath || category,
          fileCount,
          subfolderCount: sf.totalSubfolders ?? sf.subfolder_count ?? 0,
          totalBytes,
          isSpecial: false,
          icon: Folder,
          color: "text-amber-500",
          bg: "bg-amber-500/10 border-amber-500/20",
        });
      }
    }

    // Also complement subMap with any child folders present in files
    for (const f of files) {
      if (f.folder && f.folder.startsWith(`${category}/`)) {
        const rel = f.folder.slice(`${category}/`.length);
        const childSegment = rel.split("/")[0];
        if (childSegment) {
          const childPath = `${category}/${childSegment}`;
          if (!subMap.has(childPath) && !deletedFolderPathsRef.current.has(childPath)) {
            const matchingFiles = files.filter(
              (file) => file.folder === childPath || file.folder?.startsWith(`${childPath}/`)
            );
            subMap.set(childPath, {
              id: childPath,
              name: childSegment,
              path: childPath,
              parentPath: category,
              fileCount: matchingFiles.length,
              subfolderCount: 0,
              totalBytes: matchingFiles.reduce((acc, file) => acc + (file.byte_size || 0), 0),
              isSpecial: false,
              icon: Folder,
              color: "text-amber-500",
              bg: "bg-amber-500/10 border-amber-500/20",
            });
          }
        }
      }
    }

    // Also complement subMap with children from folderTree
    const findChildrenInTree = (nodes: FolderTreeNode[]) => {
      for (const n of nodes) {
        if (n.path === category && n.children) {
          for (const c of n.children) {
            const cp = c.path;
            if (!subMap.has(cp) && !deletedFolderPathsRef.current.has(cp)) {
              const matchingFiles = files.filter(
                (file) => file.folder === cp || file.folder?.startsWith(`${cp}/`)
              );
              subMap.set(cp, {
                id: c.id || cp,
                name: c.name || getFolderNameFromPath(cp),
                path: cp,
                parentPath: category,
                fileCount: matchingFiles.length,
                subfolderCount: c.children?.length || 0,
                totalBytes: matchingFiles.reduce((acc, file) => acc + (file.byte_size || 0), 0),
                isSpecial: false,
                icon: Folder,
                color: "text-amber-500",
                bg: "bg-amber-500/10 border-amber-500/20",
              });
            }
          }
        } else if (n.children && n.children.length > 0) {
          findChildrenInTree(n.children);
        }
      }
    };
    if (folderTree && folderTree.length > 0) {
      findChildrenInTree(folderTree);
    }

    const subs = Array.from(subMap.values());
    const filtered = searchQuery.trim()
      ? subs.filter(
          (folder) =>
            folder.name.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
            folder.path.toLowerCase().includes(searchQuery.toLowerCase().trim())
        )
      : subs;

    return [...filtered].sort((a, b) => {
      if (sortBy === "sanitized_name") {
        return sortOrder === "asc"
          ? a.name.localeCompare(b.name, undefined, { numeric: true })
          : b.name.localeCompare(a.name, undefined, { numeric: true });
      }
      if (sortBy === "byte_size") {
        return sortOrder === "asc" ? a.fileCount - b.fileCount : b.fileCount - a.fileCount;
      }
      return sortOrder === "asc"
        ? a.name.localeCompare(b.name, undefined, { numeric: true })
        : b.name.localeCompare(a.name, undefined, { numeric: true });
    });
  }, [category, currentFolderData, allDynamicFolders, files, searchQuery, sortBy, sortOrder]);

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* 1. Windows 11 & Google Drive Navigation Bar with Breadcrumbs & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {/* Navigation / Address Bar with Back/Forward/Up Controls & Breadcrumbs */}
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {/* Windows Explorer / Google Drive Navigation Buttons */}
          <div className="flex items-center gap-0.5 p-1 rounded-xl bg-card border border-border shadow-2xs shrink-0">
            <button
              type="button"
              disabled={!canGoBack}
              onClick={handleNavBack}
              className="p-1.5 rounded-lg hover:bg-muted text-foreground transition cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed hover:text-blue-500"
              title="Go back (Alt+Left or Browser Back)"
              aria-label="Go back"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={!canGoForward}
              onClick={handleNavForward}
              className="p-1.5 rounded-lg hover:bg-muted text-foreground transition cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed hover:text-blue-500"
              title="Go forward (Alt+Right or Browser Forward)"
              aria-label="Go forward"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={category === "all"}
              onClick={() => {
                const isSys = [
                  "websites",
                  "images",
                  "documents",
                  "media",
                  "archives",
                ].includes(category);
                if (isSys) {
                  navigateToFolder("all");
                } else {
                  const parent = getFolderParentPath(category);
                  navigateToFolder(parent || "all");
                }
              }}
              className="p-1.5 rounded-lg hover:bg-muted text-foreground transition cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed hover:text-blue-500"
              title={category === "all" ? "Already at root" : "Up to parent folder (Alt+Up)"}
              aria-label="Up to parent folder"
            >
              <CornerLeftUp className="w-4 h-4" />
            </button>
          </div>

          {/* Interactive Clickable Breadcrumbs */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card border border-border text-sm text-muted-foreground select-none overflow-x-auto no-scrollbar max-w-full shadow-2xs">
            <button
              type="button"
              onClick={() => navigateToFolder("all")}
              className={`flex items-center gap-1.5 cursor-pointer font-medium shrink-0 transition-colors ${
                category === "all"
                  ? "text-foreground font-semibold"
                  : "hover:text-blue-500 hover:underline"
              }`}
            >
              <Folder className="w-4 h-4 text-amber-500 fill-amber-500/20" />
              <span>Storage</span>
            </button>
            {category !== "all" && (
              <>
                <span className="text-muted-foreground/60">/</span>
                {[
                  "websites",
                  "images",
                  "documents",
                  "media",
                  "archives",
                ].includes(category) ? (
                  <span className="text-blue-600 dark:text-blue-400 font-semibold capitalize shrink-0">
                    {category}
                  </span>
                ) : (
                  (() => {
                    const crumbs = currentFolderData?.breadcrumbs?.length
                      ? currentFolderData.breadcrumbs.filter((b) => b.path)
                      : getBreadcrumbs(category).filter((b) => b.path);
                    return crumbs.map((crumb, idx) => {
                      const isLast = idx === crumbs.length - 1;
                      return (
                        <React.Fragment key={`crumb-${crumb.path || idx}-${idx}`}>
                          {idx > 0 && <span className="text-muted-foreground/60">/</span>}
                          {isLast ? (
                            <span className="text-blue-600 dark:text-blue-400 font-bold shrink-0">
                              {crumb.name}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => navigateToFolder(crumb.path)}
                              className="hover:text-foreground hover:underline cursor-pointer shrink-0"
                            >
                              {crumb.name}
                            </button>
                          )}
                        </React.Fragment>
                      );
                    });
                  })()
                )}
              </>
            )}
          </div>

          {/* Primary '+ New Folder' Action Button */}
          <button
            type="button"
            onClick={() => {
              setNewFolderNameInput("");
              setNewFolderError(null);
              setShowNewFolderModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition shadow-xs cursor-pointer active:scale-95 shrink-0"
            title={
              category === "all"
                ? "Create a new folder in Storage"
                : `Create a new subfolder inside ${category}`
            }
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>New Folder</span>
          </button>

          {/* Folder Action Buttons for current custom folder */}
          {category !== "all" &&
            ![
              "websites",
              "images",
              "documents",
              "media",
              "archives",
            ].includes(category) && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setFolderToRename({
                      id: category,
                      name: getFolderNameFromPath(category),
                      path: category,
                      parentPath: getFolderParentPath(category),
                      depth: category.split("/").length,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      totalFiles: files.length,
                      totalBytes: 0,
                      totalSubfolders: currentFolderData?.subfolders?.length || 0,
                    });
                    setRenameFolderNameInput(getFolderNameFromPath(category));
                    setRenameFolderError(null);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground font-medium text-xs transition shadow-2xs cursor-pointer"
                  title="Rename current folder"
                >
                  <Edit2 className="w-3 h-3 text-muted-foreground" />
                  <span className="hidden sm:inline">Rename</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFolderToMove({
                      id: category,
                      name: getFolderNameFromPath(category),
                      path: category,
                      parentPath: getFolderParentPath(category),
                      depth: category.split("/").length,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      totalFiles: files.length,
                      totalBytes: 0,
                      totalSubfolders: currentFolderData?.subfolders?.length || 0,
                    });
                    setFolderMoveTarget(getFolderParentPath(category) || "");
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground font-medium text-xs transition shadow-2xs cursor-pointer"
                  title="Move current folder to another parent"
                >
                  <Move className="w-3 h-3 text-muted-foreground" />
                  <span className="hidden sm:inline">Move</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFolderToDelete({
                      id: category,
                      name: getFolderNameFromPath(category),
                      path: category,
                      parentPath: getFolderParentPath(category),
                      depth: category.split("/").length,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      totalFiles: files.length,
                      totalBytes: 0,
                      totalSubfolders: currentFolderData?.subfolders?.length || 0,
                    });
                    setDeleteFolderError(null);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-medium text-xs transition shadow-2xs cursor-pointer"
                  title="Delete current folder and all contents"
                >
                  <Trash2 className="w-3 h-3" />
                  <span className="hidden sm:inline">Delete</span>
                </button>
              </div>
            )}
        </div>

        {/* Dynamic Real-time Live Status Badge with ? InfoTooltip */}
        <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border transition-all duration-300 shadow-2xs select-none shrink-0 ${
              lastLiveAction && Date.now() - lastLiveAction.timestamp < 3500
                ? "bg-blue-500/15 border-blue-500/40 text-blue-600 dark:text-blue-300 ring-1 ring-blue-500/30 scale-102"
                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
            }`}
          >
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-semibold text-[11px]">
              {lastLiveAction && Date.now() - lastLiveAction.timestamp < 3500
                ? lastLiveAction.message
                : "Live Sync"}
            </span>
          </div>
          <InfoTooltip
            title="Real-time Live Sync"
            content="Real-time WebSocket connection is active. Any uploaded, renamed, moved, or deleted files update instantly on your screen without reloading."
            variant="emerald"
            side="bottom"
            align="end"
          />
        </div>
      </div>

      {/* 2. Search, Filter, Sort, View & Specialized Tools Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
        {/* Search Input (Full width on mobile, responsive width on desktop) */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search files & folders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-7 py-1.5 rounded-xl bg-background border border-border text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500 transition shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Action Controls Toolbar: Scrollable / wrapping on small screens */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 md:pb-0 shrink-0">
          {/* Type Filter Dropdown */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:border-blue-500 cursor-pointer font-medium shadow-2xs shrink-0"
            aria-label="Filter by file type"
            title="Filter by file type"
          >
            <option value="all">All Types</option>
            <option value="images">Images</option>
            <option value="documents">Documents</option>
            <option value="media">Media</option>
            <option value="archives">Archives</option>
            <option value="websites">Websites</option>
            <option value="executables">Apps &amp; Executables</option>
          </select>

          {/* Sort Dropdown & Order Toggle */}
          <div className="flex items-center gap-1 shrink-0">
            <select
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value as FileSortOption)}
              className="px-2.5 py-1.5 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:border-blue-500 cursor-pointer font-medium shadow-2xs shrink-0"
              aria-label="Sort files"
              title="Sort files"
            >
              <option value="recent">Recent</option>
              <option value="created_at">Date</option>
              <option value="byte_size">Size</option>
              <option value="sanitized_name">Name</option>
              <option value="expires_at">Expiry</option>
            </select>

            <button
              type="button"
              onClick={() => {
                const nextOrder = sortOrder === "desc" ? "asc" : "desc";
                setSortOrder(nextOrder);
                setFiles((prev) => sortFiles(prev, sortBy, nextOrder));
              }}
              className="p-1.5 rounded-xl bg-background border border-border text-xs text-muted-foreground hover:text-foreground hover:border-blue-500/40 transition cursor-pointer shadow-2xs shrink-0 flex items-center justify-center"
              aria-label={`Sort direction: ${sortOrder === "desc" ? "Descending (newest/largest first)" : "Ascending (oldest/smallest first)"}`}
              title={sortOrder === "desc" ? "Descending (newest first - click for ascending)" : "Ascending (oldest first - click for descending)"}
            >
              {sortOrder === "desc" ? (
                <ArrowDown className="w-3.5 h-3.5 text-blue-500" />
              ) : (
                <ArrowUp className="w-3.5 h-3.5 text-blue-500" />
              )}
            </button>
          </div>

          {/* View Mode Switcher [ ≡ List | ⊞ Grid ] */}
          <div className="flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-xl border border-border shrink-0 shadow-2xs">
            <button
              type="button"
              onClick={() => handleViewModeChange("list")}
              aria-label="List view"
              title="List view (Google Drive & Windows 11 style)"
              className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer flex items-center justify-center ${
                viewMode === "list"
                  ? "bg-background text-foreground shadow-2xs font-semibold ring-1 ring-border/50"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
              }`}
            >
              <ListIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange("grid")}
              aria-label="Grid view"
              title="Grid view (Google Drive & Windows 11 style)"
              className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer flex items-center justify-center ${
                viewMode === "grid"
                  ? "bg-background text-foreground shadow-2xs font-semibold ring-1 ring-border/50"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Divider */}
          <div className="h-5 w-px bg-border/80 shrink-0 mx-0.5" />

          {/* Host HTML Webpage Button with ? InfoTooltip */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setShowHtmlHostModal(true)}
              className="px-2.5 py-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0 font-medium shadow-2xs"
              title="Host static HTML webpage with custom domain and slug"
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px] font-semibold">Host Webpage</span>
            </button>
            <InfoTooltip
              title="Host Static Webpage"
              content="Deploy standalone HTML webpages, single-page sites, or portfolios with high-speed CDN delivery and custom public share links."
              variant="info"
              side="bottom"
              align="end"
            />
          </div>

          {/* Terminal Upload cURL Quick Launcher with ? InfoTooltip */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setShowTerminalModal(true)}
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow-2xs"
              title="Upload via Terminal (cURL / PowerShell)"
            >
              <Terminal className="w-3.5 h-3.5 text-blue-500" />
              <span className="hidden md:inline font-mono text-[11px]">cURL</span>
            </button>
            <InfoTooltip
              title="Terminal / cURL Upload"
              content="Generate command-line cURL and PowerShell scripts to upload files straight from your terminal or CI/CD pipelines."
              side="bottom"
              align="end"
            />
          </div>
        </div>
      </div>

      {/* 2. Google Drive / Windows Explorer Style Folders Section */}
      {currentLevelFolders.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-medium px-0.5">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 font-semibold text-foreground text-xs sm:text-sm">
                <Folder className="w-4 h-4 text-amber-500 fill-amber-500/20" />
                <span>Folders</span>
                <span className="text-xs text-muted-foreground font-normal">
                  ({currentLevelFolders.length})
                </span>
              </span>

              {/* Dynamic Batch Select All Checkbox for Folders */}
              <label className="flex items-center gap-1.5 cursor-pointer select-none ml-2 group">
                <input
                  type="checkbox"
                  checked={
                    currentLevelFolders.length > 0 &&
                    currentLevelFolders.every((f) => selectedFolderPaths.has(f.path))
                  }
                  ref={(el) => {
                    if (el) {
                      const allSelected =
                        currentLevelFolders.length > 0 &&
                        currentLevelFolders.every((f) => selectedFolderPaths.has(f.path));
                      const someSelected = currentLevelFolders.some((f) =>
                        selectedFolderPaths.has(f.path)
                      );
                      el.indeterminate = !allSelected && someSelected;
                    }
                  }}
                  onChange={(e) => {
                    if (e.target.checked) {
                      const next = new Set(selectedFolderPaths);
                      currentLevelFolders.forEach((f) => next.add(f.path));
                      setSelectedFolderPaths(next);
                    } else {
                      const next = new Set(selectedFolderPaths);
                      currentLevelFolders.forEach((f) => next.delete(f.path));
                      setSelectedFolderPaths(next);
                    }
                  }}
                  className="w-3.5 h-3.5 rounded border-border text-blue-600 focus:ring-blue-500 cursor-pointer transition accent-blue-600"
                />
                <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition">
                  {selectedFolderPaths.size > 0 &&
                  currentLevelFolders.every((f) => selectedFolderPaths.has(f.path))
                    ? "Deselect all"
                    : "Select all"}
                </span>
              </label>
            </div>
          </div>

          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-3.5">
              {currentLevelFolders.map((folder, idx) => {
                const FolderIcon = folder.icon || Folder;
                const isSelected = selectedFolderPaths.has(folder.path);
                return (
                  <div
                    key={`folder-${folder.path}-${idx}`}
                    suppressHydrationWarning
                    onClick={() => navigateToFolder(folder.path)}
                    className={`group relative p-3 rounded-2xl border transition-all duration-150 cursor-pointer shadow-2xs select-none flex items-center justify-between gap-3 min-h-[66px] ${
                      isSelected
                        ? "border-blue-500 ring-2 ring-blue-500/50 bg-blue-500/5 dark:bg-blue-500/10 shadow-md"
                        : "border-border bg-card hover:bg-muted/40 hover:border-blue-500/40 text-foreground"
                    }`}
                    title={folder.path}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Checkbox for dynamic batch select */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          const next = new Set(selectedFolderPaths);
                          if (next.has(folder.path)) next.delete(folder.path);
                          else next.add(folder.path);
                          setSelectedFolderPaths(next);
                        }}
                        className={`w-4 h-4 rounded border-border text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0 transition-opacity ${
                          isSelected || selectedFolderPaths.size > 0
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100 focus:opacity-100"
                        }`}
                        title={`Select folder '${folder.name}'`}
                        aria-label={`Select folder '${folder.name}'`}
                      />

                      <div
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 border transition-transform group-hover:scale-105 ${
                          folder.bg && folder.color
                            ? `${folder.bg} ${folder.color}`
                            : "bg-amber-500/10 border-amber-500/20 text-amber-500"
                        }`}
                      >
                        <FolderIcon className="w-4 h-4 sm:w-5 sm:h-5 fill-current/20" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div
                          className="text-xs sm:text-sm font-semibold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug break-words line-clamp-2"
                          title={folder.name}
                        >
                          {folder.name}
                        </div>
                        <div className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 truncate">
                          {folder.fileCount === 0 && folder.subfolderCount === 0
                            ? "Empty"
                            : folder.fileCount > 0
                            ? `${folder.fileCount} ${folder.fileCount === 1 ? "file" : "files"}${
                                folder.totalBytes && folder.totalBytes > 0
                                  ? ` • ${formatBytes(folder.totalBytes)}`
                                  : ""
                              }${
                                folder.subfolderCount > 0
                                  ? ` • ${folder.subfolderCount} ${
                                      folder.subfolderCount === 1 ? "folder" : "folders"
                                    }`
                                  : ""
                              }`
                            : `${folder.subfolderCount} ${
                                folder.subfolderCount === 1 ? "folder" : "folders"
                              }`}
                        </div>
                      </div>
                    </div>

                    {/* Right side actions in subtle glass pill - Never covers folder name and takes 0px flow width */}
                    {!folder.isSpecial && (
                      <div
                        suppressHydrationWarning
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-card/95 dark:bg-card/95 backdrop-blur-md px-1.5 py-1 rounded-xl border border-border/80 shadow-md opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-all z-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setFolderToRename({
                              id: folder.id,
                              name: folder.name,
                              path: folder.path,
                              parentPath: folder.parentPath,
                              depth: folder.path.split("/").length,
                              createdAt: new Date().toISOString(),
                              updatedAt: new Date().toISOString(),
                              totalFiles: folder.fileCount,
                              totalBytes: folder.totalBytes || 0,
                              totalSubfolders: folder.subfolderCount,
                            });
                            setRenameFolderNameInput(folder.name);
                            setRenameFolderError(null);
                          }}
                          className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition cursor-pointer"
                          title={`Rename folder '${folder.name}'`}
                          aria-label={`Rename folder '${folder.name}'`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFolderToMove({
                              id: folder.id,
                              name: folder.name,
                              path: folder.path,
                              parentPath: folder.parentPath,
                              depth: folder.path.split("/").length,
                              createdAt: new Date().toISOString(),
                              updatedAt: new Date().toISOString(),
                              totalFiles: folder.fileCount,
                              totalBytes: 0,
                              totalSubfolders: folder.subfolderCount,
                            });
                            setFolderMoveTarget(folder.parentPath || "");
                          }}
                          className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition cursor-pointer"
                          title={`Move folder '${folder.name}'`}
                          aria-label={`Move folder '${folder.name}'`}
                        >
                          <Move className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFolderToDelete({
                              id: folder.id,
                              name: folder.name,
                              path: folder.path,
                              parentPath: folder.parentPath,
                              depth: folder.path.split("/").length,
                              createdAt: new Date().toISOString(),
                              updatedAt: new Date().toISOString(),
                              totalFiles: folder.fileCount,
                              totalBytes: 0,
                              totalSubfolders: folder.subfolderCount,
                            });
                          }}
                          className="p-1 hover:bg-rose-500/10 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition cursor-pointer"
                          title={`Delete folder '${folder.name}'`}
                          aria-label={`Delete folder '${folder.name}'`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* LIST VIEW FOR FOLDERS (Google Drive & Windows 11 style) */
            <div className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden divide-y divide-border/60">
              {currentLevelFolders.map((folder, idx) => {
                const FolderIcon = folder.icon || Folder;
                const isSelected = selectedFolderPaths.has(folder.path);
                return (
                  <div
                    key={`folder-list-${folder.path}-${idx}`}
                    suppressHydrationWarning
                    onClick={() => navigateToFolder(folder.path)}
                    className={`group p-3 sm:px-4 flex items-center justify-between gap-3 hover:bg-muted/40 transition-all duration-150 cursor-pointer select-none ${
                      isSelected ? "bg-blue-500/5 dark:bg-blue-500/10" : "text-foreground"
                    }`}
                    title={`Open folder '${folder.name}'`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Checkbox for dynamic batch select */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          const next = new Set(selectedFolderPaths);
                          if (next.has(folder.path)) next.delete(folder.path);
                          else next.add(folder.path);
                          setSelectedFolderPaths(next);
                        }}
                        className="w-4 h-4 rounded border-border text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                        title={`Select folder '${folder.name}'`}
                        aria-label={`Select folder '${folder.name}'`}
                      />

                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border transition-transform group-hover:scale-105 ${
                          folder.bg && folder.color
                            ? `${folder.bg} ${folder.color}`
                            : "bg-amber-500/10 border-amber-500/20 text-amber-500"
                        }`}
                      >
                        <FolderIcon className="w-4 h-4 fill-current/20" />
                      </div>
                      <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                        <span
                          className="text-xs sm:text-sm font-semibold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors break-words"
                          title={folder.name}
                        >
                          {folder.name}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-muted text-muted-foreground border border-border/60 shrink-0">
                          Folder
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                      <span className="font-mono text-[11px]">
                        {folder.fileCount === 0 && folder.subfolderCount === 0
                          ? "Empty"
                          : folder.fileCount > 0
                          ? `${folder.fileCount} ${folder.fileCount === 1 ? "file" : "files"}${
                              folder.totalBytes && folder.totalBytes > 0
                                ? ` • ${formatBytes(folder.totalBytes)}`
                                : ""
                            }${
                              folder.subfolderCount > 0
                                ? ` • ${folder.subfolderCount} ${
                                    folder.subfolderCount === 1 ? "folder" : "folders"
                                  }`
                                : ""
                            }`
                          : `${folder.subfolderCount} ${
                              folder.subfolderCount === 1 ? "folder" : "folders"
                            }`}
                      </span>

                      {!folder.isSpecial && (
                        <div
                          suppressHydrationWarning
                          className="flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setFolderToRename({
                                id: folder.id,
                                name: folder.name,
                                path: folder.path,
                                parentPath: folder.parentPath,
                                depth: folder.path.split("/").length,
                                createdAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString(),
                                totalFiles: folder.fileCount,
                                totalBytes: folder.totalBytes || 0,
                                totalSubfolders: folder.subfolderCount,
                              });
                              setRenameFolderNameInput(folder.name);
                              setRenameFolderError(null);
                            }}
                            className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition cursor-pointer"
                            title={`Rename folder '${folder.name}'`}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFolderToMove({
                                id: folder.id,
                                name: folder.name,
                                path: folder.path,
                                parentPath: folder.parentPath,
                                depth: folder.path.split("/").length,
                                createdAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString(),
                                totalFiles: folder.fileCount,
                                totalBytes: 0,
                                totalSubfolders: folder.subfolderCount,
                              });
                              setFolderMoveTarget(folder.parentPath || "");
                            }}
                            className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition cursor-pointer"
                            title={`Move folder '${folder.name}'`}
                          >
                            <Move className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFolderToDelete({
                                id: folder.id,
                                name: folder.name,
                                path: folder.path,
                                parentPath: folder.parentPath,
                                depth: folder.path.split("/").length,
                                createdAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString(),
                                totalFiles: folder.fileCount,
                                totalBytes: 0,
                                totalSubfolders: folder.subfolderCount,
                              });
                            }}
                            className="p-1 hover:bg-rose-500/10 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition cursor-pointer"
                            title={`Delete folder '${folder.name}'`}
                            aria-label={`Delete folder '${folder.name}'`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3. Section Title & Master Select All Checkbox */}
      {displayedFiles.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium px-0.5 pt-1">
          <div className="flex items-center gap-2.5">
            <label className="flex items-center gap-2 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={displayedFiles.length > 0 && displayedFiles.every((f) => selectedFileIds.has(f.id))}
                ref={(el) => {
                  if (el) {
                    const allSelected = displayedFiles.length > 0 && displayedFiles.every((f) => selectedFileIds.has(f.id));
                    const someSelected = displayedFiles.some((f) => selectedFileIds.has(f.id));
                    el.indeterminate = !allSelected && someSelected;
                  }
                }}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedFileIds(new Set(displayedFiles.map((f) => f.id)));
                  } else {
                    setSelectedFileIds(new Set());
                  }
                }}
                className="w-4 h-4 rounded border-border text-blue-600 focus:ring-blue-500 cursor-pointer transition accent-blue-600"
              />
              <span className="text-xs font-semibold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                {selectedFileIds.size > 0 && selectedFileIds.size === displayedFiles.length
                  ? "Deselect all"
                  : `Select all (${displayedFiles.length})`}
              </span>
            </label>
            <span className="text-muted-foreground hidden sm:inline">
              •{" "}
              {category === "all"
                ? "Storage files"
                : `📁 ${category} files`}
            </span>
          </div>
          <span>{displayedFiles.length} {displayedFiles.length === 1 ? "file" : "files"}</span>
        </div>
      )}

      {/* Batch Selection Toolbar */}
      {(selectedFileIds.size > 0 || selectedFolderPaths.size > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-xs text-foreground shadow-sm animate-in fade-in duration-150">
          <div className="flex items-center gap-2 flex-wrap">
            <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {selectedFolderPaths.size > 0 && (
                <span>
                  {selectedFolderPaths.size} {selectedFolderPaths.size === 1 ? "folder" : "folders"}
                </span>
              )}
              {selectedFolderPaths.size > 0 && selectedFileIds.size > 0 && <span>, </span>}
              {selectedFileIds.size > 0 && (
                <span>
                  {selectedFileIds.size} {selectedFileIds.size === 1 ? "file" : "files"}
                </span>
              )}
              {" selected"}
            </span>
            {protectedFiles.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400">
                1 permanently protected (v0.0.0)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {selectedFileIds.size > 0 && (
              <button
                type="button"
                onClick={() => {
                  setTargetMoveFolder("");
                  setShowMoveFolderModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground font-medium transition cursor-pointer shadow-xs active:scale-[0.98]"
                title="Move selected files to a folder"
              >
                <FolderInput className="w-3.5 h-3.5 text-blue-500" />
                <span>Move to Folder</span>
              </button>
            )}
            {selectedFileIds.size > 0 && (
              <button
                type="button"
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
            )}
            <button
              type="button"
              onClick={() => setShowBulkDeleteModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-semibold transition cursor-pointer shadow-xs"
              title="Delete selected items"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected ({selectedFolderPaths.size + selectedFileIds.size})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedFileIds(new Set());
                setSelectedFolderPaths(new Set());
              }}
              className="px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* 4. Files Container (Grid or List View) */}
      {isRevalidating && (
        <div className="h-0.5 w-full bg-blue-500/10 rounded-full overflow-hidden mb-2">
          <div className="h-full bg-blue-500 animate-pulse w-full rounded-full" />
        </div>
      )}
      {loading ? (
        <div className="p-12 flex flex-col items-center justify-center gap-3 text-muted-foreground rounded-2xl border border-border bg-card shadow-2xs">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          <span className="text-xs">Loading files...</span>
        </div>
      ) : displayedFiles.length === 0 ? (
        currentLevelFolders.length > 0 ? (
          /* When there are folders present and 0 direct files at this level */
          <div className="py-6 px-4 text-center rounded-2xl border border-dashed border-border/70 bg-card/30 shadow-2xs text-muted-foreground space-y-1.5">
            <FolderOpen className="w-7 h-7 mx-auto opacity-30 text-amber-500" />
            <p className="text-xs font-medium text-foreground">
              {category === "all"
                ? "Files are organized inside the folders above"
                : `No direct files inside '${getFolderNameFromPath(category)}'`}
            </p>
            <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
              {category === "all"
                ? "Click any folder above to open it and view its contents."
                : "Browse subfolders above or upload files directly into this folder."}
            </p>
          </div>
        ) : (
          <div className="p-10 text-center rounded-2xl border border-dashed border-border bg-card/60 shadow-2xs text-muted-foreground space-y-3">
            <FileIcon className="w-9 h-9 mx-auto opacity-30 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                This folder is empty
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-md mx-auto">
                {category !== "all"
                  ? `No files or subfolders found inside ${category}.`
                  : "Upload files or create your first folder to get started."}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setNewFolderNameInput("");
                  setNewFolderError(null);
                  setShowNewFolderModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition shadow-xs cursor-pointer active:scale-95"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>New Folder</span>
              </button>
              {category !== "all" && (
                <button
                  type="button"
                  onClick={() => {
                    const isSys = [
                      "websites",
                      "images",
                      "documents",
                      "media",
                      "archives",
                    ].includes(category);
                    if (isSys) {
                      navigateToFolder("all");
                    } else {
                      const parent = getFolderParentPath(category);
                      navigateToFolder(parent || "all");
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground font-medium text-xs transition cursor-pointer"
                >
                  <CornerLeftUp className="w-3.5 h-3.5" />
                  <span>Go Up</span>
                </button>
              )}
            </div>
          </div>
        )
      ) : viewMode === "grid" ? (
        /* GRID / CARD VIEW (Google Drive & Windows 11 style) */
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
            {displayedFiles.map((file) => {
              const isExpired =
                file.status === "EXPIRED" ||
                (file.expires_at !== null && currentTime > 0 && new Date(file.expires_at).getTime() <= currentTime);
              const fileType = getFileTypeDetails(file.mime_type, file.sanitized_name);
              const FileTypeIcon = fileType.icon;
              return (
                <div
                  key={file.id}
                  className={`relative rounded-2xl border ${
                    selectedFileIds.has(file.id)
                      ? "border-blue-500 ring-2 ring-blue-500/50 bg-blue-500/5 dark:bg-blue-500/10 shadow-md"
                      : highlightedIds.has(file.id)
                      ? "border-blue-500 ring-2 ring-blue-500/60 bg-blue-500/5 dark:bg-blue-500/10 shadow-md scale-[1.01] animate-in fade-in slide-in-from-top-2 duration-300"
                      : isExpired
                      ? "border-rose-500/35 bg-rose-500/[0.02]"
                      : "border-border bg-card"
                  } p-3.5 shadow-2xs hover:shadow-md hover:border-border/80 transition-all duration-300 group flex flex-col justify-between overflow-hidden`}
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
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-foreground truncate max-w-[130px] sm:max-w-[160px]" title={file.sanitized_name}>
                            {file.sanitized_name}
                          </span>
                          {highlightedIds.has(file.id) && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-blue-500 text-white shadow-2xs shrink-0 select-none animate-in zoom-in-75"
                              title="File arrived live"
                            >
                              <Sparkles className="w-2.5 h-2.5 animate-spin" />
                              <span>Just added</span>
                            </span>
                          )}
                          {file.is_api_upload && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-violet-500/15 border border-violet-500/30 text-violet-600 dark:text-violet-300 shadow-2xs shrink-0 select-none"
                              title={file.sha256 ? `Uploaded via Owner API • SHA-256: ${file.sha256}` : "Uploaded via Owner API"}
                            >
                              <Zap className="w-2.5 h-2.5 text-amber-500 dark:text-amber-400 fill-amber-500/20" />
                              <span>API</span>
                            </span>
                          )}
                          {file.folder && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-blue-500/10 border border-blue-500/25 text-blue-600 dark:text-blue-300 shadow-2xs shrink-0 select-none"
                              title={`Folder: ${file.folder}`}
                            >
                              <Folder className="w-2.5 h-2.5 text-blue-500" />
                              <span>{file.folder}</span>
                            </span>
                          )}
                          {file.is_release_locked && (
                            <span
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 shadow-2xs shrink-0 select-none"
                              title="Release Locked: Protected against accidental deletion"
                            >
                              <Lock className="w-2.5 h-2.5 text-amber-500" />
                              <span>Locked</span>
                            </span>
                          )}
                        </div>
                      </div>
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
                    <div className="flex items-center gap-1.5 min-w-0 shrink-0">
                      {file.is_api_upload && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-violet-500/15 border border-violet-500/30 text-violet-600 dark:text-violet-300 shadow-2xs shrink-0 select-none"
                          title={file.sha256 ? `API Managed • SHA-256: ${file.sha256}` : "API Managed"}
                        >
                          <Zap className="w-2.5 h-2.5 text-amber-500 dark:text-amber-400 fill-amber-500/20" />
                          <span>API</span>
                        </span>
                      )}
                      <ExpiryStatusBadge expiresAt={file.expires_at} status={file.status} size="xs" />
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="flex items-center gap-1.5 pt-2.5 mt-auto">
                    {isBinaryContainer(file) ? (
                      <div
                        className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-violet-500/10 border border-violet-500/25 text-violet-600 dark:text-violet-400 text-xs font-semibold select-none cursor-default shadow-2xs"
                        title="In-process OTA container: Exclusively consumed by the desktop app updater daemon. Zero public web share link."
                      >
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-violet-500" />
                        <span className="truncate">OTA Daemon Only</span>
                      </div>
                    ) : isExpired ? (
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
                      {file.share_slug && !isBinaryContainer(file) && (
                        <button
                          onClick={() => setSelectedFileForLinks(file)}
                          className="w-7 h-7 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 border border-blue-500/25 flex items-center justify-center transition cursor-pointer shrink-0 shadow-2xs"
                          title="View All Share Links (Default, Embed, XURL)"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {isBinaryContainer(file) ? (
                        <button
                          disabled
                          className="w-7 h-7 rounded-lg text-muted-foreground/30 bg-muted/20 border border-border/40 flex items-center justify-center cursor-not-allowed shrink-0"
                          title="Binary download disabled in web UI. This OTA container is consumed exclusively in-process by the app updater daemon."
                        >
                          <Download className="w-3.5 h-3.5 opacity-30" />
                        </button>
                      ) : (
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
                      )}

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
            {displayedFiles.map((file) => {
              const isExpired =
                file.status === "EXPIRED" ||
                (file.expires_at !== null && currentTime > 0 && new Date(file.expires_at).getTime() <= currentTime);
              const fileType = getFileTypeDetails(file.mime_type, file.sanitized_name);
              const FileTypeIcon = fileType.icon;
              return (
                <div
                  key={file.id}
                  className={`p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all duration-300 group ${
                    selectedFileIds.has(file.id)
                      ? "bg-blue-500/10 dark:bg-blue-500/15 border-l-4 border-l-blue-500 shadow-xs"
                      : highlightedIds.has(file.id)
                      ? "bg-blue-500/10 dark:bg-blue-500/15 border-l-4 border-l-blue-500 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300"
                      : isExpired
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
                        {highlightedIds.has(file.id) && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-blue-500 text-white shadow-2xs shrink-0 select-none animate-in zoom-in-75"
                            title="File arrived live"
                          >
                            <Sparkles className="w-2.5 h-2.5 animate-spin" />
                            <span>Just added</span>
                          </span>
                        )}
                        {file.is_api_upload && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-violet-500/15 border border-violet-500/30 text-violet-600 dark:text-violet-300 shadow-2xs shrink-0 select-none"
                            title={file.sha256 ? `Uploaded via Owner API • SHA-256: ${file.sha256}` : "Uploaded via Owner API"}
                          >
                            <Zap className="w-2.5 h-2.5 text-amber-500 dark:text-amber-400 fill-amber-500/20" />
                            <span>API</span>
                          </span>
                        )}
                        {file.folder && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-blue-500/10 border border-blue-500/25 text-blue-600 dark:text-blue-300 shadow-2xs shrink-0 select-none"
                            title={`Folder: ${file.folder}`}
                          >
                            <Folder className="w-2.5 h-2.5 text-blue-500" />
                            <span>{file.folder}</span>
                          </span>
                        )}
                        {file.is_release_locked && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 shadow-2xs shrink-0 select-none"
                            title="Release Locked: Protected against accidental deletion"
                          >
                            <Lock className="w-2.5 h-2.5 text-amber-500" />
                            <span>Locked</span>
                          </span>
                        )}
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
                        <div className="inline-flex items-center gap-1.5 shrink-0">
                          {file.is_api_upload && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-violet-500/15 border border-violet-500/30 text-violet-600 dark:text-violet-300 shadow-2xs shrink-0 select-none"
                              title={file.sha256 ? `API Managed • SHA-256: ${file.sha256}` : "API Managed"}
                            >
                              <Zap className="w-2.5 h-2.5 text-amber-500 dark:text-amber-400 fill-amber-500/20" />
                              <span>API</span>
                            </span>
                          )}
                          <ExpiryStatusBadge expiresAt={file.expires_at} status={file.status} size="xs" />
                        </div>
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

                    {isBinaryContainer(file) ? (
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/25 text-violet-600 dark:text-violet-400 text-xs font-semibold select-none cursor-default"
                        title="In-process OTA container: Exclusively consumed by the desktop app updater daemon. Zero public web share link."
                      >
                        <ShieldAlert className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                        <span>OTA Daemon Only</span>
                      </span>
                    ) : file.share_slug ? (
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

                    {isBinaryContainer(file) ? (
                      <button
                        disabled
                        className="p-1.5 rounded-lg text-muted-foreground/30 cursor-not-allowed"
                        title="Binary download disabled in web UI. This OTA container is consumed exclusively in-process by the app updater daemon."
                      >
                        <Download className="w-3.5 h-3.5 opacity-30" />
                      </button>
                    ) : (
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
                    )}

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
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/45 dark:bg-black/65 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedFileForDetails(null)}
        >
          <div
            className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto modal-scrollbar rounded-3xl border border-white/30 dark:border-white/10 bg-card/90 dark:bg-card/85 backdrop-blur-2xl p-5 sm:p-6 shadow-2xl space-y-5 ring-1 ring-black/5 dark:ring-white/5 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ambient Top Glow */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-500/10 dark:bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between border-b border-border/80 pb-3.5 relative z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 shadow-2xs">
                  <Info className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">File Details</h3>
                  <p className="text-[11px] text-muted-foreground">Detailed metadata and storage attributes</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFileForDetails(null)}
                className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent hover:border-border/60 transition cursor-pointer"
                aria-label="Close"
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
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {selectedFileForDetails.is_api_upload && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-violet-500/15 border border-violet-500/30 text-violet-600 dark:text-violet-300 shadow-2xs shrink-0 select-none"
                        title={selectedFileForDetails.sha256 ? `API Managed • SHA-256: ${selectedFileForDetails.sha256}` : "API Managed"}
                      >
                        <Zap className="w-2.5 h-2.5 text-amber-500 dark:text-amber-400 fill-amber-500/20" />
                        <span>API</span>
                      </span>
                    )}
                    <ExpiryStatusBadge expiresAt={selectedFileForDetails.expires_at} status={selectedFileForDetails.status} />
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
                      ? `${new Date(selectedFileForDetails.expires_at).toLocaleString()}`
                      : "Permanent Storage (Never Expire)"}
                  </span>
                </div>
              </div>

              {/* Owner API Pipeline & Release Card */}
              {(selectedFileForDetails.is_api_upload ||
                selectedFileForDetails.sha256 ||
                selectedFileForDetails.is_release_locked) && (
                <div className="p-3 rounded-xl border border-violet-500/20 bg-violet-500/5 space-y-2 mt-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-300 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20" />
                      Owner API Release Pipeline
                    </span>
                    {selectedFileForDetails.is_release_locked && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" />
                        Release Locked
                      </span>
                    )}
                  </div>
                  {selectedFileForDetails.folder && (
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <span>Bucket / Folder:</span>
                      <span className="font-mono font-semibold text-foreground px-1.5 py-0.5 rounded bg-background border border-border">
                        {selectedFileForDetails.folder}
                      </span>
                    </div>
                  )}
                  {selectedFileForDetails.sha256 && (
                    <div className="space-y-1">
                      <div className="text-muted-foreground text-[10px]">SHA-256 Checksum</div>
                      <div className="flex items-center gap-1.5 bg-background p-1.5 rounded-lg border border-border">
                        <span className="font-mono text-[10px] text-foreground truncate flex-1 select-all">
                          {selectedFileForDetails.sha256}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyCustomUrl(selectedFileForDetails.sha256!, "modal-sha256", true)}
                          className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                          title="Copy SHA-256 Checksum"
                        >
                          {copiedCustomKey === "modal-sha256" ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* In-Process OTA Binary Container Panel */}
              {isBinaryContainer(selectedFileForDetails) && (
                <div className="p-3 rounded-xl border border-violet-500/25 bg-violet-500/10 space-y-2 mt-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                      In-Process OTA Binary Container
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        selectedFileForDetails.status === "DISABLED"
                          ? "bg-rose-500/15 text-rose-500 border-rose-500/30"
                          : "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                      }`}
                    >
                      {selectedFileForDetails.status === "DISABLED" ? "DISABLED" : "ACTIVE"}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Web downloads and public share links are strictly disabled for this container. It is consumed exclusively in-process by the desktop application updater daemon.
                  </p>
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-violet-500/15">
                    <span className="text-[11px] text-muted-foreground">
                      Status: <strong className="text-foreground">{selectedFileForDetails.status === "DISABLED" ? "Disabled from update checks" : "Active & serving updates"}</strong>
                    </span>
                    <button
                      type="button"
                      disabled={isTogglingStatus}
                      onClick={() =>
                        handleToggleFileStatus(
                          selectedFileForDetails,
                          selectedFileForDetails.status === "DISABLED" ? "ACTIVE" : "DISABLED"
                        )
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                        selectedFileForDetails.status === "DISABLED"
                          ? "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600 shadow-xs"
                          : "bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30"
                      }`}
                    >
                      {isTogglingStatus ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : selectedFileForDetails.status === "DISABLED" ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Enable Binary</span>
                        </>
                      ) : (
                        <>
                          <Ban className="w-3 h-3" />
                          <span>Disable Binary</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
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
                type="button"
                onClick={() => setSelectedFileForDetails(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/80 border border-border/80 transition cursor-pointer active:scale-98"
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
          <div className="fixed inset-0 z-50 bg-black/45 dark:bg-black/65 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="relative w-full max-w-4xl xl:max-w-5xl rounded-3xl bg-card/95 dark:bg-card/90 backdrop-blur-2xl border border-white/30 dark:border-white/10 p-4 sm:p-5 shadow-2xl space-y-3 max-h-[88vh] overflow-y-auto modal-scrollbar overscroll-contain transition-all ring-1 ring-black/5 dark:ring-white/5 overflow-hidden">
              {/* Ambient Top Glow */}
              <div className="absolute -top-24 -left-24 w-52 h-52 bg-blue-500/10 dark:bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />

              <div className="flex items-center justify-between border-b border-border/80 pb-2.5 relative z-10">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 shadow-2xs">
                    <Share2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground leading-tight">Create Share Link</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">Customize your link, add protection, and choose delivery options.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedFileForShare(null)}
                  className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent hover:border-border/60 transition cursor-pointer"
                  aria-label="Close"
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

                      <button
                        type="button"
                        onClick={() => setShowQrCode((prev) => !prev)}
                        className={`h-10 px-3.5 rounded-xl border text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                          showQrCode
                            ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
                            : "bg-background hover:bg-muted text-foreground border-border"
                        }`}
                        title={showQrCode ? "Hide QR Code" : "Show & Download QR Code"}
                      >
                        <QrCode className="w-4 h-4 text-blue-500" />
                        <span>{showQrCode ? "Hide QR" : "QR Code"}</span>
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
                          `📁 ${selectedFileForShare?.sanitized_name} (${formatBytes(selectedFileForShare?.byte_size || 0)})\n⚡ Download securely on GPHost (Built by Gaurav for developers):\n${preferredShareUrl}`
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
                          `📁 "${selectedFileForShare?.sanitized_name}" (${formatBytes(selectedFileForShare?.byte_size || 0)}) — Secure high-speed transfer on GPHost (Built by Gaurav for developers)`
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
                          `Download: ${selectedFileForShare?.sanitized_name} (${formatBytes(selectedFileForShare?.byte_size || 0)})`
                        )}&body=${encodeURIComponent(
                          `Hi,\n\nI have shared "${selectedFileForShare?.sanitized_name}" (${formatBytes(selectedFileForShare?.byte_size || 0)}) with you via GPHost (Built by Gaurav for developers).\n\nYou can access or download it securely here:\n${preferredShareUrl}\n\nHigh-speed edge delivery with zero tracking.\n`
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

                  {/* Instant Client-Side QR Code with Download Actions */}
                  {showQrCode && (
                    <div
                      ref={qrSectionRef}
                      className="p-4 rounded-xl bg-card border-2 border-blue-500/30 shadow-xs flex flex-col sm:flex-row items-center sm:items-start gap-4 animate-in fade-in duration-200"
                    >
                      <div className="p-2.5 bg-white rounded-xl shadow-xs border border-neutral-200 shrink-0 flex items-center justify-center">
                        <QRCodeSVG
                          id="file-manager-qr-svg"
                          value={preferredShareUrl}
                          size={130}
                          level="H"
                          includeMargin={false}
                          className="w-[120px] h-[120px]"
                        />
                      </div>
                      <div className="space-y-2 text-center sm:text-left min-w-0 flex-1">
                        <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-semibold text-foreground">
                          <QrCode className="w-4 h-4 text-blue-500" />
                          <span>Instant Mobile QR Code</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Point your mobile phone camera at this QR code to instantly open or download. You can also download or copy this QR image below.
                        </p>
                        <div className="text-[10.5px] font-mono text-blue-600 dark:text-blue-400 truncate max-w-[250px] sm:max-w-md">
                          {preferredShareUrl}
                        </div>

                        {/* Download QR Actions */}
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                          <button
                            type="button"
                            disabled={isDownloadingQr}
                            onClick={async () => {
                              setIsDownloadingQr(true);
                              try {
                                await downloadQrCodePng("file-manager-qr-svg", {
                                  filename: `QR-${selectedFileForShare?.sanitized_name || "share"}.png`,
                                  title: selectedFileForShare?.sanitized_name || "Share Link",
                                  subtitle: "GPHost Share Link",
                                  size: 512,
                                });
                              } finally {
                                setIsDownloadingQr(false);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50"
                            title="Download high-resolution PNG image"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>{isDownloadingQr ? "Saving..." : "Download PNG"}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              downloadQrCodeSvg("file-manager-qr-svg", `QR-${selectedFileForShare?.sanitized_name || "share"}.svg`)
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-medium transition cursor-pointer"
                            title="Download vector SVG format"
                          >
                            <Download className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>Download SVG</span>
                          </button>

                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await copyQrCodeImage("file-manager-qr-svg");
                              if (ok) {
                                setCopiedQrImg(true);
                                setTimeout(() => setCopiedQrImg(false), 2000);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-medium transition cursor-pointer"
                            title="Copy QR image to clipboard for instant pasting"
                          >
                            {copiedQrImg ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Copied Image!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                                <span>Copy Image</span>
                              </>
                            )}
                          </button>
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
        onClose={() => {
          if (!isDeleting) {
            setSelectedFileForDelete(null);
            setDeleteError(null);
          }
        }}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
        title="Delete File?"
        description={
          <div className="space-y-2">
            <p>
              Are you sure you want to delete{" "}
              <strong className="text-foreground">{selectedFileForDelete?.sanitized_name}</strong>?
            </p>
            <p className="text-[11px] text-muted-foreground">
              Your storage quota will be instantly restored and all share links for this file will stop working permanently.
            </p>
            {deleteError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium animate-in fade-in">
                {deleteError}
              </div>
            )}
          </div>
        }
        confirmText="Yes, Delete File"
        cancelText="Cancel"
        variant="danger"
      />

      {/* EXTEND EXPIRY MODAL */}
      {selectedFileForExtend && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/45 dark:bg-black/65 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => !isExtending && setSelectedFileForExtend(null)}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/30 dark:border-white/10 bg-card/90 dark:bg-card/85 backdrop-blur-2xl p-5 sm:p-6 shadow-2xl shadow-black/15 dark:shadow-black/50 ring-1 ring-black/5 dark:ring-white/5 space-y-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ambient Top Glow */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-500/10 dark:bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between border-b border-border/80 pb-3 relative z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-sm shadow-amber-500/10">
                  <RotateCw className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-foreground">Extend File Expiry</h4>
                  <p className="text-[11px] text-muted-foreground">Restore status to ACTIVE and resume secure access</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isExtending && setSelectedFileForExtend(null)}
                disabled={isExtending}
                className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent hover:border-border/60 transition cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Target File Info */}
            <div className="p-3.5 rounded-2xl bg-muted/30 dark:bg-muted/20 border border-border/80 backdrop-blur-sm flex items-center gap-3 relative z-10">
              <div className="w-8 h-8 rounded-xl bg-background border border-border/80 text-amber-500 flex items-center justify-center shrink-0 shadow-2xs">
                <FileIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground truncate">{selectedFileForExtend.sanitized_name}</p>
                <p className="text-[11px] text-muted-foreground font-mono">{formatBytes(selectedFileForExtend.byte_size)}</p>
              </div>
            </div>

            {/* Explanatory Callout */}
            <div className="p-3.5 rounded-2xl bg-amber-500/[0.06] border border-amber-500/20 backdrop-blur-sm text-xs text-amber-800 dark:text-amber-300 space-y-1 relative z-10">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>What happens when you extend?</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-700/90 dark:text-amber-400/90">
                This file is currently expired and locked from public access. Extending it restores status to <strong className="text-amber-800 dark:text-amber-200">ACTIVE</strong>, recalculates its countdown, and allows sharing once again.
              </p>
            </div>

            {/* Preset Selection */}
            <div className="space-y-1.5 relative z-10">
              <label className="text-xs font-semibold text-foreground">New Expiration Duration</label>
              <select
                value={extendPreset}
                onChange={(e) => setExtendPreset(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border/80 bg-background/80 text-foreground text-xs focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition cursor-pointer"
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
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2 relative z-10 font-medium">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{extendError}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/80 relative z-10">
              <button
                type="button"
                onClick={() => setSelectedFileForExtend(null)}
                disabled={isExtending}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/70 border border-border/70 transition cursor-pointer active:scale-98"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExtendConfirm}
                disabled={isExtending}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-semibold text-xs transition-all shadow-md shadow-amber-600/30 hover:shadow-amber-600/50 cursor-pointer active:scale-95 disabled:opacity-50"
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

      {/* Create New Dynamic Folder Modal */}
      {showNewFolderModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 dark:bg-black/65 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => !isCreatingFolder && setShowNewFolderModal(false)}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/30 dark:border-white/10 bg-card/90 dark:bg-card/85 backdrop-blur-2xl p-5 sm:p-6 shadow-2xl shadow-black/15 dark:shadow-black/50 ring-1 ring-black/5 dark:ring-white/5 space-y-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ambient Top Glow */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-500/10 dark:bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between pb-3.5 border-b border-border/80 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 shadow-sm shadow-blue-500/10">
                  <FolderPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold tracking-tight text-foreground">
                    Create New Folder
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-muted-foreground">Inside:</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 dark:bg-muted/40 border border-border/80 text-[11px] font-semibold text-foreground truncate max-w-[220px]">
                      <Folder className="w-3 h-3 text-amber-500 shrink-0" />
                      <span>
                        {category === "all" ||
                        [
                          "websites",
                          "images",
                          "documents",
                          "media",
                          "archives",
                        ].includes(category)
                          ? "Storage (Main)"
                          : category}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isCreatingFolder && setShowNewFolderModal(false)}
                disabled={isCreatingFolder}
                className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent hover:border-border/60 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNewFolder} className="space-y-4 relative z-10">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">
                  Folder Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Invoices, Projects, or Work"
                  value={newFolderNameInput}
                  disabled={isCreatingFolder}
                  onChange={(e) => {
                    setNewFolderNameInput(e.target.value);
                    setNewFolderError(null);
                  }}
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl bg-background/80 border border-border/90 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition shadow-2xs font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                />

                {newFolderError && (
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{newFolderError}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/80">
                <button
                  type="button"
                  onClick={() => !isCreatingFolder && setShowNewFolderModal(false)}
                  disabled={isCreatingFolder}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/70 border border-border/70 transition cursor-pointer active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newFolderNameInput.trim() || isCreatingFolder}
                  onClick={(e) => {
                    e.preventDefault();
                    void handleCreateNewFolder();
                  }}
                  className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs transition-all shadow-md shadow-blue-600/30 hover:shadow-blue-600/50 cursor-pointer active:scale-95 ${
                    !newFolderNameInput.trim() || isCreatingFolder
                      ? "opacity-50 cursor-not-allowed active:scale-100"
                      : ""
                  }`}
                >
                  {isCreatingFolder ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0 text-white" />
                      <span>Creating folder...</span>
                    </>
                  ) : (
                    <>
                      <FolderPlus className="w-3.5 h-3.5 shrink-0" />
                      <span>Create Folder</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Folder Modal */}
      {folderToRename && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 dark:bg-black/65 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => !isRenamingFolder && setFolderToRename(null)}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/30 dark:border-white/10 bg-card/90 dark:bg-card/85 backdrop-blur-2xl p-5 sm:p-6 shadow-2xl shadow-black/15 dark:shadow-black/50 ring-1 ring-black/5 dark:ring-white/5 space-y-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ambient Top Glow */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-500/10 dark:bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between pb-3.5 border-b border-border/80 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 shadow-sm shadow-amber-500/10">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold tracking-tight text-foreground">
                    Rename Folder
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-muted-foreground">Current:</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 dark:bg-muted/40 border border-border/80 text-[11px] font-mono font-semibold text-foreground truncate max-w-[220px]">
                      <Folder className="w-3 h-3 text-amber-500 shrink-0" />
                      <span>{folderToRename.path}</span>
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isRenamingFolder && setFolderToRename(null)}
                disabled={isRenamingFolder}
                className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent hover:border-border/60 transition cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRenameFolderConfirm} className="space-y-4 relative z-10">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  New Folder Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. NewName"
                  value={renameFolderNameInput}
                  onChange={(e) => {
                    setRenameFolderNameInput(e.target.value);
                    setRenameFolderError(null);
                  }}
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl bg-background/80 border border-border/90 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition shadow-2xs font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  Renaming cascades across all nested child folders and files in storage.
                </p>
                {renameFolderError && (
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{renameFolderError}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/80">
                <button
                  type="button"
                  onClick={() => setFolderToRename(null)}
                  disabled={isRenamingFolder}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/70 border border-border/70 transition cursor-pointer active:scale-98"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRenamingFolder || !renameFolderNameInput.trim()}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-semibold text-xs transition-all shadow-md shadow-amber-600/30 hover:shadow-amber-600/50 cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {isRenamingFolder ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Renaming...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Folder Modal */}
      {folderToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 dark:bg-black/65 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => !isDeletingFolder && setFolderToDelete(null)}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/30 dark:border-white/10 bg-card/90 dark:bg-card/85 backdrop-blur-2xl p-5 sm:p-6 shadow-2xl shadow-black/15 dark:shadow-black/50 ring-1 ring-black/5 dark:ring-white/5 space-y-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ambient Red Glow */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-rose-500/10 dark:bg-rose-500/15 rounded-full blur-3xl pointer-events-none" />

            {/* Header */}
            <div className="flex items-start justify-between pb-3.5 border-b border-border/80 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 shadow-sm shadow-rose-500/10">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold tracking-tight text-foreground">
                    Delete Folder?
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-muted-foreground">Target:</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 dark:bg-muted/40 border border-border/80 text-[11px] font-mono font-semibold text-foreground truncate max-w-[220px]">
                      <Folder className="w-3 h-3 text-amber-500 shrink-0" />
                      <span>{folderToDelete.path}</span>
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isDeletingFolder && setFolderToDelete(null)}
                disabled={isDeletingFolder}
                className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent hover:border-border/60 transition cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Base Installer Protection Guard */}
            {files.some(
              (f) =>
                (f.folder === folderToDelete.path ||
                  f.folder?.startsWith(`${folderToDelete.path}/`)) &&
                f.is_release_locked
            ) ? (
              <div className="relative overflow-hidden rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-3.5 backdrop-blur-sm flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300 relative z-10">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                <div>
                  <p className="font-semibold text-amber-900 dark:text-amber-200">Base Installer Permanently Protected</p>
                  <p className="text-[11px] mt-0.5 text-amber-700/90 dark:text-amber-400/90 leading-relaxed">
                    Permanent base installers are protected for public downloads. Folders containing protected base release binaries cannot be deleted.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 relative z-10">
                {/* Modern Minimalist Glass Warning Box */}
                <div className="relative overflow-hidden rounded-2xl border border-rose-500/20 dark:border-rose-500/30 bg-rose-500/[0.04] dark:bg-rose-500/[0.08] p-3.5 backdrop-blur-sm space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md bg-rose-500/15 flex items-center justify-center shrink-0 text-rose-600 dark:text-rose-400">
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 tracking-tight">
                      Permanent Deletion Warning
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed pl-7">
                    This will permanently delete <strong className="text-foreground font-semibold font-mono">{folderToDelete.path}</strong>, all nested subfolders, and purge physical files from Cloudflare R2 storage. Storage quota will be reclaimed immediately.
                  </p>
                </div>

                {deleteFolderError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{deleteFolderError}</span>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/80 relative z-10">
              <button
                type="button"
                onClick={() => setFolderToDelete(null)}
                disabled={isDeletingFolder}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/70 border border-border/70 transition cursor-pointer active:scale-98"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteFolderConfirm}
                disabled={
                  isDeletingFolder ||
                  files.some(
                    (f) =>
                      (f.folder === folderToDelete.path ||
                        f.folder?.startsWith(`${folderToDelete.path}/`)) &&
                      f.is_release_locked
                  )
                }
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-semibold text-xs transition-all shadow-md shadow-rose-600/30 hover:shadow-rose-600/50 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeletingFolder ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Folder</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Folder Modal */}
      {folderToMove && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 dark:bg-black/65 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => !isMovingFolder && setFolderToMove(null)}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/30 dark:border-white/10 bg-card/90 dark:bg-card/85 backdrop-blur-2xl p-5 sm:p-6 shadow-2xl shadow-black/15 dark:shadow-black/50 ring-1 ring-black/5 dark:ring-white/5 space-y-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ambient Top Glow */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-500/10 dark:bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between pb-3.5 border-b border-border/80 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 shadow-sm shadow-blue-500/10">
                  <Move className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold tracking-tight text-foreground">
                    Move Folder
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-muted-foreground">Moving:</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 dark:bg-muted/40 border border-border/80 text-[11px] font-mono font-semibold text-foreground truncate max-w-[220px]">
                      <Folder className="w-3 h-3 text-amber-500 shrink-0" />
                      <span>{folderToMove.path}</span>
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isMovingFolder && setFolderToMove(null)}
                disabled={isMovingFolder}
                className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent hover:border-border/60 transition cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 relative z-10">
              <label className="text-xs font-semibold text-foreground">
                Destination Parent Folder (leave empty to move to root)
              </label>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setFolderMoveTarget("")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
                    folderMoveTarget === ""
                      ? "bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-600/20 font-semibold"
                      : "bg-muted/30 hover:bg-muted/70 border-border/70 text-foreground"
                  }`}
                >
                  <Folder className="w-3 h-3" />
                  <span>Storage (Root)</span>
                </button>
                {allDynamicFolders
                  .filter((f) => f !== folderToMove.path && !f.startsWith(`${folderToMove.path}/`))
                  .map((fName, idx) => (
                    <button
                      key={`move-dest-${fName}-${idx}`}
                      type="button"
                      onClick={() => setFolderMoveTarget(fName)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
                        folderMoveTarget === fName
                          ? "bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-600/20 font-semibold"
                          : "bg-muted/30 hover:bg-muted/70 border-border/70 text-foreground"
                      }`}
                    >
                      <Folder className="w-3 h-3" />
                      <span>{fName}</span>
                    </button>
                  ))}
              </div>

              <input
                type="text"
                placeholder="Or type destination parent path (e.g. Projects/2026)"
                value={folderMoveTarget}
                onChange={(e) => setFolderMoveTarget(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-background/80 border border-border/90 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition shadow-2xs font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/80 relative z-10">
              <button
                type="button"
                onClick={() => setFolderToMove(null)}
                disabled={isMovingFolder}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/70 border border-border/70 transition cursor-pointer active:scale-98"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleMoveFolderConfirm(folderMoveTarget)}
                disabled={isMovingFolder}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs transition-all shadow-md shadow-blue-600/30 hover:shadow-blue-600/50 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isMovingFolder ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Moving...</span>
                  </>
                ) : (
                  <>
                    <Move className="w-3.5 h-3.5" />
                    <span>Move Folder</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Files to Folder Modal */}
      {showMoveFolderModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 dark:bg-black/65 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => !isMovingFiles && setShowMoveFolderModal(false)}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/30 dark:border-white/10 bg-card/90 dark:bg-card/85 backdrop-blur-2xl p-5 sm:p-6 shadow-2xl shadow-black/15 dark:shadow-black/50 ring-1 ring-black/5 dark:ring-white/5 space-y-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ambient Top Glow */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-500/10 dark:bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between pb-3.5 border-b border-border/80 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 shadow-sm shadow-blue-500/10">
                  <FolderInput className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold tracking-tight text-foreground">
                    Move Files to Folder
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Relocate {selectedFiles.length} {selectedFiles.length === 1 ? "file" : "files"} to a folder
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMoveFolderModal(false)}
                disabled={isMovingFiles}
                className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent hover:border-border/60 transition cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 relative z-10">
              <label className="text-xs font-semibold text-foreground">
                Select Existing Folder or Enter New Name
              </label>

              {allDynamicFolders.length > 0 && (
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {allDynamicFolders.map((fName, idx) => (
                    <button
                      key={`target-folder-${fName}-${idx}`}
                      type="button"
                      onClick={() => setTargetMoveFolder(fName)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
                        targetMoveFolder === fName
                          ? "bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-600/20 font-semibold"
                          : "bg-muted/30 hover:bg-muted/70 border-border/70 text-foreground"
                      }`}
                    >
                      <Folder className="w-3 h-3" />
                      <span>{fName}</span>
                    </button>
                  ))}
                </div>
              )}

              <input
                type="text"
                placeholder="Or enter custom folder (e.g. gpn-dynamic-update)"
                value={targetMoveFolder}
                onChange={(e) => setTargetMoveFolder(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-background/80 border border-border/90 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition shadow-2xs font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/80 relative z-10">
              <button
                type="button"
                onClick={() => setShowMoveFolderModal(false)}
                disabled={isMovingFiles}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/70 border border-border/70 transition cursor-pointer active:scale-98"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleMoveFilesToFolder(targetMoveFolder)}
                disabled={isMovingFiles || !targetMoveFolder.trim()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs transition-all shadow-md shadow-blue-600/30 hover:shadow-blue-600/50 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isMovingFiles ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Moving...</span>
                  </>
                ) : (
                  <>
                    <FolderInput className="w-3.5 h-3.5" />
                    <span>Move Files</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 dark:bg-black/65 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => !isBulkDeleting && setShowBulkDeleteModal(false)}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/30 dark:border-white/10 bg-card/90 dark:bg-card/85 backdrop-blur-2xl p-5 sm:p-6 shadow-2xl shadow-black/15 dark:shadow-black/50 ring-1 ring-black/5 dark:ring-white/5 space-y-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ambient Top Glow */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-rose-500/10 dark:bg-rose-500/15 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between pb-3.5 border-b border-border/80 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 shadow-sm shadow-rose-500/10">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold tracking-tight text-foreground">
                    Delete Selected Items?
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Storage will be reclaimed permanently
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isBulkDeleting && setShowBulkDeleteModal(false)}
                disabled={isBulkDeleting}
                className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent hover:border-border/60 transition cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Base Installer Protection Notice */}
            {protectedFiles.length > 0 && (
              <div className="relative overflow-hidden rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-3.5 backdrop-blur-sm flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300 relative z-10">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                <div>
                  <p className="font-semibold text-amber-900 dark:text-amber-200">Base Installer Permanently Protected</p>
                  <p className="text-[11px] mt-0.5 text-amber-700/90 dark:text-amber-400/90 leading-relaxed">
                    Gaurav Personal Notes v0.0.0 Base Installer is protected for public website downloads and will NOT be deleted.
                  </p>
                </div>
              </div>
            )}

            {/* Selected Folders Section */}
            {selectedFolderPaths.size > 0 && (
              <div className="p-3.5 rounded-2xl bg-rose-500/[0.04] dark:bg-rose-500/[0.08] border border-rose-500/20 backdrop-blur-sm space-y-1.5 relative z-10">
                <div className="flex items-center gap-1.5 font-semibold text-rose-600 dark:text-rose-400 text-xs">
                  <Folder className="w-3.5 h-3.5 text-amber-500" />
                  <span>{selectedFolderPaths.size} {selectedFolderPaths.size === 1 ? "Folder" : "Folders"} to be permanently deleted:</span>
                </div>
                <div className="max-h-24 overflow-y-auto space-y-1 pl-5">
                  {Array.from(selectedFolderPaths).map((fPath) => (
                    <div key={fPath} className="text-[11px] font-mono text-foreground font-semibold truncate">
                      📁 {fPath}
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  All nested files and subfolders will be recursively purged from storage.
                </p>
              </div>
            )}

            {/* Storage Reclamation Summary for Files */}
            {deletableFiles.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-muted/30 dark:bg-muted/20 border border-border/80 backdrop-blur-sm space-y-2 text-xs relative z-10">
                <div className="flex items-center justify-between font-medium">
                  <span className="text-muted-foreground">Files to be purged:</span>
                  <span className="font-semibold text-foreground">{deletableFiles.length}</span>
                </div>
                <div className="flex items-center justify-between font-medium">
                  <span className="text-muted-foreground">Reclaimed storage:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                    {formatBytes(deletableFiles.reduce((acc, f) => acc + f.byte_size, 0))}
                  </span>
                </div>
                <div className="max-h-28 overflow-y-auto space-y-1 pt-2 border-t border-border/60">
                  {deletableFiles.map((f) => (
                    <div key={f.id} className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="truncate max-w-[240px]">{f.sanitized_name}</span>
                      <span className="font-mono text-[10px] shrink-0">{formatBytes(f.byte_size)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bulk Delete Progress Bar */}
            {bulkDeleteProgress && (
              <div className="space-y-1.5 relative z-10">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Purging from storage...</span>
                  <span className="font-mono font-semibold text-foreground">
                    {bulkDeleteProgress.current} / {bulkDeleteProgress.total}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted/60 overflow-hidden">
                  <div
                    className="h-full bg-rose-600 transition-all duration-200"
                    style={{
                      width: `${Math.round((bulkDeleteProgress.current / bulkDeleteProgress.total) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Modal Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/80 relative z-10">
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(false)}
                disabled={isBulkDeleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/70 border border-border/70 transition cursor-pointer active:scale-98"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkDeleteConfirm}
                disabled={isBulkDeleting || (deletableFiles.length === 0 && selectedFolderPaths.size === 0)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 active:scale-[0.98] text-white font-semibold text-xs transition-all shadow-md shadow-rose-600/30 hover:shadow-rose-600/50 cursor-pointer disabled:opacity-50"
              >
                {isBulkDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      Delete {selectedFolderPaths.size + deletableFiles.length} Selected Item{selectedFolderPaths.size + deletableFiles.length === 1 ? "" : "s"}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}