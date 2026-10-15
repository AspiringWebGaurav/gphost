/**
 * Utility functions for custom dynamic folder extraction and management.
 */

/**
 * Extracts a custom dynamic folder prefix from an R2 object key.
 *
 * Rules:
 * 1. Default user uploads start with 'u/{userId}/' -> return null (no custom folder).
 * 2. Explicit folder paths (e.g. 'gpn-dynamic-update/0.0.0/file.exe' or 'backups/db.sql') -> return the first directory segment ('gpn-dynamic-update').
 * 3. Root files without slashes -> return null.
 */
export function extractFolderFromR2Key(r2Key?: string | null): string | null {
  if (!r2Key || typeof r2Key !== "string") return null;
  const trimmed = r2Key.trim().replace(/^\/+/, "");
  if (trimmed.startsWith("u/")) {
    const parts = trimmed.split("/");
    if (parts.length >= 4) {
      const maybeYear = parts[2];
      if (/^\d{4}$/.test(maybeYear)) {
        return null;
      }
      return parts[2];
    }
    return null;
  }
  const slashIdx = trimmed.indexOf("/");
  if (slashIdx > 0) {
    return trimmed.substring(0, slashIdx);
  }
  return null;
}

/**
 * Sanitizes a custom folder name.
 * Allows alphanumeric characters, dashes, underscores, and dots (e.g. 'gpn-dynamic-update', 'v1.0').
 */
export function sanitizeFolderName(folder: string): string {
  return folder
    .trim()
    .toLowerCase()
    .replace(/[^\w.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
