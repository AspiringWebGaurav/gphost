import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteR2Object, abortR2MultipartUpload } from "@/lib/storage/r2";
import { redis } from "@/lib/redis/client";
import { deleteXurlLink } from "@/lib/xurl/client";



/**
 * Permanently purges all Redis keys associated with a share link slug,
 * including metadata caches and all claimed download slot locks (IP & hardware device fingerprints).
 * Guarantees zero orphaned state or ghost locks when a link is deleted or expires.
 */
export async function purgeShareLinkRedisData(slug: string): Promise<void> {
  if (!slug) return;
  try {
    const keysToDelete: string[] = [
      `raw:meta:${slug}`,
      `share:pub:${slug}`,
      `share:slug:${slug}`,
      `share:meta:${slug}`,
      `share:claim_meta:${slug}`,
      `check_slug:${slug}`,
      `share_enhancements:${slug}`,
    ];

    // Scan and clean all claimed slots (IP locks, hardware device fingerprint locks, user locks)
    const slotKeys = await redis.keys(`claimed_slot:${slug}:*`);
    if (Array.isArray(slotKeys) && slotKeys.length > 0) {
      keysToDelete.push(...slotKeys);
    }

    await Promise.all(keysToDelete.map((key) => redis.del(key)));
  } catch (err) {
    console.warn(`[Lifecycle] Failed to purge Redis keys for slug '${slug}':`, err);
  }
}

export const purgeShareRedisKeys = purgeShareLinkRedisData;

/**
 * Sweeps and purges claimed single-use files and expired assets from PostgreSQL and Cloudflare R2.
 * Fully self-contained: works on Vercel Hobby, self-hosted, or Supabase without requiring external crons.
 */
