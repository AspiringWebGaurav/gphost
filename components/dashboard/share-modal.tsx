"use client";

import React, { useState, useCallback } from "react";
import {
  File as FileIcon,
  Share2,
  Copy,
  Check,
  Clock,
  Loader2,
  X,
  Lock,
  Globe,
  Sparkles,
  AlertTriangle,
  Download,
  Zap,
  Activity,
  ExternalLink,
  EyeOff,
  MessageSquare,
  Lightbulb,
  QrCode,
  Send,
  Mail,
  RotateCcw,
  Shield,
  ShieldCheck,
  AlertCircle,
  Users,
  Flame,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { formatTimeRemaining } from "@/lib/storage/expiry";
import { authFetch } from "@/lib/auth/client-fetch";
import { ExpiryStatusBadge } from "@/components/ui/expiry-status-badge";
import { FileAnalyticsModal } from "@/components/dashboard/file-analytics-modal";
import { storageEvents } from "@/lib/storage/events";
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
}

export interface ShareResponseData {
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

export interface ShareModalProps {
  file: FileItem | null;
  isOpen?: boolean;
  onClose: () => void;
  isPremium?: boolean;
  onShareCreated?: (shareData: ShareResponseData) => void;
}

export function ShareModal({
  file,
  isOpen = true,
  onClose,
  onShareCreated,
}: ShareModalProps) {
  const [sharePassword, setSharePassword] = useState("");
  const [passwordHint, setPasswordHint] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [maxDownloads, setMaxDownloads] = useState("");
  const [isSingleUse, setIsSingleUse] = useState(false);
  const [onePerMember, setOnePerMember] = useState(false);
  const [burnAfterPreview, setBurnAfterPreview] = useState(false);
  const [directDownload, setDirectDownload] = useState(false);
  const [disablePreview, setDisablePreview] = useState(false);
  const [recipientNote, setRecipientNote] = useState("");
  const [showRecipientNote, setShowRecipientNote] = useState(false);
  const [shortenWithXurl, setShortenWithXurl] = useState(false);
  const [creatingShare, setCreatingShare] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareResult, setShareResult] = useState<ShareResponseData | null>(null);
  const [showQrCode, setShowQrCode] = useState(false);
  const [copiedDirect, setCopiedDirect] = useState(false);
  const [copiedXurl, setCopiedXurl] = useState(false);
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [analyticsFile, setAnalyticsFile] = useState<FileItem | null>(null);
  const [currentTime] = useState(() => Date.now());
  const [prevFileId, setPrevFileId] = useState<string | null>(file?.id ?? null);
  const [xurlStatus, setXurlStatus] = useState<{
    configured: boolean;
    valid: boolean;
    status: string;
    plan?: string;
    message: string;
  } | null>(null);
  const [retryingXurl, setRetryingXurl] = useState(false);
  const [xurlRetryError, setXurlRetryError] = useState<string | null>(null);
  const [checkingXurlLive, setCheckingXurlLive] = useState(false);

  const domainConfig = getShareDomainConfig(shortenWithXurl);
  const slugValidation = useSlugValidation(customSlug, isOpen);

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
      console.error("Failed to check XURL status:", err);
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

