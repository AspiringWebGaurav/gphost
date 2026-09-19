/**
 * Authoritative File & Share Expiry Management
 * Supports granular presets: 5m, 10m, 30m, 1h, 2h, 5h, 10h, 12h, 24h, 7d, 30d, 90d, never
 */

export const EXPIRY_PRESET_VALUES = [
  "5m",
  "10m",
  "30m",
  "1h",
  "2h",
  "5h",
  "10h",
  "12h",
  "24h",
  "7d",
  "30d",
  "90d",
  "never",
] as const;

export type ExpiryPreset = (typeof EXPIRY_PRESET_VALUES)[number];

export interface ExpiryOption {
  value: ExpiryPreset;
  label: string;
  shortLabel: string;
  durationMs: number | null; // null represents permanent / never expire
  requiresPerm?: boolean;
}

export const EXPIRY_OPTIONS: ExpiryOption[] = [
  { value: "5m", label: "Expires in 5 Minutes", shortLabel: "5 Minutes", durationMs: 5 * 60 * 1000 },
  { value: "10m", label: "Expires in 10 Minutes", shortLabel: "10 Minutes", durationMs: 10 * 60 * 1000 },
  { value: "30m", label: "Expires in 30 Minutes", shortLabel: "30 Minutes", durationMs: 30 * 60 * 1000 },
  { value: "1h", label: "Expires in 1 Hour", shortLabel: "1 Hour", durationMs: 60 * 60 * 1000 },
  { value: "2h", label: "Expires in 2 Hours", shortLabel: "2 Hours", durationMs: 2 * 60 * 60 * 1000 },
  { value: "5h", label: "Expires in 5 Hours", shortLabel: "5 Hours", durationMs: 5 * 60 * 60 * 1000 },
  { value: "10h", label: "Expires in 10 Hours", shortLabel: "10 Hours", durationMs: 10 * 60 * 60 * 1000 },
  { value: "12h", label: "Expires in 12 Hours", shortLabel: "12 Hours", durationMs: 12 * 60 * 60 * 1000 },
  { value: "24h", label: "Expires in 24 Hours", shortLabel: "24 Hours (1 Day)", durationMs: 24 * 60 * 60 * 1000 },
  { value: "7d", label: "Expires in 7 Days", shortLabel: "7 Days", durationMs: 7 * 24 * 60 * 60 * 1000 },
  { value: "30d", label: "Expires in 30 Days (Default)", shortLabel: "30 Days (Default)", durationMs: 30 * 24 * 60 * 60 * 1000 },
  { value: "90d", label: "Expires in 90 Days", shortLabel: "90 Days", durationMs: 90 * 24 * 60 * 60 * 1000 },
  { value: "never", label: "Never Expire (Permanent)", shortLabel: "Never Expire", durationMs: null, requiresPerm: true },
];

/**
 * Calculates authoritative UTC expiration timestamp for a given preset.
 */
