import { Redis } from "@upstash/redis";

/**
 * Upstash Redis REST client instance for ephemeral security state.
 * Redis is strictly for rate limiting, brute-force defense, and replay caching.
 * PostgreSQL is the sole permanent source of truth.
 */
const redisUrl = (process.env.UPSTASH_REDIS_REST_URL || "").replace(/^["']|["']$/g, "");
const redisToken = (process.env.UPSTASH_REDIS_REST_TOKEN || "").replace(/^["']|["']$/g, "");

export const redis = new Redis({
  url: redisUrl,
  token: redisToken,
});