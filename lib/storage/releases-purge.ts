import { createAdminClient } from "@/lib/supabase/admin";
import { deleteR2Object, listR2Objects } from "@/lib/storage/r2";
import { redis } from "@/lib/redis/client";

export interface PurgeStaleReleasesOptions {
  userId: string;
  targetBinaryFileId?: string;
  baseFileId?: string;
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

const PROTECTED_SLUGS = new Set([
  "gpn-app",
  "gpn-desktop",
  "downex-desktop",
  "downex-base",
  "downex-app",
  "downex-extension",
]);

/**
 * Audit check: returns true if a file is an immutable base installer, companion extension,
 * or protected permanent asset that MUST NEVER be purged under any circumstances.
 */
function isProtectedAsset(file: any, appId: string, baseFileId: string | null): boolean {
  if (!file) return false;
  if (baseFileId && file.id === baseFileId) return true;

  const name = (file.sanitized_name || file.filename || "").toLowerCase();
  const r2Key = (file.r2_key || "").toLowerCase();
  const folder = (file.folder || "").toLowerCase();
  const shareList = Array.isArray(file.share_links)
    ? file.share_links
    : file.share_links
    ? [file.share_links]
    : [];

  // 1. Any file associated with a permanent or protected vanity slug
  if (
    shareList.some(
      (s: any) =>
        s?.slug &&
        (PROTECTED_SLUGS.has(s.slug.toLowerCase()) ||
          s.slug.endsWith("-desktop") ||
          s.slug.endsWith("-base") ||
          s.slug.endsWith("-app") ||
          s.slug.endsWith("-extension"))
    )
  ) {
    return true;
  }

  // 2. Any file in an immutable base or archived folder
  if (
    folder.includes("immutable") ||
    folder.includes("base") ||
    r2Key.includes("immutable") ||
    r2Key.includes("base") ||
    folder.includes("/old/") ||
    folder.startsWith("old/") ||
    r2Key.includes("/old/") ||
    r2Key.startsWith("old/")
  ) {
    return true;
  }

  // 3. Companion browser extensions
  if (name.includes("extension") || r2Key.includes("extension") || folder.includes("extension")) {
    return true;
  }

  // 4. Permanent base installers (v0.0.0)
  if (
    name.includes("0.0.0") &&
    (name.includes("setup") || name.includes("installer") || name.endsWith(".exe") || name.includes("base"))
  ) {
    return true;
  }

  // 5. Files flagged as permanent or never expiring
  if (file.is_permanent === true || file.expiry_preset === "never") {
    return true;
  }

  return false;
}

/**
 * Multi-layer automated purge engine for application releases.
 * Protects:
 *   1. Base v0.0.0 installers (e.g. 'downex-desktop', 'gpn-app', 'downex-base')
 *   2. Companion extensions (e.g. 'downex-extension')
 *   3. Archived release containers in OLD/
 *   4. The newly targeted release binary
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
      .select("id, sanitized_name, filename, folder, byte_size, r2_key, is_permanent, expiry_preset, share_links(slug)")
      .eq("user_id", userId);

    if (filesErr) {
      errors.push(`Failed to fetch user files: ${filesErr.message}`);
    }

    const allFiles = userFiles || [];

    // Base 0.0.0 installer resolution scoped strictly to the requested appId
    const cleanApp = appId.toLowerCase();
    let baseFile = options.baseFileId
      ? allFiles.find((f) => f.id === options.baseFileId)
      : null;

    if (!baseFile) {
      baseFile = allFiles.find((f) => {
        const shareList = Array.isArray(f.share_links)
          ? f.share_links
          : f.share_links
          ? [f.share_links]
          : [];
        const name = (f.sanitized_name || f.filename || "").toLowerCase();
        const folder = (f.folder || "").toLowerCase();
        const r2Key = (f.r2_key || "").toLowerCase();

        if (cleanApp === "downex") {
          return (
            shareList.some((s: any) => s.slug === "downex-desktop" || s.slug === "downex-base" || s.slug === "downex-app") ||
            folder.includes("downex-immutable-base") ||
            r2Key.includes("downex-immutable-base") ||
            (name.includes("downex") && name.includes("0.0.0"))
          );
        } else if (cleanApp === "gpn") {
          return (
            shareList.some((s: any) => s.slug === "gpn-app" || s.slug === "gpn-desktop") ||
            folder.includes("gpn-dynamic-update/0.0.0") ||
            (name.includes("gaurav_personal_notes") && name.includes("0.0.0"))
          );
        } else {
          return (
            shareList.some(
              (s: any) =>
                s.slug === `${cleanApp}-desktop` ||
                s.slug === `${cleanApp}-app` ||
                s.slug === `${cleanApp}-base`
            ) ||
            folder.includes(`${cleanApp}-immutable-base`) ||
            folder.includes("base") ||
            (name.includes(cleanApp) && name.includes("0.0.0"))
          );
        }
      });
    }

    const baseFileId = baseFile?.id || options.baseFileId || null;

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
    // Query files that strictly belong to this specific app (avoid blanket cross-app deletes)
    const isGpnApp = cleanApp === "gpn";
    const appFiles = allFiles.filter((f) => {
      const name = (f.sanitized_name || f.filename || "").toLowerCase();
      const r2Key = (f.r2_key || "").toLowerCase();
      const folder = (f.folder || "").toLowerCase();

      // App identity match
      const belongsToApp = isGpnApp
        ? name.includes("gaurav personal notes") || name.includes("gpn") || r2Key.includes("gpn") || folder.includes("gpn")
        : name.includes(cleanApp) || r2Key.includes(cleanApp) || folder.includes(cleanApp);

      if (!belongsToApp) return false;

      // Extensions are permanent companion assets, NEVER release binaries
      if (name.includes("extension") || r2Key.includes("extension") || folder.includes("extension")) {
        return false;
      }

      // Base installer assets are permanent foundation, NEVER purge candidates
      if (folder.includes("immutable") || folder.includes("base") || r2Key.includes("immutable") || r2Key.includes("base")) {
        return false;
      }

      // Only match potential update binary payloads
      return (
        name.endsWith(".bin") ||
        name.endsWith(".exe") ||
        name.endsWith(".msi") ||
        name.endsWith(".dmg") ||
        name.endsWith(".appimage") ||
        name.endsWith(".deb")
      );
    });

    for (const file of appFiles) {
      // Rule 1: Never delete Base 0.0.0 installer or protected assets
      if (isProtectedAsset(file, appId, baseFileId)) {
        console.log(`[Layer 1 Auto-Purge] Skipping protected asset: ${file.sanitized_name} (${file.id})`);
        continue;
      }

      // Rule 2: Never delete newly published / target binary
      if (resolvedTargetId && file.id === resolvedTargetId) continue;

      // Rule 3: Never delete archived binaries in OLD/ (user manages/deletes manually)
      if (
        (file.r2_key && (file.r2_key.includes("/OLD/") || file.r2_key.startsWith("OLD/"))) ||
        (file.folder && (file.folder.includes("/OLD/") || file.folder.startsWith("OLD/")))
      ) {
        continue;
      }

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

      // 2. Delete share links (protecting all permanent vanity slugs)
      const shareList = Array.isArray(file.share_links)
        ? file.share_links
        : file.share_links
        ? [file.share_links]
        : [];
      const hasProtectedSlug = shareList.some(
        (s: any) =>
          s?.slug &&
          (PROTECTED_SLUGS.has(s.slug.toLowerCase()) ||
            s.slug.endsWith("-desktop") ||
            s.slug.endsWith("-base") ||
            s.slug.endsWith("-extension"))
      );

      if (!hasProtectedSlug) {
        await adminClient
          .from("share_links")
          .delete()
          .eq("file_id", file.id);
      }

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

    // Clean up lingering app_releases rows not matching 0.0.0 or targetBinaryFileId
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
    const purgedIds = new Set(layer1_purged_files.map((p) => p.id));
    const allowedR2Keys = new Set<string>();
    if (baseFile?.r2_key) allowedR2Keys.add(baseFile.r2_key);
    if (targetFile?.r2_key) allowedR2Keys.add(targetFile.r2_key);
    for (const f of allFiles) {
      if (!purgedIds.has(f.id) && f.r2_key) {
        allowedR2Keys.add(f.r2_key);
      }
    }

    try {
      const userPrefix = `u/${userId}/`;
      const physicalObjects = await listR2Objects(userPrefix);

      for (const obj of physicalObjects) {
        const key = obj.key;
        const lowerKey = key.toLowerCase();

        // Never delete archived binaries in OLD/
        if (lowerKey.includes("/old/") || lowerKey.startsWith("old/")) continue;

        // Never delete immutable base files
        if (lowerKey.includes("immutable") || lowerKey.includes("base")) continue;

        // Never delete companion extension files
        if (lowerKey.includes("extension")) continue;

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
      .eq("user_id", userId)
      .in("status", ["ACTIVE", "EXPIRING"]);

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
