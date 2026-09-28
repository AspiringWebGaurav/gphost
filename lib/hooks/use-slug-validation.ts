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
  const [status, setStatus] = useState<SlugValidationStatus>("idle");
  const [message, setMessage] = useState<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      setMessage("");
      return;
    }

    const trimmed = rawSlug.trim().toLowerCase();

    // Empty slug is valid (since custom slug is optional)
    if (!trimmed) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setStatus("idle");
      setMessage("");
      return;
    }

    // Client-side quick checks
    if (trimmed.length < 3) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setStatus("too_short");
      setMessage("Minimum 3 characters");
      return;
    }

    if (trimmed.length > 48) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setStatus("too_long");
      setMessage("Maximum 48 characters");
      return;
    }

    if (!/^[a-z0-9_-]+$/.test(trimmed)) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setStatus("invalid_chars");
      setMessage("Letters, numbers, hyphens, and underscores only");
      return;
    }

    if (RESERVED_SLUGS.has(trimmed)) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setStatus("reserved");
      setMessage("Reserved system address");
      return;
    }

    // Passed local checks -> debounce server availability check
    setStatus("checking");
    setMessage("Checking availability...");

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
          setStatus("available");
          setMessage("Slug is available");
        } else if (data.isTaken) {
          setStatus("taken");
          setMessage(data.error || "Slug is already taken");
        } else if (data.isReserved) {
          setStatus("reserved");
          setMessage(data.error || "Reserved system address");
        } else {
          setStatus("taken");
          setMessage(data.error || "Slug is not available");
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        // Don't flag error on standard abort
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn("[useSlugValidation] Check failed:", err);
        setStatus("error");
        setMessage("Could not verify slug availability");
      }
    }, 280);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [rawSlug, enabled]);

  // If rawSlug is empty, it is valid because custom slug is optional.
  // If rawSlug is not empty, it is only valid if status is 'available'.
  const trimmed = rawSlug.trim();
  const isValid = !trimmed ? true : status === "available";

  return {
    status,
    message,
    isValid,
    isChecking: status === "checking",
  };
}
