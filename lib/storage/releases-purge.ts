import { createAdminClient } from "@/lib/supabase/admin";
import { deleteR2Object, listR2Objects } from "@/lib/storage/r2";
import { redis } from "@/lib/redis/client";

export interface PurgeStaleReleasesOptions {
  userId: string;
  targetBinaryFileId?: string;
  appId?: string;
}

export interface PurgeStaleReleasesResult {
  success: boolean;
  baseFileId: string | null;
  targetFileId: string | null;
  layer1_db_purged_count: number;
  layer1_purged_files: { id: string; name: string; size: number }[];
  layer2_r2_orphans_purged_count: number;
  layer2_purged_keys: string[];
  final_files_count: number;
  final_storage_bytes: number;
  errors: string[];
}

/**
 * Multi-layer automated purge engine for GPN releases.
 * Enforces the Strict 2-File Maximum Rule:
 *   1. Base v0.0.0 installer (anchored to vanity slug 'gpn-app', permanent & untouched)
 *   2. Single active OTA binary (latest target release)
 *
 * Layer 1: Server Database & Metadata Scan (Deletes superseded records & physical objects)
 * Layer 2: Cloudflare R2 Direct Reconciliation Sweep (Purges unindexed / orphaned R2 objects)
 */
export async function purgeStaleReleaseBinaries(
  options: PurgeStaleReleasesOptions
): Promise<PurgeStaleReleasesResult> {
  const { userId, targetBinaryFileId, appId = "gpn" } = options;
  const adminClient = createAdminClient();
  const errors: string[] = [];

  const layer1_purged_files: { id: string; name: string; size: number }[] = [];
  const layer2_purged_keys: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // Step 1: Identify Base 0.0.0 File and Target File
    // -------------------------------------------------------------------------
    const { data: userFiles, error: filesErr } = await adminClient
      .from("files")
      .select("id, sanitized_name, filename, byte_size, r2_key, share_links(slug)")
      .eq("user_id", userId);

    if (filesErr) {
      errors.push(`Failed to fetch user files: ${filesErr.message}`);
    }

    const allFiles = userFiles || [];

    // Base 0.0.0 installer resolution (anchored to 'gpn-app' or containing 0.0.0)
    const baseFile = allFiles.find((f) => {
      const shareList = Array.isArray(f.share_links)
        ? f.share_links
        : f.share_links
        ? [f.share_links]
        : [];
      return (
        shareList.some((s: any) => s.slug === "gpn-app") ||
        (f.sanitized_name || "").includes("0.0.0") ||
        (f.filename || "").includes("0.0.0")
      );
    });

    const baseFileId = baseFile?.id || null;

    // Target Active OTA file resolution
    let resolvedTargetId = targetBinaryFileId || null;
    if (!resolvedTargetId) {
      const { data: latestRelease } = await adminClient
        .from("app_releases")
        .select("binary_file_id, version")
        .eq("app_id", appId)
        .neq("version", "0.0.0")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      resolvedTargetId = latestRelease?.binary_file_id || null;
    }

    const targetFile = allFiles.find((f) => f.id === resolvedTargetId) || null;

    // -------------------------------------------------------------------------
    // LAYER 1: Server Database & Metadata Scan
    // -------------------------------------------------------------------------
    // Query all files matching GPN installer patterns
    const gpnFiles = allFiles.filter((f) => {
      const name = (f.sanitized_name || f.filename || "").toLowerCase();
      return (
        name.includes("gaurav personal notes") ||
        name.includes("gpn") ||
        name.endsWith(".exe") ||
        name.endsWith(".msi") ||
        name.endsWith(".nsis.zip")
      );
    });

    for (const file of gpnFiles) {
      // Rule: Never delete Base 0.0.0 installer
      if (baseFileId && file.id === baseFileId) continue;
      // Rule: Never delete newly published / target binary
      if (resolvedTargetId && file.id === resolvedTargetId) continue;
      // Rule: Never delete archived binaries in OLD/ (user manages/deletes manually)
      if (file.r2_key && (file.r2_key.includes("/OLD/") || file.r2_key.startsWith("OLD/"))) continue;

      // This is a superseded stale binary
      console.log(`[Layer 1 Auto-Purge] Deleting superseded file: ${file.sanitized_name} (${file.id})`);

      // 1. Delete physical object from Cloudflare R2
      if (file.r2_key) {
        try {
          await deleteR2Object(file.r2_key);
        } catch (r2Err: any) {
          errors.push(`Layer 1 R2 delete failed for key ${file.r2_key}: ${r2Err.message}`);
        }
      }

      // 2. Delete share links (protecting vanity slug 'gpn-app')
      await adminClient
        .from("share_links")
        .delete()
        .eq("file_id", file.id)
        .neq("slug", "gpn-app");

      // 3. Delete obsolete app_releases row
      await adminClient
        .from("app_releases")
        .delete()
        .eq("binary_file_id", file.id);

      // 4. Delete file record from files table
      const { error: delErr } = await adminClient
        .from("files")
        .delete()
        .eq("id", file.id);

      if (delErr) {
        errors.push(`Layer 1 DB delete failed for file ${file.id}: ${delErr.message}`);
      } else {
        layer1_purged_files.push({
          id: file.id,
          name: file.sanitized_name || file.filename || "unknown",
          size: file.byte_size || 0,
        });
      }

      // 5. Purge any redis cache
      if (redis) {
        try {
          await redis.del(`file:${file.id}`);
        } catch {}
      }
    }

    // Clean up any lingering app_releases rows not matching 0.0.0 or targetBinaryFileId
    if (resolvedTargetId) {
      await adminClient
        .from("app_releases")
        .delete()
        .eq("app_id", appId)
        .neq("version", "0.0.0")
        .neq("binary_file_id", resolvedTargetId);
    }

    // -------------------------------------------------------------------------
    // LAYER 2: Cloudflare R2 Direct Reconciliation Sweep
    // Physical bucket scan for orphaned/untracked binary payloads
    // -------------------------------------------------------------------------
    const allowedR2Keys = new Set<string>();
    if (baseFile?.r2_key) allowedR2Keys.add(baseFile.r2_key);
    if (targetFile?.r2_key) allowedR2Keys.add(targetFile.r2_key);

    try {
      const userPrefix = `u/${userId}/`;
      const physicalObjects = await listR2Objects(userPrefix);

      for (const obj of physicalObjects) {
        const key = obj.key;
        // Never delete archived binaries in OLD/ (user manages/deletes manually)
        if (key.includes("/OLD/") || key.startsWith("OLD/")) continue;

        // Check if object is an executable/installer payload
        const isBinaryPayload =
          key.endsWith(".exe") ||
          key.endsWith(".msi") ||
          key.endsWith(".zip") ||
          obj.size > 2 * 1024 * 1024; // > 2MB

        if (isBinaryPayload && !allowedR2Keys.has(key)) {
          console.warn(`[Layer 2 Auto-Purge] Found unindexed/orphaned R2 binary: ${key} (${obj.size} bytes). Purging...`);
          const deleted = await deleteR2Object(key);
          if (deleted) {
            layer2_purged_keys.push(key);
            // Also clean up any lingering DB row referencing this key
            await adminClient.from("files").delete().eq("r2_key", key);
          } else {
            errors.push(`Layer 2 failed to delete R2 orphan ${key}`);
          }
        }
      }
    } catch (l2Err: any) {
      errors.push(`Layer 2 reconciliation sweep error: ${l2Err.message}`);
    }

    // -------------------------------------------------------------------------
    // Recalculate Profile Storage Usage
    // -------------------------------------------------------------------------
    const { data: remainingFiles } = await adminClient
      .from("files")
      .select("id, byte_size, sanitized_name, filename")
      .eq("user_id", userId);

    const totalUsed = (remainingFiles || []).reduce((acc, f) => acc + (f.byte_size || 0), 0);

    await adminClient
      .from("profiles")
      .update({ storage_used_bytes: totalUsed, updated_at: new Date().toISOString() })
      .eq("id", userId);

    const finalFilesCount = (remainingFiles || []).length;

    return {
      success: errors.length === 0,
      baseFileId,
      targetFileId: resolvedTargetId,
      layer1_db_purged_count: layer1_purged_files.length,
      layer1_purged_files,
      layer2_r2_orphans_purged_count: layer2_purged_keys.length,
      layer2_purged_keys,
      final_files_count: finalFilesCount,
      final_storage_bytes: totalUsed,
      errors,
    };
  } catch (err: any) {
    errors.push(`Unexpected error in purge engine: ${err.message}`);
    return {
      success: false,
      baseFileId: null,
      targetFileId: null,
      layer1_db_purged_count: layer1_purged_files.length,
      layer1_purged_files,
      layer2_r2_orphans_purged_count: layer2_purged_keys.length,
      layer2_purged_keys,
      final_files_count: -1,
      final_storage_bytes: -1,
      errors,
    };
  }
}
