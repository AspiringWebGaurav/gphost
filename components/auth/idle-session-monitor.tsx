"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// 30-minute background idle timeout window
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
// Throttle activity updates to once every 15 seconds to avoid performance overhead
const THROTTLE_MS = 15 * 1000;
// Periodic token refresh interval while user is active (10 minutes)
const TOKEN_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

const STORAGE_KEY = "gphost_last_active";
const COOKIE_NAME = "gphost_last_active";

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${value}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

function getStoredLastActive(): number {
  if (typeof window === "undefined") return Date.now();
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val) {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch {}
  return Date.now();
}

/**
 * IdleSessionMonitor:
 * - Keeps live/active users logged in continuously without interruption.
 * - Detects true background inactivity (no interaction for 30 consecutive minutes).
 * - Synchronizes activity across all open browser tabs via localStorage.
 * - Gracefully signs out and redirects to /login?reason=idle_timeout when 30 minutes of complete inactivity occurs.
 */
export function IdleSessionMonitor() {
  const router = useRouter();
  const lastActiveRef = useRef<number>(getStoredLastActive());
  const lastThrottleRef = useRef<number>(0);
  const idleCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const tokenRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isLoggingOutRef = useRef<boolean>(false);

  const handleIdleLogout = useCallback(async () => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;

    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
      }
      setCookie(COOKIE_NAME, "0", 0);
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Error during idle logout:", err);
    } finally {
      router.push("/login?reason=idle_timeout");
      router.refresh();
    }
  }, [router]);

  const handleRevocationLogout = useCallback(async () => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;

    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.clear();
      }
      setCookie(COOKIE_NAME, "0", 0);
      const supabase = createClient();
      await supabase.auth.signOut();
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    } catch (err) {
      console.error("Error during revocation logout:", err);
    } finally {
      router.push("/login?reason=revoked");
      router.refresh();
    }
  }, [router]);

  const checkRevocationStatus = useCallback(async () => {
    if (isLoggingOutRef.current) return;
    try {
      const res = await fetch("/api/auth/session-status");
      if (res.status === 403 || res.status === 401) {
        const data = await res.json().catch(() => ({}));
        if (data.isRevoked || data.status === "revoked") {
          handleRevocationLogout();
        }
      } else if (res.ok) {
        const data = await res.json();
        if (data.isRevoked || data.status === "revoked") {
          handleRevocationLogout();
        }
      }
    } catch {
      // Ignored
    }
  }, [handleRevocationLogout]);

  const recordActivity = useCallback(() => {
    const now = Date.now();
    lastActiveRef.current = now;

    // Throttle writing to localStorage and cookie
    if (now - lastThrottleRef.current > THROTTLE_MS) {
      lastThrottleRef.current = now;
      try {
        localStorage.setItem(STORAGE_KEY, now.toString());
      } catch {}
      // Set cookie for 7 days rolling window so server proxy receives the activity timestamp
      setCookie(COOKIE_NAME, now.toString(), 7 * 24 * 60 * 60);
    }
  }, []);

  // Check inactivity status
  const checkIdleStatus = useCallback(() => {
    if (isLoggingOutRef.current) return;

    // Check latest timestamp from localStorage in case another tab updated it
    const stored = getStoredLastActive();
    if (stored > lastActiveRef.current) {
      lastActiveRef.current = stored;
    }

    const elapsed = Date.now() - lastActiveRef.current;
    if (elapsed >= IDLE_TIMEOUT_MS) {
      handleIdleLogout();
    }
  }, [handleIdleLogout]);

  useEffect(() => {
    // Initial sync
    recordActivity();
    checkRevocationStatus();

    // 1. Supabase Realtime Listener for Immediate Revocation (<500ms response)
    let isCancelled = false;
    const supabase = createClient();
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || isCancelled) return;
      const channelName = `user-profile-guard-${user.id}`;
      // Remove any pre-existing channel with this topic to avoid duplicate callback collisions
      const existing = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
      if (existing) {
        supabase.removeChannel(existing);
      }
      realtimeChannel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "profiles",
            filter: `id=eq.${user.id}`,
          },
          (payload) => {
            if (isCancelled) return;
            const newStatus = (payload.new as { status?: string })?.status;
            if (newStatus === "revoked" || newStatus === "rejected") {
              handleRevocationLogout();
            }
          }
        )
        .subscribe();
    });

    // 2. User activity event listeners
    const activityEvents = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    const onActivity = () => {
      recordActivity();
    };

    activityEvents.forEach((ev) => {
      window.addEventListener(ev, onActivity, { passive: true });
    });

    // 3. Cross-tab activity synchronization via localStorage
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const parsed = parseInt(e.newValue, 10);
        if (!isNaN(parsed) && parsed > lastActiveRef.current) {
          lastActiveRef.current = parsed;
        }
      }
    };
    window.addEventListener("storage", onStorage);

    // 4. Tab visibility / Window focus check:
    // If user returns to tab after leaving computer idle, immediately verify elapsed time and revocation
    const onVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        checkIdleStatus();
        checkRevocationStatus();
        if (!isLoggingOutRef.current) {
          recordActivity();
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibilityOrFocus);
    window.addEventListener("focus", onVisibilityOrFocus);

    // 5. Background periodic timer to check idle timeout (every 15 seconds)
    idleCheckIntervalRef.current = setInterval(checkIdleStatus, 15000);

    // 6. Fast Heartbeat polling to detect revocation (< 8 seconds fallback)
    const revocationPollInterval = setInterval(checkRevocationStatus, 8000);

    // 7. Periodic Supabase session keep-alive while user is active
    tokenRefreshIntervalRef.current = setInterval(async () => {
      const elapsed = Date.now() - lastActiveRef.current;
      if (elapsed < IDLE_TIMEOUT_MS) {
        try {
          const client = createClient();
          await client.auth.getSession();
        } catch {}
      }
    }, TOKEN_REFRESH_INTERVAL_MS);

    return () => {
      isCancelled = true;
      activityEvents.forEach((ev) => {
        window.removeEventListener(ev, onActivity);
      });
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
      window.removeEventListener("focus", onVisibilityOrFocus);

      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
      }
      if (idleCheckIntervalRef.current) clearInterval(idleCheckIntervalRef.current);
      if (revocationPollInterval) clearInterval(revocationPollInterval);
      if (tokenRefreshIntervalRef.current) clearInterval(tokenRefreshIntervalRef.current);
    };
  }, [recordActivity, checkIdleStatus, checkRevocationStatus, handleRevocationLogout]);

  // Headless component
  return null;
}
