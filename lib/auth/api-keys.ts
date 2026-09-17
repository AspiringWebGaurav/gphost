import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile, UserProfile } from "@/lib/auth/session";
import { redis } from "@/lib/redis/client";

export interface ApiKeyItem {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

/**
 * Generates a high-entropy cryptographically secure API key.
 * Format: gp_live_[48 hex chars].
 * The full secret is returned ONCE to the user and is never stored in plaintext.
 */
export async function createApiKey(
  userId: string,
  name: string
): Promise<{ keyItem: ApiKeyItem; rawKey: string }> {
  const secretBytes = crypto.randomBytes(24).toString("hex");
  const rawKey = `gp_live_${secretBytes}`;
  const keyPrefix = `${rawKey.slice(0, 14)}...`;
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("user_api_keys")
    .insert({
      user_id: userId,
      name: name.trim() || "Default API Key",
      key_prefix: keyPrefix,
      key_hash: keyHash,
      is_active: true,
    })
    .select("id, name, key_prefix, created_at, last_used_at, is_active")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create API key");
  }

  return {
    keyItem: data as ApiKeyItem,
    rawKey,
  };
}

/**
 * Authoritatively validates an incoming API key.
 * Uses Upstash Redis caching (<1ms) to eliminate redundant database queries on repeated CLI calls.
 */
export async function validateApiKey(rawKey: string): Promise<{
  userId: string;
  profile: UserProfile;
  keyId: string;
} | null> {
  if (!rawKey || !rawKey.startsWith("gp_live_") || rawKey.length < 24) {
    return null;
  }

  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const redisKey = `apikey:${keyHash}`;

  // 1. Check Redis cache
  if (redis) {
    try {
      const cached = await redis.get<{ userId: string; profile: UserProfile; keyId: string }>(redisKey);
      if (cached && cached.userId && cached.profile?.status === "approved") {
        return cached;
      }
    } catch {
      // Graceful cache fallback
    }
  }

  // 2. Authoritative database lookup
  const adminClient = createAdminClient();
  const { data: keyRecord, error } = await adminClient
    .from("user_api_keys")
    .select("id, user_id, is_active")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .single();

  if (error || !keyRecord || !keyRecord.is_active) {
    return null;
  }

  const profile = await getUserProfile(keyRecord.user_id);
  if (!profile || profile.status !== "approved") {
    return null;
  }

  // Non-blocking update of last_used_at
  void adminClient
    .from("user_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRecord.id);

  const result = {
    userId: keyRecord.user_id,
    profile,
    keyId: keyRecord.id,
  };

  // Cache in Redis for 60 seconds
  if (redis) {
    try {
      await redis.set(redisKey, result, { ex: 60 });
    } catch {}
  }

  return result;
}

/**
 * Revokes an API key and evicts any Redis cache entries.
 */
export async function revokeApiKey(userId: string, keyId: string): Promise<boolean> {
  const adminClient = createAdminClient();

  const { data: existing } = await adminClient
    .from("user_api_keys")
    .select("key_hash")
    .eq("id", keyId)
    .eq("user_id", userId)
    .single();

  const { error } = await adminClient
    .from("user_api_keys")
    .update({ is_active: false })
    .eq("id", keyId)
    .eq("user_id", userId);

  if (error) {
    return false;
  }

  if (existing?.key_hash) {
    if (redis) {
      try {
        await redis.del(`apikey:${existing.key_hash}`);
      } catch {}
    }
  }

  return true;
}
