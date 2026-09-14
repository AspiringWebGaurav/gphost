import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./client";

/**
 * Onboarding PIN Brute-Force Protection Rate Limiter:
 * Allows a maximum of 5 attempts within a 15-minute sliding window.
 */
export const pinRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  analytics: false,
  prefix: "gphost:ratelimit:pin",
});

/**
 * Access Request Rate Limiter:
 * Allows a maximum of 5 submissions per hour per user/IP.
 */
export const requestRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 h"),
  analytics: false,
  prefix: "gphost:ratelimit:request",
});

/**
 * Auth Callback Rate Limiter:
 * Prevents spamming code exchanges.
 */
export const authCallbackRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 m"),
  analytics: false,
  prefix: "gphost:ratelimit:auth",
});

/**
 * Upload Initiation Rate Limiter:
 * Allows a maximum of 30 upload initiations per hour per user/IP.
 */
export const uploadInitiateRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 h"),
  analytics: false,
  prefix: "gphost:ratelimit:upload_init",
});

/**
 * Multipart Part Signing Rate Limiter:
 * Allows a maximum of 600 part signings per hour per user.
 */
export const multipartSignRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(600, "1 h"),
  analytics: false,
  prefix: "gphost:ratelimit:multipart_sign",
});

/**
 * Share Link Creation Rate Limiter:
 * Allows a maximum of 60 share creations per hour per user.
 */
export const shareCreateRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 h"),
  analytics: false,
  prefix: "gphost:ratelimit:share_create",
});

/**
 * Public Share Read Rate Limiter:
 * Allows a maximum of 120 reads per minute per IP.
 */
export const publicShareRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(120, "1 m"),
  analytics: false,
  prefix: "gphost:ratelimit:share_read",
});

/**
 * Share Password Verification Rate Limiter:
 * Maximum 5 attempts per 15 minutes per IP/slug.
 */
export const passwordVerifyRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  analytics: false,
  prefix: "gphost:ratelimit:share_password",
});

/**
 * Download Claim Rate Limiter:
 * Maximum 10 claims per 1 minute per IP.
 */
export const downloadClaimRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  analytics: false,
  prefix: "gphost:ratelimit:download_claim",
});

/**
 * User Profile Update Rate Limiter:
 * 30 updates per 1 minute per user/IP.
 */
export const profileUpdateRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 m"),
  analytics: false,
  prefix: "gphost:ratelimit:profile_update",
});

/**
 * Admin Operational Rate Limiter:
 * 60 operations per 1 minute per admin.
 */
export const adminOpRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  analytics: false,
  prefix: "gphost:ratelimit:admin_op",
});

/**
 * Onboarding Status Check Rate Limiter:
 * 30 checks per 1 minute per user/IP.
 */
export const onboardingStatusRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 m"),
  analytics: false,
  prefix: "gphost:ratelimit:onboarding_status",
});


