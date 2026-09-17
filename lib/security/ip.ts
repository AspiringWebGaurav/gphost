import crypto from "node:crypto";

export const IP_HASH_PEPPER =
  process.env.IP_HASH_PEPPER ||
  process.env.PIN_PEPPER ||
  (process.env.NODE_ENV !== "production" ? "gphost_dev_ip_pepper" : "");

/**
 * Computes a keyed HMAC-SHA256 hash of a client IP address.
 * NEVER log or store raw IP addresses in PostgreSQL.
 */
export function hashClientIp(ip: string, pepper = IP_HASH_PEPPER): string {
  const normalized = (ip || "127.0.0.1").trim().toLowerCase();
  return crypto.createHmac("sha256", pepper).update(normalized).digest("hex");
}

/**
 * Helper to safely extract client IP from NextRequest / Request headers.
 * Strictly prioritizes authoritative edge headers (cf-connecting-ip, x-real-ip)
 * over client-controllable x-forwarded-for to prevent rate-limit spoofing.
 */
export function getClientIp(headers: Headers): string {
  const cfConnectingIp = headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    const trimmed = cfConnectingIp.trim();
    if (trimmed && isValidIp(trimmed)) return trimmed;
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) {
    const trimmed = realIp.trim();
    if (trimmed && isValidIp(trimmed)) return trimmed;
  }

  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first && isValidIp(first)) return first;
  }

  return "127.0.0.1";
}

function isValidIp(ip: string): boolean {
  // Basic sanity check: reject oversized strings or control characters
  if (!ip || ip.length > 45 || /[\s\x00-\x1F\x7F]/.test(ip)) {
    return false;
  }
  // Standard IPv4 or IPv6 pattern check
  const isIpv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip);
  const isIpv6 = /^[0-9a-fA-F:]+$/.test(ip) && ip.includes(":");
  return isIpv4 || isIpv6;
}
