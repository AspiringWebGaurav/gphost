/**
 * Browser-side Resumable Upload Persistence via IndexedDB.
 *
 * Saves active multipart upload state in the user's browser.
 * - 0 bytes Vercel CPU
 * - 0 bytes Vercel bandwidth
 * - Survives page refreshes, tab closures, and transient network drops
 */

export interface PendingUpload {
  fileId: string;
  uploadId: string;
  key: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  completedParts: { PartNumber: number; ETag: string }[];
  totalParts: number;
  updatedAt: number;
}

const DB_NAME = "gphost_storage";
const DB_VERSION = 1;
const STORE_NAME = "pending_multipart_uploads";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this environment."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "fileId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Persists an in-flight multipart upload session with its completed parts.
 */
export async function savePendingUpload(upload: PendingUpload): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({ ...upload, updatedAt: Date.now() });

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Could not persist upload session to IndexedDB:", err);
  }
}

/**
 * Retrieves all pending incomplete uploads stored in IndexedDB.
 */
export async function listPendingUploads(): Promise<PendingUpload[]> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const uploads = (req.result as PendingUpload[]) || [];
        // Filter out items older than 24 hours
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        resolve(uploads.filter((u) => u.updatedAt > cutoff));
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Could not retrieve pending uploads from IndexedDB:", err);
    return [];
  }
}

/**
 * Removes a completed or discarded upload session from IndexedDB.
 */
export async function removePendingUpload(fileId: string): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(fileId);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Could not delete pending upload from IndexedDB:", err);
  }
}
