"use client";

import React, { useState, useEffect, useSyncExternalStore } from "react";
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
  Lightbulb,
  MessageSquare,
  Archive,
  Globe,
  Users,
  X,
} from "lucide-react";
import { type PublicShareMetadata, getPreviewType } from "@/lib/storage/share";
import { ZipViewerModal } from "@/components/dashboard/zip-viewer-modal";
import { importE2EKey, decryptBuffer, extractE2EKeyFromHash } from "@/lib/crypto/e2e";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useTimeRemaining } from "@/lib/hooks/use-time-remaining";
import { isHtmlDocument } from "@/lib/storage/sanitizer";
import { ExpiryStatusBadge } from "@/components/ui/expiry-status-badge";
import { getBrowserDeviceFingerprint } from "@/lib/security/device-fingerprint";

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
  onePerMember?: boolean;
  siteKey: string;
  initialPreviewUrl?: string | null;
  initialPreviewType?: "image" | "pdf" | null;
  directDownload?: boolean;
  disablePreview?: boolean;
  recipientNote?: string | null;
  passwordHint?: string | null;
}

export function DownloadCard({
  slug,
  metadata,
  isSingleUse: isSingleUseProp = false,
  onePerMember = false,
  siteKey,
  initialPreviewType = null,
  disablePreview = false,
  recipientNote = null,
  passwordHint = null,
}: DownloadCardProps) {
  const { resolvedTheme } = useTheme();
  const isSingleUse = Boolean(isSingleUseProp);
  const [isUnlocked, setIsUnlocked] = useState(!metadata.is_password_protected);
  const [downloadCount, setDownloadCount] = useState<number>(metadata.download_count ?? 0);
  const isOnePerMemberActive = Boolean(onePerMember && !isSingleUse);
  const isTotalCapped = Boolean(
    metadata.max_downloads !== null &&
    !(isOnePerMemberActive && metadata.max_downloads <= 1)
  );
  const [maxDownloads, setMaxDownloads] = useState<number | null>(
    isTotalCapped ? metadata.max_downloads : null
  );
  const [limitReached, setLimitReached] = useState<boolean>(() => {
    return Boolean(
      isTotalCapped &&
      metadata.download_count !== undefined &&
      metadata.download_count >= (metadata.max_downloads ?? 0)
    );
  });
  const [sessionDownloaded, setSessionDownloaded] = useState<boolean>(false);
  const persistedDownloaded = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      window.addEventListener("storage", onStoreChange);
      return () => window.removeEventListener("storage", onStoreChange);
    },
    () => {
      try {
        if (!isOnePerMemberActive) return false;
        return typeof window !== "undefined" && localStorage.getItem(`gphost_downloaded_${slug}`) === "1";
      } catch {
        return false;
      }
    },
    () => false
  );
  const isLifetimeDownloaded = Boolean(isOnePerMemberActive && (sessionDownloaded || persistedDownloaded));
  const [deviceFp, setDeviceFp] = useState<string | null>(null);

  // Deep hardware device pre-flight check across Incognito, Normal, and post-purge sessions:
  // Contacts server with hardware fingerprint (Canvas, WebGL GPU, Audio DSP, CPU).
  // Automatically syncs state so if the database was purged, stale client storage is auto-cleared!
  useEffect(() => {
    if (!isOnePerMemberActive) {
      // If one-per-member is NOT active for this link, clean up any stale localStorage key
      try {
        if (typeof window !== "undefined" && localStorage.getItem(`gphost_downloaded_${slug}`)) {
          localStorage.removeItem(`gphost_downloaded_${slug}`);
          window.dispatchEvent(new Event("storage"));
        }
      } catch {}
      setSessionDownloaded(false);
      return;
    }

    let isMounted = true;
    (async () => {
      try {
        const fp = await getBrowserDeviceFingerprint();
        if (!isMounted) return;
        if (fp) setDeviceFp(fp);

        const res = await fetch(`/api/share/${encodeURIComponent(slug)}/check-claim`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-device-fingerprint": fp,
          },
          body: JSON.stringify({ deviceFingerprint: fp }),
        });

        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;

        if (data.claimed) {
          setSessionDownloaded(true);
          try {
            localStorage.setItem(`gphost_downloaded_${slug}`, "1");
          } catch {}
        } else if (data.claimed === false) {
          // Server confirmed this link has NOT been downloaded by this device!
          // Auto-heal any stale localStorage left over from previous purged links with the same slug.
          try {
            if (localStorage.getItem(`gphost_downloaded_${slug}`)) {
              localStorage.removeItem(`gphost_downloaded_${slug}`);
              window.dispatchEvent(new Event("storage"));
            }
          } catch {}
          setSessionDownloaded(false);
        }
      } catch {
        // Non-blocking fallback
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [slug, isOnePerMemberActive]);

  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [copiedFilename, setCopiedFilename] = useState(false);
  const [showLifecycleModal, setShowLifecycleModal] = useState(false);
  const [showZipViewer, setShowZipViewer] = useState(false);

  const isZip = (metadata.filename || "").toLowerCase().endsWith(".zip") || (metadata.mime_type || "").includes("zip");
  const isHtml = isHtmlDocument(metadata.filename, metadata.mime_type);

  // Live reactive real-time expiration tracker
  const { isExpired: isTimeExpired } = useTimeRemaining(
    metadata.expires_at,
    { warningThresholdMs: 60 * 1000 }
  );

  // Client-side Zero-Trust End-to-End Encryption Key
  const [e2eKey, setE2eKey] = useState<string | null>(() => extractE2EKeyFromHash());

  useEffect(() => {
    const handleHashChange = () => {
      setE2eKey(extractE2EKeyFromHash());
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Resolved preview format
  const resolvedPreviewType = disablePreview
    ? null
    : (initialPreviewType || getPreviewType(metadata.mime_type, metadata.filename));

  // Download state
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadPhase, setDownloadPhase] = useState("");
  const [leaseSeconds, setLeaseSeconds] = useState<number | null>(null);
  const [isSingleUseClaimed, setIsSingleUseClaimed] = useState(false);
  const [downloadCooldown, setDownloadCooldown] = useState<number>(0);

  // Download anti-spam rate limiting cooldown timer (e.g. 5-second cooldown)
  useEffect(() => {
    if (downloadCooldown <= 0) return;
    const timer = setInterval(() => {
      setDownloadCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [downloadCooldown]);

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

    const isLocalhost =
      typeof window !== "undefined" &&
      (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost");

    const token =
      turnstileToken ||
      (process.env.NODE_ENV !== "production" || isLocalhost
        ? "test_turnstile_bypass_token"
        : null);

    if (!token && siteKey) {
      setUnlockError("Please complete the security challenge.");
      return;
    }

    try {
      setUnlocking(true);
      setUnlockError(null);

      const res = await fetch(`/api/share/${encodeURIComponent(slug)}/verify-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, turnstileToken: token }),
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
    if (claiming || downloadCooldown > 0 || isSingleUseClaimed || isTimeExpired || isLifetimeDownloaded || limitReached) {
      if (isLifetimeDownloaded) {
        setClaimError("You have already downloaded this file. Each person can download once.");
      } else if (limitReached) {
        setClaimError("This share link has reached its maximum download limit.");
      } else if (downloadCooldown > 0) {
        setClaimError(`Please wait ${downloadCooldown}s before downloading again.`);
      }
      return;
    }

    try {
      setClaiming(true);
      setClaimError(null);
      setDownloadProgress(25);
      setDownloadPhase("Preparing your download...");

      const t1 = setTimeout(() => {
        setDownloadProgress((prev) => (prev < 60 ? 60 : prev));
        setDownloadPhase("Connecting to secure server...");
      }, 150);

      const fp = deviceFp || (await getBrowserDeviceFingerprint().catch(() => null));
      if (fp && !deviceFp) setDeviceFp(fp);

      const res = await fetch(`/api/share/${encodeURIComponent(slug)}/claim`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(fp ? { "x-device-fingerprint": fp } : {}),
        },
        body: JSON.stringify({ deviceFingerprint: fp }),
      });

      clearTimeout(t1);
      const data = await res.json();

      if (!res.ok || !data.success) {
        setDownloadSuccess(false);
        setDownloadProgress(0);
        setDownloadPhase("");
        if (res.status === 429) {
          const retrySec = data.retryAfter || 5;
          setDownloadCooldown(retrySec);
          setClaimError(data.error || `Too many download requests. Please wait ${retrySec}s.`);
        } else if (res.status === 401 && data.code === "PASSWORD_REQUIRED") {
          setIsUnlocked(false);
          setUnlockError("Session expired. Please unlock the file again.");
        } else if (res.status === 403 && data.code === "ALREADY_DOWNLOADED") {
          if (isOnePerMemberActive) {
            setSessionDownloaded(true);
            try {
              localStorage.setItem(`gphost_downloaded_${slug}`, "1");
            } catch {}
            setClaimError(data.error || "You have already downloaded this file. Each person can download once.");
          } else {
            setClaimError(data.error || "Download limit reached.");
          }
        } else {
          setClaimError(data.error || "Unable to start download. Please try again.");
        }
        setClaiming(false);
        return;
      }

      // Download slot claimed successfully!
      const newCount = typeof data.download_count === "number" ? data.download_count : (downloadCount + 1);
      setDownloadCount(newCount);

      const returnedMaxDownloads = typeof data.max_downloads === "number" ? data.max_downloads : (isTotalCapped ? maxDownloads : null);
      if (returnedMaxDownloads !== maxDownloads) {
        setMaxDownloads(returnedMaxDownloads);
      }

      const isMaxLimitReached = Boolean(
        data.limit_reached ||
        (returnedMaxDownloads !== null && newCount >= returnedMaxDownloads)
      );
      if (isMaxLimitReached) {
        setLimitReached(true);
      }

      if (isSingleUse) {
        setIsSingleUseClaimed(true);
      }

      if (isOnePerMemberActive) {
        setSessionDownloaded(true);
        try {
          localStorage.setItem(`gphost_downloaded_${slug}`, "1");
        } catch {}
      }

      setDownloadSuccess(true);
      setLeaseSeconds(data.expires_in_seconds || 50);
      setDownloadProgress(100);
      setDownloadPhase("Download started! Saving file to your device...");
      setClaiming(false);
      // Enforce anti-spam cooldown so user cannot spam click download
      setDownloadCooldown(5);

      if (e2eKey) {
        setDownloadPhase("Decrypting file on your device...");
        try {
          const fetchRes = await fetch(data.downloadUrl);
          const encryptedBuf = await fetchRes.arrayBuffer();
          const cryptoKey = await importE2EKey(e2eKey);
          const decryptedBuf = await decryptBuffer(encryptedBuf, cryptoKey);
          const blob = new Blob([decryptedBuf], { type: metadata.mime_type });
          const localUrl = URL.createObjectURL(blob);

          const a = document.createElement("a");
          a.href = localUrl;
          a.download = data.filename || metadata.filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(localUrl), 15000);
          setDownloadPhase("Decrypted & saved to disk!");
        } catch (decryptErr) {
          console.error("E2E decryption error:", decryptErr);
          setClaimError("Failed to decrypt file. Invalid or corrupted zero-trust key.");
        }
      } else {
        // Trigger browser download immediately via presigned GET URL
        const a = document.createElement("a");
        a.href = data.downloadUrl;
        a.download = data.filename || metadata.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch {
      setDownloadProgress(0);
      setDownloadPhase("");
      setClaimError("Network error requesting download. Please try again.");
      setClaiming(false);
    }
  };

  const hasPreview = Boolean(!disablePreview && isUnlocked && resolvedPreviewType && !isTimeExpired);
  const formatTitle = getFormatLabel(metadata.mime_type, metadata.filename);

  return (
    <div className="w-full h-full flex-1 flex flex-col overflow-hidden min-h-0">
      {/* ======================================================== */}
      {/* MOBILE VIEW (< lg): Strict One-View, Zero Vertical Scroll */}
      {/* ======================================================== */}
      <div className="lg:hidden flex flex-col justify-between w-full h-full p-3 sm:p-4 overflow-hidden min-h-0">
        {/* Top Status & Expiry Bar */}
        <div className="shrink-0 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {isTimeExpired ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                <Clock className="w-3 h-3" />
                <span>Expired</span>
              </span>
            ) : isSingleUseClaimed ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                <Flame className="w-2.5 h-2.5" />
                <span>1-Time Used</span>
              </span>
            ) : isLifetimeDownloaded ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <CheckCircle2 className="w-3 h-3 text-amber-500" />
                <span>Downloaded</span>
              </span>
            ) : limitReached ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                <Ban className="w-2.5 h-2.5 text-rose-500" />
                <span>Limit Reached</span>
              </span>
            ) : isUnlocked ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Ready to download</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <Lock className="w-3 h-3" />
                <span>Password Protected</span>
              </span>
            )}

            {isSingleUse && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                <Flame className="w-2.5 h-2.5" />
                <span>Single-Use</span>
              </span>
            )}

            {e2eKey && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="w-3 h-3" />
                <span>E2E</span>
              </span>
            )}
          </div>

          <ExpiryStatusBadge expiresAt={metadata.expires_at} />
        </div>

        {/* Center Hero Card (File spotlight & metadata) */}
        <div className="my-auto w-full max-w-sm mx-auto flex flex-col items-center justify-center text-center p-3.5 rounded-2xl bg-card/70 border border-border/70 shadow-xs space-y-2.5">
          {recipientNote && (
            <div className="w-full p-2 rounded-xl bg-blue-500/10 border border-blue-500/25 text-[11px] text-foreground flex items-center gap-2 text-left">
              <MessageSquare className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <p className="truncate text-foreground/90 font-medium">{recipientNote}</p>
            </div>
          )}

          {/* File Icon */}
          <div
            className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 transition-transform ${
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
              <ImageIcon className="w-6 h-6" />
            ) : resolvedPreviewType === "pdf" ? (
              <FileText className="w-6 h-6" />
            ) : (
              <FileText className="w-6 h-6" />
            )}
          </div>

          {/* Filename + Copy */}
          <div className="flex items-center justify-center gap-1.5 max-w-full px-1">
            <h1 className="text-sm font-bold tracking-tight text-foreground truncate max-w-[220px] select-all leading-tight">
              {metadata.filename}
            </h1>
            <button
              type="button"
              onClick={handleCopyFilename}
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition shrink-0 cursor-pointer"
              title="Copy filename"
            >
              {copiedFilename ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* File Spec Pills - Clean, No Redundancies */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 text-[10.5px]">
            <span className="inline-flex items-center gap-1 font-mono font-medium px-2 py-0.5 rounded-md bg-muted text-foreground">
              <HardDrive className="w-3 h-3 text-muted-foreground" />
              {formatBytes(metadata.byte_size)}
            </span>
            <span className="font-mono bg-muted/80 px-2 py-0.5 rounded-md font-semibold text-foreground/90 uppercase">
              {metadata.mime_type.split("/")[1] || metadata.mime_type}
            </span>
            {onePerMember && !isSingleUse && (
              <span className="inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                <Users className="w-3 h-3 text-indigo-500" />
                <span>1 Download per person{maxDownloads ? ` (${downloadCount}/${maxDownloads})` : ""}</span>
              </span>
            )}
            {maxDownloads && !onePerMember && !isSingleUse && (
              <span className="inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                <Download className="w-3 h-3" />
                <span>{downloadCount} / {maxDownloads} DLs</span>
              </span>
            )}
          </div>
        </div>

        {/* Action Controls Area */}
        <div className="shrink-0 w-full max-w-sm mx-auto space-y-2">
          {/* Password unlock if locked */}
          {!isUnlocked && !isTimeExpired && (
            <form onSubmit={handleUnlock} className="space-y-2">
              {unlockError && (
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-[11px] flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{unlockError}</span>
                </div>
              )}

              <input
                type="password"
                data-testid="password-input-mobile"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password to unlock..."
                className="w-full h-10 px-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={unlocking}
              />

              {passwordHint && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10.5px] text-amber-700 dark:text-amber-300">
                  <Lightbulb className="w-3 h-3 text-amber-500 shrink-0" />
                  <span className="truncate">Hint: <strong>{passwordHint}</strong></span>
                </div>
              )}

              {siteKey && (
                <div className="flex justify-center scale-80 -my-2">
                  <Turnstile
                    siteKey={siteKey}
                    onSuccess={setTurnstileToken}
                    options={{ theme: resolvedTheme }}
                  />
                </div>
              )}

              <button
                type="submit"
                data-testid="unlock-button-mobile"
                disabled={unlocking}
                className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-muted disabled:text-muted-foreground text-white text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer shadow-sm"
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

          {/* Unlocked Actions */}
          {isUnlocked && (
            <div className="space-y-2">
              {/* Lifetime downloaded notice (only when not currently showing active downloadSuccess) */}
              {isLifetimeDownloaded && !downloadSuccess && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="text-[11px] leading-snug">
                    You have already downloaded this file on this device. Each person can download once.
                  </span>
                </div>
              )}

              {claimError && !isLifetimeDownloaded && (
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px]">{claimError}</span>
                </div>
              )}

              {/* Active download progress card (compact for mobile) */}
              {(claiming || downloadSuccess) && (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1.5 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {downloadSuccess ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500 shrink-0" />
                      )}
                      <span className="text-[11px] font-semibold text-foreground truncate">
                        {downloadSuccess
                          ? isSingleUse
                            ? "Download Complete (1-Time Link Used)"
                            : onePerMember
                            ? "Download Complete (1-Per-Person Claimed)"
                            : "Download Complete"
                          : downloadPhase || "Downloading..."}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                      {downloadProgress}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${Math.max(4, downloadProgress)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Primary Download Button */}
              {!isSingleUseClaimed ? (
                <button
                  type="button"
                  data-testid="download-button-mobile"
                  onClick={handleDownload}
                  disabled={claiming || downloadCooldown > 0 || isTimeExpired || isLifetimeDownloaded || limitReached}
                  className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-muted disabled:text-muted-foreground text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.98] cursor-pointer"
                >
                  {isTimeExpired ? (
                    <>
                      <Clock className="w-3.5 h-3.5" />
                      <span>Link Expired</span>
                    </>
                  ) : isLifetimeDownloaded ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
                      <span>Already Downloaded</span>
                    </>
                  ) : limitReached ? (
                    <>
                      <Ban className="w-3.5 h-3.5 text-rose-500" />
                      <span>Download Limit Reached</span>
                    </>
                  ) : claiming ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Preparing Download...</span>
                    </>
                  ) : downloadCooldown > 0 ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Download Started ({downloadCooldown}s)</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>{downloadSuccess ? "Download Again" : "Download File"}</span>
                      <span className="text-[11px] font-mono opacity-80 px-1.5 py-0.5 rounded bg-white/20">
                        {formatBytes(metadata.byte_size)}
                      </span>
                    </>
                  )}
                </button>
              ) : (
                <div className="w-full py-2.5 rounded-xl bg-muted/40 border border-border text-center text-[11px] text-muted-foreground">
                  This 1-time link has already been used and deleted.
                </div>
              )}

              {/* Secondary Actions (Preview / ZIP / Site) in a single compact row */}
              {(hasPreview || isZip || isHtml) && !isSingleUseClaimed && !isTimeExpired && (
                <div className="flex items-center gap-2">
                  {hasPreview && (
                    <a
                      href={`/f/${slug}/preview`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 h-9 rounded-xl border border-border bg-background hover:bg-muted text-foreground text-xs font-medium flex items-center justify-center gap-1.5 transition shadow-2xs"
                    >
                      <Eye className="w-3.5 h-3.5 text-blue-500" />
                      <span>Preview</span>
                      <ExternalLink className="w-2.5 h-2.5 text-muted-foreground" />
                    </a>
                  )}
                  {isZip && (
                    <button
                      type="button"
                      onClick={() => setShowZipViewer(true)}
                      className="flex-1 h-9 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-medium flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      <span>View ZIP</span>
                    </button>
                  )}
                  {isHtml && (
                    <a
                      href={`/site/${slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 h-9 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 text-xs font-medium flex items-center justify-center gap-1.5 transition shadow-2xs"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>Live Site</span>
                      <ExternalLink className="w-2.5 h-2.5 text-cyan-500" />
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Mobile Lifecycle Button */}
          <div className="pt-1 flex items-center justify-center">
            <button
              type="button"
              onClick={() => setShowLifecycleModal(true)}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition cursor-pointer"
            >
              <Info className="w-3 h-3 text-blue-500" />
              <span>What happens to your file after expiry?</span>
            </button>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* DESKTOP VIEW (lg+): Spacious 2-Column Split Layout        */}
      {/* ======================================================== */}
      <div className="hidden lg:grid lg:grid-cols-12 w-full h-full flex-1 overflow-hidden min-h-0">
        {/* LEFT PANE: File Spotlight (Desktop) */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col justify-between p-8 xl:p-12 border-r border-border/40 relative overflow-hidden">
          {/* Top Status Row */}
          <div className="flex items-center justify-between gap-3 shrink-0 mb-4">
            <div className="flex items-center gap-2">
              {isTimeExpired ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                  <Clock className="w-3 h-3" />
                  Expired &amp; Deleted
                </span>
              ) : isSingleUseClaimed ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                  <Flame className="w-3 h-3" />
                  1-Time Link Used
                </span>
              ) : isLifetimeDownloaded ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <CheckCircle2 className="w-3 h-3 text-amber-500" />
                  Downloaded
                </span>
              ) : limitReached ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                  <Ban className="w-3 h-3 text-rose-500" />
                  Limit Reached
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

              {e2eKey && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Zero-Trust E2E</span>
                  <InfoTooltip
                    variant="emerald"
                    title="Zero-Trust End-to-End Encryption"
                    content="This file was encrypted locally on the sender's device before upload. Your browser decrypts it directly in memory using the private key from your URL fragment (#key=...). GPHost servers never had access to the unencrypted file."
                  />
                </span>
              )}
            </div>

            <ExpiryStatusBadge expiresAt={metadata.expires_at} />
          </div>

          {/* Center: Hero File Focus */}
          <div className="flex-1 flex flex-col items-start justify-center text-left my-auto py-6 max-w-3xl w-full">
            {recipientNote && (
              <div className="w-full max-w-xl mb-4 p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/25 text-xs text-foreground flex items-start gap-2.5 text-left animate-in fade-in duration-200">
                <MessageSquare className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <div className="space-y-0.5 min-w-0">
                  <div className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                    Note from sender
                  </div>
                  <p className="text-[12px] text-foreground/90 leading-relaxed [overflow-wrap:anywhere] break-words">
                    {recipientNote}
                  </p>
                </div>
              </div>
            )}

            {/* File Icon */}
            <div
              className={`w-20 h-20 xl:w-24 xl:h-24 rounded-3xl border flex items-center justify-center shrink-0 mb-6 transition-transform hover:scale-105 duration-300 ${
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
                <ImageIcon className="w-10 h-10 xl:w-12 xl:h-12" />
              ) : resolvedPreviewType === "pdf" ? (
                <FileText className="w-10 h-10 xl:w-12 xl:h-12" />
              ) : (
                <FileText className="w-10 h-10 xl:w-12 xl:h-12" />
              )}
            </div>

            {/* Filename with copy button */}
            <div className="w-full flex items-start justify-start gap-2.5 mb-4">
              <h1 className="text-2xl xl:text-3xl font-bold tracking-tight text-foreground [overflow-wrap:anywhere] break-words select-all leading-tight">
                {metadata.filename}
              </h1>
              <button
                type="button"
                onClick={handleCopyFilename}
                className="p-2 mt-0.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 transition shrink-0 cursor-pointer"
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

            {/* File Spec Pills - Clean, No Redundancies */}
            <div className="flex flex-wrap items-center justify-start gap-2 text-xs">
              <span className="inline-flex items-center gap-1 font-mono font-medium px-2.5 py-1 rounded-lg bg-muted text-foreground">
                <HardDrive className="w-3.5 h-3.5 text-muted-foreground" />
                {formatBytes(metadata.byte_size)}
              </span>
              <span className="font-mono bg-muted/80 px-2.5 py-1 rounded-lg font-semibold text-foreground/90 uppercase">
                {metadata.mime_type.split("/")[1] || metadata.mime_type}
              </span>
              {onePerMember && !isSingleUse && (
                <span className="inline-flex items-center gap-1 font-semibold px-2.5 py-1 rounded-lg bg-indigo-500/10 dark:bg-indigo-500/20 border border-indigo-500/25 text-indigo-600 dark:text-indigo-400 shadow-2xs">
                  <Users className="w-3 h-3 text-indigo-500" />
                  <span>1 Download per person{maxDownloads ? ` (${downloadCount}/${maxDownloads})` : ""}</span>
                </span>
              )}
              {maxDownloads && !onePerMember && !isSingleUse && (
                <span className="inline-flex items-center gap-1 font-medium px-2.5 py-1 rounded-lg bg-muted text-muted-foreground">
                  <Download className="w-3.5 h-3.5" />
                  <span>{downloadCount} / {maxDownloads} downloads</span>
                </span>
              )}
            </div>
          </div>

          <div className="shrink-0 h-2" />
        </div>

        {/* RIGHT PANE: Action & Lifecycle Panel (Desktop) */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col justify-between p-8 xl:p-10 bg-muted/15 dark:bg-muted/5 backdrop-blur-xs shrink-0 overflow-hidden">
          {/* Transfer details table */}
          <div className="space-y-4">
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
                <ExpiryStatusBadge expiresAt={metadata.expires_at} />
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Access Limit</span>
                <span className="font-medium text-foreground">
                  {isSingleUse
                    ? "1 download (Single-use)"
                    : onePerMember
                    ? maxDownloads
                      ? `1 download per person (${downloadCount}/${maxDownloads})`
                      : "1 download per person"
                    : maxDownloads
                    ? `${downloadCount} / ${maxDownloads} downloads`
                    : "Unlimited downloads"}
                </span>
              </div>
            </div>
          </div>

          {/* Action Area: Buttons, Alerts & Lifecycle */}
          <div className="my-auto py-4 space-y-3 max-w-sm mx-auto w-full">
            {/* Post-Expiry Alert */}
            {isTimeExpired && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <Clock className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  <span>Transfer Expired</span>
                </div>
                <p className="text-[11px] text-rose-600/90 dark:text-rose-400/90 leading-relaxed">
                  The time limit for this link has ended. This file was automatically and permanently deleted.
                </p>
              </div>
            )}

            {/* Single-Use Warning */}
            {isSingleUse && !isSingleUseClaimed && !isTimeExpired && (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="text-[11px] leading-tight">
                  1-time link: Deletes permanently right after downloading.
                </span>
              </div>
            )}

            {/* PASSWORD UNLOCK */}
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
                  data-testid="password-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={unlocking}
                  autoFocus
                />

                {passwordHint && (
                  <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-300">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="min-w-0 [overflow-wrap:anywhere] break-words">
                      Hint: <strong className="font-semibold text-foreground">{passwordHint}</strong>
                    </span>
                  </div>
                )}

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
                  data-testid="unlock-button"
                  disabled={unlocking}
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
                {onePerMember && !isSingleUse && !isLifetimeDownloaded && !isTimeExpired && (
                  <div className="p-3 sm:p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/25 text-foreground text-xs space-y-1 shadow-2xs">
                    <div className="flex items-center gap-1.5 font-semibold text-indigo-600 dark:text-indigo-400">
                      <Users className="w-4 h-4 shrink-0" />
                      <span>1 Download</span>
                    </div>
                    <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                      Each person can download this file once.
                    </p>
                  </div>
                )}

                {/* Lifetime downloaded notice (only when not currently showing active downloadSuccess) */}
                {isLifetimeDownloaded && !downloadSuccess && (
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-950 dark:text-amber-200 text-xs space-y-1.5 shadow-2xs animate-in fade-in">
                    <div className="flex items-center gap-2 font-semibold text-amber-600 dark:text-amber-400 text-xs sm:text-sm">
                      <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>Already Downloaded</span>
                    </div>
                    <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                      You have already downloaded this file on this device. Each person can download once.
                    </p>
                  </div>
                )}

                {claimError && !isLifetimeDownloaded && (
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{claimError}</span>
                  </div>
                )}

                {/* Active Download Progress Card */}
                {(claiming || downloadSuccess) && (
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-card via-card to-card/90 border border-emerald-500/30 p-4 shadow-lg shadow-emerald-500/5 backdrop-blur-sm space-y-3 transition-all">
                    <div className="relative flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 shadow-xs">
                          {downloadSuccess ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">
                            {downloadSuccess
                              ? isSingleUse
                                ? "Download Complete (1-Time Link Used)"
                                : "Download Complete"
                              : "Preparing Download"}
                          </p>
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium truncate">
                            {downloadPhase || (downloadSuccess ? "File saved to your device!" : "Connecting to server...")}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-baseline gap-0.5 px-2.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 shadow-xs">
                          <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                            {downloadProgress}
                          </span>
                          <span className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 font-bold">%</span>
                        </div>
                      </div>
                    </div>

                    <div className="relative w-full h-2.5 rounded-full bg-muted/60 dark:bg-zinc-800/80 p-0.5 border border-border/70 dark:border-white/10 overflow-hidden">
                      <div
                        className="relative h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-300 ease-out"
                        style={{ width: `${Math.max(3, downloadProgress)}%` }}
                      />
                    </div>
                  </div>
                )}

                {!isSingleUseClaimed ? (
                  <div className="space-y-2">
                    {/* Primary Download Button */}
                    <button
                      type="button"
                      data-testid="download-button"
                      onClick={handleDownload}
                      disabled={claiming || downloadCooldown > 0 || isTimeExpired || isLifetimeDownloaded || limitReached}
                      className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-muted disabled:text-muted-foreground text-white font-semibold text-sm flex items-center justify-center gap-2.5 shadow-md shadow-blue-600/20 hover:shadow-blue-600/30 transition-all cursor-pointer disabled:cursor-not-allowed active:scale-[0.98]"
                    >
                      {isTimeExpired ? (
                        <>
                          <Clock className="w-4 h-4 shrink-0 text-muted-foreground" />
                          <span>Link Expired</span>
                        </>
                      ) : isLifetimeDownloaded ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 shrink-0 text-amber-500" />
                          <span>Already Downloaded</span>
                        </>
                      ) : limitReached ? (
                        <>
                          <Ban className="w-4 h-4 shrink-0 text-rose-500" />
                          <span>Download Limit Reached</span>
                        </>
                      ) : claiming ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                          <span>Preparing Download...</span>
                        </>
                      ) : downloadCooldown > 0 ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                          <span>Download Started — Ready in {downloadCooldown}s</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 shrink-0" />
                          <span>{downloadSuccess ? "Download Again" : "Download File"}</span>
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
                        className="w-full h-10 rounded-xl border border-border/80 bg-background hover:bg-muted text-foreground font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span>Preview in Browser</span>
                        <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
                      </a>
                    )}

                    {/* Client-Side ZIP Archive Inspector */}
                    {isZip && !isTimeExpired && (
                      <button
                        type="button"
                        onClick={() => setShowZipViewer(true)}
                        className="w-full h-10 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        <span>Browse ZIP Files (Without Downloading)</span>
                      </button>
                    )}

                    {/* GP-Sites: 1-Click Static Web Preview */}
                    {isHtml && !isTimeExpired && (
                      <a
                        href={`/site/${slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full h-10 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span>Open Live Webpage</span>
                        <ExternalLink className="w-3 h-3 text-cyan-500/70" />
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="w-full py-3 rounded-xl bg-muted/40 border border-border text-center text-xs text-muted-foreground">
                    This 1-time link has already been used and deleted.
                  </div>
                )}
              </div>
            )}

            {/* Transfer Lifecycle Button */}
            <div className="pt-2 border-t border-border/30">
              <button
                type="button"
                onClick={() => setShowLifecycleModal(true)}
                className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1 cursor-pointer"
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <Info className="w-3.5 h-3.5 text-blue-500" />
                  What happens to your file after expiry?
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>

          <div className="shrink-0 h-2" />
        </div>
      </div>

      {/* Lifecycle & Security Policy Modal */}
      {showLifecycleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl p-5 shadow-xl space-y-4 animate-in zoom-in-95 duration-150 relative">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-foreground">How Your File Stays Safe</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLifecycleModal(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-foreground">Automatic Deletion:</strong>
                  <p className="text-muted-foreground leading-relaxed text-[11.5px]">
                    Your file is permanently deleted from our servers as soon as time runs out. No one can download it anymore.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Flame className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-foreground">1-Time Download Links:</strong>
                  <p className="text-muted-foreground leading-relaxed text-[11.5px]">
                    If a 1-time link was created, the file automatically deletes itself as soon as the first download finishes.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Ban className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-foreground">Download Limit:</strong>
                  <p className="text-muted-foreground leading-relaxed text-[11.5px]">
                    If the sender set a download limit, access permanently closes once that number of downloads is reached.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-foreground">No Copies Saved:</strong>
                  <p className="text-muted-foreground leading-relaxed text-[11.5px]">
                    We never keep hidden copies, backups, or logs. Once deleted, your file is gone forever.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowLifecycleModal(false)}
              className="w-full py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Client-Side In-Browser ZIP Archive Inspector Modal */}
      {showZipViewer && (
        <ZipViewerModal
          filename={metadata.filename}
          fileSource={`/raw/${slug}`}
          onClose={() => setShowZipViewer(false)}
        />
      )}
    </div>
  );
}