export function calculateExpiryDate(preset: string, fromDate?: Date): Date | null {
  const baseTime = (fromDate || new Date()).getTime();

  switch (preset) {
    case "5m":
      return new Date(baseTime + 5 * 60 * 1000);
    case "10m":
      return new Date(baseTime + 10 * 60 * 1000);
    case "30m":
      return new Date(baseTime + 30 * 60 * 1000);
    case "1h":
      return new Date(baseTime + 60 * 60 * 1000);
    case "2h":
      return new Date(baseTime + 2 * 60 * 60 * 1000);
    case "5h":
      return new Date(baseTime + 5 * 60 * 60 * 1000);
    case "10h":
      return new Date(baseTime + 10 * 60 * 60 * 1000);
    case "12h":
      return new Date(baseTime + 12 * 60 * 60 * 1000);
    case "24h":
      return new Date(baseTime + 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(baseTime + 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(baseTime + 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(baseTime + 90 * 24 * 60 * 60 * 1000);
    case "never":
      return null;
    default:
      return new Date(baseTime + 30 * 24 * 60 * 60 * 1000);
  }
}

/**
 * Provides a backward-compatible enum fallback for older database schemas
 * that only accept the original ('24h', '7d', '30d', '90d', 'never') enum values.
 */
export function getLegacyEnumFallback(preset: string): "24h" | "7d" | "30d" | "90d" | "never" {
  switch (preset) {
    case "never":
      return "never";
    case "90d":
      return "90d";
    case "30d":
      return "30d";
    case "7d":
      return "7d";
    case "24h":
    case "12h":
    case "10h":
    case "5h":
    case "2h":
    case "1h":
    case "30m":
    case "10m":
    case "5m":
    default:
      return "24h";
  }
}

/**
 * Highly granular, user-friendly formatter for remaining expiration time.
 * Handles days, hours, and minutes with sub-hour precision.
 */
export function formatTimeRemaining(
  expiresAt: string | Date | null,
  baseTime?: Date | number
): string {
  if (!expiresAt) return "Permanent";
  const date = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  const now = baseTime !== undefined ? (typeof baseTime === "number" ? new Date(baseTime) : baseTime) : new Date();
  const diffMs = date.getTime() - now.getTime();

  if (diffMs <= 0) return "Expired";

  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const diffHours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const diffMins = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
  const diffSecs = Math.floor((diffMs % (60 * 1000)) / 1000);

  if (diffDays > 0) {
    return `${diffDays}d ${diffHours}h left`;
  }
  if (diffHours > 0) {
    return diffMins > 0 ? `${diffHours}h ${diffMins}m left` : `${diffHours}h left`;
  }
  if (diffMins > 0) {
    return `${diffMins}m left`;
  }
  return `${diffSecs}s left`;
}

/**
 * Safe formatter for expiration badges that prevents duplicate "Expires Expired" text.
 * When expired, returns `label: "Expired"`.
 * When active, returns `label: "Expires 35m left"`.
 * When permanent, returns `label: "Permanent"`.
 */
export function formatExpiryBadge(
  expiresAt: string | Date | null,
  baseTime?: Date | number
): { isExpired: boolean; isPermanent: boolean; label: string; remaining: string } {
  if (!expiresAt) {
    return { isExpired: false, isPermanent: true, label: "Permanent", remaining: "Permanent" };
  }
  const date = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  const now = baseTime !== undefined ? (typeof baseTime === "number" ? new Date(baseTime) : baseTime) : new Date();
  const diffMs = date.getTime() - now.getTime();

  if (diffMs <= 0) {
    return { isExpired: true, isPermanent: false, label: "Expired", remaining: "Expired" };
  }

  const remaining = formatTimeRemaining(date, now);
  return {
    isExpired: false,
    isPermanent: false,
    label: `Expires ${remaining}`,
    remaining,
  };
}

/**
 * Calculates human-readable elapsed time since an expiration date.
 * e.g., "3 days ago", "1 day ago", "5 hours ago", "12 minutes ago", "just now"
 */
export function formatTimeElapsedSinceExpiry(
  expiresAt: string | Date | null,
  baseTime?: Date | number
): string {
  if (!expiresAt) return "Permanent";
  const date = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  const now = baseTime !== undefined ? (typeof baseTime === "number" ? new Date(baseTime) : baseTime) : new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs <= 0) return "just now";

  const diffMins = Math.floor(diffMs / (60 * 1000));
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays >= 30) {
    const months = Math.floor(diffDays / 30);
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }
  if (diffDays >= 7) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }
  if (diffDays > 0) {
    return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
  }
  if (diffHours > 0) {
    return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  }
  if (diffMins > 0) {
    return diffMins === 1 ? "1 minute ago" : `${diffMins} minutes ago`;
  }
  return "just now";
}

/**
 * Formats a clean, readable UTC expiration timestamp:
 * e.g. "Wed, 16 Sep 2026, 11:15:00 UTC"
 */
export function formatExpiryTimestamp(expiresAt: string | Date | null): string {
  if (!expiresAt) return "Permanent (No Expiry)";
  const date = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  if (isNaN(date.getTime())) return String(expiresAt);
  return date.toUTCString().replace("GMT", "UTC");
}
