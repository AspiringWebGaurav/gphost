import { Redis } from "@upstash/redis";
import fs from "node:fs";

function getEnv(key: string): string {
  if (typeof process !== "undefined" && process.env && process.env[key]) {
    return process.env[key]!.replace(/^["']|["']$/g, "");
  }
  try {
    if (fs.existsSync(".env.local")) {
      const content = fs.readFileSync(".env.local", "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
          const idx = trimmed.indexOf("=");
          const k = trimmed.slice(0, idx).trim();
          if (k === key) {
            return trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
          }
        }
      }
    }
  } catch {}
  return "";
}

/**
 * Upstash Redis REST client instance for ephemeral security state.
 * Redis is strictly for rate limiting, brute-force defense, and replay caching.
 * PostgreSQL is the sole permanent source of truth.
 */
const redisUrl = getEnv("UPSTASH_REDIS_REST_URL");
const redisToken = getEnv("UPSTASH_REDIS_REST_TOKEN");

export const redis = new Redis({
  url: redisUrl,
  token: redisToken,
});