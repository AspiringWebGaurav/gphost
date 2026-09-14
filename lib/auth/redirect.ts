/**
 * Validates and sanitizes redirect destinations to prevent open-redirect vulnerabilities.
 * Strictly permits only relative paths within the same origin.
 */
export function getSafeRedirectUrl(target: string | null | undefined, fallback = "/dashboard"): string {
  if (!target || typeof target !== "string") {
    return fallback;
  }

  const trimmed = target.trim();

  // Reject protocol-relative URLs, backslashes, scheme URLs, or external targets
  if (
    trimmed.startsWith("//") ||
    trimmed.startsWith("\\\\") ||
    trimmed.startsWith("/\\") ||
    trimmed.startsWith("\\/") ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
  ) {
    return fallback;
  }

  // Must strictly start with a single leading slash and not contain control characters
  if (!trimmed.startsWith("/") || /[\x00-\x1F\x7F]/.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}
