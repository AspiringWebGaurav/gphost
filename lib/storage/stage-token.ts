import crypto from "crypto";

const STAGE_TOKEN_SECRET =
  process.env.PIN_PEPPER ||
  process.env.SUPABASE_SECRET_KEY ||
  "gphost-secure-stage-token-signing-key-default-salt";

export interface StageTokenPayload {
  fileId: string;
  slug: string;
  stagedR2Key: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  sha256?: string;
  userId: string;
  timestamp: number;
}

/**
 * Creates a cryptographically signed HMAC token for staged file replacements.
 */
export function signStageToken(payload: StageTokenPayload): string {
  const json = JSON.stringify(payload);
  const b64Data = Buffer.from(json, "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", STAGE_TOKEN_SECRET)
    .update(b64Data)
    .digest("base64url");
  return `${b64Data}.${signature}`;
}

/**
 * Authoritatively verifies and decodes a stage token.
 * Rejects expired tokens (> 30 minutes) or tampered payloads.
 */
export function verifyStageToken(token: string): StageTokenPayload | null {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return null;
  }

  const [b64Data, signature] = token.split(".");
  if (!b64Data || !signature) {
    return null;
  }

  const expectedSignature = crypto
    .createHmac("sha256", STAGE_TOKEN_SECRET)
    .update(b64Data)
    .digest("base64url");

  const sigBufA = Buffer.from(signature);
  const sigBufB = Buffer.from(expectedSignature);

  if (sigBufA.length !== sigBufB.length || !crypto.timingSafeEqual(sigBufA, sigBufB)) {
    return null;
  }

  try {
    const json = Buffer.from(b64Data, "base64url").toString("utf8");
    const payload = JSON.parse(json) as StageTokenPayload;

    // Check expiration (30 minutes)
    if (!payload.timestamp || Date.now() - payload.timestamp > 30 * 60 * 1000) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
