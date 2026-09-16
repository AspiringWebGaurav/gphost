"use client";

import { createContext, useContext } from "react";

export interface StorageContextType {
  storageUsedBytes: number;
  quotaBytes: number;
  reservedBytes: number;
  isUnlimited: boolean;
  activeFilesCount: number;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  realtimeConnected: boolean;
  syncWithR2: (silent?: boolean) => Promise<void>;
  broadcastStorageUpdate: (data?: {
    storageUsedBytes?: number;
    reservedBytes?: number;
    activeFilesCountDelta?: number;
  }) => void;
  refreshStorageState: () => Promise<void>;
}

export const StorageContext = createContext<StorageContextType | null>(null);

export function useStorageSync(): StorageContextType {
  const context = useContext(StorageContext);
  if (!context) {
    throw new Error("useStorageSync must be used within a StorageProvider");
  }
  return context;
}
