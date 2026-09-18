"use client";

import React, { useState } from "react";
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
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { formatTimeRemaining } from "@/lib/storage/expiry";
import { ExpiryStatusBadge } from "@/components/ui/expiry-status-badge";
import { FileAnalyticsModal } from "@/components/dashboard/file-analytics-modal";

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
  isPremium = false,
  onShareCreated,
}: ShareModalProps) {
  const [sharePassword, setSharePassword] = useState("");
  const [passwordHint, setPasswordHint] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [maxDownloads, setMaxDownloads] = useState("");
  const [isSingleUse, setIsSingleUse] = useState(false);
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
        burnAfterPreview,
        directDownload,
        disablePreview,
        recipientNote: recipientNote.trim() || undefined,
        shortenWithXurl,
        enableXurl: shortenWithXurl,
      };

      if (customSlug.trim()) {
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
      if (onShareCreated) {
        onShareCreated(shareData);
      }
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Error creating share link");
    } finally {
      setCreatingShare(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
        <div className="w-full max-w-4xl xl:max-w-5xl bg-card border border-border rounded-2xl p-4 sm:p-5 md:p-6 shadow-2xl space-y-3 sm:space-y-3.5 max-h-[95vh] overflow-y-auto transition-all">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Share2 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">Create Share Link</h4>
                <p className="text-[11px] text-muted-foreground">
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 px-3 rounded-xl bg-muted/40 border border-border">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-background border border-border/80 text-blue-500 flex items-center justify-center shrink-0">
                <FileIcon className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div
                  className="text-xs font-semibold text-foreground truncate max-w-[280px] sm:max-w-[460px]"
                  title={file.sanitized_name}
                >
                  {file.sanitized_name}
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-2 font-mono">
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

            {isPremium ? (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs shrink-0 self-start sm:self-auto">
                <Sparkles className="w-3 h-3 text-blue-500" />
                <span className="font-semibold text-[10px]">Premium Plan</span>
                <span className="text-[9px] text-blue-500/80 dark:text-blue-400/80">
                  &bull; Custom name unlocked
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-muted border border-border text-muted-foreground text-xs shrink-0 self-start sm:self-auto">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                <span className="font-medium text-[10px] text-foreground">Standard Plan</span>
                <span className="text-[9px] text-muted-foreground">&bull; PRO for custom names</span>
              </div>
            )}
          </div>

          {!shareResult ? (
            <div className="space-y-3 sm:space-y-3.5">
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

              <div
                className={`space-y-3.5 ${
                  isFileExpired ? "opacity-45 pointer-events-none select-none" : ""
                }`}
              >
                {/* Section 1: Core Settings in Balanced 2x2 Grid */}
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
                      {file.expires_at && !isFileExpired && (
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
                          {file.expires_at
                            ? isFileExpired
                              ? "File Expired"
                              : `Same as file (expires in ${formatExpiry(file.expires_at, currentTime)})`
                            : "Permanent (Never expires)"}
                        </option>
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground/75 truncate">
                      {file.expires_at
                        ? isFileExpired
                          ? "Target file has expired. Sharing is locked."
                          : `Link will automatically expire in ${formatExpiry(file.expires_at, currentTime)}.`
                        : "Permanent file — link will never expire."}
                    </p>
                  </div>

                  {/* Password Protection */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[12px] font-semibold text-foreground/90 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Password Protection</span>
                        <span className="text-[10.5px] font-normal text-muted-foreground">
                          (Optional)
                        </span>
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

                    {sharePassword.length > 0 && (
                      <div className="pt-1 animate-in fade-in slide-in-from-top-1 duration-150 space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                            <Lightbulb className="w-3 h-3 text-amber-500" />
                            <span>Password Hint (Optional)</span>
                          </label>
                          <span className="text-[10px] text-muted-foreground">
                            Shown to recipient
                          </span>
                        </div>
                        <input
                          type="text"
                          placeholder="e.g. Office Wi-Fi password, project code name"
                          value={passwordHint}
                          onChange={(e) => setPasswordHint(e.target.value)}
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
                          content="Choose a clean, memorable address for your link (e.g. gphost.app/f/project-deck) instead of random letters."
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
                            value={customSlug}
                            onChange={(e) =>
                              setCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
                            }
                            maxLength={48}
                            className="w-full h-full px-3 text-xs sm:text-[13px] text-foreground font-mono tracking-tight font-medium bg-transparent focus:outline-none placeholder:text-muted-foreground/50 placeholder:font-sans placeholder:font-normal placeholder:tracking-normal"
                          />
                          {customSlug && (
                            <button
                              type="button"
                              onClick={() => setCustomSlug("")}
                              className="p-1 mr-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg cursor-pointer transition-colors"
                              aria-label="Clear custom slug"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        {customSlug && (
                          <div className="text-[10.5px] text-muted-foreground flex items-center gap-1.5 truncate">
                            <span className="font-medium text-foreground">Your link:</span>
                            <span className="font-mono text-blue-600 dark:text-blue-400 font-medium truncate">
                              {typeof window !== "undefined" ? window.location.host : "gphost.app"}/f/{customSlug}
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
                        <span className="text-[10.5px] font-normal text-muted-foreground">
                          (Optional)
                        </span>
                        <InfoTooltip
                          title="Download Limit"
                          content="Set how many times this file can be downloaded before the link turns off. Leave blank if anyone can download it without limits."
                        />
                      </label>
                      <span className="text-[10.5px] text-muted-foreground font-mono font-medium">
                        {isSingleUse ? "Single-Use: 1" : maxDownloads ? `${maxDownloads} max` : "Unlimited"}
                      </span>
                    </div>
                    <input
                      type="number"
                      min="1"
                      placeholder={isSingleUse ? "1 (Single-Use Link Locked)" : "No limit (e.g. 5, 10, 50)"}
                      value={isSingleUse ? "1" : maxDownloads}
                      onChange={(e) => setMaxDownloads(e.target.value)}
                      disabled={isSingleUse}
                      className="w-full h-10 px-3.5 rounded-xl bg-background/90 hover:bg-background border border-border/80 hover:border-blue-500/60 dark:hover:border-blue-400/60 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none text-xs sm:text-[13px] text-foreground font-mono font-medium tracking-tight placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-muted-foreground/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border/80 disabled:hover:bg-background/80 disabled:hover:shadow-none transition-all duration-200 shadow-2xs hover:shadow-xs focus:shadow-xs"
                    />
                    <p className="text-[11px] text-muted-foreground/75 truncate">
                      {isSingleUse ? (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          Locked to 1 download (Single-Use enabled).
                        </span>
                      ) : (
                        <span>Leave empty for unlimited downloads, or enter a number.</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Private Note / Memo for Recipient */}
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
                            setRecipientNote("");
                          }}
                          className="text-[10.5px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
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
                        className="w-full h-9 px-3 rounded-lg bg-background/90 hover:bg-background border border-border/80 hover:border-blue-500/50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none text-xs text-foreground placeholder:text-muted-foreground/50 transition-all font-sans"
                      />
                      <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                        <span>Recipient sees this above the file name.</span>
                        <span>{recipientNote.length}/280</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section 2: 5 Delivery & Security Feature Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 pt-0.5">
                  {/* Card 1: One-Time Download */}
                  <label
                    className={`flex flex-col justify-between p-3.5 rounded-xl border transition-all duration-200 cursor-pointer select-none group relative overflow-hidden ${
                      isSingleUse
                        ? "bg-blue-500/[0.08] border-blue-500/60 ring-1 ring-blue-500/30 shadow-xs"
                        : "bg-muted/30 hover:bg-muted/60 border-border/80 hover:border-blue-500/50 hover:shadow-xs"
                    }`}
                  >
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
                          checked={isSingleUse}
                          onChange={(e) => setIsSingleUse(e.target.checked)}
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
                  <label
                    className={`flex flex-col justify-between p-3.5 rounded-xl border transition-all duration-200 cursor-pointer select-none group relative overflow-hidden ${
                      burnAfterPreview
                        ? "bg-rose-500/[0.08] border-rose-500/60 ring-1 ring-rose-500/30 shadow-xs"
                        : "bg-muted/30 hover:bg-muted/60 border-border/80 hover:border-rose-500/50 hover:shadow-xs"
                    }`}
                  >
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
                          checked={burnAfterPreview}
                          onChange={(e) => setBurnAfterPreview(e.target.checked)}
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
                  <label
                    className={`flex flex-col justify-between p-3.5 rounded-xl border transition-all duration-200 cursor-pointer select-none group relative overflow-hidden ${
                      directDownload
                        ? "bg-purple-500/[0.08] border-purple-500/60 ring-1 ring-purple-500/30 shadow-xs"
                        : "bg-muted/30 hover:bg-muted/60 border-border/80 hover:border-purple-500/50 hover:shadow-xs"
                    }`}
                  >
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
                          checked={directDownload}
                          onChange={(e) => setDirectDownload(e.target.checked)}
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
                  <label
                    className={`flex flex-col justify-between p-3.5 rounded-xl border transition-all duration-200 cursor-pointer select-none group relative overflow-hidden ${
                      disablePreview
                        ? "bg-amber-500/[0.08] border-amber-500/60 ring-1 ring-amber-500/30 shadow-xs"
                        : "bg-muted/30 hover:bg-muted/60 border-border/80 hover:border-amber-500/50 hover:shadow-xs"
                    }`}
                  >
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
                          checked={disablePreview}
                          onChange={(e) => setDisablePreview(e.target.checked)}
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

                  {/* Card 5: Shorten with XURL */}
                  <label
                    className={`flex flex-col justify-between p-3.5 rounded-xl border transition-all duration-200 cursor-pointer select-none group relative overflow-hidden ${
                      shortenWithXurl
                        ? "bg-blue-500/[0.08] border-blue-500/60 ring-1 ring-blue-500/30 shadow-xs"
                        : "bg-muted/30 hover:bg-muted/60 border-border/80 hover:border-blue-500/50 hover:shadow-xs"
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-[12.5px] font-semibold text-foreground flex items-center gap-1.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span>XURL Shortlink</span>
                          <InfoTooltip
                            variant="info"
                            title="XURL (3rd-Party URL Shortener Integration)"
                            content="XURL (https://xurl.eu.cc) is an external third-party URL shortening service integrated with GPHost. Enabling this creates an extra-compact, easy-to-share link (e.g. xurl.eu.cc/abc) that redirects to your file."
                          />
                        </div>
                        <input
                          type="checkbox"
                          checked={shortenWithXurl}
                          onChange={(e) => setShortenWithXurl(e.target.checked)}
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
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl bg-muted/60 hover:bg-muted text-xs font-medium text-foreground hover:text-foreground border border-border/60 hover:border-border transition-all duration-150 cursor-pointer shadow-2xs"
                  >
                    {isFileExpired ? "Close" : "Cancel"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateShare}
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
            </div>
          ) : (
            <div className="space-y-3.5">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>
                  Share link active! Anyone with this link can access the file within the
                  expiration window.
                </span>
              </div>

              {/* Realtime Stats & QR Code Action Strip */}
              <div className="p-3 rounded-xl bg-muted/40 border border-border flex flex-wrap items-center justify-between gap-2.5 text-xs">
                <div className="flex items-center gap-3 flex-wrap">
                  <ExpiryStatusBadge expiresAt={shareResult.expires_at} />
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

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setAnalyticsFile(file)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 transition cursor-pointer flex-1 sm:flex-initial"
                    title="View File Analytics"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>View Analytics</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowQrCode(!showQrCode)}
                    className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer flex-1 sm:flex-initial ${
                      showQrCode
                        ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
                        : "bg-background hover:bg-muted text-foreground border-border hover:border-blue-500/40 shadow-2xs"
                    }`}
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>{showQrCode ? "Hide QR" : "QR Code"}</span>
                  </button>
                </div>
              </div>

              {/* QR Code display */}
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
                      Point your mobile phone camera at this QR code to instantly open or download
                      this file on mobile. Computed 100% in your browser without any network delays.
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
                  <Send className="w-3.5 h-3.5 text-blue-500" />
                  <span>1-Click Instant Sharing</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                      `Download "${file.sanitized_name}" securely on GPHost: ${shareResult.shareUrl}`
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
                      shareResult.shareUrl
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
                      `Hi,\n\nI have shared "${file.sanitized_name}" with you via GPHost.\n\nYou can access or download it here:\n${shareResult.shareUrl}\n\nThis link will automatically expire based on the security settings.\n`
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
                      navigator.clipboard.writeText(
                        `[${file.sanitized_name}](${shareResult.shareUrl})`
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
                {/* Primary Direct Link */}
                <div className="space-y-2 p-3.5 rounded-xl bg-card border border-border/90 hover:border-blue-500/40 shadow-xs transition-colors flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                          <span>Direct Link</span>
                          <InfoTooltip
                            variant="info"
                            title="Direct Share Page (Interactive Preview)"
                            content="The rich landing page for human recipients. Includes in-browser media players, file size, download button, and view analytics."
                          />
                        </label>
                        {shareResult.is_custom_slug && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                            Custom Slug
                          </span>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 font-medium bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20 font-mono">
                        Primary Link
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug mb-2">
                      Interactive web page with rich media preview &amp; download controls.
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={shareResult.shareUrl}
                        className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-muted/40 border border-border text-xs text-foreground font-mono select-all focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => {
                          if (shareResult.shareUrl) {
                            navigator.clipboard.writeText(shareResult.shareUrl);
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
                {shareResult.rawUrl && (
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
                              content="Pure asset streaming with zero HTML wrapper or website branding. Streams raw binary bytes directly from Cloudflare R2 edge servers with instant edge caching."
                            />
                          </label>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400 font-mono font-medium bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20">
                          0 Vercel Egress
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug mb-2">
                        Permanent hotlink to embed directly in Discord, GitHub READMEs, or blogs.
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={shareResult.rawUrl}
                          className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-background border border-purple-500/30 text-xs text-foreground font-mono select-all focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                        <button
                          onClick={() => {
                            if (shareResult.rawUrl) {
                              navigator.clipboard.writeText(shareResult.rawUrl);
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

                {/* Optional XURL Short Link */}
                {shareResult.xurl?.shortUrl && (
                  <div className="space-y-2 p-3.5 rounded-xl bg-card border border-border/90 hover:border-indigo-500/40 shadow-xs transition-colors flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Globe className="w-3.5 h-3.5 text-blue-500" />
                          <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                            <span>XURL Short Link</span>
                          </label>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 uppercase tracking-wide">
                            3rd-Party
                          </span>
                        </div>
                        <a
                          href="https://xurl.eu.cc"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition cursor-pointer"
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
                          type="text"
                          readOnly
                          value={shareResult.xurl.shortUrl}
                          className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-background border border-border text-xs text-blue-600 dark:text-blue-400 font-mono select-all focus:outline-none"
                        />
                        <button
                          onClick={() => {
                            if (shareResult.xurl?.shortUrl) {
                              navigator.clipboard.writeText(shareResult.xurl.shortUrl);
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
                          href={shareResult.xurl.shortUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 transition cursor-pointer shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-border flex justify-end">
                <button
                  onClick={onClose}
                  className="px-5 py-2 rounded-xl bg-foreground text-background text-xs font-semibold hover:opacity-90 transition cursor-pointer"
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
