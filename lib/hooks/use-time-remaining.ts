"use client";

import { useState, useEffect, useMemo } from "react";

export type ExpiryStatus = "permanent" | "active" | "expiring" | "expired";

export interface TimeRemainingResult {
  status: ExpiryStatus;
  remainingMs: number;
  formatted: string;
  elapsedAgo?: string;
  isExpired: boolean;
  isExpiring: boolean;
  isPermanent: boolean;
  diffDays: number;
  diffHours: number;
  diffMins: number;
  diffSecs: number;
}

interface UseTimeRemainingOptions {
  warningThresholdMs?: number;
}

export function calculateTimeRemaining(
  expiresAt: string | Date | null | undefined,
  nowMs: number,
  warningThresholdMs = 60 * 1000
): TimeRemainingResult {
  if (!expiresAt) {
    return {
      status: "permanent",
      remainingMs: Infinity,
      formatted: "Permanent",
      isExpired: false,
      isExpiring: false,
      isPermanent: true,
      diffDays: 0,
      diffHours: 0,
      diffMins: 0,
      diffSecs: 0,
    };
  }

  const date = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  const targetTime = date.getTime();
  const diffMs = targetTime - nowMs;

  if (diffMs <= 0) {
    const elapsedMs = Math.abs(diffMs);
    const diffSecs = Math.floor((elapsedMs % (60 * 1000)) / 1000);
    const diffMins = Math.floor(elapsedMs / (60 * 1000));
    const diffHours = Math.floor(elapsedMs / (60 * 60 * 1000));
    const diffDays = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));

    let elapsedAgo = "just now";
    if (diffDays >= 30) {
      const months = Math.floor(diffDays / 30);
      elapsedAgo = months === 1 ? "1 month ago" : `${months} months ago`;
    } else if (diffDays >= 7) {
      const weeks = Math.floor(diffDays / 7);
      elapsedAgo = weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
    } else if (diffDays > 0) {
      elapsedAgo = diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
    } else if (diffHours > 0) {
      elapsedAgo = diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
    } else if (diffMins > 0) {
      elapsedAgo = diffMins === 1 ? "1 minute ago" : `${diffMins} minutes ago`;
    }

    return {
      status: "expired",
      remainingMs: 0,
      formatted: `Expired ${elapsedAgo}`,
      elapsedAgo,
      isExpired: true,
      isExpiring: false,
      isPermanent: false,
      diffDays,
      diffHours,
      diffMins,
      diffSecs,
    };
  }

  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const diffHours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const diffMins = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
  const diffSecs = Math.floor((diffMs % (60 * 1000)) / 1000);

  let formatted = "";
  if (diffDays > 0) {
    formatted = `${diffDays}d ${diffHours}h left`;
  } else if (diffHours > 0) {
    formatted = diffMins > 0 ? `${diffHours}h ${diffMins}m left` : `${diffHours}h left`;
  } else if (diffMins > 0) {
    formatted = diffSecs > 0 ? `${diffMins}m ${diffSecs}s left` : `${diffMins}m left`;
  } else {
    formatted = `${diffSecs}s left`;
  }

  const isExpiring = diffMs <= warningThresholdMs;

  return {
    status: isExpiring ? "expiring" : "active",
    remainingMs: diffMs,
    formatted,
    isExpired: false,
    isExpiring,
    isPermanent: false,
    diffDays,
    diffHours,
    diffMins,
    diffSecs,
  };
}

export function useTimeRemaining(
  expiresAt: string | Date | null | undefined,
  options?: UseTimeRemainingOptions
): TimeRemainingResult {
  const warningThreshold = options?.warningThresholdMs ?? 60 * 1000;

  // Initialize with current time
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;

    const date = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
    const targetMs = date.getTime();

    // If already expired, poll every 30s to keep elapsed time relatively accurate
    const isAlreadyExpired = targetMs - Date.now() <= 0;
    const intervalMs = isAlreadyExpired ? 30000 : 1000;

    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
    }, intervalMs);

    return () => clearInterval(interval);
  }, [expiresAt]);

  return useMemo(
    () => calculateTimeRemaining(expiresAt, now, warningThreshold),
    [expiresAt, now, warningThreshold]
  );
}
