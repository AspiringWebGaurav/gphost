import { Redis } from "@upstash/redis";

export interface XurlShortenResult {
  success: boolean;
  shortUrl?: string;
  xurlId?: string;
  status: "active" | "failed" | "cooldown";
  error?: string;
  attempts?: number;
}

const CIRCUIT_BREAKER_KEY = "circuit:xurl:cooldown";
const RATELIMIT_BREAKER_KEY = "circuit:xurl:ratelimit";
const CIRCUIT_BREAKER_TTL = 86400; // 24 hours in seconds
const RATELIMIT_BREAKER_TTL = 60; // 60 seconds

const MAX_ATTEMPTS = 3; // 1 initial + 2 retries
const BACKOFF_MS = [1000, 2000];

function getRedisClient(customRedis?: Redis | null): Redis | null {
  if (customRedis !== undefined) return customRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

/**
 * Robust, circuit-broken, quota-protecting client for XURL (https://xurl.eu.cc/api/v1/links).
 * Strictly enforces:
 * - Bearer authorization via XURL_API_KEY
 * - Bounded retries (3 total attempts) with exponential backoff on 5xx / network errors
 * - Zero retries on 400, 401, 403, 409
 * - Upstash Redis 24h circuit breaker on 403 quota exhaustion
 * - Upstash Redis 60s cooldown on 429 rate limits
 * - Non-blocking: never throws unhandled errors
 */
export async function shortenUrl(
  targetUrl: string,
  customRedis?: Redis | null
): Promise<XurlShortenResult> {
  // 1. Basic URL validation
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        success: false,
        status: "failed",
        error: "Invalid URL protocol: must be http or https",
      };
    }
  } catch {
    return {
      success: false,
      status: "failed",
      error: "Malformed target URL",
    };
  }

  // 2. Check Redis Circuit Breakers
  const redisClient = getRedisClient(customRedis);
  if (redisClient) {
    try {
      const isCooldown = await redisClient.get(CIRCUIT_BREAKER_KEY);
      if (isCooldown) {
        return {
          success: false,
          status: "cooldown",
          error: "XURL quota circuit breaker active (24h cooldown)",
        };
      }

      const isRatelimited = await redisClient.get(RATELIMIT_BREAKER_KEY);
      if (isRatelimited) {
        return {
          success: false,
          status: "failed",
          error: "XURL temporary rate-limit cooldown active (60s)",
        };
      }
    } catch (redisErr) {
      console.warn("[XURL] Redis circuit breaker check warning (proceeding):", redisErr);
    }
  }

  const baseUrl = (process.env.XURL_API_URL || "https://xurl.eu.cc/api/v1").replace(/\/+$/, "");
  const endpoint = baseUrl.endsWith("/links") ? baseUrl : `${baseUrl}/links`;
  const apiKey = process.env.XURL_API_KEY;

  if (!apiKey) {
    console.error("[XURL] Missing XURL_API_KEY in environment");
    return {
      success: false,
      status: "failed",
      error: "Missing XURL API credentials",
    };
  }

  let attempt = 0;
  let lastError = "";

  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ url: targetUrl }),
        signal: AbortSignal.timeout(8000), // 8s bounded timeout
      });

      // HTTP 201 Created or 200 OK
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && typeof data.shortUrl === "string" && typeof data.id === "string") {
          return {
            success: true,
            status: "active",
            shortUrl: data.shortUrl,
            xurlId: data.id,
            attempts: attempt,
          };
        }
        return {
          success: false,
          status: "failed",
          error: "Invalid response shape from XURL API",
          attempts: attempt,
        };
      }

      const status = res.status;
      const errorBody = await res.json().catch(() => ({}));
      const errorMsg = errorBody.error || errorBody.message || `HTTP ${status}`;

      // HTTP 403: Quota Exceeded / Disabled Plan -> Trip 24h Circuit Breaker
      if (status === 403) {
        if (redisClient) {
          try {
            await redisClient.set(CIRCUIT_BREAKER_KEY, "1", { ex: CIRCUIT_BREAKER_TTL });
            console.warn("[XURL] 403 Quota Exceeded. Tripped 24h circuit breaker.");
          } catch (e) {
            console.error("[XURL] Failed to set Redis circuit breaker:", e);
          }
        }
        return {
          success: false,
          status: "cooldown",
          error: `API quota exceeded: ${errorMsg}`,
          attempts: attempt,
        };
      }

      // HTTP 429: Rate Limit -> Bounded handling or 60s cooldown
      if (status === 429) {
        const retryAfterHeader = res.headers.get("Retry-After");
        const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;

        if (!isNaN(retryAfterSeconds) && retryAfterSeconds <= 2 && attempt < MAX_ATTEMPTS) {
          // Bounded retry if within 2 seconds
          await new Promise((r) => setTimeout(r, retryAfterSeconds * 1000));
          continue;
        }

        // Trip 60s cooldown
        if (redisClient) {
          try {
            await redisClient.set(RATELIMIT_BREAKER_KEY, "1", { ex: RATELIMIT_BREAKER_TTL });
          } catch (e) {
            console.error("[XURL] Failed to set Redis rate limit breaker:", e);
          }
        }

        return {
          success: false,
          status: "failed",
          error: `Rate limited by XURL: ${errorMsg}`,
          attempts: attempt,
        };
      }

      // Non-retryable client errors: 400 (e.g. unresolvable DNS), 401 (bad key), 409 (conflict)
      if (status >= 400 && status < 500) {
        return {
          success: false,
          status: "failed",
          error: `XURL client error (${status}): ${errorMsg}`,
          attempts: attempt,
        };
      }

      // HTTP 5xx: Transient server errors -> retry if budget remains
      lastError = `XURL upstream error (${status}): ${errorMsg}`;
    } catch (err: unknown) {
      // Network error, DNS error, or AbortSignal timeout
      lastError = err instanceof Error ? err.message : "Network failure";
    }

    // Apply backoff if retry attempts remain
    if (attempt < MAX_ATTEMPTS) {
      const delay = BACKOFF_MS[attempt - 1] || 1000;
      const jitter = Math.floor(Math.random() * 200) - 100;
      await new Promise((r) => setTimeout(r, Math.max(100, delay + jitter)));
    }
  }

  return {
    success: false,
    status: "failed",
    error: `Exhausted ${MAX_ATTEMPTS} attempts. Last error: ${lastError}`,
    attempts: MAX_ATTEMPTS,
  };
}
