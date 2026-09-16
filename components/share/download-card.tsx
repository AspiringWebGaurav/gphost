"use client";

import React, { useState, useEffect } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { useTheme } from "@/components/theme-provider";
import {
  Download,
  Lock,
  AlertTriangle,
  Clock,
  CheckCircle2,
  FileText,
  Flame,
  ShieldCheck,
  Loader2,
  HardDrive,
  Eye,
  ExternalLink,
  Copy,
  Check,
  Image as ImageIcon,
  Info,
  ChevronDown,
  Ban,
} from "lucide-react";
import { type PublicShareMetadata, getPreviewType } from "@/lib/storage/share";
import { formatExpiryBadge } from "@/lib/storage/expiry";

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function getFormatLabel(mimeType: string, filename: string): string {
  const ext = filename.split(".").pop()?.toUpperCase();
  if (mimeType.startsWith("image/")) return `${ext || "IMAGE"} Image`;
  if (mimeType.includes("pdf")) return "PDF Document";
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("rar") || mimeType.includes("7z"))
    return "Compressed Archive";
  if (mimeType.startsWith("video/")) return `${ext || "VIDEO"} Video`;
  if (mimeType.startsWith("audio/")) return `${ext || "AUDIO"} Audio`;
  if (mimeType.startsWith("text/")) return `${ext || "TEXT"} Document`;
  return ext ? `${ext} File` : "Binary File";
}

interface DownloadCardProps {
  slug: string;
  metadata: PublicShareMetadata;
  isSingleUse?: boolean;
  siteKey: string;
  initialPreviewUrl?: string | null;
  initialPreviewType?: "image" | "pdf" | null;
}

