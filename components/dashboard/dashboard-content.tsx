"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ShieldCheck, Activity, ArrowRight, UploadCloud } from "lucide-react";
import { UploadZone } from "@/components/upload/upload-zone";
import { FileList, FileItem } from "@/components/dashboard/file-list";

interface DashboardContentProps {
  initialFiles: FileItem[];
  profile: {
    full_name: string | null;
    email: string;
    role: "user" | "admin";
    quota_bytes: number;
    storage_used_bytes: number;
    reserved_bytes: number;
    can_create_permanent: boolean;
  };
}

export function DashboardContent({ initialFiles, profile }: DashboardContentProps) {
  const [files, setFiles] = useState<FileItem[]>(initialFiles);

  const isAdmin = profile.role === "admin";

  const refreshData = async () => {
    try {
      const res = await fetch("/api/files");
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files);
      }
    } catch (err) {
      console.error("Failed to refresh dashboard data:", err);
    }
  };

  return (
    <div className="space-y-4 max-w-5xl w-full mx-auto">
      {/* 1. Slim Welcome Header (No duplicate storage widget - single source of truth in sidebar) */}
      <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-medium mb-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Direct Cloud Storage Active</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Welcome back, {profile.full_name || profile.email.split("@")[0]}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Encrypted file storage with custom expiration and secure sharing.
          </p>
        </div>

        {/* Engine Status & Tier Pill */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="px-3 py-1.5 rounded-xl bg-muted/40 border border-border flex items-center gap-2 text-xs">
            <Activity className="w-3.5 h-3.5 text-emerald-500" />
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>R2 Cloud Storage</span>
            </span>
          </div>

          <span
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize border ${
              isAdmin
                ? "bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/20"
                : "bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/20"
            }`}
          >
            {profile.role} Tier
          </span>
        </div>
      </div>

      {/* 2. Upload Section (Stacked Below - Full Width, Compact Height) */}
      <div className="rounded-2xl bg-card border border-border p-4 sm:p-5 shadow-2xs space-y-3">
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
          onUploadSuccess={refreshData}
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
          onFileDeleted={refreshData}
          hideHeader={true}
          maxHeight="max-h-[220px]"
        />
      </div>
    </div>
  );
}
