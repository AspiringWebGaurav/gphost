/**
 * Robust, Typed Storage Event System for GPHosting.
 * Pure event-driven architecture connecting Client UI, Cross-tab BroadcastChannels,
 * and Cloudflare R2 lifecycle events.
 * 
 * Zero polling. 100% event-driven.
 */

export interface StorageUpdatedPayload {
  storageUsedBytes: number;
  quotaBytes?: number;
  reservedBytes?: number;
  deltaBytes?: number;
  activeFilesCount?: number;
  source?: "websocket" | "local_optimistic" | "r2_sync" | "cross_tab" | "webhook";
}

export interface FileLifecyclePayload {
  fileId: string;
  filename?: string;
  size: number;
  action: "created" | "deleted" | "extended" | "burned";
}

export type StorageEventMap = {
  "storage:updated": StorageUpdatedPayload;
  "file:lifecycle": FileLifecyclePayload;
  "r2:reconciled": {
    r2ObjectCount: number;
    r2TotalBytes: number;
    dbStorageUsedBytes: number;
    syncedAt: string;
  };
};

type EventCallback<T> = (data: T) => void;

class StorageEventEmitter {
  private listeners: Map<string, Set<EventCallback<unknown>>> = new Map();
  private broadcastChannel: BroadcastChannel | null = null;
  private channelName = "gphost_storage_event_bus";

  constructor() {
    if (typeof window !== "undefined") {
      if ("BroadcastChannel" in window) {
        try {
          this.broadcastChannel = new BroadcastChannel(this.channelName);
          this.broadcastChannel.onmessage = (e) => {
            const { event, data } = e.data || {};
            if (event && data) {
              this.notifyLocal(event, data);
            }
          };
        } catch {
          this.broadcastChannel = null;
        }
      }
    }
  }

  /**
   * Subscribe to a typed storage event.
   */
  on<K extends keyof StorageEventMap>(
    event: K,
    callback: EventCallback<StorageEventMap[K]>
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(callback as EventCallback<unknown>);

    return () => {
      set.delete(callback as EventCallback<unknown>);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  /**
   * Emit an event locally to all components in the current window.
   */
  private notifyLocal<K extends keyof StorageEventMap>(
    event: K,
    data: StorageEventMap[K]
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((cb) => {
        try {
          cb(data);
        } catch (err) {
          console.error(`[StorageEventBus] Error in listener for ${event}:`, err);
        }
      });
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(`gphost:${event}`, {
          detail: data,
        })
      );
    }
  }

  /**
   * Authoritative emit: notifies local window AND broadcasts across all open tabs.
   */
  emit<K extends keyof StorageEventMap>(
    event: K,
    data: StorageEventMap[K],
    broadcastCrossTab = true
  ): void {
    // 1. Notify local subscribers
    this.notifyLocal(event, data);

    // 2. Broadcast across browser tabs
    if (broadcastCrossTab && this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ event, data });
      } catch {
        // Fallback or closed channel
      }
    }
  }
}

// Singleton event bus instance
export const storageEvents = new StorageEventEmitter();
