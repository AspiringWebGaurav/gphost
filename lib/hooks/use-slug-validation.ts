"use client";

import { useState, useEffect, useRef } from "react";
import { authFetch } from "@/lib/auth/client-fetch";
import { RESERVED_SLUGS } from "@/lib/share/constants";

export type SlugValidationStatus =
  | "idle"
  | "too_short"
  | "too_long"
  | "invalid_chars"
  | "reserved"
  | "checking"
  | "available"
  | "taken"
  | "error";

export interface SlugValidationResult {
  status: SlugValidationStatus;
  message: string;
  isValid: boolean;
  isChecking: boolean;
}

export function useSlugValidation(rawSlug: string, enabled: boolean = true): SlugValidationResult {
  const [asyncResult, setAsyncResult] = useState<{
    slug: string;
    status: SlugValidationStatus;
    message: string;
  } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const trimmed = rawSlug.trim().toLowerCase();

  // Pure synchronous derivation: instantaneous client validation without cascading effect re-renders
  let syncStatus: SlugValidationStatus = "idle";
  let syncMessage = "";

  if (!enabled || !trimmed) {
    syncStatus = "idle";
    syncMessage = "";
  } else if (trimmed.length < 3) {
    syncStatus = "too_short";
    syncMessage = "Minimum 3 characters";
  } else if (trimmed.length > 48) {
    syncStatus = "too_long";
    syncMessage = "Maximum 48 characters";
  } else if (!/^[a-z0-9_-]+$/.test(trimmed)) {
    syncStatus = "invalid_chars";
    syncMessage = "Letters, numbers, hyphens, and underscores only";
  } else if (RESERVED_SLUGS.has(trimmed)) {
    syncStatus = "reserved";
    syncMessage = "Reserved system address";
  } else {
    syncStatus = "checking";
  }

  useEffect(() => {
    if (!enabled || !trimmed || syncStatus !== "checking") {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timer = setTimeout(async () => {
      try {
        const res = await authFetch(`/api/share/check-slug?slug=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const data = await res.json();

        if (controller.signal.aborted) return;

        if (res.ok && data.available) {
          setAsyncResult({ slug: trimmed, status: "available", message: "Slug is available" });
        } else if (data.isTaken) {
          setAsyncResult({ slug: trimmed, status: "taken", message: data.error || "Slug is already taken" });
        } else if (data.isReserved) {
          setAsyncResult({ slug: trimmed, status: "reserved", message: data.error || "Reserved system address" });
        } else {
          setAsyncResult({ slug: trimmed, status: "taken", message: data.error || "Slug is not available" });
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        // Don't flag error on standard abort
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn("[useSlugValidation] Check failed:", err);
        setAsyncResult({ slug: trimmed, status: "error", message: "Could not verify slug availability" });
      }
    }, 280);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, enabled, syncStatus]);

  // Combine synchronous checks with asynchronous network result
  const isSyncError = syncStatus !== "idle" && syncStatus !== "checking";
  const isAsyncForCurrentSlug = asyncResult?.slug === trimmed;

  const finalStatus: SlugValidationStatus = isSyncError
    ? syncStatus
    : syncStatus === "checking"
    ? isAsyncForCurrentSlug
      ? asyncResult.status
      : "checking"
    : "idle";

  const finalMessage = isSyncError
    ? syncMessage
    : syncStatus === "checking"
    ? isAsyncForCurrentSlug
      ? asyncResult.message
      : "Checking availability..."
    : "";

  const isValid = !trimmed ? true : finalStatus === "available";

  return {
    status: finalStatus,
    message: finalMessage,
    isValid,
    isChecking: finalStatus === "checking",
  };
}
