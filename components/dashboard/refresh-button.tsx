"use client";

import React, { useState, useCallback, useContext } from "react";
import { useRouter } from "next/navigation";
import { RotateCw, Check } from "lucide-react";
import { storageEvents } from "@/lib/storage/events";
import { StorageContext } from "@/components/storage/storage-context";

interface RefreshButtonProps {
  className?: string;
}

/**
 * Universal, Ultra-Smooth Screen Refresh Button for GPHost Top Navbar.
 * Triggers Next.js Server Component route re-validation, client state refresh,
 * and live storage reconciliation without full page reloads or layout jarring.
 */
export function RefreshButton({ className = "" }: RefreshButtonProps) {
  const router = useRouter();
  const storageContext = useContext(StorageContext);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setJustRefreshed(false);

    try {
      // 1. Trigger background storage state check
      if (storageContext) {
        void storageContext.refreshStorageState();
      }

      // 2. Broadcast screen refresh across all active in-window and cross-tab components
      storageEvents.emit("screen:refresh", {
        timestamp: Date.now(),
        forced: true,
      });

      // 3. Next.js App Router Server Component Refresh (re-fetches server data smoothly)
      router.refresh();

      // 4. Smooth minimum animation duration so the user perceives the fast, responsive spin
      await new Promise((resolve) => setTimeout(resolve, 450));

      setJustRefreshed(true);
      setTimeout(() => {
        setJustRefreshed(false);
      }, 1500);
    } catch (err) {
      console.error("[RefreshButton] Refresh error:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, router, storageContext]);

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={isRefreshing}
      aria-label="Refresh current screen"
      title="Refresh current screen to latest data (Fast & Smooth)"
      className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 h-8 sm:h-9 rounded-xl border border-border bg-card/60 hover:bg-muted/60 text-xs sm:text-sm font-semibold text-foreground transition-all duration-150 shadow-xs shrink-0 cursor-pointer disabled:opacity-70 active:scale-95 group ${
        justRefreshed
          ? "border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-500/30"
          : ""
      } ${className}`}
    >
      {justRefreshed ? (
        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 shrink-0 transition-transform duration-200 animate-in zoom-in-75" />
      ) : (
        <RotateCw
          className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500 shrink-0 transition-transform duration-200 ${
            isRefreshing
              ? "animate-spin text-blue-600 dark:text-blue-400"
              : "group-hover:rotate-45"
          }`}
        />
      )}
      <span className="hidden sm:inline">
        {justRefreshed ? "Updated" : isRefreshing ? "Refreshing..." : "Refresh"}
      </span>
    </button>
  );
}
