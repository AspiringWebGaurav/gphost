"use client";

import { useState, useEffect } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { useTheme } from "@/components/theme-provider";
import {
  Download,
  Lock,
  Unlock,
  AlertTriangle,
  Clock,
  CheckCircle2,
  FileText,
  Flame,
  ShieldCheck,
  Loader2,
  HardDrive,
} from "lucide-react";
import type { PublicShareMetadata } from "@/lib/storage/share";
import { formatExpiryBadge } from "@/lib/storage/expiry";

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

interface DownloadCardProps {
  slug: string;
  metadata: PublicShareMetadata;
  isSingleUse?: boolean;
  siteKey: string;
}

export function DownloadCard({
  slug,
  metadata,
  isSingleUse: isSingleUseProp = false,
  siteKey,
}: DownloadCardProps) {
  const { resolvedTheme } = useTheme();
  const isSingleUse = Boolean(isSingleUseProp);
  const [isUnlocked, setIsUnlocked] = useState(!metadata.is_password_protected);
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

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
    if (claiming || isSingleUseClaimed) return;

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

  return (
    <div className="w-full max-w-xl mx-auto rounded-2xl bg-card border border-border shadow-xl backdrop-blur-xl overflow-hidden transition-colors">
      {/* File Header */}
      <div className="p-6 sm:p-8 border-b border-border">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 shadow-inner">
            <FileText className="w-7 h-7" />
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate" title={metadata.filename}>
              {metadata.filename}
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 font-mono">
                <HardDrive className="w-3.5 h-3.5" />
                {formatBytes(metadata.byte_size)}
              </span>
              <span>•</span>
              <span className="truncate font-mono bg-muted px-2 py-0.5 rounded text-[11px] text-muted-foreground">
                {metadata.mime_type}
              </span>
            </div>
          </div>
        </div>

        {/* Status Badges */}
        <div className="flex flex-wrap items-center gap-2 mt-5">
          {isSingleUse && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shadow-xs">
              <Flame className="w-3.5 h-3.5" />
              Single-Use Link
            </span>
          )}

          {metadata.is_password_protected && (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                isUnlocked
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
              }`}
            >
              {isUnlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              {isUnlocked ? "Password Unlocked" : "Password Protected"}
            </span>
          )}

          {metadata.expires_at && (() => {
            const badge = formatExpiryBadge(metadata.expires_at);
            return (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                  badge.isExpired
                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                    : "bg-muted text-muted-foreground border-border"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{badge.label}</span>
              </span>
            );
          })()}

          {metadata.max_downloads && !isSingleUse && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
              {metadata.download_count} / {metadata.max_downloads} downloads
            </span>
          )}
        </div>
      </div>

      {/* Body Area */}
      <div className="p-6 sm:p-8 space-y-6">
        {/* Single-Use Warning Notice */}
        {isSingleUse && !isSingleUseClaimed && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs sm:text-sm flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-200">Single-Use Link</p>
              <p className="text-amber-700/80 dark:text-amber-300/80 mt-0.5 leading-relaxed">
                This link can only be downloaded once. After downloading, it will be automatically deleted.
              </p>
            </div>
          </div>
        )}

        {/* Password Lock State */}
        {!isUnlocked && (
          <form onSubmit={handleUnlock} className="space-y-4">
            <div className="text-center sm:text-left">
              <h2 className="text-base font-semibold text-foreground flex items-center justify-center sm:justify-start gap-2">
                <Lock className="w-4 h-4 text-amber-500" />
                Password Required
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                This file is password protected. Enter the password to download.
              </p>
            </div>

            {unlockError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{unlockError}</span>
              </div>
            )}

            <div>
              <label htmlFor="share-password" className="block text-xs font-medium text-muted-foreground mb-1.5">
                Password
              </label>
              <input
                id="share-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password..."
                className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                disabled={unlocking}
                autoFocus
              />
            </div>

            {siteKey && (
              <div className="flex justify-center my-2">
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
              className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-muted disabled:text-muted-foreground text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-600/20 cursor-pointer disabled:cursor-not-allowed"
            >
              {unlocking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Checking password...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Unlock Download
                </>
              )}
            </button>
          </form>
        )}

        {/* Unlocked / Ready to Download State */}
        {isUnlocked && (
          <div className="space-y-4">
            {claimError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs sm:text-sm flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{claimError}</span>
              </div>
            )}

            {downloadSuccess && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs sm:text-sm space-y-2">
                <div className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Download Started
                </div>
                <p className="text-emerald-700/80 dark:text-emerald-300/80 leading-relaxed">
                  Your download has started.
                </p>
                {leaseSeconds !== null && (
                  <div className="flex items-center gap-2 pt-1 font-mono text-xs text-muted-foreground">
                    <Clock className="w-3.5 h-3.5 text-blue-500" />
                    <span>
                      Link valid for:{" "}
                      <strong className="text-blue-600 dark:text-blue-400">{leaseSeconds}s</strong> remaining
                    </span>
                  </div>
                )}
                {isSingleUseClaimed && (
                  <p className="text-xs text-rose-600 dark:text-rose-400 pt-1 font-medium">
                    This was a single-use download. The link has been deleted.
                  </p>
                )}
              </div>
            )}

            {/* Download Claim Button */}
            {!isSingleUseClaimed && (
              <button
                type="button"
                onClick={handleDownload}
                disabled={claiming}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-muted disabled:to-muted disabled:text-muted-foreground text-white text-sm sm:text-base font-semibold flex items-center justify-center gap-2.5 shadow-md shadow-blue-600/20 transition-all cursor-pointer disabled:cursor-not-allowed hover:opacity-95 active:scale-[0.99]"
              >
                {claiming ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Preparing download...
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    Download File
                  </>
                )}
              </button>
            )}

            {isSingleUseClaimed && (
              <div className="w-full py-4 rounded-xl bg-muted/40 border border-border text-center text-xs text-muted-foreground">
                Single-use download complete. This link has expired.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Security Footer */}
      <div className="px-6 py-4 bg-muted/20 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          Direct secure transfer
        </span>
        <span className="font-medium">GPHosting</span>
      </div>
    </div>
  );
}
