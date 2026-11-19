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
  const pathMap = new Map<string, FolderItem>();

  try {
    const { data, error } = await adminClient
      .from("folders")
      .select("*")
      .eq("user_id", userId)
      .order("path", { ascending: true });

    if (!error && data && data.length > 0) {
      for (const item of data as FolderItem[]) {
        const itemPath = normalizeFolderPath(item.path);
        if (itemPath && !pathMap.has(itemPath)) {
          const isImm = Boolean(item.is_immutable ?? item.isImmutable);
          pathMap.set(itemPath, {
            ...item,
            path: itemPath,
            name: item.name || getFolderNameFromPath(itemPath),
            parent_path: item.parent_path ?? getFolderParentPath(itemPath),
            is_immutable: isImm,
            isImmutable: isImm,
            purpose: item.purpose || (isImm ? "immutable" : null),
            description: item.description || null,
          });
        }
      }
    }
  } catch { }

  // Redis fallback / merge
  try {
    if (redis) {
      const allEntries = await redis.hgetall<Record<string, string>>(getRedisFolderKey(userId));
      if (allEntries && Object.keys(allEntries).length > 0) {
        for (const [hashKey, val] of Object.entries(allEntries)) {
          try {
            const item = typeof val === "string" ? (JSON.parse(val) as FolderItem) : (val as FolderItem);
            if (item) {
              const itemPath = normalizeFolderPath(item.path || hashKey);
              if (itemPath && !pathMap.has(itemPath)) {
                const isImm = Boolean(item.is_immutable ?? item.isImmutable);
                pathMap.set(itemPath, {
                  ...item,
                  path: itemPath,
                  name: item.name || getFolderNameFromPath(itemPath),
                  parent_path: item.parent_path ?? getFolderParentPath(itemPath),
                  is_immutable: isImm,
                  isImmutable: isImm,
                  purpose: item.purpose || (isImm ? "immutable" : null),
                  description: item.description || null,
                });
              }
            }
          } catch { }
        }
      }
    }
  } catch { }

  // Discovery merge: automatically discover all active folders and ancestor paths directly from storage files
  try {
    const { data: fileRows } = await adminClient
      .from("files")
      .select("r2_key")
      .eq("user_id", userId)
      .in("status", ["ACTIVE", "EXPIRING"]);

    if (fileRows && fileRows.length > 0) {
      for (const row of fileRows) {
        const folder = extractFolderFromR2Key(row.r2_key);
        if (folder) {
          const parts = folder.split("/");
          let accumulated = "";
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const parent = accumulated || null;
            accumulated = accumulated ? `${accumulated}/${part}` : part;
            if (!pathMap.has(accumulated)) {
              pathMap.set(accumulated, {
                id: accumulated,
                user_id: userId,
                name: part,
                path: accumulated,
                parent_path: parent,
                depth: i + 1,
                is_immutable: false,
                isImmutable: false,
                purpose: null,
                description: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            }
          }
        }
      }
    }
  } catch { }

  return Array.from(pathMap.values()).sort((a, b) => a.path.localeCompare(b.path));
}

export interface CreateFolderOptions {
  isImmutable?: boolean;
  immutable?: boolean;
  purpose?: string | null;
  description?: string | null;
}

/**
 * Creates or retrieves a folder, ensuring all ancestor parent folders exist automatically.
 * Supports special-purpose and immutable folder creation for authorized API key owners.
 */
