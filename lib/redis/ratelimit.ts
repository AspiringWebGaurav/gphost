import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./client";

/**
 * In-memory sliding window rate limiter fallback.
 * Ensures strict anti-abuse protections function even when Upstash Redis
 * credentials are not configured (local dev, self-hosted, or transient outages).
 */
class MemorySlidingWindowLimiter {
  private windows = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }

  limit(identifier: string): { success: boolean; limit: number; remaining: number; reset: number } {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const timestamps = (this.windows.get(identifier) || []).filter((t) => t > windowStart);

    if (timestamps.length >= this.max) {
      const oldest = timestamps[0] || now;
      const reset = oldest + this.windowMs;
      this.windows.set(identifier, timestamps);
      return {
        success: false,
        limit: this.max,
        remaining: 0,
        reset,
      };
    }

    timestamps.push(now);
    this.windows.set(identifier, timestamps);

    // Housekeeping: purge expired keys if map grows large
    if (this.windows.size > 2000) {
      for (const [k, v] of this.windows.entries()) {
        if (v.every((t) => t <= windowStart)) {
          this.windows.delete(k);
        }
      }
    }

    return {
      success: true,
      limit: this.max,
      remaining: Math.max(0, this.max - timestamps.length),
      reset: now + this.windowMs,
    };
  }
}

/**
 * Creates a resilient Ratelimit instance that uses Upstash Redis when available,
 * and falls back gracefully to in-memory sliding windows if Redis is unconfigured or unreachable.
 */
function createResilientLimiter(
  options: ConstructorParameters<typeof Ratelimit>[0],
  fallbackConfig?: { max: number; windowMs: number }
): Ratelimit {
  const instance = new Ratelimit(options);
  const originalLimit = instance.limit.bind(instance);
  const memoryFallback = fallbackConfig
    ? new MemorySlidingWindowLimiter(fallbackConfig.max, fallbackConfig.windowMs)
    : null;

  instance.limit = async function (identifier: string, req?: Parameters<typeof originalLimit>[1]) {
    try {
      const url = (process.env.UPSTASH_REDIS_REST_URL || "").trim();
      const token = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
      if (!url || !token) {
        if (memoryFallback) {
          const res = memoryFallback.limit(identifier);
          return {
            ...res,
            pending: Promise.resolve(),
          } as unknown as Awaited<ReturnType<typeof originalLimit>>;
        }
        return {
          success: true,
          limit: 100,
          remaining: 99,
          reset: Date.now() + 60000,
          pending: Promise.resolve(),
        } as unknown as Awaited<ReturnType<typeof originalLimit>>;
      }
      return await originalLimit(identifier, req);
    } catch (err) {
      console.warn(`[Upstash RateLimit] Transient failure for ${identifier}, falling to memory fallback:`, err);
      if (memoryFallback) {
        const res = memoryFallback.limit(identifier);
        return {
          ...res,
          pending: Promise.resolve(),
        } as unknown as Awaited<ReturnType<typeof originalLimit>>;
      }
      return {
        success: true,
        limit: 100,
        remaining: 99,
        reset: Date.now() + 60000,
        pending: Promise.resolve(),
      } as unknown as Awaited<ReturnType<typeof originalLimit>>;
    }
  };

  return instance;
}

/**
 * Onboarding PIN Brute-Force Protection Rate Limiter:
 * Allows a maximum of 5 attempts within a 15-minute sliding window.
 */
export const pinRatelimit = createResilientLimiter(
  {
    redis,
    limiter: Ratelimit.slidingWindow(5, "15 m"),
    analytics: false,
    prefix: "gphost:ratelimit:pin",
  },
  { max: 5, windowMs: 15 * 60 * 1000 }
);

/**
 * Access Request Rate Limiter:
 * Allows a maximum of 5 submissions per hour per user/IP.
 */
export const requestRatelimit = createResilientLimiter(
  {
    redis,
    limiter: Ratelimit.slidingWindow(5, "1 h"),
    analytics: false,
    prefix: "gphost:ratelimit:request",
  },
  { max: 5, windowMs: 60 * 60 * 1000 }
);

/**
 * Auth Callback Rate Limiter:
 * Prevents spamming code exchanges.
 */
export const authCallbackRatelimit = createResilientLimiter(
  {
    redis,
    limiter: Ratelimit.slidingWindow(20, "1 m"),
    analytics: false,
    prefix: "gphost:ratelimit:auth",
  },
  { max: 20, windowMs: 60 * 1000 }
);

