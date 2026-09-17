"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowRight, UploadCloud } from "lucide-react";
import { UploadZone } from "@/components/upload/upload-zone";
import { FileList, FileItem } from "@/components/dashboard/file-list";
import {
  ApprovalWelcomeBanner,
  ApprovalWelcomeInfo,
} from "@/components/dashboard/approval-welcome-banner";
import { useStorageSync } from "@/components/storage/storage-context";
import { storageEvents } from "@/lib/storage/events";

interface DashboardContentProps {
  initialFiles: FileItem[];
  welcomeInfo?: ApprovalWelcomeInfo;
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

export function DashboardContent({
  initialFiles,
  profile,
  welcomeInfo,
}: DashboardContentProps) {
  const [files, setFiles] = useState<FileItem[]>(initialFiles);

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

  return (
    <div className="space-y-4 max-w-5xl w-full mx-auto">
      {/* Admin Approval Dynamic Welcome Banner (Regular approved users only, never admin) */}
      {!isAdmin && welcomeInfo && (
        <ApprovalWelcomeBanner
          info={welcomeInfo}
          onUploadClick={() => {
            const el = document.getElementById("dashboard-upload-zone");
            if (el) {
              el.scrollIntoView({ behavior: "smooth" });
            } else {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
        />
      )}

      {/* Upload Section */}
      <div
        id="dashboard-upload-zone"
        className="rounded-2xl bg-card border border-border p-4 sm:p-5 shadow-2xs space-y-3"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Upload a File</h2>
              <p className="text-[11px] text-muted-foreground">Direct browser-to-cloud transfer up to 1 GB</p>
            </div>
          </div>
          <Link
            href="/upload"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
          >
            <span>Dedicated Page</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <UploadZone
          canCreatePermanent={profile.can_create_permanent}
          isAdmin={isAdmin}
          onUploadSuccess={handleUploadSuccess}
          compact={true}
        />
      </div>

      {/* 3. Recent Files Section (Stacked Below - Full Width, Compact Height) */}
      <div className="rounded-2xl bg-card border border-border p-4 sm:p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Recent Files ({files.length})</h2>
            <p className="text-[11px] text-muted-foreground">Quickly manage and share your recent uploads</p>
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
          maxHeight="max-h-[220px]"
          isPremium={isPremium}
        />
      </div>
    </div>
  );
}
