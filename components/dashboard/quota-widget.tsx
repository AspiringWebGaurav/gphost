"use client";

import React, { useState } from "react";
import { HardDrive, RefreshCw, Check } from "lucide-react";
import { useStorageSync } from "@/components/storage/storage-context";

interface QuotaWidgetProps {
  quotaBytes?: number;
  storageUsedBytes?: number;
  reservedBytes?: number;
  isAdmin?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function QuotaWidget(props: QuotaWidgetProps) {
  let liveStorage: ReturnType<typeof useStorageSync> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    liveStorage = useStorageSync();
  } catch {
    liveStorage = null;
  }

  const [syncFeedback, setSyncFeedback] = useState(false);

  const storageUsedBytes = liveStorage
    ? liveStorage.storageUsedBytes
    : props.storageUsedBytes ?? 0;

  const quotaBytes = liveStorage
    ? liveStorage.quotaBytes
    : props.quotaBytes ?? -1;

  const reservedBytes = liveStorage
    ? liveStorage.reservedBytes
    : props.reservedBytes ?? 0;

  const isAdmin = props.isAdmin ?? false;
  const isUnlimited = liveStorage ? liveStorage.isUnlimited : (quotaBytes === -1 || isAdmin);
  const isSyncing = liveStorage ? liveStorage.isSyncing : false;

  const totalAllocated = storageUsedBytes + reservedBytes;
  const percent = isUnlimited
    ? (storageUsedBytes > 0 ? 5 : 2)
    : Math.min(100, Math.round((totalAllocated / (quotaBytes || 1)) * 100));

  let progressColor = "from-blue-500 to-indigo-500";
  if (!isUnlimited) {
    if (percent > 90) {
      progressColor = "from-rose-500 to-red-600";
    } else if (percent > 70) {
      progressColor = "from-amber-500 to-orange-500";
    } else {
      progressColor = "from-emerald-500 to-teal-500";
    }
  }

  const handleManualSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!liveStorage || isSyncing) return;
    try {
      await liveStorage.syncWithR2();
      setSyncFeedback(true);
      setTimeout(() => setSyncFeedback(false), 2000);
    } catch (err) {
      console.error("Manual R2 sync failed:", err);
    }
  };

  return (
    <div className="p-3.5 rounded-xl bg-muted/40 border border-border transition-all duration-200 space-y-2.5">
      {/* 1. Header Row: Title on left, Status on right */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-blue-500/10 text-blue-500 dark:text-blue-400 flex items-center justify-center">
            <HardDrive className="w-3 h-3" />
          </div>
          <span className="text-xs font-semibold text-foreground tracking-tight">Storage</span>
        </div>

        <span className="font-mono text-[11px] text-muted-foreground font-medium">
          {isUnlimited ? "Unlimited" : `${percent}%`}
        </span>
      </div>

      {/* 2. Numerical Byte Usage */}
      <div className="flex items-baseline justify-between text-sm font-semibold text-foreground tracking-tight">
        <span>{formatBytes(storageUsedBytes)}</span>
        <span className="text-[11px] font-normal text-muted-foreground">
          / {isUnlimited ? "Unlimited" : formatBytes(quotaBytes)}
        </span>
      </div>

      {/* 3. Progress Bar */}
      <div className="w-full h-1.5 rounded-full bg-muted/80 overflow-hidden relative">
        <div
          className={`h-full bg-gradient-to-r ${progressColor} rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${isUnlimited ? (storageUsedBytes > 0 ? 5 : 2) : Math.max(percent, 2)}%` }}
        />
      </div>

      {/* 4. Elegant Footer: Live indicator on left, Sync button on right */}
      <div className="flex items-center justify-between pt-0.5 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">Live Cloud Sync</span>
        </div>

        {liveStorage && (
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors disabled:opacity-50"
            title="Audit and sync physical Cloudflare R2 storage"
          >
            {syncFeedback ? (
              <>
                <Check className="w-2.5 h-2.5 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400">Synced</span>
              </>
            ) : (
              <>
                <RefreshCw className={`w-2.5 h-2.5 ${isSyncing ? "animate-spin text-blue-500" : ""}`} />
                <span>{isSyncing ? "Auditing..." : "Sync R2"}</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