/**
 * Upload Initiation Rate Limiter:
 * Allows a maximum of 30 upload initiations per hour per user/IP.
 */
export const uploadInitiateRatelimit = createResilientLimiter(
  {
    redis,
    limiter: Ratelimit.slidingWindow(30, "1 h"),
    analytics: false,
    prefix: "gphost:ratelimit:upload_init",
  },
  { max: 30, windowMs: 60 * 60 * 1000 }
);

/**
 * Developer API & CLI Upload Rate Limiter:
 * Allows a maximum of 60 upload requests per minute per user/API key
 * to support fast legitimate automated CLI operations while strictly stopping DDoS flood attacks.
 */
export const cliUploadRatelimit = createResilientLimiter(
  {
    redis,
    limiter: Ratelimit.slidingWindow(60, "1 m"),
    analytics: false,
    prefix: "gphost:ratelimit:cli_upload",
  },
  { max: 60, windowMs: 60 * 1000 }
);

/**
 * Multipart Part Signing Rate Limiter:
 * Allows a maximum of 600 part signings per hour per user.
 */
export const multipartSignRatelimit = createResilientLimiter(
  {
    redis,
    limiter: Ratelimit.slidingWindow(600, "1 h"),
    analytics: false,
    prefix: "gphost:ratelimit:multipart_sign",
  },
  { max: 600, windowMs: 60 * 60 * 1000 }
);

/**
 * Share Link Creation Rate Limiter:
 * Allows a maximum of 60 share creations per hour per user.
 */
export const shareCreateRatelimit = createResilientLimiter(
  {
    redis,
    limiter: Ratelimit.slidingWindow(60, "1 h"),
    analytics: false,
    prefix: "gphost:ratelimit:share_create",
  },
  { max: 60, windowMs: 60 * 60 * 1000 }
);

/**
 * Public Share Read Rate Limiter:
 * Allows a maximum of 120 reads per minute per IP.
 */
export const publicShareRatelimit = createResilientLimiter(
  {
    redis,
    limiter: Ratelimit.slidingWindow(120, "1 m"),
    analytics: false,
    prefix: "gphost:ratelimit:share_read",
  },
  { max: 120, windowMs: 60 * 1000 }
);

/**
 * Share Password Verification Rate Limiter:
 * Maximum 5 attempts per 15 minutes per IP/slug.
 */
export const passwordVerifyRatelimit = createResilientLimiter(
  {
    redis,
    limiter: Ratelimit.slidingWindow(5, "15 m"),
    analytics: false,
    prefix: "gphost:ratelimit:share_password",
  },
  { max: 5, windowMs: 15 * 60 * 1000 }
);

/**
 * Anti-Burst Rapid Click Download Rate Limiter:
 * Allows max 2 download claims within 6 seconds per (IP + slug).
 * Prevents "click click click" double-triggering or rapid button spamming while
 * remaining generous enough for legitimate browser retry attempts.
 */
export const downloadBurstRatelimit = createResilientLimiter(
  {
    redis,
    limiter: Ratelimit.slidingWindow(2, "6 s"),
    analytics: false,
    prefix: "gphost:ratelimit:dl_burst",
  },
  { max: 2, windowMs: 6 * 1000 }
);

/**
 * Sustained Volume Download Rate Limiter:
 * Maximum 15 claims per 1 minute per IP.
 */
export const downloadClaimRatelimit = createResilientLimiter(
  {
    redis,
    limiter: Ratelimit.slidingWindow(15, "1 m"),
    analytics: false,
    prefix: "gphost:ratelimit:dl_claim",
  },
  { max: 15, windowMs: 60 * 1000 }
);

/**
 * Authenticated Owner Direct Download Burst Limiter:
 * Allows max 3 downloads in 6 seconds per (User + File).
 */
export const ownerDownloadBurstRatelimit = createResilientLimiter(
  {
    redis,
    limiter: Ratelimit.slidingWindow(3, "6 s"),
    analytics: false,
    prefix: "gphost:ratelimit:owner_dl_burst",
  },
  { max: 3, windowMs: 6 * 1000 }
);

/**
 * Authenticated Owner Direct Download Volume Limiter:
 * Allows max 30 downloads in 1 minute per user.
 */
export const ownerDownloadVolumeRatelimit = createResilientLimiter(
  {
    redis,
    limiter: Ratelimit.slidingWindow(30, "1 m"),
    analytics: false,
    prefix: "gphost:ratelimit:owner_dl_vol",
  },
  { max: 30, windowMs: 60 * 1000 }
);