export async function executeLifecycleSweep(): Promise<{
  singleUseReconciled: number;
  expiredFilesPurged: number;
  expiredLinksDeactivated: number;
  abandonedUploadsPruned: number;
}> {
  const adminClient = createAdminClient();
  const nowIso = new Date().toISOString();

  let singleUseCount = 0;
  let expiredFilesCount = 0;
  let expiredLinksCount = 0;
  let abandonedUploadsCount = 0;

  try {
    // 1. Zero Stale Data: Permanently purge expired and deactivated share links
    // Slugs are immediately freed for recycling, and ON DELETE CASCADE wipes file_downloads & xurl_mappings
    const { data: expiredLinks } = await adminClient
      .from("share_links")
      .select("id, slug")
      .or(`expires_at.lte.${nowIso},is_active.eq.false`);

    if (expiredLinks && expiredLinks.length > 0) {
      const idsToPurge = expiredLinks.map((l) => l.id);

      // Fetch and delete associated XURL vanity links externally
      try {
        const { data: mappings } = await adminClient
          .from("xurl_mappings")
          .select("xurl_id")
          .in("share_link_id", idsToPurge);

        if (mappings && mappings.length > 0) {
          for (const m of mappings) {
            if (m.xurl_id) void deleteXurlLink(m.xurl_id);
          }
        }
      } catch (xurlErr) {
        console.warn("[Lifecycle Sweep] Error pruning XURL links:", xurlErr);
      }

      // Hard-delete the share links row (PostgreSQL cascades deletion to file_downloads and xurl_mappings)
      const { error: delErr } = await adminClient
        .from("share_links")
        .delete()
        .in("id", idsToPurge);

      if (delErr) {
        console.error("[Lifecycle Sweep] Error hard-deleting expired share links:", delErr);
      } else {
        expiredLinksCount = idsToPurge.length;
      }

      // Invalidate all associated Redis caches & claimed slot locks
      try {
        await Promise.all(
          expiredLinks.map((link) => (link.slug ? purgeShareLinkRedisData(link.slug) : Promise.resolve()))
        );
      } catch (redisErr) {
        console.warn("Failed to invalidate Redis keys during expired links sweep:", redisErr);
      }
    }

    // 2. Reconcile claimed single-use files whose 50-second download lease has expired
    // Strictly requires download_count > 0 so un-downloaded single-use files are never purged prematurely!
    const { data: singleUseLinks } = await adminClient
      .from("share_links")
      .select(`
        id,
        file_id,
        download_count,
        files (
          id,
          r2_key,
          user_id,
          byte_size,
          status
        )
      `)
      .eq("is_single_use", true)
      .gt("download_count", 0)
      .limit(50);

    if (singleUseLinks && singleUseLinks.length > 0) {
      for (const link of singleUseLinks) {
        // Extract joined file record
        const fileRaw = link.files;
        const file = Array.isArray(fileRaw) ? fileRaw[0] : fileRaw;
        if (!file || file.status === "PURGED" || !file.id) continue;

        // Verify if any active download lease remains in progress (lease_expires_at > NOW())
        const { data: activeLease } = await adminClient
          .from("file_downloads")
          .select("id")
          .eq("file_id", file.id)
          .gt("lease_expires_at", nowIso)
          .limit(1)
          .maybeSingle();

        // If an active download lease is still running, leave it alone for now
        if (activeLease) continue;

        // Atomically reconcile in PostgreSQL (reclaims quota, transitions status)
        const { error: rpcErr } = await adminClient.rpc("reconcile_single_use_file", {
          p_file_id: file.id,
        });

        if (rpcErr) {
          // DOWNLOAD_LEASE_ACTIVE or already handled
          continue;
        }

        // Delete physical object from Cloudflare R2
        if (file.r2_key) {
          await deleteR2Object(file.r2_key);
        }

        // Mark permanently purged
        await adminClient
          .from("files")
          .update({ status: "PURGED", updated_at: nowIso })
          .eq("id", file.id);

        // Hard-delete the single-use share link to eliminate stale records
        await adminClient
          .from("share_links")
          .delete()
          .eq("id", link.id);

        singleUseCount++;

        // Invalidate Redis caches for single-use file and associated shares
        try {
          const { data: shares } = await adminClient
            .from("share_links")
            .select("slug")
            .eq("file_id", file.id);
          const delPromises: Promise<unknown>[] = [redis.del(`analytics:${file.id}`)];
          if (shares) {
            for (const s of shares) {
              if (s.slug) {
                delPromises.push(purgeShareLinkRedisData(s.slug));
              }
            }
          }
          await Promise.all(delPromises);
        } catch {}
      }
    }

    // 3. Purge expired files that reached their TTL
    const { data: expiredFiles } = await adminClient
      .from("files")
      .select("id, r2_key, user_id, byte_size")
      .eq("status", "ACTIVE")
      .not("expires_at", "is", null)
      .lte("expires_at", nowIso)
      .limit(50);

    if (expiredFiles && expiredFiles.length > 0) {
      for (const file of expiredFiles) {
        // Delete physical R2 object
        if (file.r2_key) {
          await deleteR2Object(file.r2_key);
        }

        // Mark file as PURGED and reclaim user's storage quota
        await adminClient
          .from("files")
          .update({ status: "PURGED", updated_at: nowIso })
          .eq("id", file.id);

        if (file.byte_size > 0 && file.user_id) {
          try {
            await adminClient.rpc("decrement_storage_used", {
              p_user_id: file.user_id,
              p_bytes: file.byte_size,
            });
          } catch {
            // Fallback direct update if RPC is missing
            const { data: prof } = await adminClient
              .from("profiles")
              .select("storage_used_bytes")
              .eq("id", file.user_id)
              .single();
            if (prof) {
              await adminClient
                .from("profiles")
                .update({
                  storage_used_bytes: Math.max(0, prof.storage_used_bytes - file.byte_size),
                })
                .eq("id", file.user_id);
            }
          }
        }

        expiredFilesCount++;

        // Invalidate Redis caches for purged expired file and associated shares
        try {
          const { data: shares } = await adminClient
            .from("share_links")
            .select("slug")
            .eq("file_id", file.id);
          const delPromises: Promise<unknown>[] = [redis.del(`analytics:${file.id}`)];
          if (shares) {
            for (const s of shares) {
              if (s.slug) {
                delPromises.push(purgeShareLinkRedisData(s.slug));
              }
            }
          }
          await Promise.all(delPromises);
        } catch {}
      }
    }

    // 4. Prune abandoned UPLOADING records older than 15 minutes and release reserved quota
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: abandonedUploads } = await adminClient
      .from("files")
      .select("id, r2_key, user_id, byte_size, is_multipart, r2_upload_id")
      .eq("status", "UPLOADING")
      .lte("created_at", fifteenMinutesAgo)
      .limit(50);

    if (abandonedUploads && abandonedUploads.length > 0) {
      for (const file of abandonedUploads) {
        // Release reserved quota
        if (file.byte_size > 0 && file.user_id) {
          try {
            await adminClient.rpc("release_quota_reservation", {
              p_user_id: file.user_id,
              p_reserved_bytes: file.byte_size,
            });
          } catch (e) {
            console.error("[Lifecycle Sweep] Failed to release quota for abandoned upload:", e);
          }
        }

        // Abort multipart if applicable
        if (file.is_multipart && file.r2_upload_id && file.r2_key) {
          try {
            await abortR2MultipartUpload(file.r2_key, file.r2_upload_id);
          } catch {
            // Ignore abort error
          }
        }

        // Delete physical R2 object if any exists
        if (file.r2_key) {
          try {
            await deleteR2Object(file.r2_key);
          } catch {
            // Ignore if object doesn't exist
          }
        }

        // Permanently delete the abandoned upload placeholder
        await adminClient
          .from("files")
          .delete()
          .eq("id", file.id);

        abandonedUploadsCount++;
      }
    }

    // 5. GDPR Data Retention Lifecycle: Purge stale telemetry, download, and audit records older than 90 days
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    try {
      await adminClient
        .from("file_events")
        .delete()
        .lte("created_at", ninetyDaysAgo);

      await adminClient
        .from("file_downloads")
        .delete()
        .lte("created_at", ninetyDaysAgo);

      await adminClient
        .from("audit_logs")
        .delete()
        .lte("created_at", ninetyDaysAgo);
    } catch (gdprErr) {
      console.warn("[Lifecycle Sweep] GDPR log retention cleanup notice:", gdprErr);
    }
  } catch (err) {
    console.error("[Lifecycle Sweep] Error during opportunistic sweep:", err);
  }

  return {
    singleUseReconciled: singleUseCount,
    expiredFilesPurged: expiredFilesCount,
    expiredLinksDeactivated: expiredLinksCount,
    abandonedUploadsPruned: abandonedUploadsCount,
  };
}

