/**
 * Client-safe Hierarchical Folder Utilities and Type Definitions
 * Can be safely imported in both Client Components ("use client") and Server Components.
 */

export interface FolderItem {
  id: string;
  user_id?: string;
  name: string;
  path: string;
  parent_path?: string | null;
  parentPath?: string | null;
  depth: number;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  subfolder_count?: number;
  totalSubfolders?: number;
  file_count?: number;
  totalFiles?: number;
  total_bytes?: number;
  totalBytes?: number;
}

export interface FolderBreadcrumb {
  name: string;
  path: string;
}

export interface FolderContents {
  currentPath: string;
  parentPath: string | null;
  folder: FolderItem | null;
  breadcrumbs: FolderBreadcrumb[];
  subfolders: FolderItem[];
  files: any[];
  totalSubfolders: number;
  totalFiles: number;
  totalBytes: number;
}

export interface FolderTreeNode extends FolderItem {
  children: FolderTreeNode[];
}

/**
 * Validates and sanitizes a single folder name segment
 */
export function sanitizeFolderName(name?: string | null): string {
  if (!name || typeof name !== "string") return "";
  let clean = name.trim().toLowerCase();
  clean = clean.replace(/[^a-z0-9_-]/g, "-");
  clean = clean.replace(/-+/g, "-");
  clean = clean.replace(/^-+|-+$/g, "");
  return clean;
}

/**
 * Normalizes a hierarchical folder path.
 * - Removes leading/trailing slashes.
 * - Collapses consecutive slashes.
 * - Enforces security: rejects path traversal ('..', '.'), null bytes, and illegal characters.
 * - Sanitizes segment names while preserving folder separators.
 */
export function normalizeFolderPath(path?: string | null): string {
  if (!path || typeof path !== "string") return "";
  let clean = path.trim().replace(/\\/g, "/");

  clean = clean.replace(/^\/+|\/+$/g, "");

  if (/(?:^|\/)\.\.(?:\/|$)/.test(clean) || /(?:^|\/)\.(?:\/|$)/.test(clean)) {
    throw new Error("Path traversal characters ('..' or '.') are strictly forbidden");
  }

  if (/[\x00-\x1f\x7f<>:"|?*]/.test(clean)) {
    throw new Error("Invalid character detected in folder path");
  }

  const segments = clean.split("/").filter((s) => s.trim().length > 0);

  const sanitizedSegments = segments.map((seg) => {
    let s = seg.trim().replace(/\s+/g, "_");
    s = s.replace(/[^a-zA-Z0-9_\-\.]/g, "");
    if (!s) {
      throw new Error(`Folder segment '${seg}' contains only invalid characters`);
    }
    return s;
  });

  return sanitizedSegments.join("/");
}

/**
 * Extracts immediate folder name from a full path
 */
export function getFolderNameFromPath(path?: string | null): string {
  const norm = normalizeFolderPath(path);
  if (!norm) return "";
  const parts = norm.split("/");
  return parts[parts.length - 1];
}

/**
 * Extracts parent folder path from a full path
 */
export function getFolderParentPath(path?: string | null): string | null {
  const norm = normalizeFolderPath(path);
  if (!norm) return null;
  const lastSlash = norm.lastIndexOf("/");
  if (lastSlash === -1) return null;
  return norm.substring(0, lastSlash);
}

/**
 * Calculates hierarchy depth (1-indexed for root children)
 */
export function getFolderDepth(path?: string | null): number {
  const norm = normalizeFolderPath(path);
  if (!norm) return 0;
  return norm.split("/").length;
}

/**
 * Generates interactive breadcrumbs for path
 */
export function getBreadcrumbs(path?: string | null): FolderBreadcrumb[] {
  const norm = normalizeFolderPath(path);
  const crumbs: FolderBreadcrumb[] = [{ name: "Storage", path: "" }];
  if (!norm) return crumbs;

  const parts = norm.split("/");
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    crumbs.push({ name: part, path: acc });
  }
  return crumbs;
}

/**
 * Extracts folder path prefix from physical R2 object key
 */
export function extractFolderFromR2Key(key?: string | null): string | null {
  if (!key || typeof key !== "string") return null;
  let cleanKey = key.trim().replace(/\\/g, "/").replace(/^\/+/, "");

  if (cleanKey.startsWith("u/")) {
    const afterU = cleanKey.substring(2);
    const slashIdx = afterU.indexOf("/");
    if (slashIdx !== -1) {
      cleanKey = afterU.substring(slashIdx + 1);
    } else {
      return null;
    }
  }

  const lastSlash = cleanKey.lastIndexOf("/");
  if (lastSlash === -1) return null;

  const folderPath = cleanKey.substring(0, lastSlash);
  return folderPath || null;
}
