import { ListObjectsV2Command, ListObjectsV2CommandOutput } from "@aws-sdk/client-s3";
import { getR2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeFilename } from "@/lib/storage/sanitizer";

export interface ReconciliationResult {
  userId: string;
  r2ObjectCount: number;
  r2TotalBytes: number;
  dbFileCount: number;
  dbStorageUsedBytes: number;
  reconciledFilesCount: number;
  reconciledFiles: Array<{
    id: string;
    sanitized_name: string;
    byte_size: number;
    r2_key: string;
  }>;
  syncedAt: string;
}

/**
 * Guesses MIME type from file extension.
 */
function guessMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "pdf":
      return "application/pdf";
    case "txt":
      return "text/plain";
    case "json":
      return "application/json";
    case "zip":
      return "application/zip";
    case "mp4":
      return "video/mp4";
    case "mp3":
      return "audio/mpeg";
    default:
      return "application/octet-stream";
  }
}

/**
 * Authoritative Cloudflare R2 Physical Reconciliation Engine.
 * Scans Cloudflare R2 bucket for objects belonging to the user (or all objects if admin).
 * Auto-registers missing files in PostgreSQL and synchronizes storage_used_bytes to match physical truth.
 */
export async function reconcileUserStorage(
  userId: string,
  isAdmin: boolean = false
): Promise<ReconciliationResult> {
  const adminClient = createAdminClient();
  const r2 = getR2Client();

  // 1. Fetch physical objects from Cloudflare R2
  // We list objects with prefix `u/${userId}/`
  const userPrefix = `u/${userId}/`;
  const r2Objects: Array<{ key: string; size: number; etag: string; lastModified?: Date }> = [];

  let continuationToken: string | undefined = undefined;
  do {
    const listCmd = new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: userPrefix,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    });
    const res: ListObjectsV2CommandOutput = await r2.send(listCmd);
    if (res.Contents) {
      for (const obj of res.Contents) {
        if (obj.Key && obj.Size !== undefined) {
          r2Objects.push({
            key: obj.Key,
            size: obj.Size,
            etag: (obj.ETag || "").replace(/^"|"$/g, ""),
            lastModified: obj.LastModified,
          });
        }
      }
    }
    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  // If user is admin, also scan root objects
  // in case files were uploaded directly via Cloudflare Console without a `u/{userId}/` prefix.
  if (isAdmin) {
    let rootToken: string | undefined = undefined;
    do {
      const rootCmd = new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        ContinuationToken: rootToken,
        MaxKeys: 1000,
      });
      const res: ListObjectsV2CommandOutput = await r2.send(rootCmd);
      if (res.Contents) {
        for (const obj of res.Contents) {
          if (!obj.Key || obj.Size === undefined) continue;
          // Only process root objects that don't belong to another user (`u/...`)
          if (!obj.Key.startsWith("u/")) {
            // Root object uploaded directly to bucket!
            const alreadyIncluded = r2Objects.some((o) => o.key === obj.Key);
            if (!alreadyIncluded) {
              r2Objects.push({
                key: obj.Key,
                size: obj.Size,
                etag: (obj.ETag || "").replace(/^"|"$/g, ""),
                lastModified: obj.LastModified,
              });
            }
          }
        }
      }
      rootToken = res.NextContinuationToken;
    } while (rootToken);
  }

  const r2ObjectCount = r2Objects.length;
  const r2TotalBytes = r2Objects.reduce((acc, curr) => acc + curr.size, 0);

  // 2. Fetch existing database records for this user
  const { data: dbFiles, error: dbErr } = await adminClient
    .from("files")
    .select("id, r2_key, byte_size, status")
    .eq("user_id", userId);

  if (dbErr) {
    console.error("[Reconcile] Error fetching DB files:", dbErr);
    throw new Error("Failed to query database files during reconciliation");
  }

  const dbFilesMap = new Map<string, { id: string; byte_size: number; status: string }>();
  (dbFiles || []).forEach((f) => {
    dbFilesMap.set(f.r2_key, f);
  });

  const reconciledFiles: Array<{
    id: string;
    sanitized_name: string;
    byte_size: number;
    r2_key: string;
  }> = [];

  // 3. Reconcile R2 objects missing in database
  for (const r2Obj of r2Objects) {
    const existing = dbFilesMap.get(r2Obj.key);

    if (!existing) {
      // Physical R2 file exists, but no DB record! Auto-register it into PostgreSQL
      const rawName = r2Obj.key.split("/").pop() || "recovered-file.bin";
      const filename = sanitizeFilename(rawName);
      const mimeType = guessMimeType(filename);
      const nowIso = new Date().toISOString();

      const { data: newFile, error: insertErr } = await adminClient
        .from("files")
        .insert({
          user_id: userId,
          filename: filename,
          sanitized_name: filename,
          byte_size: r2Obj.size,
          mime_type: mimeType,
          r2_key: r2Obj.key,
          r2_etag: r2Obj.etag,
          status: "ACTIVE",
          expiry_preset: "never",
          expires_at: null,
          created_at: r2Obj.lastModified ? r2Obj.lastModified.toISOString() : nowIso,
          updated_at: nowIso,
        })
        .select("id, sanitized_name, byte_size, r2_key")
        .single();

      if (!insertErr && newFile) {
        reconciledFiles.push(newFile);
        dbFilesMap.set(r2Obj.key, {
          id: newFile.id,
          byte_size: newFile.byte_size,
          status: "ACTIVE",
        });
      }
    } else if (existing.status !== "ACTIVE" && existing.status !== "EXPIRING") {
      // File exists physically in R2, but was marked non-active (e.g. UPLOADING or EXPIRED)
      await adminClient
        .from("files")
        .update({
          status: "ACTIVE",
          byte_size: r2Obj.size,
          r2_etag: r2Obj.etag,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      reconciledFiles.push({
        id: existing.id,
        sanitized_name: sanitizeFilename(r2Obj.key.split("/").pop() || "recovered-file.bin"),
        byte_size: r2Obj.size,
        r2_key: r2Obj.key,
      });

      dbFilesMap.set(r2Obj.key, {
        id: existing.id,
        byte_size: r2Obj.size,
        status: "ACTIVE",
      });
    }
  }

  // 4. Compute true active file storage from database
  const { data: activeFiles, error: activeErr } = await adminClient
    .from("files")
    .select("id, byte_size")
    .eq("user_id", userId)
    .in("status", ["ACTIVE", "EXPIRING"]);

  if (activeErr) {
    console.error("[Reconcile] Error fetching active files:", activeErr);
    throw new Error("Failed to calculate active storage bytes");
  }

  const trueDbStorageBytes = (activeFiles || []).reduce((sum, f) => sum + (f.byte_size || 0), 0);
  const dbFileCount = (activeFiles || []).length;

  // 5. Update user's profile with true storage bytes
  const { error: profileUpdateErr } = await adminClient
    .from("profiles")
    .update({
      storage_used_bytes: trueDbStorageBytes,
      reserved_bytes: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (profileUpdateErr) {
    console.error("[Reconcile] Failed to update profile storage_used_bytes:", profileUpdateErr);
  }

  return {
    userId,
    r2ObjectCount,
    r2TotalBytes,
    dbFileCount,
    dbStorageUsedBytes: trueDbStorageBytes,
    reconciledFilesCount: reconciledFiles.length,
    reconciledFiles,
    syncedAt: new Date().toISOString(),
  };
}
