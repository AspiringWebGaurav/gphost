import { createAdminClient } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis/client";
import { moveR2Object, deleteR2Object } from "@/lib/storage/r2";
import { purgeShareLinkRedisData } from "@/lib/storage/lifecycle";
import { deleteXurlLink } from "@/lib/xurl/client";

export * from "@/lib/storage/folder-utils";
import {
  type FolderItem,
  type FolderTreeNode,
  type FolderContents,
  normalizeFolderPath,
  getFolderNameFromPath,
  getFolderParentPath,
  getFolderDepth,
  getBreadcrumbs,
  extractFolderFromR2Key,
  sanitizeFolderName,
} from "@/lib/storage/folder-utils";


// Key for Redis fallback store
function getRedisFolderKey(userId: string): string {
  return `folders:store:${userId}`;
}

/**
 * Retrieves all folder items for a user.
 * Tries Supabase table first; transparently falls back to Upstash Redis if table not yet migrated.
 */
export async function getAllUserFolders(userId: string): Promise<FolderItem[]> {
  const adminClient = createAdminClient();

  try {
    const { data, error } = await adminClient
      .from("folders")
      .select("*")
      .eq("user_id", userId)
      .order("path", { ascending: true });

    if (!error && data && data.length > 0) {
      return data as FolderItem[];
    }
  } catch {}

  // Redis fallback
  try {
    if (redis) {
      const allEntries = await redis.hgetall<Record<string, string>>(getRedisFolderKey(userId));
      if (allEntries && Object.keys(allEntries).length > 0) {
        const items = Object.values(allEntries)
          .map((str) => {
            try {
              return typeof str === "string" ? (JSON.parse(str) as FolderItem) : (str as FolderItem);
            } catch {
              return null;
            }
          })
          .filter(Boolean) as FolderItem[];

        return items.sort((a, b) => a.path.localeCompare(b.path));
      }
    }
  } catch {}

  return [];
}

/**
 * Creates or retrieves a folder, ensuring all ancestor parent folders exist automatically.
 */
export async function createFolder(userId: string, rawPath: string): Promise<FolderItem> {
  const norm = normalizeFolderPath(rawPath);
  if (!norm) {
    throw new Error("Folder path cannot be empty");
  }

  const adminClient = createAdminClient();
  const parts = norm.split("/");
  let currentAccumulated = "";
  let lastFolderItem: FolderItem | null = null;

  for (let i = 0; i < parts.length; i++) {
    const segName = parts[i];
    const segParent = currentAccumulated || null;
    currentAccumulated = currentAccumulated ? `${currentAccumulated}/${segName}` : segName;
    const depth = i;
    const now = new Date().toISOString();

    const candidate: FolderItem = {
      id: crypto.randomUUID(),
      user_id: userId,
      name: segName,
      path: currentAccumulated,
      parent_path: segParent,
      depth,
      created_at: now,
      updated_at: now,
    };

    let thisFolderItem: FolderItem = candidate;

    // 1. Try Supabase
    try {
      const { data, error } = await adminClient
        .from("folders")
        .upsert(
          {
            user_id: userId,
            name: segName,
            path: currentAccumulated,
            parent_path: segParent,
            depth,
            updated_at: now,
          },
          { onConflict: "user_id,path" }
        )
        .select("*")
        .single();

      if (!error && data) {
        thisFolderItem = data as FolderItem;
      }
    } catch {}

    // 2. Redis fallback / sync
    if (redis) {
      try {
        await redis.hset(getRedisFolderKey(userId), {
          [currentAccumulated]: JSON.stringify(thisFolderItem),
        });
      } catch {}
    }

    lastFolderItem = thisFolderItem;
  }

  return lastFolderItem!;
}

/**
 * Lists contents of a folder (immediate subfolders and immediate files), with breadcrumbs and counts.
 */
