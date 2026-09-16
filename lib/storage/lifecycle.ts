import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteR2Object } from "@/lib/storage/r2";

// Minimum interval between opportunistic lifecycle sweeps (default: 5 minutes)
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSweepTimestamp = 0;
let isSweepInProgress = false;

/**
 * Sweeps and purges claimed single-use files and expired assets from PostgreSQL and Cloudflare R2.
 * Fully self-contained: works on Vercel Hobby, self-hosted, or Supabase without requiring external crons.
 */
export async function executeLifecycleSweep(): Promise<{
  singleUseReconciled: number;
  expiredFilesPurged: number;
  expiredLinksDeactivated: number;
}> {
  const adminClient = createAdminClient();
  const nowIso = new Date().toISOString();

  let singleUseCount = 0;
  let expiredFilesCount = 0;
  let expiredLinksCount = 0;

  try {
    // 1. Deactivate expired share links
    const { data: expiredLinks } = await adminClient
      .from("share_links")
      .select("id")
      .eq("is_active", true)
      .not("expires_at", "is", null)
      .lte("expires_at", nowIso);

    if (expiredLinks && expiredLinks.length > 0) {
      const idsToDeactivate = expiredLinks.map((l) => l.id);
      await adminClient
        .from("share_links")
        .update({ is_active: false })
        .in("id", idsToDeactivate);
      expiredLinksCount = idsToDeactivate.length;
    }

    // 2. Reconcile claimed single-use files whose 90-second download lease has expired
    const { data: singleUseLinks } = await adminClient
      .from("share_links")
      .select(`
        id,
        file_id,
        files (
          id,
          r2_key,
          user_id,
          byte_size,
          status
        )
      `)
      .eq("is_single_use", true)
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

        singleUseCount++;
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
      }
    }
  } catch (err) {
    console.error("[Lifecycle Sweep] Error during opportunistic sweep:", err);
  }

  return {
    singleUseReconciled: singleUseCount,
    expiredFilesPurged: expiredFilesCount,
    expiredLinksDeactivated: expiredLinksCount,
  };
}

/**
 * Non-blocking, debounced scheduler.
 * Enqueues a background sweep using Next.js `after()` so the current request is never delayed.
 * Throttled to execute at most once every 5 minutes per serverless instance.
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