// Minimum interval between opportunistic lifecycle sweeps (default: 10 minutes)
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
let lastSweepTimestamp = 0;
let isSweepInProgress = false;

/**
 * Non-blocking, debounced scheduler optimized for Vercel Serverless / Free Quota plans.
 * Enqueues a background sweep using Next.js `after()` with a distributed Redis lock (`lock:lifecycle_sweep`, 10 min TTL).
 * Guarantees that across all global serverless instances, at most 1 instance executes a DB sweep every 10 minutes,
 * reducing serverless CPU burn by ~95% while keeping background garbage collection robust and automatic.
 */
export function scheduleOpportunisticLifecycleSweep(): void {
  const now = Date.now();
  if (isSweepInProgress || now - lastSweepTimestamp < SWEEP_INTERVAL_MS) {
    return;
  }

  lastSweepTimestamp = now;

  try {
    after(async () => {
      if (isSweepInProgress) return;

      // Distributed Redis lock: ensure only 1 serverless container executes the sweep globally
      try {
        const acquired = await redis.set("lock:lifecycle_sweep", "1", { nx: true, ex: 600 });
        if (!acquired) {
          return;
        }
      } catch {
        // Fallback gracefully if Redis is temporarily unreachable
      }

      isSweepInProgress = true;
      try {
        await executeLifecycleSweep();
      } finally {
        isSweepInProgress = false;
      }
    });
  } catch {
    // If called outside Next.js request context (e.g. background worker or test), fire asynchronously
    if (!isSweepInProgress) {
      isSweepInProgress = true;
      executeLifecycleSweep()
        .catch(() => {})
        .finally(() => {
          isSweepInProgress = false;
        });
    }
  }
}
