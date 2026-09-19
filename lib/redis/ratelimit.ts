import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./client";

/**
 * Creates a resilient Ratelimit instance that fails open with a warning
 * if Upstash Redis credentials are not configured or experience transient network errors.
 * This guarantees that serverless functions on Vercel never throw 500 errors due to Redis hiccups.
 */
function createResilientLimiter(
  options: ConstructorParameters<typeof Ratelimit>[0]
): Ratelimit {
  const instance = new Ratelimit(options);
  const originalLimit = instance.limit.bind(instance);

  instance.limit = async function (identifier: string, req?: Parameters<typeof originalLimit>[1]) {
    try {
      const url = (process.env.UPSTASH_REDIS_REST_URL || "").trim();
      const token = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
      if (!url || !token) {
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
      console.warn(`[Upstash RateLimit] Transient failure for ${identifier}, failing open:`, err);
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
export const pinRatelimit = createResilientLimiter({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  analytics: false,
  prefix: "gphost:ratelimit:pin",
});

/**
 * Access Request Rate Limiter:
 * Allows a maximum of 5 submissions per hour per user/IP.
 */
export const requestRatelimit = createResilientLimiter({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 h"),
  analytics: false,
  prefix: "gphost:ratelimit:request",
});

/**
 * Auth Callback Rate Limiter:
 * Prevents spamming code exchanges.
 */
export const authCallbackRatelimit = createResilientLimiter({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 m"),
  analytics: false,
  prefix: "gphost:ratelimit:auth",
});

/**
 * Upload Initiation Rate Limiter:
 * Allows a maximum of 30 upload initiations per hour per user/IP.
 */
export const uploadInitiateRatelimit = createResilientLimiter({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 h"),
  analytics: false,
  prefix: "gphost:ratelimit:upload_init",
});

/**
 * Multipart Part Signing Rate Limiter:
 * Allows a maximum of 600 part signings per hour per user.
 */
export const multipartSignRatelimit = createResilientLimiter({
  redis,
  limiter: Ratelimit.slidingWindow(600, "1 h"),
  analytics: false,
  prefix: "gphost:ratelimit:multipart_sign",
});

/**
 * Share Link Creation Rate Limiter:
 * Allows a maximum of 60 share creations per hour per user.
 */
export const shareCreateRatelimit = createResilientLimiter({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 h"),
  analytics: false,
  prefix: "gphost:ratelimit:share_create",
});

/**
 * Public Share Read Rate Limiter:
 * Allows a maximum of 120 reads per minute per IP.
 */
export const publicShareRatelimit = createResilientLimiter({
  redis,
  limiter: Ratelimit.slidingWindow(120, "1 m"),
  analytics: false,
  prefix: "gphost:ratelimit:share_read",
});

/**
 * Share Password Verification Rate Limiter:
 * Maximum 5 attempts per 15 minutes per IP/slug.
 */
export const passwordVerifyRatelimit = createResilientLimiter({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  analytics: false,
  prefix: "gphost:ratelimit:share_password",
});

/**
 * Download Claim Rate Limiter:
 * Maximum 10 claims per 1 minute per IP.
 */
export const downloadClaimRatelimit = createResilientLimiter({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  analytics: false,
  prefix: "gphost:ratelimit:download_claim",
});

/**
 * User Profile Update Rate Limiter:
 * 30 updates per 1 minute per user/IP.
 */
export const profileUpdateRatelimit = createResilientLimiter({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 m"),
  analytics: false,
  prefix: "gphost:ratelimit:profile_update",
});

/**
 * Admin Operational Rate Limiter:
 * 60 operations per 1 minute per admin.
 */
export const adminOpRatelimit = createResilientLimiter({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  analytics: false,
  prefix: "gphost:ratelimit:admin_op",
});

/**
 * Onboarding Status Check Rate Limiter:
 * 30 checks per 1 minute per user/IP.
 */
export const onboardingStatusRatelimit = createResilientLimiter({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 m"),
  analytics: false,
  prefix: "gphost:ratelimit:onboarding_status",
});

