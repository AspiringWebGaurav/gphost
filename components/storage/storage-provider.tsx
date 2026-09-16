"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { storageEvents, StorageUpdatedPayload } from "@/lib/storage/events";
import { StorageContext, StorageContextType } from "./storage-context";

interface StorageProviderProps {
  children: React.ReactNode;
  initialProfile: {
    id?: string;
    quota_bytes: number;
    storage_used_bytes: number;
    reserved_bytes: number;
    role: "user" | "admin";
  };
  initialUserId: string;
}

export function StorageProvider({
  children,
  initialProfile,
  initialUserId,
}: StorageProviderProps) {
  const [storageUsedBytes, setStorageUsedBytes] = useState<number>(
    initialProfile.storage_used_bytes || 0
  );
  const [quotaBytes, setQuotaBytes] = useState<number>(
    initialProfile.quota_bytes ?? -1
  );
  const [reservedBytes, setReservedBytes] = useState<number>(
    initialProfile.reserved_bytes || 0
  );
  const [activeFilesCount, setActiveFilesCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(false);

  const isAdmin = initialProfile.role === "admin";
  const isUnlimited = quotaBytes === -1 || isAdmin;

  const realtimeChannelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const isSyncingRef = useRef<boolean>(false);
  const lastEtagRef = useRef<string>("");

  // Authoritative physical Cloudflare R2 reconciliation (User-triggered via "Sync with R2" button)
  const syncWithR2 = useCallback(async (silent = false) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      const res = await fetch("/api/storage/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok && isMountedRef.current) {
        const json = await res.json();
        if (json.success && json.data) {
          const { dbStorageUsedBytes, dbFileCount } = json.data;
          setStorageUsedBytes(dbStorageUsedBytes);
          setActiveFilesCount(dbFileCount);
          setReservedBytes(0);
          setLastSyncedAt(new Date());

          // Emit through typed event bus across all components and open tabs
          storageEvents.emit("storage:updated", {
            storageUsedBytes: dbStorageUsedBytes,
            activeFilesCount: dbFileCount,
            source: "r2_sync",
          });
        }
      }
    } catch (err) {
      if (!silent) {
        console.error("[StorageProvider] R2 sync error:", err);
      }
    } finally {
      isSyncingRef.current = false;
      if (isMountedRef.current) {
        setIsSyncing(false);
      }
    }
  }, []);

  // Smart tracking check on demand (returns 304 if unchanged)
  const refreshStorageState = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (lastEtagRef.current) {
        headers["If-None-Match"] = lastEtagRef.current;
      }
      const res = await fetch("/api/storage/signature", { headers });
      if (res.status === 304) {
        // HTTP 304: Not Modified. 0 state work needed!
        return;
      }
      if (res.ok && isMountedRef.current) {
        const etag = res.headers.get("etag");
        if (etag) lastEtagRef.current = etag;
        const data = await res.json();
        setStorageUsedBytes(data.storageUsedBytes);
        setQuotaBytes(data.quotaBytes);
        setReservedBytes(data.reservedBytes);
        setLastSyncedAt(new Date());
      }
    } catch (err) {
      console.error("[StorageProvider] Smart check failed:", err);
    }
  }, []);

  // Instant local optimistic broadcast (0ms, no network polling)
  const broadcastStorageUpdate = useCallback(
    (patch?: {
      storageUsedBytes?: number;
      reservedBytes?: number;
      activeFilesCountDelta?: number;
    }) => {
      let newBytes = storageUsedBytes;
      if (patch?.storageUsedBytes !== undefined) {
        newBytes = patch.storageUsedBytes;
        setStorageUsedBytes(newBytes);
      }
      if (patch?.reservedBytes !== undefined) {
        setReservedBytes(patch.reservedBytes);
      }
      if (patch?.activeFilesCountDelta !== undefined) {
        setActiveFilesCount((prev) => Math.max(0, prev + patch.activeFilesCountDelta!));
      }

      // Emit across typed event bus (handles local window + BroadcastChannel automatically)
      storageEvents.emit("storage:updated", {
        storageUsedBytes: newBytes,
        reservedBytes: patch?.reservedBytes,
        source: "local_optimistic",
      });
    },
    [storageUsedBytes]
  );

  useEffect(() => {
    isMountedRef.current = true;

    // 1. Subscribe to typed StorageEventBus (In-tab & Cross-tab)
    const unsubEvents = storageEvents.on("storage:updated", (payload: StorageUpdatedPayload) => {
      if (!isMountedRef.current) return;
      if (typeof payload.storageUsedBytes === "number") {
        setStorageUsedBytes(payload.storageUsedBytes);
      }
      if (typeof payload.quotaBytes === "number") {
        setQuotaBytes(payload.quotaBytes);
      }
      if (typeof payload.reservedBytes === "number") {
        setReservedBytes(payload.reservedBytes);
      }
      if (typeof payload.activeFilesCount === "number") {
        setActiveFilesCount(payload.activeFilesCount);
      }
    });

    // 2. Smart Conditional Tracker: Check on window focus only (with ETag -> 304 Not Modified)
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        refreshStorageState();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    // 3. Supabase Realtime WebSocket Connection (Pure push, zero polling)
    const supabase = createClient();
    const channelName = `storage-realtime-${initialUserId}`;
    const existingChannel = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
    if (existingChannel) {
      supabase.removeChannel(existingChannel);
    }

    const channel = supabase.channel(channelName);
    realtimeChannelRef.current = channel;

    channel
      // A. Profile updates pushed live via WebSocket (storage_used_bytes, quota_bytes, reserved_bytes)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${initialUserId}`,
        },
        (payload) => {
          if (!isMountedRef.current) return;
          const updated = payload.new as {
            storage_used_bytes?: number;
            quota_bytes?: number;
            reserved_bytes?: number;
          };
          if (typeof updated.storage_used_bytes === "number") {
            setStorageUsedBytes(updated.storage_used_bytes);
          }
          if (typeof updated.quota_bytes === "number") {
            setQuotaBytes(updated.quota_bytes);
          }
          if (typeof updated.reserved_bytes === "number") {
            setReservedBytes(updated.reserved_bytes);
          }
        }
      )
      // B. File additions & deletions pushed live via WebSocket
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "files",
          filter: `user_id=eq.${initialUserId}`,
        },
        (payload) => {
          if (!isMountedRef.current) return;
          if (payload.eventType === "INSERT") {
            setActiveFilesCount((c) => c + 1);
          } else if (payload.eventType === "DELETE") {
            setActiveFilesCount((c) => Math.max(0, c - 1));
          }
        }
      )
      .subscribe((status) => {
        if (isMountedRef.current) {
          setRealtimeConnected(status === "SUBSCRIBED");
        }
      });

    return () => {
      isMountedRef.current = false;
      unsubEvents();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }
    };
  }, [initialUserId, refreshStorageState]);

  const contextValue = useMemo<StorageContextType>(
    () => ({
      storageUsedBytes,
      quotaBytes,
      reservedBytes,
      isUnlimited,
      activeFilesCount,
      isSyncing,
      lastSyncedAt,
      realtimeConnected,
      syncWithR2,
      broadcastStorageUpdate,
      refreshStorageState,
    }),
    [
      storageUsedBytes,
      quotaBytes,
      reservedBytes,
      isUnlimited,
      activeFilesCount,
      isSyncing,
      lastSyncedAt,
      realtimeConnected,
      syncWithR2,
      broadcastStorageUpdate,
      refreshStorageState,
    ]
  );

  return (
    <StorageContext.Provider value={contextValue}>
      {children}
    </StorageContext.Provider>
  );
}
