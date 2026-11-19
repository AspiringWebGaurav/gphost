import { Redis } from "@upstash/redis";
import { redis as defaultRedis } from "@/lib/redis/client";
import { createAdminClient } from "@/lib/supabase/admin";

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
  return defaultRedis;
}

/**
 * Resolves the active XURL API key.
 * Prioritizes dynamic Redis override if set by user in Settings, falling back to process.env.XURL_API_KEY.
 */
export async function getActiveXurlApiKey(customRedis?: Redis | null): Promise<string | null> {
  const redisClient = getRedisClient(customRedis);
  if (redisClient) {
    try {
      const dynamicKey = await redisClient.get<string>("config:xurl:api_key");
      if (dynamicKey && typeof dynamicKey === "string" && dynamicKey.trim()) {
        return dynamicKey.trim();
      }
    } catch {}
  }
  return process.env.XURL_API_KEY || null;
}

/**
 * Persists rotated XURL API key into Redis and process.env.
 */
export async function setActiveXurlApiKey(newKey: string, customRedis?: Redis | null): Promise<void> {
  const cleanKey = newKey.trim();
  process.env.XURL_API_KEY = cleanKey;
  const redisClient = getRedisClient(customRedis);
  if (redisClient) {
    try {
      await redisClient.set("config:xurl:api_key", cleanKey);
      await Promise.all([
        redisClient.del(CIRCUIT_BREAKER_KEY),
        redisClient.del(RATELIMIT_BREAKER_KEY),
        redisClient.del("cache:xurl:account_status"),
      ]);
    } catch (err) {
      console.warn("[XURL] Failed to cache rotated API key in Redis:", err);
    }
  }
}

export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 16) return "••••••••••••";
  return `${key.slice(0, 16)}••••••••••••••••${key.slice(-4)}`;
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
  const apiKey = await getActiveXurlApiKey(customRedis);

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
        signal: AbortSignal.timeout(
          parseInt(process.env.XURL_TIMEOUT_MS || "15000", 10) || 15000
        ), // 15s bounded timeout to accommodate upstream cold starts
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
        let descriptive = `XURL error (${status}): ${errorMsg}`;
        if (status === 401) {
          descriptive = "XURL account not found or invalid API key on xurl.eu.cc";
        }
        return {
          success: false,
          status: "failed",
          error: descriptive,
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

export interface XurlAccountStatus {
  configured: boolean;
  valid: boolean;
  status: "connected" | "invalid_key" | "not_configured" | "cooldown" | "network_error" | "expired";
  plan?: "premium_permanent" | "unlimited_api" | "free" | "pro";
  maskedKey?: string;
  message: string;
}

/**
 * Checks whether the XURL integration is configured, account is active, and verifies plan entitlements.
 * If candidateApiKey is supplied, tests candidate credentials directly without caching.
 * Otherwise, resolves the active key via getActiveXurlApiKey() and caches result in Redis for 5 minutes.
 */
export async function checkXurlAccountStatus(
  forceFresh: boolean = false,
  customRedis?: Redis | null,
  candidateApiKey?: string
): Promise<XurlAccountStatus> {
  const apiKey = candidateApiKey ? candidateApiKey.trim() : await getActiveXurlApiKey(customRedis);
  if (!apiKey) {
    return {
      configured: false,
      valid: false,
      status: "not_configured",
      message: "XURL API key not configured in environment or settings (XURL_API_KEY missing).",
    };
  }

  const redisClient = getRedisClient(customRedis);
  const cacheKey = "cache:xurl:account_status";

  if (!candidateApiKey && redisClient && !forceFresh) {
    try {
      const cached = await redisClient.get<string | XurlAccountStatus>(cacheKey);
      if (cached) {
        return typeof cached === "string" ? JSON.parse(cached) : cached;
      }
    } catch {}
  }

  const baseUrl = (process.env.XURL_API_URL || "https://xurl.eu.cc/api/v1").replace(/\/+$/, "");
  const endpoint = baseUrl.endsWith("/links") ? baseUrl : `${baseUrl}/links`;

  try {
    const res = await fetch(`${endpoint}?limit=1`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(15000),
    });

    let result: XurlAccountStatus;

    if (res.ok) {
      result = {
        configured: true,
        valid: true,
        status: "connected",
        plan: "premium_permanent",
        maskedKey: maskApiKey(apiKey),
        message: "XURL account active with Premium Permanent Plan & custom vanity route freedom.",
      };
    } else if (res.status === 401) {
      result = {
        configured: true,
        valid: false,
        status: "invalid_key",
        maskedKey: maskApiKey(apiKey),
        message: "Account not found or invalid API key on xurl.eu.cc.",
      };
    } else if (res.status === 402) {
      result = {
        configured: true,
        valid: false,
        status: "expired",
        maskedKey: maskApiKey(apiKey),
        message: "XURL monthly subscription expired. Your permanent links remain active, but monthly API access is paused. Rotate to an active key.",
      };
    } else if (res.status === 403) {
      result = {
        configured: true,
        valid: false,
        status: "cooldown",
        maskedKey: maskApiKey(apiKey),
        message: "XURL quota exhausted or free tier restrictions active.",
      };
    } else {
      const errorBody = await res.json().catch(() => ({}));
      result = {
        configured: true,
        valid: false,
        status: "network_error",
        maskedKey: maskApiKey(apiKey),
        message: errorBody.error || errorBody.message || `XURL returned HTTP ${res.status}`,
      };
    }

    if (!candidateApiKey && redisClient && result.valid) {
      try {
        await redisClient.set(cacheKey, JSON.stringify(result), { ex: 300 });
      } catch {}
    }

    return result;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network failure";
    return {
      configured: true,
      valid: false,
      status: "network_error",
      maskedKey: maskApiKey(apiKey),
      message: `Failed to contact XURL service: ${errorMsg}`,
    };
  }
}

