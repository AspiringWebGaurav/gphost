"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowRight,
  UploadCloud,
  HardDrive,
  Files,
  Link as LinkIcon,
  Download,
  LayoutDashboard,
  Plus,
} from "lucide-react";
import { UploadZone } from "@/components/upload/upload-zone";
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
  const [files, setFiles] = useState<FileItem[]>(initialFiles);
  const [showUploadZone, setShowUploadZone] = useState(true);

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

  const handleUploadSuccess = useCallback(() => {
    refreshData();
    if (liveStorage) {
      liveStorage.broadcastStorageUpdate();
    }
  }, [refreshData, liveStorage]);

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
    <div className="space-y-4 sm:space-y-5 max-w-5xl w-full mx-auto" data-testid="dashboard-container">
      {/* 1. Dashboard Identity / Header — Unmistakable Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-border/60">
        <div className="space-y-0.5 min-w-0">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[11px] font-medium mb-1">
            <LayoutDashboard className="w-3 h-3" />
            <span>Console Overview</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate" data-testid="dashboard-header-title">
            Dashboard
          </h1>
          <p className="text-xs text-muted-foreground truncate">
            Welcome back, <span className="text-foreground font-medium">{profile.full_name || profile.email.split("@")[0]}</span>. Here is your storage and sharing overview.
          </p>
        </div>

        {/* Quick Navigation Shortcuts */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              setShowUploadZone(true);
              const el = document.getElementById("dashboard-upload-zone");
              el?.scrollIntoView({ behavior: "smooth" });
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Upload File</span>
          </button>

          <Link
            href="/files"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-medium border border-border transition-colors"
          >
            <Files className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Files</span>
          </Link>

          <Link
            href="/links"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-medium border border-border transition-colors"
          >
            <LinkIcon className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Links</span>
          </Link>
        </div>
      </div>

      {/* 2. Quick Metrics Grid — Real Telemetry Grounded in Existing Data */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5" data-testid="dashboard-metrics-strip">
        {/* Storage Quota Card */}
        <div className="p-3 sm:p-3.5 rounded-2xl bg-card border border-border shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium uppercase tracking-wider">Storage</span>
            <HardDrive className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-foreground leading-tight">
            {formatBytes(storageUsed)}
          </div>
          <div className="space-y-1">
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-300"
                style={{ width: `${storagePercent}%` }}
              />
            </div>
            <div className="text-[10px] text-muted-foreground flex justify-between font-mono">
              <span>{quota === -1 ? "Unlimited" : `${storagePercent}% used`}</span>
              <span>{quota === -1 ? "∞" : formatBytes(quota)}</span>
            </div>
          </div>
        </div>

        {/* Active Files Card */}
        <Link
          href="/files"
          className="p-3 sm:p-3.5 rounded-2xl bg-card border border-border hover:border-blue-500/40 shadow-2xs hover:shadow-xs transition space-y-1.5 group cursor-pointer"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium uppercase tracking-wider">Active Files</span>
            <Files className="w-3.5 h-3.5 text-emerald-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-foreground leading-tight">
            {stats?.totalFiles ?? files.length}
          </div>
          <div className="text-[10px] text-blue-600 dark:text-blue-400 font-medium flex items-center gap-0.5">
            <span>Manage files</span>
            <ArrowRight className="w-2.5 h-2.5" />
          </div>
        </Link>

        {/* Share Links Card */}
        <Link
          href="/links"
          className="p-3 sm:p-3.5 rounded-2xl bg-card border border-border hover:border-indigo-500/40 shadow-2xs hover:shadow-xs transition space-y-1.5 group cursor-pointer"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium uppercase tracking-wider">Share Links</span>
            <LinkIcon className="w-3.5 h-3.5 text-indigo-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-foreground leading-tight">
            {stats?.activeLinks ?? 0}
          </div>
          <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-0.5">
            <span>View active links</span>
            <ArrowRight className="w-2.5 h-2.5" />
          </div>
        </Link>

        {/* Total Downloads Card */}
        <div className="p-3 sm:p-3.5 rounded-2xl bg-card border border-border shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium uppercase tracking-wider">Downloads</span>
            <Download className="w-3.5 h-3.5 text-purple-500" />
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-foreground leading-tight">
            {stats?.totalDownloads ?? 0}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            Direct R2 edge transfers
          </div>
        </div>
      </div>

      {/* Admin Approval Banner (Regular approved users only) */}
      {!isAdmin && welcomeInfo && (
        <ApprovalWelcomeBanner
          info={welcomeInfo}
          onUploadClick={() => {
            setShowUploadZone(true);
            const el = document.getElementById("dashboard-upload-zone");
            el?.scrollIntoView({ behavior: "smooth" });
          }}
        />
      )}

      {/* 3. Recent Files Section — Prominent on Mobile & Desktop */}
      <div className="rounded-2xl bg-card border border-border p-4 sm:p-5 shadow-2xs space-y-3" data-testid="recent-files-section">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Recent Files ({files.length})</h2>
            <p className="text-[11px] text-muted-foreground">Manage, share, and track analytics for your files</p>
          </div>
          <Link
            href="/files"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
          >
            <span>View all in Files</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <FileList
          files={files}
          onFileDeleted={handleFileDeleted}
          hideHeader={true}
          maxHeight="max-h-[300px]"
          isPremium={isPremium}
        />
      </div>

      {/* 4. Streamlined Upload Section */}
      <div
        id="dashboard-upload-zone"
        className="rounded-2xl bg-card border border-border p-4 sm:p-5 shadow-2xs space-y-3"
        data-testid="dashboard-upload-section"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Quick Upload</h2>
              <p className="text-[11px] text-muted-foreground">Direct browser-to-cloud transfer up to 1 GB</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="quick-upload-toggle"
              onClick={() => setShowUploadZone(!showUploadZone)}
              className="text-xs text-muted-foreground hover:text-foreground font-medium cursor-pointer"
            >
              {showUploadZone ? "Collapse" : "Expand"}
            </button>
            <span className="text-muted-foreground/40">•</span>
            <Link
              href="/upload"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
            >
              <span>Full Page</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {showUploadZone && (
          <UploadZone
            canCreatePermanent={profile.can_create_permanent}
            isAdmin={isAdmin}
            onUploadSuccess={handleUploadSuccess}
            compact={true}
          />
        )}
      </div>
    </div>
  );
}
