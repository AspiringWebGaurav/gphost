/**
 * Public Share Metadata Formatter & Security Boundary.
 * Strictly filters database records so that ONLY public allow-listed metadata is exposed.
 * NEVER returns: user ID, owner email, file ID, R2 key, ETag, password hash, salt, token hash, audit logs, or quota.
 */
export interface PublicShareMetadata {
  filename: string;
  byte_size: number;
  mime_type: string;
  expires_at: string | null;
  is_password_protected: boolean;
  download_count: number;
  max_downloads: number | null;
}

export function formatPublicShareMetadata(
  file: {
    sanitized_name: string;
    byte_size: number;
    mime_type: string;
    expires_at: string | null;
    is_password_protected?: boolean;
  },
  share: {
    expires_at: string | null;
    password_hash?: string | null;
    download_count: number;
    max_downloads: number | null;
  }
): PublicShareMetadata {
  return {
    filename: file.sanitized_name,
    byte_size: file.byte_size,
    mime_type: file.mime_type,
    expires_at: share.expires_at || file.expires_at || null,
    is_password_protected: Boolean(file.is_password_protected || share.password_hash),
    download_count: share.download_count,
    max_downloads: share.max_downloads,
  };
}

export function isPreviewableImage(mimeType: string, filename: string): boolean {
  const lowerMime = (mimeType || "").toLowerCase();
  const lowerName = (filename || "").toLowerCase();

  // Exclude SVG from inline preview to completely prevent XSS vectors via embedded scripts
  if (lowerMime === "image/svg+xml" || /\.svg$/i.test(lowerName)) {
    return false;
  }

  return (
    (lowerMime.startsWith("image/") && lowerMime !== "image/svg+xml") ||
    /\.(jpg|jpeg|png|webp|gif|bmp|ico)$/i.test(lowerName)
  );
}

export function isPreviewablePdf(mimeType: string, filename: string): boolean {
  const lowerMime = (mimeType || "").toLowerCase();
  const lowerName = (filename || "").toLowerCase();
  return (
    lowerMime === "application/pdf" ||
    lowerMime.includes("pdf") ||
    /\.pdf$/i.test(lowerName)
  );
}

export function getPreviewType(mimeType: string, filename: string): "image" | "pdf" | null {
  if (isPreviewableImage(mimeType, filename)) return "image";
  if (isPreviewablePdf(mimeType, filename)) return "pdf";
  return null;
}
