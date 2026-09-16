"use client";

import React, { useState, useSyncExternalStore } from "react";
import {
  Sparkles,
  ShieldCheck,
  FileBox,
  HardDrive,
  CheckCircle2,
  X,
  UploadCloud,
  ArrowRight,
  Info,
} from "lucide-react";

export interface ApprovalWelcomeInfo {
  userId: string;
  userName: string;
  userEmail: string;
  maxFiles: number | null;
  quotaBytes: number;
  approvedAt: string | null;
  approvalNote: string | null;
}

interface ApprovalWelcomeBannerProps {
  info: ApprovalWelcomeInfo;
  onUploadClick?: () => void;
}

const emptySubscribe = () => () => {};

function useIsMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

function useStoredDismissal(key: string) {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      window.addEventListener("storage", onStoreChange);
      return () => window.removeEventListener("storage", onStoreChange);
    },
    () => {
      if (typeof window === "undefined") return true;
      try {
        return localStorage.getItem(key) === "true";
      } catch {
        return false;
      }
    },
    () => true
  );
}

export function ApprovalWelcomeBanner({
  info,
  onUploadClick,
}: ApprovalWelcomeBannerProps) {
  const isMounted = useIsMounted();
  const storageKey = `gphost_welcome_dismissed_${info.userId}_${info.approvedAt || "default"}_${info.maxFiles ?? "unlimited"}`;
  const storedDismissed = useStoredDismissal(storageKey);
  const [userDismissed, setUserDismissed] = useState<boolean | null>(null);

  const handleDismiss = () => {
    setUserDismissed(true);
    try {
      localStorage.setItem(storageKey, "true");
    } catch {
      // Ignored
    }
  };

  const handleReopen = () => {
    setUserDismissed(false);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignored
    }
  };

  const dismissed = userDismissed !== null ? userDismissed : storedDismissed;

  if (!isMounted) return null;

  // Format quota
  const quotaDisplay =
    info.quotaBytes === -1
      ? "Unlimited"
      : info.quotaBytes >= 1024 * 1024 * 1024
      ? `${(info.quotaBytes / (1024 * 1024 * 1024)).toFixed(0)} GB`
      : `${Math.round(info.quotaBytes / (1024 * 1024))} MB`;

  // Format files
  const filesDisplay =
    info.maxFiles !== null && info.maxFiles !== undefined && info.maxFiles > 0
      ? `${info.maxFiles} Active Files`
      : "Unlimited Files";

  // If dismissed, render a subtle mini badge that allows reopening
  if (dismissed) {
    return (
      <div className="flex items-center justify-between px-3.5 py-1.5 rounded-xl bg-purple-500/5 border border-purple-500/15 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-600 dark:text-purple-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Admin Approved Vault:</span>
          </span>
          <span className="text-[11px]">
            {filesDisplay} • {quotaDisplay} Storage
          </span>
        </div>
        <button
          type="button"
          onClick={handleReopen}
          className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
        >
          <Info className="w-3 h-3" />
          <span>View Approval Details</span>
        </button>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-purple-500/30 bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-blue-500/10 p-5 sm:p-6 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300 space-y-4">
      {/* Background ambient decorative glow */}
      <div
        className="absolute -top-12 -right-12 w-48 h-48 bg-purple-500/15 rounded-full blur-3xl pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-12 -left-12 w-48 h-48 bg-blue-500/15 rounded-full blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      {/* Header Row */}
      <div className="flex items-start justify-between gap-3 relative z-10">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-purple-500/20 ring-2 ring-purple-500/30 shrink-0 mt-0.5">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 mb-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>Access Request Approved by Administrator</span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
              Welcome to GPHosting, {info.userName}!
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl leading-relaxed">
              Your account has been granted full access to the encrypted cloud vault. The administrator has configured your personalized operational limits below:
            </p>
          </div>
        </div>

        {/* Dismiss Button */}
        <button
          type="button"
          onClick={handleDismiss}
          title="Dismiss welcome message"
          className="text-muted-foreground hover:text-foreground p-1.5 rounded-xl hover:bg-background/80 transition cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Dynamic Limits Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 relative z-10 pt-1">
        {/* Active Files Limit */}
        <div className="p-3.5 rounded-xl bg-background/80 dark:bg-card/80 border border-border/80 shadow-2xs space-y-1">
          <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 text-xs font-semibold">
            <FileBox className="w-4 h-4" />
            <span>File Access Limit</span>
          </div>
          <div className="text-lg font-bold text-foreground font-mono">
            {filesDisplay}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Simultaneous active uploads allowed
          </div>
        </div>

        {/* Storage Quota */}
        <div className="p-3.5 rounded-xl bg-background/80 dark:bg-card/80 border border-border/80 shadow-2xs space-y-1">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-xs font-semibold">
            <HardDrive className="w-4 h-4" />
            <span>Storage Quota</span>
          </div>
          <div className="text-lg font-bold text-foreground font-mono">
            {quotaDisplay}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Total high-speed encrypted storage
          </div>
        </div>

        {/* Vault Status */}
        <div className="p-3.5 rounded-xl bg-background/80 dark:bg-card/80 border border-border/80 shadow-2xs space-y-1">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Vault Security</span>
          </div>
          <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono">
            Active &amp; Ready
          </div>
          <div className="text-[11px] text-muted-foreground">
            Direct browser-to-cloud R2 upload
          </div>
        </div>
      </div>

      {/* Bottom Action Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-purple-500/20 relative z-10">
        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <span>Signed in as:</span>
          <span className="font-mono text-foreground font-medium">{info.userEmail}</span>
          {info.approvedAt && (
            <>
              <span>•</span>
              <span>Approved on {new Date(info.approvedAt).toLocaleDateString()}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDismiss}
            className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-background/80 transition cursor-pointer"
          >
            Got it, thanks
          </button>
          {onUploadClick ? (
            <button
              type="button"
              onClick={onUploadClick}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-[0.98] text-white font-semibold text-xs transition shadow-xs cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Start Uploading</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