export async function listFolderContents(
  userId: string,
  rawPath: string = "",
  options?: { recursive?: boolean; sortBy?: string; sortOrder?: "asc" | "desc" }
): Promise<FolderContents> {
  const norm = normalizeFolderPath(rawPath);
  const parentPath = norm ? getFolderParentPath(norm) : null;
  const adminClient = createAdminClient();

  const allFolders = await getAllUserFolders(userId);

  // Current folder metadata
  const currentFolder = norm ? allFolders.find((f) => f.path === norm) || null : null;

  // Subfolders: immediate children (where parent_path === norm or null for root)
  let subfolders = allFolders.filter((f) => {
    if (options?.recursive) {
      return norm ? f.path.startsWith(`${norm}/`) : true;
    }
    return norm ? f.parent_path === norm : f.parent_path === null || f.parent_path === "";
  });

  // Query files in this folder
  let filesQuery = adminClient
    .from("files")
    .select("id, filename, sanitized_name, mime_type, byte_size, r2_key, status, expires_at, created_at, updated_at, is_release_locked, share_links(slug, is_active, is_site)")
    .eq("user_id", userId)
    .in("status", ["ACTIVE", "EXPIRING"]);

  if (norm) {
    if (options?.recursive) {
      filesQuery = filesQuery.or(`r2_key.ilike.${norm}/%,r2_key.ilike.u/${userId}/${norm}/%`);
    } else {
      filesQuery = filesQuery.or(`r2_key.ilike.${norm}/%,r2_key.ilike.u/${userId}/${norm}/%`);
    }
  }

  const { data: dbFiles } = await filesQuery;
  let files = (dbFiles || []).map((f) => {
    const rawFolder = extractFolderFromR2Key(f.r2_key);
    const shares = Array.isArray(f.share_links) ? f.share_links : f.share_links ? [f.share_links] : [];
    const activeShare = shares.find((s) => s.is_active);
    return {
      ...f,
      folder: rawFolder,
      share_slug: activeShare?.slug || null,
      is_site: Boolean(activeShare?.is_site),
    };
  });

  // If not recursive, strictly filter files to those DIRECTLY in this folder
  if (!options?.recursive) {
    files = files.filter((f) => {
      if (!norm) {
        return !f.folder || f.folder === "gpn" || f.folder === "api";
      }
      return f.folder === norm;
    });
  }

  // Calculate file count and size per subfolder
  subfolders = subfolders.map((sf) => {
    const nestedFiles = (dbFiles || []).filter((f) => {
      const fFolder = extractFolderFromR2Key(f.r2_key);
      return fFolder === sf.path || fFolder?.startsWith(`${sf.path}/`);
    });
    const subfolderChildren = allFolders.filter((f) => f.parent_path === sf.path);
    return {
      ...sf,
      file_count: nestedFiles.length,
      subfolder_count: subfolderChildren.length,
      total_bytes: nestedFiles.reduce((acc, f) => acc + (f.byte_size || 0), 0),
    };
  });

  const totalFiles = files.length;
  const totalBytes = files.reduce((acc, f) => acc + (f.byte_size || 0), 0);

  return {
    currentPath: norm,
    parentPath,
    folder: currentFolder,
    breadcrumbs: getBreadcrumbs(norm),
    subfolders,
    files,
    totalSubfolders: subfolders.length,
    totalFiles,
    totalBytes,
  };
}

/**
 * Builds a hierarchical tree node structure of all folders.
 */
