"use client";

import React from "react";
import { HardDrive } from "lucide-react";

interface QuotaWidgetProps {
  quotaBytes: number;
  storageUsedBytes: number;
  reservedBytes: number;
  isAdmin?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function QuotaWidget({
  quotaBytes,
  storageUsedBytes,
  reservedBytes,
  isAdmin = false,
}: QuotaWidgetProps) {
  const isUnlimited = quotaBytes === -1 || isAdmin;
  const totalAllocated = storageUsedBytes + reservedBytes;
  const percent = isUnlimited ? 2 : Math.min(100, Math.round((totalAllocated / quotaBytes) * 100));

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

  return (
    <div className="p-4 rounded-xl bg-muted/40 border border-border">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground mb-2.5">
        <span className="flex items-center gap-1.5">
          <HardDrive className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
          <span>Storage</span>
        </span>
        <span className="font-mono text-[11px] text-foreground">
          {isUnlimited ? "Unlimited" : `${percent}%`}
        </span>
      </div>

      <div className="text-sm font-semibold text-foreground tracking-tight mb-2">
        {formatBytes(storageUsedBytes)}{" "}
        <span className="text-xs font-normal text-muted-foreground">
          / {isUnlimited ? "Unlimited" : formatBytes(quotaBytes)}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${progressColor} rounded-full transition-all duration-300`}
          style={{ width: `${isUnlimited ? 5 : Math.max(percent, 2)}%` }}
        />
      </div>

      {reservedBytes > 0 && (
        <div className="mt-2 text-[10px] text-amber-600 dark:text-amber-400/90 font-mono">
          + {formatBytes(reservedBytes)} uploading
        </div>
      )}
    </div>
  );
}
