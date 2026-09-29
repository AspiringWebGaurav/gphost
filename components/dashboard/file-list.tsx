"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth/client-fetch";
import {
  File as FileIcon,
  Trash2,
  Share2,
  Copy,
  Check,
  Plus,
  Link2,
  Clock,
  HardDrive,
  Loader2,
  X,
  Lock,
  Globe,
  Sparkles,
  AlertTriangle,
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
  Shield,
  ShieldCheck,
  Users,
  Flame,
  RotateCcw,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { formatTimeRemaining } from "@/lib/storage/expiry";
import { storageEvents } from "@/lib/storage/events";
import { FileAnalyticsModal } from "@/components/dashboard/file-analytics-modal";
import { FileShareLinksModal } from "@/components/dashboard/file-share-links-modal";
import { ExpiryStatusBadge } from "@/components/ui/expiry-status-badge";
import { getFriendlyFileType } from "@/lib/storage/file-type";
import { getShareDomainConfig } from "@/lib/share/constants";
import { useSlugValidation } from "@/lib/hooks/use-slug-validation";

export interface FileItem {
  id: string;
  sanitized_name: string;
  byte_size: number;
  mime_type: string;
  status: string;
  expires_at: string | null;
  created_at: string;
  share_slug?: string | null;
  is_site?: boolean;
  xurl_short_url?: string | null;
  xurl_status?: string | null;
}

interface FileListProps {
  files: FileItem[];
  onFileDeleted?: () => void;
  onFileUpdated?: () => void;
  hideHeader?: boolean;
  maxHeight?: string;
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

interface ShareResponseData {
  slug: string;
  shareUrl: string;
  rawUrl?: string;
  expires_at: string | null;
  max_downloads?: number | null;
  is_single_use?: boolean;
  one_per_member?: boolean;
  burn_after_preview?: boolean;
  direct_download?: boolean;
  disable_preview?: boolean;
  recipient_note?: string | null;
  password_hint?: string | null;
  is_password_protected?: boolean;
  is_custom_slug?: boolean;
  is_premium?: boolean;
  xurl?: {
    shortUrl?: string;
    status: "pending" | "active" | "failed" | "cooldown";
    error?: string;
  };
}

export function FileList({
  files,
  onFileDeleted,
  onFileUpdated,
  hideHeader = false,
  maxHeight,
  isPremium = false,
}: FileListProps) {
  const [localUpdates, setLocalUpdates] = useState<Record<string, Partial<FileItem>>>({});
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());

  const fileList = files
    .filter(
      (f) =>
        !deletedIds.has(f.id) &&
        f.status !== "UPLOADING" &&
        f.status !== "PURGED" &&
        f.status !== "DELETE_PENDING" &&
        f.status !== "DELETE_FAILED"
    )
    .map((f) => (localUpdates[f.id] ? { ...f, ...localUpdates[f.id] } : f));

  const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null);
  const [isDeletingFile, setIsDeletingFile] = useState(false);
  const [shareFile, setShareFile] = useState<FileItem | null>(null);
  const [selectedFileForLinks, setSelectedFileForLinks] = useState<FileItem | null>(null);

  // Extend Expiry modal state
  const [extendFile, setExtendFile] = useState<FileItem | null>(null);
  const [extendPreset, setExtendPreset] = useState<string>("30d");
  const [isExtending, setIsExtending] = useState(false);
  const [extendError, setExtendError] = useState<string | null>(null);

  // Direct download state
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadCooldownIds, setDownloadCooldownIds] = useState<Set<string>>(new Set());
  const [activeDownload, setActiveDownload] = useState<{
    id: string;
    filename: string;
    progress: number;
    status: string;
    completed: boolean;
  } | null>(null);

  // Real-time live countdown ticker (ticks every second for smooth 35m -> 34m updates)
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Direct owner download
  const handleDirectDownload = async (file: FileItem) => {
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

  // Extend expiration & re-activate
  const handleExtendConfirm = async () => {
    if (!extendFile) return;
    setIsExtending(true);
    setExtendError(null);
    try {
      const res = await fetch(`/api/files/${extendFile.id}/extend`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: extendPreset }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to extend file expiry");
      }
      setLocalUpdates((prev) => ({
        ...prev,
        [extendFile.id]: { status: data.file.status, expires_at: data.file.expires_at },
      }));
      setExtendFile(null);
      if (onFileUpdated) onFileUpdated();
      else if (onFileDeleted) onFileDeleted();
    } catch (err: unknown) {
      setExtendError(err instanceof Error ? err.message : "Failed to extend expiry");
    } finally {
      setIsExtending(false);
    }
  };

  // Share modal state
  const [sharePreset, setSharePreset] = useState<string>("file_expiry");
  const [maxDownloads, setMaxDownloads] = useState<string>("");
  const [onePerMember, setOnePerMember] = useState(false);
  const [isSingleUse, setIsSingleUse] = useState(false);
  const [burnAfterPreview, setBurnAfterPreview] = useState(false);
  const [directDownload, setDirectDownload] = useState(false);
  const [disablePreview, setDisablePreview] = useState(false);
  const [recipientNote, setRecipientNote] = useState("");
  const [showRecipientNote, setShowRecipientNote] = useState(false);
  const [sharePassword, setSharePassword] = useState("");
  const [passwordHint, setPasswordHint] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [shortenWithXurl, setShortenWithXurl] = useState(false);
  const [creatingShare, setCreatingShare] = useState(false);
  const [shareResult, setShareResult] = useState<ShareResponseData | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [showQrCode, setShowQrCode] = useState(false);
  const [copiedDirect, setCopiedDirect] = useState(false);
  const [copiedXurl, setCopiedXurl] = useState(false);
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [copiedLinkSlug, setCopiedLinkSlug] = useState<string | null>(null);
  const [analyticsFile, setAnalyticsFile] = useState<FileItem | null>(null);
  const [xurlStatus, setXurlStatus] = useState<{
    configured: boolean;
    valid: boolean;
    status: string;
    plan?: string;
    message: string;
  } | null>(null);
  const [checkingXurlLive, setCheckingXurlLive] = useState<boolean>(false);
  const [retryingXurl, setRetryingXurl] = useState(false);
  const [xurlRetryError, setXurlRetryError] = useState<string | null>(null);

  const handleRetryXurl = async () => {
    const slug = shareResult?.slug || (shareResult as unknown as { share?: { slug?: string } })?.share?.slug;
    if (!slug) return;
    setRetryingXurl(true);
    setXurlRetryError(null);
    try {
      const res = await authFetch("/api/xurl/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.shortUrl) {
        throw new Error(data.error || "Failed to create XURL shortlink");
      }
      setShareResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          xurl: {
            shortUrl: data.shortUrl,
            status: "active",
          },
        };
      });
    } catch (err: unknown) {
      setXurlRetryError(err instanceof Error ? err.message : "Failed to retry XURL shortlink");
    } finally {
      setRetryingXurl(false);
    }
  };

  const domainConfig = getShareDomainConfig(shortenWithXurl);
  const slugValidation = useSlugValidation(customSlug, Boolean(shareFile));

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
    setShortenWithXurl(checked);
    if (checked) {
      checkXurlLiveStatus(true);
    }
  };

  const handleCopyLink = (slug: string, isSite?: boolean) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const targetUrl = isSite ? `${origin}/site/${slug}` : `${origin}/f/${slug}`;
    navigator.clipboard.writeText(targetUrl);
    setCopiedLinkSlug(slug);
    setTimeout(() => setCopiedLinkSlug(null), 2000);
  };

  const handleDeleteConfirm = async () => {
    if (!fileToDelete) return;
    setIsDeletingFile(true);
    try {
      const res = await fetch(`/api/files/${fileToDelete.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to delete file");
      } else {
        const deletedId = fileToDelete.id;
        const deletedSize = fileToDelete.byte_size;
        setFileToDelete(null);
        setDeletedIds((prev) => new Set(prev).add(deletedId));
        storageEvents.emit("file:lifecycle", {
          fileId: deletedId,
          size: deletedSize,
          action: "deleted",
        });
        if (onFileDeleted) onFileDeleted();
      }
    } catch (err) {
      console.error("Error deleting file:", err);
      alert("Network error deleting file");
    } finally {
      setIsDeletingFile(false);
    }
  };

  const handleCreateShare = async () => {
    if (!shareFile) return;

    if (shareFile.expires_at && new Date(shareFile.expires_at).getTime() <= currentTime) {
      setShareError("This file has expired. Share links cannot be created for expired files.");
      return;
    }

    setCreatingShare(true);
    setShareError(null);
    setShareResult(null);

    try {
      const maxDownloadsNum = isSingleUse
        ? 1
        : maxDownloads.trim()
        ? parseInt(maxDownloads.trim(), 10)
        : null;

      const payload: Record<string, unknown> = {
        fileId: shareFile.id,
        maxDownloads: maxDownloadsNum,
        onePerMember,
        isSingleUse,
        burnAfterPreview,
        directDownload,
        disablePreview,
        recipientNote: recipientNote.trim() || undefined,
        expiresInPreset: sharePreset,
        expiresIn: sharePreset,
        shortenWithXurl,
        enableXurl: shortenWithXurl,
      };

      if (customSlug.trim()) {
        if (!slugValidation.isValid) {
          setShareError(slugValidation.message || "Please provide a valid, available custom slug.");
          return;
        }
        payload.customSlug = customSlug.trim();
      }

      if (sharePassword.trim()) {
        payload.password = sharePassword.trim();
        if (passwordHint.trim()) {
          payload.passwordHint = passwordHint.trim();
        }
      }

      const res = await fetch("/api/share/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate share link");
      }

      const shareData = data.share || data;
      setShareResult(shareData);
      storageEvents.emit("storage:updated", {
        storageUsedBytes: 0,
        source: "local_optimistic",
      });
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Error creating share link");
    } finally {
      setCreatingShare(false);
    }
  };

  if (fileList.length === 0) {
    return (
      <div
        className={`text-center ${
          hideHeader
            ? "py-6 px-4 rounded-xl bg-muted/20 border border-dashed border-border/80"
            : "p-10 rounded-2xl border border-border bg-card"
        }`}
      >
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground mx-auto mb-1.5">
          <HardDrive className="w-5 h-5 opacity-60" />
        </div>
        <h4 className="text-base sm:text-lg font-bold text-foreground mb-1">No Active Files</h4>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          You haven&apos;t uploaded any files yet. Go to the Upload tab to start sharing.
        </p>
        <div className="mt-2.5">
          <Link
            href="/upload"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Upload File</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Your Files ({fileList.length})
          </h3>
        </div>
      )}

      <div
        className={`overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border ${
          maxHeight ? `${maxHeight} overflow-y-auto` : ""
        }`}
      >
        {fileList.map((file) => {
          const isExpired =
            file.status === "EXPIRED" ||
            (file.expires_at !== null && new Date(file.expires_at).getTime() <= currentTime);

          return (
            <div
              key={file.id}
              className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                isExpired
                  ? "bg-rose-500/[0.02] dark:bg-rose-500/[0.04] hover:bg-rose-500/[0.06] border-l-2 border-l-rose-500/60"
                  : "hover:bg-muted/40 border-l-2 border-l-transparent"
              }`}
            >
              {/* File Info */}
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    file.is_site || file.mime_type === "text/html"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      : isExpired
                      ? "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                      : "bg-muted text-muted-foreground border border-border/60"
                  }`}
                >
                  {file.is_site || file.mime_type === "text/html" ? (
                    <Globe className="w-4 h-4" />
                  ) : (
                    <FileIcon className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm sm:text-base font-semibold text-foreground truncate max-w-xs sm:max-w-md">
                      {file.sanitized_name}
                    </p>
                    {file.is_site && file.share_slug && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Live Site
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    {file.is_site && file.share_slug ? (
                      <a
                        href={`/site/${file.share_slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400 hover:underline font-mono text-[11px]"
                        title="Open live website in new tab"
                      >
                        <span>/site/{file.share_slug}</span>
                        <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                      </a>
                    ) : file.share_slug ? (
                      <a
                        href={`/f/${file.share_slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-blue-600 dark:text-blue-400 hover:underline font-mono text-[11px]"
                        title="Open public share page in new tab"
                      >
                        <span>/f/{file.share_slug}</span>
                        <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                      </a>
                    ) : (
                      <span className="font-medium text-foreground/80">
                        {getFriendlyFileType(file.mime_type, file.sanitized_name)}
                      </span>
                    )}
                    <span>•</span>
                    <span className="font-mono">{formatBytes(file.byte_size)}</span>
                    <span>•</span>
                    <ExpiryStatusBadge expiresAt={file.expires_at} status={file.status} size="xs" />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                {file.share_slug && !isExpired ? (
                  <>
                    {file.is_site ? (
                      <a
                        href={`/site/${file.share_slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-xs cursor-pointer"
                        title="Open live hosted site in new tab"
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
                      title={file.is_site ? "Copy live site link" : "Copy share link"}
                    >
                      {copiedLinkSlug === file.share_slug ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>Copy Link</span>
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
                      <span>Links</span>
                      <Sparkles className="w-2.5 h-2.5 text-emerald-500" />
                    </button>

                    <button
                      onClick={() => handleDirectDownload(file)}
                      disabled={downloadingId === file.id || downloadCooldownIds.has(file.id)}
                      className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer disabled:opacity-50"
                      title={downloadCooldownIds.has(file.id) ? "Download cooling down..." : "Download file"}
                    >
                      {downloadingId === file.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </>
                ) : isExpired ? (
                  <>
                    <button
                      onClick={() => {
                        setExtendFile(file);
                        setExtendPreset("30d");
                        setExtendError(null);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                      title="Re-activate this expired file and restore public sharing"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Extend Expiry</span>
                    </button>

                    <button
                      onClick={() => handleDirectDownload(file)}
                      disabled={downloadingId === file.id}
                      className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      title="Download your copy"
                    >
                      {downloadingId === file.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setShareFile(file);
                        setShareResult(null);
                        setShareError(null);
                        setSharePassword("");
                        setPasswordHint("");
                        setCustomSlug("");
                        setSharePreset("file_expiry");
                        setMaxDownloads("");
                        setOnePerMember(false);
                        setIsSingleUse(false);
                        setBurnAfterPreview(false);
                        setDirectDownload(false);
                        setDisablePreview(false);
                        setRecipientNote("");
                        setShowRecipientNote(false);
                        setShortenWithXurl(false);
                        setShowQrCode(false);
                        setCopiedDirect(false);
                        setCopiedXurl(false);
                        setCopiedRaw(false);
                        setCopiedMarkdown(false);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-medium transition-colors cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                      <span>Share</span>
                    </button>

                    <button
                      onClick={() => handleDirectDownload(file)}
                      disabled={downloadingId === file.id}
                      className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      title="Direct download"
                    >
                      {downloadingId === file.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </>
                )}

                <button
                  onClick={() => setAnalyticsFile(file)}
                  className="p-1.5 rounded-lg border border-border hover:bg-purple-500/10 hover:border-purple-500/30 text-muted-foreground hover:text-purple-600 dark:hover:text-purple-400 transition cursor-pointer"
                  title="View File Analytics & Downloads"
                  data-testid={`file-analytics-btn-${file.id}`}
                >
                  <Activity className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setFileToDelete(file)}
                  className="p-1.5 rounded-lg border border-border hover:border-red-500/30 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
                  title={isExpired ? "Delete expired file to free storage quota" : "Delete file"}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Share Modal Dialog */}
      {shareFile && (() => {
        const fileRemainingMs = shareFile.expires_at
          ? new Date(shareFile.expires_at).getTime() - currentTime
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
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
            <div className="w-full max-w-4xl xl:max-w-5xl bg-card border border-border rounded-2xl p-3.5 sm:p-4.5 shadow-2xl space-y-2.5 sm:space-y-3 max-h-[96vh] overflow-y-auto sm:overflow-visible scrollbar-none transition-all">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Share2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground leading-tight">Create Share Link</h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">Customize your link, add protection, and choose delivery options.</p>
                  </div>
                </div>
                <button
                  onClick={() => setShareFile(null)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition cursor-pointer"
                  aria-label="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* File Info Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 py-1.5 px-3 rounded-xl bg-muted/40 border border-border">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-md bg-background border border-border/80 text-blue-500 flex items-center justify-center shrink-0">
                    <FileIcon className="w-3 h-3" />
                  </div>
                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                    <div className="text-xs font-semibold text-foreground truncate max-w-[260px] sm:max-w-[420px]" title={shareFile.sanitized_name}>
                      {shareFile.sanitized_name}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-mono">
                      <span>{formatBytes(shareFile.byte_size)}</span>
                      <span>&bull;</span>
                      {shareFile.expires_at ? (
                        isFileExpired ? (
                          <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 inline" />
                            <span>Expired</span>
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            Expires {formatExpiry(shareFile.expires_at, currentTime)}
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

                {shortenWithXurl && (
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
              </div>

              {!shareResult ? (
                <div className="space-y-2.5 sm:space-y-3">
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
                          {shareFile.expires_at && !isFileExpired && (
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
                              {shareFile.expires_at
                                ? isFileExpired
                                ? "File Expired"
                                : `Same as file (expires in ${formatExpiry(shareFile.expires_at, currentTime)})`
                                : "Permanent (Never expires)"}
                            </option>
                          </select>
                          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                          </div>
                        </div>

                        <p className="text-[10px] text-muted-foreground/75 truncate">
                          {shareFile.expires_at
                            ? isFileExpired
                              ? "Target file has expired. Sharing is locked."
                              : `Link will automatically expire in ${formatExpiry(shareFile.expires_at, currentTime)}.`
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
                              value={passwordHint}
                              onChange={(e) => setPasswordHint(e.target.value)}
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
                          {customSlug.trim() ? (
                            slugValidation.status === "checking" ? (
                              <span className="text-[9.5px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/25 flex items-center gap-1 animate-pulse">
                                <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-500" />
                                <span>Checking availability...</span>
                              </span>
                            ) : slugValidation.status === "available" ? (
                              <span className="text-[9.5px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/25 flex items-center gap-1 shadow-2xs">
                                <Check className="w-2.5 h-2.5 text-emerald-500" />
                                <span>Slug Available</span>
                              </span>
                            ) : slugValidation.status === "taken" ? (
                              <span className="text-[9.5px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/25 flex items-center gap-1 shadow-2xs">
                                <X className="w-2.5 h-2.5 text-rose-500" />
                                <span>Slug Already Taken</span>
                              </span>
                            ) : slugValidation.status === "reserved" ? (
                              <span className="text-[9.5px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/25 flex items-center gap-1">
                                <AlertTriangle className="w-2.5 h-2.5 text-amber-500" />
                                <span>Reserved Slug</span>
                              </span>
                            ) : slugValidation.status === "too_short" ? (
                              <span className="text-[9.5px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/25 flex items-center gap-1">
                                <AlertCircle className="w-2.5 h-2.5 text-amber-500" />
                                <span>Min 3 Characters</span>
                              </span>
                            ) : (
                              <span className="text-[9.5px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/25 flex items-center gap-1">
                                <AlertCircle className="w-2.5 h-2.5 text-amber-500" />
                                <span>{slugValidation.message || "Invalid Format"}</span>
                              </span>
                            )
                          ) : shortenWithXurl ? (
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
                          ) : domainConfig.isLocal ? (
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
                            customSlug.trim() && !slugValidation.isValid && slugValidation.status !== "checking"
                              ? "bg-rose-500/[0.03] border-rose-500/50 focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-500/20"
                              : slugValidation.status === "available"
                              ? "bg-emerald-500/[0.03] border-emerald-500/50 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/20"
                              : slugValidation.status === "checking"
                              ? "bg-blue-500/[0.03] border-blue-500/40 focus-within:border-blue-500"
                              : "bg-background/90 hover:bg-background border-border/80 hover:border-blue-500/60 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/20"
                          }`}
                        >
                          {/* Attached Domain Prefix */}
                          <div className="h-full flex items-center px-2.5 bg-muted/40 text-[11.5px] text-muted-foreground font-mono font-medium border-r border-border/80 select-none gap-0.5 shrink-0 max-w-[210px] sm:max-w-none overflow-hidden">
                            <span className="hidden xs:inline text-muted-foreground/60">{domainConfig.protocol}</span>
                            <span className="font-semibold text-blue-600 dark:text-blue-400 truncate">
                              {domainConfig.host}
                            </span>
                            <span className="text-muted-foreground/80">{domainConfig.path}</span>
                          </div>

                          {/* Editable Custom Slug Input */}
                          <input
                            type="text"
                            disabled={creatingShare || isFileExpired || (shortenWithXurl && (!xurlStatus?.valid || checkingXurlLive))}
                            placeholder={
                              shortenWithXurl && checkingXurlLive
                                ? "Detecting XURL Plan entitlements..."
                                : shortenWithXurl && !xurlStatus?.valid
                                ? "Verify XURL API key to unlock"
                                : "e.g. my-project-files (leave blank for random)"
                            }
                            value={customSlug}
                            onChange={(e) =>
                              setCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
                            }
                            maxLength={48}
                            className="w-full h-full px-2.5 text-xs text-foreground font-mono font-medium bg-transparent focus:outline-none placeholder:text-muted-foreground/50 placeholder:font-sans placeholder:font-normal disabled:cursor-not-allowed"
                          />

                          {/* Inline Status Icons & Clear Button */}
                          <div className="flex items-center gap-1 pr-2 shrink-0">
                            {slugValidation.status === "checking" && (
                              <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                            )}
                            {slugValidation.status === "available" && (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            )}
                            {(slugValidation.status === "taken" ||
                              slugValidation.status === "reserved" ||
                              slugValidation.status === "invalid_chars" ||
                              slugValidation.status === "too_short") && (
                              <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                            )}
                            {customSlug && (
                              <button
                                type="button"
                                onClick={() => setCustomSlug("")}
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
                              {domainConfig.fullBaseUrl}{customSlug || "auto-generated-slug"}
                            </span>
                          </div>
                          {customSlug && (
                            <span className="text-[9.5px] font-mono text-muted-foreground/60 shrink-0 hidden sm:inline">
                              {customSlug.length}/48
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
                            shortenWithXurl
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
                              checked={shortenWithXurl}
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
                            directDownload
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
                              checked={directDownload}
                              onChange={(e) => setDirectDownload(e.target.checked)}
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
                            isSingleUse
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
                              checked={isSingleUse}
                              onChange={(e) => setIsSingleUse(e.target.checked)}
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
                            burnAfterPreview
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
                              checked={burnAfterPreview}
                              onChange={(e) => setBurnAfterPreview(e.target.checked)}
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
                            disablePreview
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
                              checked={disablePreview}
                              onChange={(e) => setDisablePreview(e.target.checked)}
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
                              <Download className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <span className="text-xs font-bold text-foreground truncate">Download Quota</span>
                              <span onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
                                <InfoTooltip
                                  title="Download Quota"
                                  content="Sets the total times this file can be downloaded before the link locks up. Slide to any number or slide all the way left for Unlimited."
                                  side="top"
                                  align="end"
                                  variant="info"
                                  iconClassName="w-3 h-3 text-muted-foreground/60 hover:text-blue-500"
                                />
                              </span>
                            </div>
                            <span className="text-[9.5px] font-mono font-semibold px-1.5 py-0.5 rounded bg-muted/80 text-foreground border border-border/60 shrink-0">
                              {isSingleUse ? "1 max" : maxDownloads ? `${maxDownloads} max` : "Unlimited"}
                            </span>
                          </div>

                          {/* Quota Slider & Manual Input */}
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="0"
                              max="50"
                              step="1"
                              value={isSingleUse ? 1 : maxDownloads ? Math.min(parseInt(maxDownloads, 10) || 0, 50) : 0}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setMaxDownloads(val === 0 ? "" : val.toString());
                              }}
                              disabled={isSingleUse}
                              className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
                              title="Slide to set download quota (0 = Unlimited)"
                            />
                            <input
                              type="number"
                              min="1"
                              placeholder="∞"
                              value={isSingleUse ? "1" : maxDownloads}
                              onChange={(e) => setMaxDownloads(e.target.value)}
                              disabled={isSingleUse}
                              className="w-10 h-5.5 px-1 rounded bg-background border border-border/80 text-center font-mono text-[10.5px] text-foreground placeholder:text-muted-foreground/50 disabled:opacity-50 shrink-0 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              title="Enter exact quota (leave empty for unlimited)"
                            />
                          </div>

                          {/* 1 Download / Person Switch */}
                          <div
                            className="flex items-center justify-between gap-1 pt-1 border-t border-border/40 select-none"
                          >
                            <label
                              htmlFor="file-list-one-per-member"
                              className="flex items-center gap-1 min-w-0 cursor-pointer"
                            >
                              <Users className="w-3 h-3 text-indigo-500 shrink-0" />
                              <span className="text-[10.5px] font-semibold text-foreground truncate">1 Download / Person</span>
                            </label>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <InfoTooltip
                                title="1 Download / Person"
                                content="Unlimited different people can download this file, but each person can download it only 1 time in their lifetime. Once claimed on their device, repeat downloads are locked."
                                side="top"
                                align="end"
                                variant="purple"
                                iconClassName="w-3 h-3 text-muted-foreground/60 hover:text-indigo-500"
                              />
                              <input
                                id="file-list-one-per-member"
                                type="checkbox"
                                checked={onePerMember}
                                onChange={(e) => setOnePerMember(e.target.checked)}
                                disabled={isSingleUse}
                                className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600 shrink-0 disabled:opacity-50"
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
                                setRecipientNote("");
                              }}
                              className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                          <input
                            type="text"
                            placeholder="e.g. Here is the revised draft for review — please keep confidential."
                            value={recipientNote}
                            onChange={(e) => setRecipientNote(e.target.value)}
                            maxLength={280}
                            className="w-full h-8 px-2.5 rounded-md bg-background/90 hover:bg-background border border-border/80 hover:border-blue-500/50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none text-xs text-foreground placeholder:text-muted-foreground/50 transition-all font-sans"
                          />
                          <div className="flex justify-between items-center text-[9.5px] text-muted-foreground">
                            <span>Recipient sees this above the file name.</span>
                            <span>{recipientNote.length}/280</span>
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
                        onClick={() => setShareFile(null)}
                        disabled={creatingShare}
                        className={`px-3.5 py-1.5 rounded-lg bg-muted/60 hover:bg-muted text-xs font-medium text-foreground hover:text-foreground border border-border/60 hover:border-border transition-all duration-150 shadow-2xs ${
                          creatingShare ? "opacity-50 pointer-events-none cursor-not-allowed" : "cursor-pointer"
                        }`}
                      >
                        {isFileExpired ? "Close" : "Cancel"}
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateShare}
                        disabled={
                          creatingShare ||
                          isFileExpired ||
                          (Boolean(customSlug.trim()) &&
                            (!slugValidation.isValid || slugValidation.status === "checking"))
                        }
                        className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 shadow-sm ${
                          isFileExpired ||
                          (Boolean(customSlug.trim()) &&
                            (!slugValidation.isValid || slugValidation.status === "checking")) ||
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
                </div>
              ) : (
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
                    {shareFile && (
                      <button
                        type="button"
                        onClick={() => setAnalyticsFile(shareFile)}
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

                    {shareResult.is_password_protected && (
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
                  {(formattedXurl || shortenWithXurl || shareResult.xurl) && (
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
                      ) : shortenWithXurl ? (
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
                          `Download "${shareFile.sanitized_name}" securely on GPHost: ${preferredShareUrl}`
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
                          `Download "${shareFile.sanitized_name}" securely on GPHost`
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
                          `Download: ${shareFile.sanitized_name}`
                        )}&body=${encodeURIComponent(
                          `Hi,\n\nI have shared "${shareFile.sanitized_name}" with you via GPHost.\n\nYou can access or download it here:\n${preferredShareUrl}\n\nThis link will automatically expire based on security settings.\n`
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
                          navigator.clipboard.writeText(`[${shareFile.sanitized_name}](${preferredShareUrl})`);
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
                    onClick={() => setShareFile(null)}
                    className="px-5 py-2 rounded-xl bg-foreground text-background text-xs font-semibold hover:opacity-90 transition cursor-pointer shadow-sm"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ); })()}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={Boolean(fileToDelete)}
        onClose={() => !isDeletingFile && setFileToDelete(null)}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeletingFile}
        title="Delete File?"
        description={
          <div className="space-y-1.5">
            <p>
              Are you sure you want to permanently delete{" "}
              <strong className="text-foreground">{fileToDelete?.sanitized_name}</strong>?
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

      {/* Extend Expiry Modal */}
      {extendFile && (
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
                onClick={() => setExtendFile(null)}
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
                <p className="text-xs font-semibold text-foreground truncate">{extendFile.sanitized_name}</p>
                <p className="text-[11px] text-muted-foreground font-mono">{formatBytes(extendFile.byte_size)}</p>
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
                onClick={() => setExtendFile(null)}
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
      {analyticsFile && (
        <FileAnalyticsModal
          fileId={analyticsFile.id}
          filename={analyticsFile.sanitized_name}
          onClose={() => setAnalyticsFile(null)}
        />
      )}

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
          setLocalUpdates((prev) => ({
            ...prev,
            [fileId]: {
              ...prev[fileId],
              xurl_short_url: shortUrl,
              xurl_status: "active",
            },
          }));
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
