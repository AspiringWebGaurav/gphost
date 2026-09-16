import { Redis } from "@upstash/redis";

export interface XurlShortenResult {
  success: boolean;
  shortUrl?: string;
  xurlId?: string;
  status: "active" | "failed" | "cooldown";
  error?: string;
  attempts?: number;
}

export interface ShortenUrlOptions {
  customSlug?: string;
  expiresAt?: string | null;
  customRedis?: Redis | null;
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

export function isLocalOrPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().trim();
  if (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "0.0.0.0" ||
    h.endsWith(".localhost")
  ) {
    return true;
  }
  if (
    h.endsWith(".local") ||
    h.endsWith(".lan") ||
    h.endsWith(".test") ||
    h.endsWith(".internal")
  ) {
    return true;
  }
  // Private IPv4 ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8
  const parts = h.split(".").map(Number);
  if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
  }
  return false;
}

/**
 * Robust, circuit-broken, quota-protecting client for XURL (https://xurl.eu.cc/api/v1/links).
 * Strictly enforces:
 * - Bearer authorization via XURL_API_KEY
 * - Bounded retries (3 total attempts) with exponential backoff on 5xx / network errors
 * - Zero retries on 400, 401, 403
 * - Automatic graceful fallback on 409 (custom slug already taken) to auto-generated slug
 * - Localhost/private IP detection with zero-latency dev mode simulation
 * - Upstash Redis 24h circuit breaker on 403 quota exhaustion
 * - Upstash Redis 60s cooldown on 429 rate limits
 * - Non-blocking: never throws unhandled errors
 * - Supports customSlug and expiresAt synchronization for premium links
 */
export async function shortenUrl(
  targetUrl: string,
  options?: ShortenUrlOptions | Redis | null
): Promise<XurlShortenResult> {
  // 1. Basic URL validation
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
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

  // Parse options / Redis backwards-compatibility
  const isDirectRedis = options && typeof (options as Record<string, unknown>).get === "function";
  const customRedis = isDirectRedis
    ? (options as Redis)
    : (options as ShortenUrlOptions | undefined)?.customRedis;
  const customSlug = !isDirectRedis
    ? (options as ShortenUrlOptions | undefined)?.customSlug
    : undefined;
  const expiresAt = !isDirectRedis
    ? (options as ShortenUrlOptions | undefined)?.expiresAt
    : undefined;

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

  // 3. Localhost & Private Network Address Handling
  const isLocal = isLocalOrPrivateHostname(parsed.hostname);
  if (isLocal) {
    if (process.env.XURL_DEV_MOCK === "true") {
      const derivedSlug =
        customSlug ||
        (parsed.pathname.startsWith("/f/")
          ? parsed.pathname.replace(/^\/f\//, "")
          : `dev-${Math.random().toString(36).slice(2, 8)}`);
      const mockShortUrl = `https://xurl.eu.cc/${derivedSlug}`;
      console.log(
        `[XURL Dev Mock] Localhost target detected (${targetUrl}). Created development shortlink: ${mockShortUrl}`
      );
      return {
        success: true,
        status: "active",
        shortUrl: mockShortUrl,
        xurlId: `mock_${derivedSlug}`,
        attempts: 1,
      };
    }

    // Default on localhost: generate with the official domain https://gphost.eu.cc
    const officialTargetUrl = `https://gphost.eu.cc${parsed.pathname}${parsed.search}`;
    console.log(
      `[XURL] Localhost target detected (${targetUrl}). Generating live short link with official domain: ${officialTargetUrl}`
    );
    return shortenUrl(officialTargetUrl, { ...options, customRedis });
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

  const requestBody: Record<string, unknown> = { url: targetUrl };
  if (customSlug) {
    requestBody.customSlug = customSlug;
  }
  if (expiresAt) {
    requestBody.expiresAt = expiresAt;
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
        body: JSON.stringify(requestBody),
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

      // HTTP 409: Conflict (e.g. custom slug already taken on XURL)
      // Gracefully fall back to an auto-generated slug on XURL so creation does not fail
      if (status === 409) {
        if (requestBody.customSlug) {
          console.warn(
            `[XURL] Custom slug "${requestBody.customSlug}" is already taken on xurl.eu.cc. Retrying with auto-generated slug.`
          );
          delete requestBody.customSlug;
          continue;
        }
        return {
          success: false,
          status: "failed",
          error: `XURL client error (${status}): ${errorMsg}`,
          attempts: attempt,
        };
      }

      // Non-retryable client errors: 400 (e.g. unresolvable DNS), 401 (bad key)
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
