import { redis } from "@/lib/redis/client";

interface TurnstileVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Validates a Cloudflare Turnstile token on the server side and enforces replay protection via Redis.
 */
export async function verifyTurnstileToken(token: string | null | undefined, clientIp?: string): Promise<{ success: boolean; error?: string }> {
  if (!token || typeof token !== "string" || !token.trim()) {
    return { success: false, error: "Missing Turnstile verification token" };
  }

  const trimmedToken = token.trim();

  // Guard against memory bloat: reject abnormal token lengths
  if (trimmedToken.length > 2048) {
    return { success: false, error: "Invalid Turnstile token length" };
  }

  // Test token handling for automated verification
  if (process.env.NODE_ENV !== "production" && trimmedToken === "test_turnstile_bypass_token") {
    return { success: true };
  }

  // 1. Replay Protection via Redis: Check if token has already been consumed
  const replayKey = `gphost:turnstile:used:${trimmedToken}`;
  try {
    const alreadyUsed = await redis.get(replayKey);
    if (alreadyUsed) {
      return { success: false, error: "Turnstile token already used (replay rejected)" };
    }
  } catch (redisErr) {
    console.warn("[Turnstile] Redis replay check warning:", redisErr);
  }

  // 2. Query Cloudflare Siteverify endpoint
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    return { success: false, error: "Server missing TURNSTILE_SECRET_KEY configuration" };
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", trimmedToken);
    if (clientIp) {
      formData.append("remoteip", clientIp);
    }

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      signal: AbortSignal.timeout(6000), // 6s timeout to prevent hanging serverless workers
    });

    if (!response.ok) {
      return { success: false, error: `Cloudflare verification HTTP error: ${response.status}` };
    }

    const data = (await response.json()) as TurnstileVerifyResponse;

    if (!data.success) {
      return {
        success: false,
        error: `Cloudflare Turnstile verification failed: ${data["error-codes"]?.join(", ") || "invalid token"}`,
      };
    }

    // 3. Mark token as consumed in Redis with 5-minute (300s) TTL
    try {
      await redis.set(replayKey, "1", { ex: 300 });
    } catch (setErr) {
      console.warn("[Turnstile] Redis replay set warning:", setErr);
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: `Turnstile verification exception: ${message}` };
  }
}
