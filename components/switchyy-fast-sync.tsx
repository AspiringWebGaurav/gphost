"use client";

import { useEffect } from "react";

interface SwitchyyFastSyncProps {
  projectId: string;
  publicKey: string;
}

/**
 * High-priority client monitor for real-time Switchyy mode changes.
 * Ensures emergency modes like Maintenance, Offline, and Incident take
 * effect within seconds even if SSE experiences jitter, throttling, or sleep.
 */
export function SwitchyyFastSync({ projectId, publicKey }: SwitchyyFastSyncProps) {
  useEffect(() => {
    if (!projectId || !publicKey) return;

    let isSubscribed = true;

    const syncMode = async () => {
      try {
        const url = `https://switchyy.eu.cc/api/v1/decide?projectId=${encodeURIComponent(
          projectId
        )}&key=${encodeURIComponent(publicKey)}&_cb=${Date.now()}`;

        const res = await fetch(url, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
          signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) return;
        const json = await res.json();
        const data = json?.data;
        if (!data || !isSubscribed) return;

        const currentMode = data.mode || "live";
        const hasOverlay = Boolean(document.getElementById("switchy-overlay"));

        if (currentMode !== "live") {
          // Maintenance / Incident / Offline mode active
          if (!hasOverlay) {
            // Bust stale cache and reload into early-lock maintenance immediately
            try {
              sessionStorage.removeItem(`switchy_config_${projectId}`);
            } catch {}
            document.documentElement.style.visibility = "hidden";
            window.location.reload();
            return;
          }
        } else if (currentMode === "live" && hasOverlay) {
          // Maintenance mode lifted, restore live view immediately
          try {
            sessionStorage.removeItem(`switchy_config_${projectId}`);
          } catch {}
          window.location.reload();
          return;
        }
      } catch {
        // Fail open silently to avoid disrupting normal site operation
      }
    };

    // Run initial fast-path check
    syncMode();

    // High-priority 3.5s interval check for instant mode reaction
    const intervalId = setInterval(syncMode, 3500);

    // Immediate check whenever user returns to or focuses the tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncMode();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", syncMode);

    return () => {
      isSubscribed = false;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", syncMode);
    };
  }, [projectId, publicKey]);

  return null;
}