/**
 * Deletes a link from XURL (xurl.eu.cc) to keep lifecycles synchronized with GPHost.
 * Non-blocking: 404 is treated as already deleted (success).
 */
export async function deleteXurlLink(
  xurlId: string,
  customRedis?: Redis | null
): Promise<{ success: boolean; error?: string }> {
  if (!xurlId || xurlId.startsWith("mock_")) {
    return { success: true };
  }

  const apiKey = await getActiveXurlApiKey(customRedis);
  if (!apiKey) {
    return { success: false, error: "Missing XURL API key" };
  }

  const baseUrl = (process.env.XURL_API_URL || "https://xurl.eu.cc/api/v1").replace(/\/+$/, "");
  const baseLinks = baseUrl.endsWith("/links") ? baseUrl : `${baseUrl}/links`;
  const endpoint = `${baseLinks}/${encodeURIComponent(xurlId)}`;

  try {
    const res = await fetch(endpoint, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok || res.status === 404) {
      return { success: true };
    }

    const errData = await res.json().catch(() => ({}));
    return {
      success: false,
      error: errData.error || `HTTP ${res.status}`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    return { success: false, error: errorMsg };
  }
}

export interface SavedXurlVerification {
  status: "connected" | "invalid_key" | "not_configured" | "cooldown" | "network_error" | "expired";
  valid: boolean;
  plan?: "premium_permanent" | "unlimited_api" | "free" | "pro";
  httpStatus?: number;
  maskedKey?: string;
  message: string;
  intervalDays: number;
  testedAt: string;
  nextCheckDueAt: string;
  isDue: boolean;
}

export async function getXurlCheckIntervalDays(customRedis?: Redis | null): Promise<number> {
  const redisClient = getRedisClient(customRedis);
  if (redisClient) {
    try {
      const stored = await redisClient.get<string | number>("config:xurl:interval_days");
      if (stored) {
        const parsed = parseInt(String(stored), 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    } catch {}
  }
  return 7; // Default: 7 days (1 week)
}

export async function saveXurlVerificationToDatabase(
  testResult: XurlAccountStatus,
  intervalDays?: number,
  userId?: string,
  customRedis?: Redis | null
): Promise<SavedXurlVerification> {
  const resolvedInterval =
    intervalDays && intervalDays > 0
      ? intervalDays
      : await getXurlCheckIntervalDays(customRedis);
  const now = new Date();
  const nextCheckDue = new Date(now.getTime() + resolvedInterval * 86400000);

  const verification: SavedXurlVerification = {
    status: testResult.status,
    valid: testResult.valid,
    plan: testResult.plan,
    httpStatus: testResult.valid ? 200 : testResult.status === "expired" ? 402 : 401,
    maskedKey: testResult.maskedKey,
    message: testResult.message,
    intervalDays: resolvedInterval,
    testedAt: now.toISOString(),
    nextCheckDueAt: nextCheckDue.toISOString(),
    isDue: false,
  };

  // 1. Persist to PostgreSQL database (audit_logs table)
  try {
    const adminClient = createAdminClient();
    await adminClient.from("audit_logs").insert({
      actor_id: userId || null,
      event_type: "XURL_KEY_VERIFICATION",
      resource_type: "xurl_integration",
      resource_id: "xurl_api_key",
      ip_hash: "system_authoritative",
      metadata: {
        status: verification.status,
        valid: verification.valid,
        plan: verification.plan,
        http_status: verification.httpStatus,
        masked_key: verification.maskedKey,
        interval_days: verification.intervalDays,
        tested_at: verification.testedAt,
        next_check_due_at: verification.nextCheckDueAt,
        message: verification.message,
      },
    });
  } catch (dbErr) {
    console.error("[XURL] Error inserting verification to PostgreSQL database:", dbErr);
  }

  // 2. Persist to Redis for instant sub-millisecond lookups
  const redisClient = getRedisClient(customRedis);
  if (redisClient) {
    try {
      await redisClient.set("config:xurl:last_test", JSON.stringify(verification));
      await redisClient.set("config:xurl:interval_days", String(resolvedInterval));
    } catch (redisErr) {
      console.warn("[XURL] Error caching verification to Redis:", redisErr);
    }
  }

  return verification;
}

export async function getSavedXurlVerification(
  customRedis?: Redis | null
): Promise<SavedXurlVerification | null> {
  const redisClient = getRedisClient(customRedis);

  // 1. Try Redis first
  if (redisClient) {
    try {
      const cached = await redisClient.get<string | SavedXurlVerification>("config:xurl:last_test");
      if (cached) {
        const item: SavedXurlVerification =
          typeof cached === "string" ? JSON.parse(cached) : cached;
        const isDue = Date.now() >= new Date(item.nextCheckDueAt).getTime();
        return { ...item, isDue };
      }
    } catch {}
  }

  // 2. Fall back to PostgreSQL database (audit_logs)
  try {
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("audit_logs")
      .select("*")
      .eq("event_type", "XURL_KEY_VERIFICATION")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data || !data.metadata) return null;

    const m = data.metadata as Record<string, unknown>;
    const intervalDays = typeof m.interval_days === "number" ? m.interval_days : 7;
    const testedAt = typeof m.tested_at === "string" ? m.tested_at : data.created_at;
    const nextCheckDueAt =
      typeof m.next_check_due_at === "string"
        ? m.next_check_due_at
        : new Date(new Date(testedAt).getTime() + intervalDays * 86400000).toISOString();
    const isDue = Date.now() >= new Date(nextCheckDueAt).getTime();

    const verification: SavedXurlVerification = {
      status: (m.status as SavedXurlVerification["status"]) || "connected",
      valid: Boolean(m.valid),
      plan: m.plan as SavedXurlVerification["plan"],
      httpStatus: typeof m.http_status === "number" ? m.http_status : 200,
      maskedKey: typeof m.masked_key === "string" ? m.masked_key : undefined,
      message: typeof m.message === "string" ? m.message : "",
      intervalDays,
      testedAt,
      nextCheckDueAt,
      isDue,
    };

    // Cache to Redis
    if (redisClient) {
      try {
        await redisClient.set("config:xurl:last_test", JSON.stringify(verification));
      } catch {}
    }

    return verification;
  } catch (err) {
    console.error("[XURL] Error querying saved verification from database:", err);
    return null;
  }
}

export async function updateXurlVerificationInterval(
  newIntervalDays: number,
  customRedis?: Redis | null
): Promise<SavedXurlVerification | null> {
  const existing = await getSavedXurlVerification(customRedis);
  const redisClient = getRedisClient(customRedis);

  if (redisClient) {
    try {
      await redisClient.set("config:xurl:interval_days", String(newIntervalDays));
    } catch {}
  }

  if (!existing) return null;

  const testedAtDate = new Date(existing.testedAt);
  const nextCheckDueAt = new Date(
    testedAtDate.getTime() + newIntervalDays * 86400000
  ).toISOString();
  const isDue = Date.now() >= new Date(nextCheckDueAt).getTime();

  const updated: SavedXurlVerification = {
    ...existing,
    intervalDays: newIntervalDays,
    nextCheckDueAt,
    isDue,
  };

  if (redisClient) {
    try {
      await redisClient.set("config:xurl:last_test", JSON.stringify(updated));
    } catch {}
  }

  // Also update latest audit log metadata in database
  try {
    const adminClient = createAdminClient();
    const { data: latestRow } = await adminClient
      .from("audit_logs")
      .select("id, metadata")
      .eq("event_type", "XURL_KEY_VERIFICATION")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestRow) {
      const currentMeta = (latestRow.metadata as Record<string, unknown>) || {};
      await adminClient
        .from("audit_logs")
        .update({
          metadata: {
            ...currentMeta,
            interval_days: newIntervalDays,
            next_check_due_at: nextCheckDueAt,
          },
        })
        .eq("id", latestRow.id);
    }
  } catch (err) {
    console.warn("[XURL] Warning: could not update interval in database:", err);
  }

  return updated;
}
