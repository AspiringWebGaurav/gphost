/**
 * Filename sanitization utility for GPHosting.
 * Strictly prevents path traversal, control characters, and abnormal length attacks.
 * Filename is stored only for display in public.files.sanitized_name and Content-Disposition.
 */
export function sanitizeFilename(input: string): string {
  if (!input || typeof input !== "string") {
    return "unnamed_file";
  }

  // 1. Strip leading and trailing whitespace
  let clean = input.trim();

  // 2. Strip Windows drive letter (e.g. C:\ or D:/)
  clean = clean.replace(/^[a-zA-Z]:[/\\]/, "");

  // 3. Keep only the basename if directory path components are present
  // Handle both POSIX / and Windows \ separators
  const lastSlash = Math.max(clean.lastIndexOf("/"), clean.lastIndexOf("\\"));
  if (lastSlash >= 0) {
    clean = clean.slice(lastSlash + 1);
  }

  // 4. Remove path traversal indicators (e.g. .., ...)
  clean = clean.replace(/\.\.+/g, "");

  // 5. Replace potentially dangerous filesystem / URL characters with underscores
  clean = clean.replace(/[/\\?%*:|"<>]/g, "_");

  // 6. Remove non-printable / control characters (ASCII 0x00 to 0x1F and 0x7F)
  clean = clean.replace(/[\x00-\x1F\x7F]/g, "");

  // 7. Strip leading dots to prevent hidden unix files
  clean = clean.replace(/^\.+/, "");

  // 8. Fallback if sanitized string is empty or just dots
  if (!clean || clean === ".") {
    clean = "unnamed_file";
  }

  // 9. Truncate to maximum 255 characters while preserving extension if present
  if (clean.length > 255) {
    const lastDot = clean.lastIndexOf(".");
    if (lastDot > 0 && lastDot > clean.length - 15) {
      const ext = clean.slice(lastDot);
      const base = clean.slice(0, 255 - ext.length);
      clean = `${base}${ext}`;
    } else {
      clean = clean.slice(0, 255);
    }
  }

  return clean;
}