export function DownloadCard({
  slug,
  metadata,
  isSingleUse: isSingleUseProp = false,
  siteKey,
  initialPreviewType = null,
}: DownloadCardProps) {
  const { resolvedTheme } = useTheme();
  const isSingleUse = Boolean(isSingleUseProp);
  const [isUnlocked, setIsUnlocked] = useState(!metadata.is_password_protected);
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [copiedFilename, setCopiedFilename] = useState(false);
  const [showLifecycle, setShowLifecycle] = useState(false);

  // Live real-time expiration tracker
  const [expiryBadge, setExpiryBadge] = useState(() =>
    metadata.expires_at ? formatExpiryBadge(metadata.expires_at) : null
  );

  useEffect(() => {
    if (!metadata.expires_at) return;
    const update = () => {
      setExpiryBadge(formatExpiryBadge(metadata.expires_at));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [metadata.expires_at]);

  const isTimeExpired = Boolean(expiryBadge?.isExpired);

  // Resolved preview format
  const resolvedPreviewType =
    initialPreviewType || getPreviewType(metadata.mime_type, metadata.filename);

  // Download state
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [leaseSeconds, setLeaseSeconds] = useState<number | null>(null);
  const [isSingleUseClaimed, setIsSingleUseClaimed] = useState(false);

  // 90-second countdown lease timer
  useEffect(() => {
    if (leaseSeconds === null || leaseSeconds <= 0) return;
    const timer = setInterval(() => {
      setLeaseSeconds((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [leaseSeconds]);

  const handleCopyFilename = () => {
    navigator.clipboard.writeText(metadata.filename);
    setCopiedFilename(true);
    setTimeout(() => setCopiedFilename(false), 2000);
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setUnlockError("Please enter the password.");
      return;
    }
    if (!turnstileToken) {
      setUnlockError("Please complete the security challenge.");
      return;
    }

    try {
      setUnlocking(true);
      setUnlockError(null);

      const res = await fetch(`/api/share/${encodeURIComponent(slug)}/verify-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, turnstileToken }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setUnlockError(data.error || "Password verification failed");
        setUnlocking(false);
        return;
      }

      setIsUnlocked(true);
      setUnlocking(false);
    } catch {
      setUnlockError("Network error verifying password. Please try again.");
      setUnlocking(false);
    }
  };

  const handleDownload = async () => {
    if (claiming || isSingleUseClaimed || isTimeExpired) return;

    try {
      setClaiming(true);
      setClaimError(null);

      const res = await fetch(`/api/share/${encodeURIComponent(slug)}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (res.status === 401 && data.code === "PASSWORD_REQUIRED") {
          setIsUnlocked(false);
          setUnlockError("Session expired. Please unlock the file again.");
        } else {
          setClaimError(data.error || "Failed to claim download slot");
        }
        setClaiming(false);
        return;
      }

      // Download slot claimed successfully!
      setDownloadSuccess(true);
      setLeaseSeconds(data.expires_in_seconds || 90);

      if (isSingleUse) {
        setIsSingleUseClaimed(true);
      }

      // Trigger browser download via presigned GET URL
      const a = document.createElement("a");
      a.href = data.downloadUrl;
      a.download = data.filename || metadata.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setClaiming(false);
    } catch {
      setClaimError("Network error requesting download. Please try again.");
      setClaiming(false);
    }
  };

  const hasPreview = Boolean(isUnlocked && resolvedPreviewType && !isTimeExpired);
  const formatTitle = getFormatLabel(metadata.mime_type, metadata.filename);

  return (
    <div className="w-full flex-1 flex flex-col lg:grid lg:grid-cols-12 overflow-hidden">
      {/* ======================================================== */}
      {/* LEFT PANE: File Spotlight (Desktop: Left-Stacked)         */}
      {/* ======================================================== */}
      <div className="flex-1 lg:col-span-7 xl:col-span-8 flex flex-col justify-between p-4 sm:p-6 lg:p-12 xl:p-16 lg:border-r border-border/40 relative">
        {/* Top Status Row */}
        <div className="flex items-center justify-between gap-3 shrink-0 mb-3 lg:mb-0">
          <div className="flex items-center gap-2">
            {isTimeExpired ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                <Clock className="w-3 h-3" />
                Expired &amp; Purged
              </span>
            ) : isUnlocked ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Ready to download
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <Lock className="w-3 h-3" />
                Password Protected
              </span>
            )}

            {isSingleUse && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                <Flame className="w-3 h-3" />
                Single-Use
              </span>
            )}
          </div>

          {expiryBadge && (
            <span
              className={`text-xs flex items-center gap-1 font-medium ${
                isTimeExpired
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-muted-foreground"
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span>{expiryBadge.label}</span>
            </span>
          )}
        </div>

        {/* Center: Hero File Focus (Full Show, Dynamically Flexed, Stacked on Left on Desktop) */}
        <div className="flex-1 flex flex-col items-center justify-center text-center lg:items-start lg:text-left lg:justify-center my-auto py-3 sm:py-6 max-w-3xl w-full">
          {/* File Icon */}
          <div
            className={`w-14 h-14 sm:w-20 sm:h-20 lg:w-24 lg:h-24 rounded-2xl sm:rounded-3xl border flex items-center justify-center shrink-0 mb-3 sm:mb-6 transition-transform hover:scale-105 duration-300 ${
              isTimeExpired
                ? "bg-muted border-border text-muted-foreground"
                : resolvedPreviewType === "image"
                ? "bg-purple-500/10 border-purple-500/25 text-purple-600 dark:text-purple-400"
                : resolvedPreviewType === "pdf"
                ? "bg-rose-500/10 border-rose-500/25 text-rose-600 dark:text-rose-400"
                : "bg-blue-500/10 border-blue-500/25 text-blue-600 dark:text-blue-400"
            }`}
          >
            {resolvedPreviewType === "image" ? (
              <ImageIcon className="w-7 h-7 sm:w-10 sm:h-10 lg:w-12 lg:h-12" />
            ) : resolvedPreviewType === "pdf" ? (
              <FileText className="w-7 h-7 sm:w-10 sm:h-10 lg:w-12 lg:h-12" />
            ) : (
              <FileText className="w-7 h-7 sm:w-10 sm:h-10 lg:w-12 lg:h-12" />
            )}
          </div>

          {/* Filename with copy button - Full Show, Dynamic Flex, Stacked Vertically */}
          <div className="w-full flex items-start justify-center lg:justify-start gap-2 sm:gap-2.5 mb-3 sm:mb-4">
            <h1 className="text-lg sm:text-2xl lg:text-3xl xl:text-4xl font-bold tracking-tight text-foreground [overflow-wrap:anywhere] break-words select-all leading-tight">
              {metadata.filename}
            </h1>
            <button
              type="button"
              onClick={handleCopyFilename}
              className="p-1.5 sm:p-2 mt-0.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 transition shrink-0 cursor-pointer"
              title={copiedFilename ? "Copied!" : "Copy filename"}
              aria-label="Copy filename"
            >
              {copiedFilename ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* File Spec Pills */}
          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-1.5 sm:gap-2 text-xs">
            <span className="inline-flex items-center gap-1 font-mono font-medium px-2.5 py-1 rounded-lg bg-muted text-foreground">
              <HardDrive className="w-3.5 h-3.5 text-muted-foreground" />
              {formatBytes(metadata.byte_size)}
            </span>
            <span className="font-mono bg-muted/80 px-2.5 py-1 rounded-lg font-semibold text-foreground/90 uppercase">
              {metadata.mime_type.split("/")[1] || metadata.mime_type}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-muted/60 text-muted-foreground font-medium">
              {formatTitle}
            </span>
          </div>
        </div>

        {/* Space filler for bottom alignment */}
        <div className="hidden lg:block shrink-0 h-2" />
      </div>

      {/* ======================================================== */}
      {/* RIGHT PANE: Action & Lifecycle Panel                      */}
      {/* ======================================================== */}
      <div className="lg:col-span-5 xl:col-span-4 flex flex-col justify-center lg:justify-between p-3.5 sm:p-6 lg:p-8 xl:p-10 bg-transparent lg:bg-muted/15 dark:lg:bg-muted/5 backdrop-blur-xs border-t border-border/30 lg:border-t-0 shrink-0">
        {/* Transfer details table - visible on desktop, hidden on mobile where pills show info */}
        <div className="hidden lg:block space-y-4">
          <div className="pb-2 border-b border-border/40">
            <h2 className="text-sm font-semibold text-foreground">Transfer Details</h2>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>File Size</span>
              <span className="font-mono font-semibold text-foreground">
                {formatBytes(metadata.byte_size)}
              </span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Format</span>
              <span className="font-medium text-foreground">{formatTitle}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Expires</span>
              <span
                className={`font-medium ${
                  isTimeExpired
                    ? "text-rose-600 dark:text-rose-400 font-semibold"
                    : "text-foreground"
                }`}
              >
                {expiryBadge ? expiryBadge.label : "Never"}
              </span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Access Limit</span>
              <span className="font-medium text-foreground">
                {isSingleUse
                  ? "Single-Use (1 Burn)"
                  : metadata.max_downloads
                  ? `${metadata.download_count} / ${metadata.max_downloads} claimed`
                  : "Unlimited"}
              </span>
            </div>
          </div>
        </div>

        {/* Action Area: Buttons, Alerts & Lifecycle Accordion */}
        <div className="my-auto lg:my-0 py-2 sm:py-4 space-y-3 max-w-sm mx-auto w-full">
          {/* Post-Expiry Alert */}
          {isTimeExpired && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <Clock className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span>Transfer Expired</span>
              </div>
              <p className="text-[11px] text-rose-600/90 dark:text-rose-400/90 leading-relaxed">
                The time-to-live has elapsed. Cloudflare R2 storage has been automatically scrubbed.
              </p>
            </div>
          )}

          {/* Single-Use Warning */}
          {isSingleUse && !isSingleUseClaimed && !isTimeExpired && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="text-[11px] leading-tight">
                Single-use link: Self-destructs immediately after download.
              </span>
            </div>
          )}

          {/* PASSWORD UNLOCK (When locked & not expired) */}
          {!isUnlocked && !isTimeExpired && (
            <form onSubmit={handleUnlock} className="space-y-3">
              <div className="text-center pb-1">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-1.5">
                  <Lock className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-semibold text-foreground">Passphrase Required</h3>
              </div>

              {unlockError && (
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{unlockError}</span>
                </div>
              )}

              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={unlocking}
                autoFocus
              />

              {siteKey && (
                <div className="flex justify-center scale-90 -my-1">
                  <Turnstile
                    siteKey={siteKey}
                    onSuccess={setTurnstileToken}
                    options={{ theme: resolvedTheme }}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={unlocking || !password}
                className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-muted disabled:text-muted-foreground text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md disabled:cursor-not-allowed"
              >
                {unlocking ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Unlock File</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* UNLOCKED: ACTION BUTTONS */}
          {isUnlocked && (
            <div className="space-y-2.5">
              {claimError && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{claimError}</span>
                </div>
              )}

              {downloadSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Download Started</span>
                  </div>
                  {leaseSeconds !== null && (
                    <p className="text-[11px] font-mono text-muted-foreground">
                      Direct link: <strong>{leaseSeconds}s</strong> remaining
                    </p>
                  )}
                  {isSingleUseClaimed && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                      Single-use download complete. Link destroyed.
                    </p>
                  )}
                </div>
              )}

              {!isSingleUseClaimed ? (
                <div className="space-y-2">
                  {/* Primary Download Button */}
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={claiming || isTimeExpired}
                    className="w-full h-12 sm:h-13 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-muted disabled:text-muted-foreground text-white font-semibold text-sm flex items-center justify-center gap-2.5 shadow-md shadow-blue-600/20 hover:shadow-blue-600/30 transition-all cursor-pointer disabled:cursor-not-allowed active:scale-[0.98]"
                  >
                    {isTimeExpired ? (
                      <>
                        <Clock className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <span>Transfer Expired (Purged)</span>
                      </>
                    ) : claiming ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>Starting Stream...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 shrink-0" />
                        <span>Download</span>
                        <span className="text-xs font-mono font-normal opacity-90 px-1.5 py-0.5 rounded-md bg-white/20 whitespace-nowrap">
                          {formatBytes(metadata.byte_size)}
                        </span>
                      </>
                    )}
                  </button>

                  {/* Secondary Preview Button */}
                  {hasPreview && (
                    <a
                      href={`/f/${slug}/preview`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full h-11 rounded-xl border border-border/80 bg-background hover:bg-muted text-foreground font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
                    >
                      <Eye className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span>Preview in Browser</span>
                      <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
                    </a>
                  )}
                </div>
              ) : (
                <div className="w-full py-3 rounded-xl bg-muted/40 border border-border text-center text-xs text-muted-foreground">
                  Single-use link has expired and burned.
                </div>
              )}
            </div>
          )}

          {/* Transfer Lifecycle & Post-Expiry Policy Accordion (Available on All Screens) */}
          <div className="pt-2 border-t border-border/30">
            <button
              type="button"
              onClick={() => setShowLifecycle(!showLifecycle)}
              className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1 cursor-pointer"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <Info className="w-3.5 h-3.5 text-blue-500" />
                Lifecycle: What happens after expiry?
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  showLifecycle ? "rotate-180" : ""
                }`}
              />
            </button>

            {showLifecycle && (
              <div className="mt-2 p-3 rounded-xl bg-muted/40 border border-border/60 text-xs space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-150 text-left">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                  Ephemeral End-of-Life Scenarios
                </p>
                <div className="space-y-2 text-[11px]">
                  <div className="flex items-start gap-2">
                    <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-foreground">Time Expiry (TTL):</strong>
                      <p className="text-muted-foreground leading-relaxed">
                        Files are automatically scrubbed from Cloudflare R2 edge servers worldwide once the timer expires.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Flame className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-foreground">Single-Use Burn:</strong>
                      <p className="text-muted-foreground leading-relaxed">
                        Single-use files self-destruct immediately upon completion of the first download claim.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Ban className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-foreground">Download Quota:</strong>
                      <p className="text-muted-foreground leading-relaxed">
                        Access closes permanently once the maximum download quota is reached.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-foreground">Zero Retention:</strong>
                      <p className="text-muted-foreground leading-relaxed">
                        No residual backups, IP caches, or server-side logs are ever retained after termination.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Space filler for bottom alignment */}
        <div className="hidden lg:block shrink-0 h-2" />
      </div>
    </div>
  );
}
