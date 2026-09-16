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
 */
export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) {
    const trimmed = realIp.trim();
    if (trimmed) return trimmed;
  }

  const cfConnectingIp = headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    const trimmed = cfConnectingIp.trim();
    if (trimmed) return trimmed;
  }

  return "127.0.0.1";
}
