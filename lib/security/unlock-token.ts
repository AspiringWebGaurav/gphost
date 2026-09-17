import crypto from "node:crypto";

export const UNLOCK_TOKEN_SECRET =
  process.env.UNLOCK_TOKEN_SECRET ||
  process.env.PASSWORD_PEPPER ||
  process.env.PIN_PEPPER ||
  (process.env.NODE_ENV !== "production" ? "gphost_dev_unlock_token_secret" : "");

export interface UnlockTokenPayload {
  slug: string;
  fileId: string;
  exp: number; // Unix timestamp in seconds
}

export function getUnlockCookieName(slug: string): string {
  return `gphost_unlock_${slug}`;
}

/**
 * Creates an HMAC-SHA256 signed unlock token for a password-protected share link.
 * Default TTL is 15 minutes (900 seconds).
 */
export function createUnlockToken(
  slug: string,
  fileId: string,
  ttlSeconds = 15 * 60,
  secret = UNLOCK_TOKEN_SECRET
): string {
  if (!secret || secret.trim().length === 0) {
    throw new Error("Missing cryptographic UNLOCK_TOKEN_SECRET in server configuration");
  }

  const payload: UnlockTokenPayload = {
    slug,
    fileId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };

  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payloadEncoded)
    .digest("hex");

  return `${payloadEncoded}.${signature}`;
}

/**
 * Verifies an unlock token against expected slug and fileId.
 * Validates cryptographic signature and expiration.
 */
export function verifyUnlockToken(
  token: unknown,
  expectedSlug: string,
  expectedFileId: string,
  secret = UNLOCK_TOKEN_SECRET
): boolean {
  if (!secret || secret.trim().length === 0 || typeof token !== "string" || !token.includes(".")) {
    return false;
  }

  try {
    const [payloadEncoded, signature] = token.split(".");
    if (
      !payloadEncoded ||
      !signature ||
      signature.length !== 64 ||
      !/^[0-9a-f]{64}$/i.test(signature)
    ) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payloadEncoded)
      .digest("hex");

    const bufA = Buffer.from(signature, "hex");
    const bufB = Buffer.from(expectedSignature, "hex");

    if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
      return false;
    }

    const jsonStr = Buffer.from(payloadEncoded, "base64url").toString("utf8");
    const payload: UnlockTokenPayload = JSON.parse(jsonStr);

    if (
      typeof payload !== "object" ||
      payload === null ||
      payload.slug !== expectedSlug ||
      payload.fileId !== expectedFileId ||
      typeof payload.exp !== "number"
    ) {
      return false;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp <= nowSec) {
      return false; // Expired
    }

    return true;
  } catch {
    return false;
  }
}