export async function getFolderTree(userId: string): Promise<FolderTreeNode[]> {
  const folders = await getAllUserFolders(userId);
  const nodeMap = new Map<string, FolderTreeNode>();

  for (const f of folders) {
    nodeMap.set(f.path, { ...f, children: [] });
  }

  const rootNodes: FolderTreeNode[] = [];

  for (const f of folders) {
    const node = nodeMap.get(f.path)!;
    if (f.parent_path && nodeMap.has(f.parent_path)) {
      nodeMap.get(f.parent_path)!.children.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  return rootNodes;
}

/**
 * Relocates a folder and all its descendant subfolders and files to a new path.
 * Handles both renaming (same parent) and moving (new parent).
 */
export async function relocateFolder(
  userId: string,
  oldNorm: string,
  newNorm: string
): Promise<{ oldPath: string; newPath: string; updatedFolders: number; updatedFiles: number }> {
  if (oldNorm === newNorm) {
    return { oldPath: oldNorm, newPath: newNorm, updatedFolders: 0, updatedFiles: 0 };
  }

  // Base installer permanence guard
  if (oldNorm.toLowerCase() === "gpn" || oldNorm.toLowerCase().startsWith("gpn/")) {
    const err = new Error("BASE_INSTALLER_PROTECTED: Gaurav Personal Notes v0.0.0 installer is permanently protected.");
    (err as any).code = "BASE_INSTALLER_PROTECTED";
    (err as any).status = 403;
    throw err;
  }

  const adminClient = createAdminClient();

  // Guard: Base v0.0.0 installer check in files
  const { data: baseCheck } = await adminClient
    .from("files")
    .select("id, sanitized_name, is_release_locked, share_links(slug)")
    .eq("user_id", userId)
    .or(`r2_key.ilike.${oldNorm}/%,r2_key.ilike.u/${userId}/${oldNorm}/%`);

  if (baseCheck) {
    for (const f of baseCheck) {
      const shares = Array.isArray(f.share_links) ? f.share_links : f.share_links ? [f.share_links] : [];
      if (
        shares.some((s) => s.slug === "gpn-app" || s.slug === "gpn-app-sig") ||
        f.sanitized_name === "Gaurav_Personal_Notes_v0.0.0_x64-setup.exe" ||
        f.is_release_locked
      ) {
        const err = new Error("BASE_INSTALLER_PROTECTED: Base v0.0.0 installer is permanently isolated and cannot be moved or renamed.");
        (err as any).code = "BASE_INSTALLER_PROTECTED";
        (err as any).status = 403;
        throw err;
      }
    }
  }

  // Ensure destination parent folder exists if newNorm has a parent
  const newParent = getFolderParentPath(newNorm);
  if (newParent) {
    await createFolder(userId, newParent);
  }

  const allFolders = await getAllUserFolders(userId);
  const affectedFolders = allFolders.filter((f) => f.path === oldNorm || f.path.startsWith(`${oldNorm}/`));

  let updatedFoldersCount = 0;
  for (const f of affectedFolders) {
    const updatedPath = f.path === oldNorm ? newNorm : `${newNorm}${f.path.substring(oldNorm.length)}`;
    const updatedParent = getFolderParentPath(updatedPath);
    const updatedName = getFolderNameFromPath(updatedPath);
    const depth = getFolderDepth(updatedPath);
    const now = new Date().toISOString();

    let updated = false;
    try {
      const { error } = await adminClient
        .from("folders")
        .update({
          name: updatedName,
          path: updatedPath,
          parent_path: updatedParent,
          depth,
          updated_at: now,
        })
        .eq("id", f.id);
      if (!error) updated = true;
    } catch {}

    if (redis) {
      try {
        await redis.hdel(getRedisFolderKey(userId), f.path);
        await redis.hset(getRedisFolderKey(userId), {
          [updatedPath]: JSON.stringify({
            ...f,
            name: updatedName,
            path: updatedPath,
            parent_path: updatedParent,
            depth,
            updated_at: now,
          }),
        });
        updated = true;
      } catch {}
    }

    if (updated) updatedFoldersCount++;
  }

  // Update files inside oldNorm
  const { data: filesToMove } = await adminClient
    .from("files")
    .select("id, r2_key, sanitized_name")
    .eq("user_id", userId)
    .or(`r2_key.ilike.${oldNorm}/%,r2_key.ilike.u/${userId}/${oldNorm}/%`);

  let updatedFilesCount = 0;
  if (filesToMove && filesToMove.length > 0) {
    const moveResults = await Promise.allSettled(
      filesToMove.map(async (file) => {
        let newR2Key: string;
        if (file.r2_key.startsWith(`${oldNorm}/`)) {
          newR2Key = `${newNorm}/${file.r2_key.substring(oldNorm.length + 1)}`;
        } else if (file.r2_key.startsWith(`u/${userId}/${oldNorm}/`)) {
          newR2Key = `u/${userId}/${newNorm}/${file.r2_key.substring(`u/${userId}/${oldNorm}/`.length)}`;
        } else {
          return false;
        }

        await moveR2Object(file.r2_key, newR2Key);
        await adminClient
          .from("files")
          .update({ r2_key: newR2Key, updated_at: new Date().toISOString() })
          .eq("id", file.id);
        return true;
      })
    );
    updatedFilesCount = moveResults.filter((r) => r.status === "fulfilled" && (r as PromiseFulfilledResult<boolean>).value).length;
  }

  return {
    oldPath: oldNorm,
    newPath: newNorm,
    updatedFolders: updatedFoldersCount,
    updatedFiles: updatedFilesCount,
  };
}

/**
 * Renames a folder, cascading all child folders, file records, and physical R2 objects.
 */
export async function renameFolder(
  userId: string,
  currentPath: string,
  newName: string
): Promise<{ oldPath: string; newPath: string; updatedFolders: number; updatedFiles: number }> {
  const oldNorm = normalizeFolderPath(currentPath);
  const cleanNewName = newName.trim().replace(/[^\w.\- ]/g, "-").replace(/-+/g, "-");

  if (!oldNorm) throw new Error("Root folder cannot be renamed");
  if (!cleanNewName) throw new Error("New folder name cannot be empty");

  const parent = getFolderParentPath(oldNorm);
  const newNorm = parent ? `${parent}/${cleanNewName}` : cleanNewName;

  return relocateFolder(userId, oldNorm, newNorm);
}

/**
 * Moves a folder and all its contents to a new parent folder or to root.
 */
export async function moveFolder(
  userId: string,
  sourcePath: string,
  destinationParentPath: string | null
): Promise<{ oldPath: string; newPath: string; updatedFolders: number; updatedFiles: number }> {
  const srcNorm = normalizeFolderPath(sourcePath);
  const destParentNorm = destinationParentPath ? normalizeFolderPath(destinationParentPath) : null;

  if (!srcNorm) throw new Error("Source folder cannot be empty or root");

  // Prevent moving into itself or its own descendants
  if (destParentNorm === srcNorm || (destParentNorm && destParentNorm.startsWith(`${srcNorm}/`))) {
    throw new Error("Cannot move a folder into itself or its subfolder");
  }

  const folderName = getFolderNameFromPath(srcNorm);
  const newNorm = destParentNorm ? `${destParentNorm}/${folderName}` : folderName;

  return relocateFolder(userId, srcNorm, newNorm);
}

/**
 * Deletes a folder and all its subfolders and files safely.
 * Safeguard: Rejects deletion if Base v0.0.0 installer is located anywhere within.
 */
export async function deleteFolder(
  userId: string,
  path: string,
  recursive: boolean = true
): Promise<{ deletedFolders: number; deletedFiles: number; reclaimedBytes: number }> {
  const norm = normalizeFolderPath(path);
  if (!norm) throw new Error("Root folder cannot be deleted");

  // Base v0.0.0 installer permanence guard
  if (norm.toLowerCase() === "gpn" || norm.toLowerCase().startsWith("gpn/")) {
    const err = new Error("BASE_INSTALLER_PROTECTED: Gaurav Personal Notes v0.0.0 installer is permanently protected.");
    (err as any).code = "BASE_INSTALLER_PROTECTED";
    (err as any).status = 403;
    throw err;
  }

  const adminClient = createAdminClient();

  // 1. Guard check: Base v0.0.0 installer permanence in files
  const { data: candidateFiles } = await adminClient
    .from("files")
    .select("id, sanitized_name, byte_size, r2_key, is_release_locked, share_links(id, slug)")
    .eq("user_id", userId)
    .or(`r2_key.ilike.${norm}/%,r2_key.ilike.u/${userId}/${norm}/%`);

  if (candidateFiles) {
    for (const f of candidateFiles) {
      const shares = Array.isArray(f.share_links) ? f.share_links : f.share_links ? [f.share_links] : [];
      if (
        shares.some((s) => s.slug === "gpn-app" || s.slug === "gpn-app-sig") ||
        f.sanitized_name === "Gaurav_Personal_Notes_v0.0.0_x64-setup.exe" ||
        f.is_release_locked
      ) {
        const err = new Error("BASE_INSTALLER_PROTECTED: Folder contains Base v0.0.0 installer which is permanently protected.");
        (err as any).code = "BASE_INSTALLER_PROTECTED";
        (err as any).status = 403;
        throw err;
      }
    }
  }

  // 2. Delete files concurrently
  let deletedFilesCount = 0;
  let reclaimedBytes = 0;

  if (candidateFiles && candidateFiles.length > 0) {
    const fileIds = candidateFiles.map((f) => f.id);
    const slugsToPurge: string[] = [];

    // Parallelize physical R2 deletions & collect slugs
    await Promise.allSettled(
      candidateFiles.map(async (file) => {
        if (file.r2_key) {
          await deleteR2Object(file.r2_key);
        }
        const shares = Array.isArray(file.share_links)
          ? file.share_links
          : file.share_links
          ? [file.share_links]
          : [];
        for (const s of shares) {
          if (s.slug) {
            slugsToPurge.push(s.slug);
          }
        }
      })
    );

    // Concurrently purge share link Redis caches
    if (slugsToPurge.length > 0) {
      await Promise.allSettled(slugsToPurge.map((slug) => purgeShareLinkRedisData(slug)));
    }

    // Batch database update to PURGED status
    await adminClient
      .from("files")
      .update({ status: "PURGED", updated_at: new Date().toISOString() })
      .in("id", fileIds);

    deletedFilesCount = candidateFiles.length;
    reclaimedBytes = candidateFiles.reduce((sum, f) => sum + (f.byte_size || 0), 0);

    // Authoritatively sync profile storage_used_bytes
    try {
      const { data: remainingFiles } = await adminClient
        .from("files")
        .select("byte_size")
        .eq("user_id", userId)
        .in("status", ["ACTIVE", "EXPIRING"]);
      const updatedStorageBytes = (remainingFiles || []).reduce((sum, f) => sum + (f.byte_size || 0), 0);
      await adminClient
        .from("profiles")
        .update({
          storage_used_bytes: updatedStorageBytes,
          reserved_bytes: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
    } catch {}
  }

  // 3. Delete folders in batch
  const allFolders = await getAllUserFolders(userId);
  const targetFolders = allFolders.filter((f) => f.path === norm || (recursive && f.path.startsWith(`${norm}/`)));

  let deletedFoldersCount = 0;
  if (targetFolders.length > 0) {
    const targetFolderIds = targetFolders.map((f) => f.id).filter(Boolean);
    const targetFolderPaths = targetFolders.map((f) => f.path);

    if (targetFolderIds.length > 0) {
      try {
        await adminClient.from("folders").delete().in("id", targetFolderIds);
      } catch {}
    }

    if (redis && targetFolderPaths.length > 0) {
      try {
        await redis.hdel(getRedisFolderKey(userId), ...targetFolderPaths);
      } catch {}
    }

    deletedFoldersCount = targetFolders.length;
  }

  return {
    deletedFolders: deletedFoldersCount,
    deletedFiles: deletedFilesCount,
    reclaimedBytes,
  };
}