export async function createFolder(
  userId: string,
  rawPath: string,
  options?: CreateFolderOptions
): Promise<FolderItem> {
  const norm = normalizeFolderPath(rawPath);
  if (!norm) {
    throw new Error("Folder path cannot be empty");
  }

  const adminClient = createAdminClient();
  const allExisting = await getAllUserFolders(userId);
  const existingMap = new Map(allExisting.map((f) => [f.path, f]));

  const parts = norm.split("/");
  let currentAccumulated = "";
  let lastFolderItem: FolderItem | null = null;

  for (let i = 0; i < parts.length; i++) {
    const segName = parts[i];
    const segParent = currentAccumulated || null;
    currentAccumulated = currentAccumulated ? `${currentAccumulated}/${segName}` : segName;
    const depth = getFolderDepth(currentAccumulated);
    const now = new Date().toISOString();

    const existing = existingMap.get(currentAccumulated);
    const isTarget = i === parts.length - 1;

    let isImmutable = false;
    if (isTarget) {
      if (options?.isImmutable !== undefined || options?.immutable !== undefined) {
        isImmutable = Boolean(options?.isImmutable ?? options?.immutable);
      } else if (existing) {
        isImmutable = Boolean(existing.is_immutable ?? existing.isImmutable);
      }
    } else if (existing) {
      isImmutable = Boolean(existing.is_immutable ?? existing.isImmutable);
    }

    let purpose: string | null = null;
    if (isTarget) {
      if (options?.purpose !== undefined) {
        purpose = options.purpose;
      } else if (existing?.purpose) {
        purpose = existing.purpose;
      } else if (isImmutable) {
        purpose = "immutable";
      }
    } else if (existing?.purpose) {
      purpose = existing.purpose;
    }

    let description: string | null = null;
    if (isTarget) {
      if (options?.description !== undefined) {
        description = options.description;
      } else if (existing?.description) {
        description = existing.description;
      }
    } else if (existing?.description) {
      description = existing.description;
    }

    const candidate: FolderItem = {
      id: existing?.id || crypto.randomUUID(),
      user_id: userId,
      name: segName,
      path: currentAccumulated,
      parent_path: segParent,
      depth,
      is_immutable: isImmutable,
      isImmutable,
      purpose,
      description,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    let thisFolderItem: FolderItem = candidate;

    // 1. Try Supabase
    try {
      const upsertPayload: Record<string, any> = {
        user_id: userId,
        name: segName,
        path: currentAccumulated,
        parent_path: segParent,
        depth,
        updated_at: now,
      };
      if (isImmutable) {
        upsertPayload.is_immutable = isImmutable;
      }
      if (purpose) {
        upsertPayload.purpose = purpose;
      }
      if (description) {
        upsertPayload.description = description;
      }

      const { data, error } = await adminClient
        .from("folders")
        .upsert(upsertPayload, { onConflict: "user_id,path" })
        .select("*")
        .single();

      if (!error && data) {
        thisFolderItem = {
          ...data,
          is_immutable: isImmutable || Boolean(data.is_immutable),
          isImmutable: isImmutable || Boolean(data.is_immutable),
          purpose: purpose || data.purpose || null,
          description: description || data.description || null,
        } as FolderItem;
      }
    } catch { }

    // 2. Redis fallback / sync
    if (redis) {
      try {
        await redis.hset(getRedisFolderKey(userId), {
          [currentAccumulated]: JSON.stringify(thisFolderItem),
        });
      } catch { }
    }

    existingMap.set(currentAccumulated, thisFolderItem);
    lastFolderItem = thisFolderItem;
  }

  return lastFolderItem!;
}

/**
 * Updates folder metadata: immutability flag, special purpose, or description.
 */
export async function updateFolderMetadata(
  userId: string,
  rawPath: string,
  updates: { isImmutable?: boolean; immutable?: boolean; purpose?: string | null; description?: string | null }
): Promise<FolderItem> {
  const norm = normalizeFolderPath(rawPath);
  if (!norm) throw new Error("Root folder cannot be updated");

  const allFolders = await getAllUserFolders(userId);
  const folder = allFolders.find((f) => f.path === norm);

  const isImm =
    updates.isImmutable !== undefined
      ? updates.isImmutable
      : updates.immutable !== undefined
        ? updates.immutable
        : undefined;

  if (!folder) {
    return createFolder(userId, norm, {
      isImmutable: isImm,
      purpose: updates.purpose,
      description: updates.description,
    });
  }

  const adminClient = createAdminClient();
  const now = new Date().toISOString();

  const finalImmutable = isImm !== undefined ? isImm : Boolean(folder.is_immutable);
  const finalPurpose = updates.purpose !== undefined ? updates.purpose : folder.purpose;
  const finalDescription = updates.description !== undefined ? updates.description : folder.description;

  const updatedItem: FolderItem = {
    ...folder,
    is_immutable: finalImmutable,
    isImmutable: finalImmutable,
    purpose: finalPurpose,
    description: finalDescription,
    updated_at: now,
  };

  try {
    const payload: Record<string, any> = {
      updated_at: now,
    };
    if (isImm !== undefined) payload.is_immutable = isImm;
    if (updates.purpose !== undefined) payload.purpose = updates.purpose;
    if (updates.description !== undefined) payload.description = updates.description;

    await adminClient.from("folders").update(payload).eq("id", folder.id);
  } catch { }

  if (redis) {
    try {
      await redis.hset(getRedisFolderKey(userId), {
        [norm]: JSON.stringify(updatedItem),
      });
    } catch { }
  }

  return updatedItem;
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

  // Query files in this folder with schema-safe column selection
  let filesQuery = adminClient
    .from("files")
    .select("id, filename, sanitized_name, mime_type, byte_size, r2_key, status, expires_at, created_at, updated_at, share_links(slug, is_active)")
    .eq("user_id", userId)
    .in("status", ["ACTIVE", "EXPIRING"]);

  if (norm) {
    if (options?.recursive) {
      filesQuery = filesQuery.or(`r2_key.ilike.${norm}/%,r2_key.ilike.u/${userId}/${norm}/%`);
    } else {
      filesQuery = filesQuery.or(`r2_key.ilike.${norm}/%,r2_key.ilike.u/${userId}/${norm}/%`);
    }
  }

  let { data: dbFiles, error: filesErr } = await filesQuery;

  if (filesErr) {
    console.warn("[listFolderContents] filesQuery error with share_links, falling back to core columns:", filesErr.message);
    let fallbackQuery = adminClient
      .from("files")
      .select("id, filename, sanitized_name, mime_type, byte_size, r2_key, status, expires_at, created_at, updated_at")
      .eq("user_id", userId)
      .in("status", ["ACTIVE", "EXPIRING"]);

    if (norm) {
      fallbackQuery = fallbackQuery.or(`r2_key.ilike.${norm}/%,r2_key.ilike.u/${userId}/${norm}/%`);
    }

    const { data: fallbackData } = await fallbackQuery;
    dbFiles = (fallbackData || []).map((f) => ({ ...f, share_links: [] as { slug: string; is_active: boolean }[] }));
  }

  let files = (dbFiles || []).map((f) => {
    const rawFolder = extractFolderFromR2Key(f.r2_key);
    const shares = Array.isArray(f.share_links) ? f.share_links : f.share_links ? [f.share_links] : [];
    const activeShare = shares.find((s) => s.is_active);
    return {
      ...f,
      folder: rawFolder,
      share_slug: activeShare?.slug || null,
      is_site: false,
    };
  });

  // If not recursive, strictly filter files to those DIRECTLY in this folder
  if (!options?.recursive) {
    files = files.filter((f) => {
      if (!norm) {
        return !f.folder;
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
    const byteSize = nestedFiles.reduce((acc, f) => acc + (f.byte_size || 0), 0);
    return {
      ...sf,
      file_count: nestedFiles.length,
      totalFiles: nestedFiles.length,
      subfolder_count: subfolderChildren.length,
      totalSubfolders: subfolderChildren.length,
      total_bytes: byteSize,
      totalBytes: byteSize,
    };
  });

  // Strictly deduplicate subfolders by path
  const seenPaths = new Set<string>();
  subfolders = subfolders.filter((sf) => {
    if (seenPaths.has(sf.path)) return false;
    seenPaths.add(sf.path);
    return true;
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
  newNorm: string,
  options?: { force?: boolean }
): Promise<{ oldPath: string; newPath: string; updatedFolders: number; updatedFiles: number }> {
  if (oldNorm === newNorm) {
    return { oldPath: oldNorm, newPath: newNorm, updatedFolders: 0, updatedFiles: 0 };
  }

  const adminClient = createAdminClient();

  // Guard: Immutable folder check
  const allUserFolders = await getAllUserFolders(userId);
  const sourceFolder = allUserFolders.find((f) => f.path === oldNorm);
  if (sourceFolder?.is_immutable && !options?.force) {
    const err = new Error(
      `FOLDER_IMMUTABLE: Folder '${oldNorm}' is marked IMMUTABLE (special purpose: ${sourceFolder.purpose || "locked"}). Pass 'force: true' to rename or move.`
    );
    (err as any).code = "FOLDER_IMMUTABLE";
    (err as any).status = 409;
    throw err;
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
      filesToMove.map(async (file: any) => {
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
    updatedFilesCount = moveResults.filter((r: any) => r.status === "fulfilled" && r.value).length;
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
  newName: string,
  options?: { force?: boolean }
): Promise<{ oldPath: string; newPath: string; updatedFolders: number; updatedFiles: number }> {
  const oldNorm = normalizeFolderPath(currentPath);
  const cleanNewName = newName.trim().replace(/[^\w.\- ]/g, "-").replace(/-+/g, "-");

  if (!oldNorm) throw new Error("Root folder cannot be renamed");
  if (!cleanNewName) throw new Error("New folder name cannot be empty");

  const parent = getFolderParentPath(oldNorm);
  const newNorm = parent ? `${parent}/${cleanNewName}` : cleanNewName;

  return relocateFolder(userId, oldNorm, newNorm, options);
}

/**
 * Moves a folder and all its contents to a new parent folder or to root.
 */
export async function moveFolder(
  userId: string,
  sourcePath: string,
  destinationParentPath: string | null,
  options?: { force?: boolean }
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

  return relocateFolder(userId, srcNorm, newNorm, options);
}

/**
 * Deletes a folder and all its subfolders and files safely.
 * Safeguard: Rejects deletion if Base v0.0.0 installer is located anywhere within unless forced.
 */
export async function deleteFolder(
  userId: string,
  path: string,
  recursive: boolean = true,
  options?: { force?: boolean }
): Promise<{
  deletedFolders: number;
  deletedFiles: number;
  reclaimedBytes: number;
  storageUsedBytes?: number;
  activeFilesCount?: number;
}> {
  const norm = normalizeFolderPath(path);
  if (!norm) throw new Error("Root folder cannot be deleted");

  // Check if target folder or any nested descendant is marked immutable
  const allFolders = await getAllUserFolders(userId);
  const targetFolders = allFolders.filter((f) => f.path === norm || (recursive && f.path.startsWith(`${norm}/`)));
  const immutableFolder = targetFolders.find((f) => f.is_immutable);

  if (immutableFolder && !options?.force) {
    const err = new Error(
      `FOLDER_IMMUTABLE: Folder '${immutableFolder.path}' is marked as IMMUTABLE (special purpose: ${immutableFolder.purpose || "locked"}). Pass '?force=true' or 'confirmImmutable: true' to force deletion.`
    );
    (err as any).code = "FOLDER_IMMUTABLE";
    (err as any).status = 409;
    throw err;
  }

  const adminClient = createAdminClient();

  const { data: candidateFiles, error: fetchFilesErr } = await adminClient
    .from("files")
    .select("id, sanitized_name, filename, byte_size, r2_key, status, share_links(id, slug)")
    .eq("user_id", userId)
    .in("status", ["ACTIVE", "EXPIRING"])
    .or(`r2_key.ilike.${norm}/%,r2_key.ilike.u/${userId}/${norm}/%,filename.ilike.${norm}/%`);

  if (fetchFilesErr) {
    console.error("[deleteFolder] Error fetching candidate files:", fetchFilesErr.message);
  }

  if (candidateFiles && candidateFiles.length > 0 && !options?.force) {
    const candidateFileIds = candidateFiles.map((f) => f.id);
    let lockedFile: any = null;
    try {
      const { data: lockedReleases } = await adminClient
        .from("app_releases")
        .select("id, version, binary_file_id, signature_file_id, is_locked")
        .eq("is_locked", true)
        .or(`binary_file_id.in.(${candidateFileIds.join(",")}),signature_file_id.in.(${candidateFileIds.join(",")})`);

      if (lockedReleases && lockedReleases.length > 0) {
        lockedFile = candidateFiles.find(
          (f) => f.id === lockedReleases[0].binary_file_id || f.id === lockedReleases[0].signature_file_id
        ) || { sanitized_name: `Release v${lockedReleases[0].version}` };
      }
    } catch (relErr: any) {
      console.warn("[deleteFolder] Release lock check warning:", relErr?.message);
    }

    if (lockedFile) {
      const err = new Error(
        `RELEASE_LOCKED: Folder contains release-locked binary '${lockedFile.sanitized_name || lockedFile.filename}'. Pass '?force=true' to override.`
      );
      (err as any).code = "RELEASE_LOCKED";
      (err as any).status = 409;
      throw err;
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
    const now = new Date().toISOString();
    await adminClient
      .from("files")
      .update({ status: "PURGED", deleted_at: now, updated_at: now })
      .in("id", fileIds);

    // Deactivate releases referencing these files
    try {
      await adminClient
        .from("app_releases")
        .update({ is_active: false, is_locked: false, updated_at: now })
        .in("binary_file_id", fileIds);
    } catch {}

    deletedFilesCount = candidateFiles.length;
    reclaimedBytes = candidateFiles.reduce((sum, f) => sum + (f.byte_size || 0), 0);
  }

  // Authoritatively sync profile storage_used_bytes and get remaining metrics
  let updatedStorageBytes: number | undefined = undefined;
  let remainingActiveCount: number | undefined = undefined;
  try {
    const { data: remainingFiles } = await adminClient
      .from("files")
      .select("byte_size")
      .eq("user_id", userId)
      .in("status", ["ACTIVE", "EXPIRING"]);
    const activeList = remainingFiles || [];
    updatedStorageBytes = activeList.reduce((sum, f) => sum + (f.byte_size || 0), 0);
    remainingActiveCount = activeList.length;
    await adminClient
      .from("profiles")
      .update({
        storage_used_bytes: updatedStorageBytes,
        reserved_bytes: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
  } catch { }

  // 3. Delete folders in batch
  let deletedFoldersCount = 0;
  const targetFolderIds = targetFolders.map((f) => f.id).filter(Boolean);
  const targetFolderPaths = targetFolders.map((f) => f.path);

  // Supabase delete
  try {
    if (targetFolderIds.length > 0) {
      await adminClient.from("folders").delete().in("id", targetFolderIds);
    }
    await adminClient.from("folders").delete().eq("user_id", userId).eq("path", norm);
    if (recursive) {
      await adminClient.from("folders").delete().eq("user_id", userId).like("path", `${norm}/%`);
    }
  } catch { }

  // Redis fallback & cache delete - ALWAYS purge norm and all matching paths
  if (redis) {
    try {
      const redisKey = getRedisFolderKey(userId);
      const allEntries = await redis.hgetall<Record<string, string>>(redisKey);
      const keysToDelete: string[] = [norm];
      if (allEntries) {
        for (const k of Object.keys(allEntries)) {
          if (k === norm || (recursive && k.startsWith(`${norm}/`))) {
            keysToDelete.push(k);
          }
        }
      }
      for (const tf of targetFolderPaths) {
        keysToDelete.push(tf);
      }
      const uniqueKeys = Array.from(new Set(keysToDelete));
      if (uniqueKeys.length > 0) {
        await redis.hdel(redisKey, ...uniqueKeys);
      }
    } catch { }
  }

  deletedFoldersCount = Math.max(targetFolders.length, 1);

  return {
    deletedFolders: deletedFoldersCount,
    deletedFiles: deletedFilesCount,
    reclaimedBytes,
    storageUsedBytes: updatedStorageBytes,
    activeFilesCount: remainingActiveCount,
  };
}