  const handleRetryXurl = async () => {
    if (!shareResult?.slug) return;
    setRetryingXurl(true);
    setXurlRetryError(null);
    try {
      const res = await authFetch(`/api/share/${shareResult.slug}/xurl`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to generate XURL shortlink");
      }
      setShareResult((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          xurl: {
            shortUrl: data.shortUrl,
            status: "active",
          },
          share: {
            ...prev,
            xurl: {
              shortUrl: data.shortUrl,
              status: "active",
            },
          },
        };
      });
    } catch (err: unknown) {
      setXurlRetryError(err instanceof Error ? err.message : "Failed to retry XURL shortlink");
    } finally {
      setRetryingXurl(false);
    }
  };

  // Reset form when file changes via React's recommended render-phase state adjustment pattern
  if (file && file.id !== prevFileId) {
    setPrevFileId(file.id);
    setShareResult(null);
    setShareError(null);
    setSharePassword("");
    setPasswordHint("");
    setCustomSlug("");
    setMaxDownloads("");
    setIsSingleUse(false);
    setOnePerMember(false);
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
  }

  if (!isOpen || !file) return null;

  const fileRemainingMs = file.expires_at
    ? new Date(file.expires_at).getTime() - currentTime
    : null;
  const isFileExpired = fileRemainingMs !== null && fileRemainingMs <= 0;

  const handleCreateShare = async () => {
    if (!file) return;
    setCreatingShare(true);
    setShareError(null);

    try {
      const maxDownloadsNum = isSingleUse
        ? 1
        : maxDownloads.trim()
        ? parseInt(maxDownloads, 10)
        : undefined;

      const payload: Record<string, unknown> = {
        fileId: file.id,
        expiresInPreset: "file_expiry",
        maxDownloads: maxDownloadsNum,
        isSingleUse,
        onePerMember,
        burnAfterPreview,
        directDownload,
        disablePreview,
        recipientNote: recipientNote.trim() || undefined,
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

      const res = await authFetch("/api/share/create", {
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
      if (onShareCreated) {
        onShareCreated(shareData);
      }
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Error creating share link");
    } finally {
      setCreatingShare(false);
    }
  };

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
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
        <div className="w-full max-w-4xl xl:max-w-5xl bg-card border border-border rounded-2xl p-3.5 sm:p-4.5 shadow-2xl space-y-2.5 sm:space-y-3 max-h-[96vh] overflow-y-auto sm:overflow-visible scrollbar-none transition-all">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Share2 className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground leading-tight">Create Share Link</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                  Customize your link, add protection, and choose delivery options.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
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
                <div
                  className="text-xs font-semibold text-foreground truncate max-w-[260px] sm:max-w-[420px]"
                  title={file.sanitized_name}
                >
                  {file.sanitized_name}
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-mono">
                  <span>{formatBytes(file.byte_size)}</span>
                  <span>&bull;</span>
                  {file.expires_at ? (
                    isFileExpired ? (
                      <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 inline" />
                        <span>Expired</span>
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">
                        Expires {formatExpiry(file.expires_at, currentTime)}
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
                {/* Section 1: Core Settings in Balanced 2x2 Grid */}
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
                      {file.expires_at && !isFileExpired && (
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
                          {file.expires_at
                            ? isFileExpired
                              ? "File Expired"
                              : `Same as file (expires in ${formatExpiry(file.expires_at, currentTime)})`
                            : "Permanent (Never expires)"}
                        </option>
                      </select>
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    <p className="text-[10px] text-muted-foreground/75 truncate">
                      {file.expires_at
                        ? isFileExpired
                          ? "Target file has expired. Sharing is locked."
                          : `Link will automatically expire in ${formatExpiry(file.expires_at, currentTime)}.`
                        : "Permanent file — link will never expire."}
                    </p>
                  </div>

                  {/* Password Protection */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11.5px] font-semibold text-foreground/90 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Password Protection</span>
                        <span className="text-[10px] font-normal text-muted-foreground">
                          (Optional)
                        </span>
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

                    {sharePassword.length > 0 && (
                      <div className="pt-0.5 animate-in fade-in slide-in-from-top-1 duration-150 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10.5px] font-semibold text-muted-foreground flex items-center gap-1">
                            <Lightbulb className="w-2.5 h-2.5 text-amber-500" />
                            <span>Password Hint (Optional)</span>
                          </label>
                          <span className="text-[9.5px] text-muted-foreground">
                            Shown to recipient
                          </span>
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
                          htmlFor="share-modal-one-per-member"
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
                            id="share-modal-one-per-member"
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

                {/* Section 4: Private Note for Recipient (Optional) */}
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
                    onClick={onClose}
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
                      (Boolean(customSlug.trim()) && (!slugValidation.isValid || slugValidation.status === "checking"))
                    }
                    className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 shadow-sm ${
                      isFileExpired || (Boolean(customSlug.trim()) && (!slugValidation.isValid || slugValidation.status === "checking")) || creatingShare
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
                  <button
                    type="button"
                    onClick={() => setAnalyticsFile(file)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 transition cursor-pointer"
                    title="View File Analytics"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Analytics</span>
                  </button>
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
                        `Download "${file.sanitized_name}" securely on GPHost: ${preferredShareUrl}`
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
                        `Download "${file.sanitized_name}" securely on GPHost`
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
                        `Download: ${file.sanitized_name}`
                      )}&body=${encodeURIComponent(
                        `Hi,\n\nI have shared "${file.sanitized_name}" with you via GPHost.\n\nYou can access or download it here:\n${preferredShareUrl}\n\nThis link will automatically expire based on security settings.\n`
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
                        navigator.clipboard.writeText(`[${file.sanitized_name}](${preferredShareUrl})`);
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
                  onClick={onClose}
                  className="px-5 py-2 rounded-xl bg-foreground text-background text-xs font-semibold hover:opacity-90 transition cursor-pointer shadow-sm"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {analyticsFile && (
        <FileAnalyticsModal
          fileId={analyticsFile.id}
          filename={analyticsFile.sanitized_name}
          onClose={() => setAnalyticsFile(null)}
        />
      )}
    </>
  );
}