/**
 * User Profile Update Rate Limiter:
 * 30 updates per 1 minute per user/IP.
 */
export const profileUpdateRatelimit = createResilientLimiter(
  {
    redis,
    limiter: Ratelimit.slidingWindow(30, "1 m"),
    analytics: false,
    prefix: "gphost:ratelimit:profile_update",
  },
  { max: 30, windowMs: 60 * 1000 }
);

/**
 * Admin Operational Rate Limiter:
 * 60 operations per 1 minute per admin.
 */
export const adminOpRatelimit = createResilientLimiter(
  {
    redis,
    limiter: Ratelimit.slidingWindow(60, "1 m"),
    analytics: false,
    prefix: "gphost:ratelimit:admin_op",
  },
  { max: 60, windowMs: 60 * 1000 }
);

/**
 * Onboarding Status Check Rate Limiter:
 * 30 checks per 1 minute per user/IP.
 */
export const onboardingStatusRatelimit = createResilientLimiter(
  {
    redis,
    limiter: Ratelimit.slidingWindow(30, "1 m"),
    analytics: false,
    prefix: "gphost:ratelimit:onboarding_status",
  },
  { max: 30, windowMs: 60 * 1000 }
);

/**
 * Comprehensive download anti-abuse checker for public share links:
 * 1. Checks short-term burst window (max 2 downloads in 6s per IP+slug) to stop rapid click spam.
 * 2. Checks sustained volume window (max 15 downloads in 1m per IP) to stop automated scrapers.
 */
export async function checkDownloadRateLimit(
  clientIp: string,
  slug?: string
): Promise<{ success: boolean; error?: string; retryAfterSeconds?: number }> {
  const safeIp = (clientIp || "").trim() || "anonymous";
  const burstKey = slug ? `${safeIp}:${slug}` : safeIp;

  // 1. Check rapid consecutive burst
  const burstRes = await downloadBurstRatelimit.limit(burstKey);
  if (!burstRes.success) {
    const retrySec = Math.max(1, Math.ceil((burstRes.reset - Date.now()) / 1000));
    return {
      success: false,
      error: `Download in progress. Please wait ${retrySec}s before requesting again.`,
      retryAfterSeconds: retrySec,
    };
  }

  // 2. Check sustained 1-minute volume
  const volRes = await downloadClaimRatelimit.limit(safeIp);
  if (!volRes.success) {
    const retrySec = Math.max(1, Math.ceil((volRes.reset - Date.now()) / 1000));
    return {
      success: false,
      error: `Too many download requests. Please wait ${retrySec}s before downloading more files.`,
      retryAfterSeconds: retrySec,
    };
  }

  return { success: true };
}

/**
 * Comprehensive download rate limiter for dashboard owners.
 */
export async function checkOwnerDownloadRateLimit(
  userId: string,
  fileId?: string
): Promise<{ success: boolean; error?: string; retryAfterSeconds?: number }> {
  const safeUser = (userId || "").trim() || "anonymous";
  const burstKey = fileId ? `${safeUser}:${fileId}` : safeUser;

  const burstRes = await ownerDownloadBurstRatelimit.limit(burstKey);
  if (!burstRes.success) {
    const retrySec = Math.max(1, Math.ceil((burstRes.reset - Date.now()) / 1000));
    return {
      success: false,
      error: `Download in progress. Please wait ${retrySec}s before downloading again.`,
      retryAfterSeconds: retrySec,
    };
  }

  const volRes = await ownerDownloadVolumeRatelimit.limit(safeUser);
  if (!volRes.success) {
    const retrySec = Math.max(1, Math.ceil((volRes.reset - Date.now()) / 1000));
    return {
      success: false,
      error: `Too many download requests. Please wait ${retrySec}s before downloading more files.`,
      retryAfterSeconds: retrySec,
    };
  }

  return { success: true };
}

/**
 * GDPR / Privacy Data Export Rate Limiter:
 * Allows a maximum of 5 data export requests per hour per user.
 * Protects against database exhaustion while supporting legitimate data portability rights.
 */
export const dataExportRatelimit = createResilientLimiter(
  {
    redis,
    limiter: Ratelimit.slidingWindow(5, "1 h"),
    analytics: false,
    prefix: "gphost:ratelimit:data_export",
  },
  { max: 5, windowMs: 60 * 60 * 1000 }
);

