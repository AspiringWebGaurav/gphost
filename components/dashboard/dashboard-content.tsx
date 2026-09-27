"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  UploadCloud,
  HardDrive,
  Files,
  Link as LinkIcon,
  Download,
  Plus,
  Clock,
} from "lucide-react";
import { FileList, FileItem } from "@/components/dashboard/file-list";
import {
  ApprovalWelcomeBanner,
  ApprovalWelcomeInfo,
} from "@/components/dashboard/approval-welcome-banner";
import { useStorageSync } from "@/components/storage/storage-context";
import { storageEvents } from "@/lib/storage/events";

interface DashboardStats {
  totalFiles: number;
  activeLinks: number;
  totalDownloads: number;
}

interface DashboardContentProps {
  initialFiles: FileItem[];
  welcomeInfo?: ApprovalWelcomeInfo;
  stats?: DashboardStats;
  profile: {
    full_name: string | null;
    email: string;
    role: "user" | "admin";
    quota_bytes: number;
    storage_used_bytes: number;
    reserved_bytes: number;
    can_create_permanent: boolean;
    max_files?: number | null;
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function DashboardContent({
  initialFiles,
  profile,
  welcomeInfo,
  stats,
}: DashboardContentProps) {
  const router = useRouter();
  const [files, setFiles] = useState<FileItem[]>(initialFiles);
  const [overrideStats, setOverrideStats] = useState<DashboardStats | null>(null);
  const [prevStats, setPrevStats] = useState(stats);
  if (stats !== prevStats) {
    setPrevStats(stats);
    setOverrideStats(null);
  }

  const dashboardStats = overrideStats || stats || {
    totalFiles: initialFiles.length,
    activeLinks: 0,
    totalDownloads: 0,
  };

  const liveStorage = useStorageSync();

  const isAdmin = profile.role === "admin";
  const isPremium =
    isAdmin ||
    profile.can_create_permanent ||
    profile.quota_bytes === -1 ||
    profile.quota_bytes > 5368709120;

  const refreshData = useCallback(async () => {
    try {
      const res = await fetch("/api/files", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
        if (data.stats) {
          setOverrideStats(data.stats);
        }
      }
    } catch (err) {
      console.error("Failed to refresh dashboard data:", err);
    }
  }, []);

  // Listen to typed live storage & file events
  useEffect(() => {
    const unsubStorage = storageEvents.on("storage:updated", () => {
      refreshData();
    });
    const unsubLifecycle = storageEvents.on("file:lifecycle", () => {
      refreshData();
    });

    return () => {
      unsubStorage();
      unsubLifecycle();
    };
  }, [refreshData]);

  const handleFileDeleted = useCallback(() => {
    refreshData();
    if (liveStorage) {
      liveStorage.broadcastStorageUpdate();
    }
  }, [refreshData, liveStorage]);

  // Compute storage percent
  const storageUsed = liveStorage?.storageUsedBytes ?? profile.storage_used_bytes;
  const quota = profile.quota_bytes;
  const storagePercent =
    quota === -1 ? 0 : Math.min(100, Math.round((storageUsed / Math.max(1, quota)) * 100));

  return (
    <div className="space-y-3 sm:space-y-3.5 max-w-5xl w-full mx-auto" data-testid="dashboard-container">
      {/* 1. Dashboard Identity / Header — Overview Title & Direct Tab Redirects */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-1 border-b border-border/60">
        <div className="space-y-0.5 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground truncate" data-testid="dashboard-header-title">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground truncate">
            Welcome back, <span className="text-foreground font-semibold">{profile.full_name || profile.email.split("@")[0]}</span>. Here is your storage and sharing overview.
          </p>
        </div>

        {/* Quick Navigation Shortcuts — Direct Tab Redirects */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/upload?pick=1"
            onClick={() => {
              if (typeof window !== "undefined") {
                sessionStorage.setItem("gphost_auto_pick", Date.now().toString());
              }
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Upload File</span>
          </Link>
          <Link
            href="/files"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-muted/60 hover:bg-muted text-foreground text-sm font-semibold border border-border transition cursor-pointer"
          >
            <Files className="w-4 h-4 text-muted-foreground" />
            <span>All Files</span>
          </Link>
        </div>
      </div>

      {/* 2. Key Metrics Grid — Compact & High Scannability */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3" data-testid="metrics-overview">
        {/* Storage Used Card */}
        <div className="p-3 sm:p-3.5 rounded-2xl bg-card border border-border shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Storage</span>
            <HardDrive className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-foreground leading-tight">
            {formatBytes(storageUsed)}
          </div>
          <div className="space-y-1">
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  storagePercent > 90
                    ? "bg-rose-500"
                    : storagePercent > 75
                    ? "bg-amber-500"
                    : "bg-blue-600"
                }`}
                style={{ width: `${storagePercent}%` }}
              />
            </div>
            <div className="text-xs font-medium text-muted-foreground flex justify-between">
              <span>{storagePercent}% used</span>
              <span>{quota === -1 ? "Unlimited" : formatBytes(quota)}</span>
            </div>
          </div>
        </div>

        {/* Active Files Card */}
        <Link
          href="/files"
          className="p-3 sm:p-3.5 rounded-2xl bg-card border border-border hover:border-blue-500/40 shadow-2xs hover:shadow-xs transition space-y-1.5 group cursor-pointer"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Active Files</span>
            <Files className="w-4 h-4 text-emerald-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-foreground leading-tight">
            {dashboardStats.totalFiles ?? files.length}
          </div>
          <div className="text-xs text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1">
            <span>Manage files</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </Link>

        {/* Share Links Card */}
        <Link
          href="/links"
          className="p-3 sm:p-3.5 rounded-2xl bg-card border border-border hover:border-indigo-500/40 shadow-2xs hover:shadow-xs transition space-y-1.5 group cursor-pointer"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Share Links</span>
            <LinkIcon className="w-4 h-4 text-indigo-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-foreground leading-tight">
            {dashboardStats.activeLinks}
          </div>
          <div className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1">
            <span>View active links</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </Link>

        {/* Total Downloads Card */}
        <div className="p-3 sm:p-3.5 rounded-2xl bg-card border border-border shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Downloads</span>
            <Download className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-foreground leading-tight">
            {dashboardStats.totalDownloads}
          </div>
          <div className="text-xs font-medium text-muted-foreground">
            Direct secure transfers
          </div>
        </div>
      </div>

      {/* Admin Approval Banner (Regular approved users only) */}
      {!isAdmin && welcomeInfo && (
        <ApprovalWelcomeBanner
          info={welcomeInfo}
          onUploadClick={() => {
            if (typeof window !== "undefined") {
              sessionStorage.setItem("gphost_auto_pick", Date.now().toString());
            }
            router.push("/upload?pick=1");
          }}
        />
      )}

      {/* 3. Recent Files Section — Compact Overview View */}
      <div className="rounded-2xl bg-card border border-border p-3.5 sm:p-4 shadow-2xs space-y-2.5" data-testid="recent-files-section">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-foreground">Recent Files ({files.length})</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">Manage, share, and track analytics for your files</p>
          </div>
          <Link
            href="/files"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold"
          >
            <span>View all in Files</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <FileList
          files={files}
          onFileDeleted={handleFileDeleted}
          hideHeader={true}
          maxHeight="max-h-[190px]"
          isPremium={isPremium}
        />
      </div>

      {/* 4. Quick Actions / Feature Navigation Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3" data-testid="overview-quick-actions">
        <Link
          href="/upload?pick=1"
          onClick={() => {
            if (typeof window !== "undefined") {
              sessionStorage.setItem("gphost_auto_pick", Date.now().toString());
            }
          }}
          className="p-3 rounded-2xl bg-card border border-border hover:border-blue-500/40 shadow-2xs hover:shadow-xs transition group cursor-pointer flex items-center justify-between"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-foreground truncate">Upload Files</div>
              <p className="text-xs text-muted-foreground truncate">Direct cloud upload up to 1 GB</p>
            </div>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all shrink-0" />
        </Link>

        <Link
          href="/links"
          className="p-3 rounded-2xl bg-card border border-border hover:border-indigo-500/40 shadow-2xs hover:shadow-xs transition group cursor-pointer flex items-center justify-between"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <LinkIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-foreground truncate">Shared Links</div>
              <p className="text-xs text-muted-foreground truncate">Track downloads and passwords</p>
            </div>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all shrink-0" />
        </Link>

        <Link
          href="/expiring"
          className="p-3 rounded-2xl bg-card border border-border hover:border-purple-500/40 shadow-2xs hover:shadow-xs transition group cursor-pointer flex items-center justify-between"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Clock className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-foreground truncate">Expiring Files</div>
              <p className="text-xs text-muted-foreground truncate">Review auto-destruct timers</p>
            </div>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-purple-500 group-hover:translate-x-0.5 transition-all shrink-0" />
        </Link>
      </div>
    </div>
  );
}
