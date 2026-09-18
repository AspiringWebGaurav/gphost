"use client";

import React from "react";
import { Clock, AlertTriangle, Lock, ShieldCheck } from "lucide-react";
import { useTimeRemaining } from "@/lib/hooks/use-time-remaining";
import { cn } from "@/lib/utils";

export interface ExpiryStatusBadgeProps {
  expiresAt?: string | Date | null;
  status?: string | null;
  size?: "xs" | "sm" | "md";
  showIcon?: boolean;
  className?: string;
  warningThresholdMs?: number;
  showPrefix?: boolean;
}

export function ExpiryStatusBadge({
  expiresAt,
  status: initialStatus,
  size = "sm",
  showIcon = true,
  className,
  warningThresholdMs,
  showPrefix = true,
}: ExpiryStatusBadgeProps) {
  const result = useTimeRemaining(expiresAt, { warningThresholdMs });
  const { status, formatted, isExpiring, isExpired } = result;
  const isExpiredState = isExpired || initialStatus === "expired";

  const sizeClasses = {
    xs: "text-[10px] px-1.5 py-0.5 gap-1",
    sm: "text-[11px] px-2 py-0.5 gap-1.5",
    md: "text-xs px-2.5 py-1 gap-2",
  }[size];

  const iconSizes = {
    xs: "w-2.5 h-2.5",
    sm: "w-3 h-3",
    md: "w-3.5 h-3.5",
  }[size];

  if (status === "permanent") {
    return (
      <span
        suppressHydrationWarning
        data-testid="expiry-status-badge"
        data-status="permanent"
        className={cn(
          "inline-flex items-center font-medium rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-mono select-none",
          sizeClasses,
          className
        )}
      >
        {showIcon && <ShieldCheck className={cn(iconSizes, "text-blue-500 shrink-0")} />}
        <span>Permanent</span>
      </span>
    );
  }

  if (isExpiredState) {
    return (
      <span
        suppressHydrationWarning
        data-testid="expiry-status-badge"
        data-status="expired"
        className={cn(
          "inline-flex items-center font-semibold uppercase tracking-wider rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 font-mono select-none",
          sizeClasses,
          className
        )}
      >
        {showIcon && <Lock className={cn(iconSizes, "text-rose-500 shrink-0")} />}
        <span suppressHydrationWarning>Expired &amp; Locked</span>
      </span>
    );
  }

  if (isExpiring) {
    return (
      <span
        suppressHydrationWarning
        data-testid="expiry-status-badge"
        data-status="expiring"
        className={cn(
          "inline-flex items-center font-semibold rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-mono select-none animate-pulse",
          sizeClasses,
          className
        )}
      >
        {showIcon && <AlertTriangle className={cn(iconSizes, "text-amber-500 shrink-0")} />}
        <span suppressHydrationWarning>Expiring soon • {formatted}</span>
      </span>
    );
  }

  // Active status
  return (
    <span
      suppressHydrationWarning
      data-testid="expiry-status-badge"
      data-status="active"
      className={cn(
        "inline-flex items-center font-medium rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-mono select-none",
        sizeClasses,
        className
      )}
    >
      {showIcon && <Clock className={cn(iconSizes, "text-emerald-500 shrink-0")} />}
      <span suppressHydrationWarning>{showPrefix ? `Expires ${formatted}` : formatted}</span>
    </span>
  );
}
