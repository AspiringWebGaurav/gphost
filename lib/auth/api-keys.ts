import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile, requireApprovedUser, UserProfile } from "@/lib/auth/session";
import { redis } from "@/lib/redis/client";

export const API_PERMISSIONS = [
  "files:read",
  "files:upload",
  "files:replace",
  "files:delete",
  "files:manage",
  "storage:read",
  "*",
] as const;

export type ApiPermission = typeof API_PERMISSIONS[number];

export interface ApiKeyItem {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
  permissions?: string[];
}

export interface ValidatedAuthContext {
  userId: string;
  profile: UserProfile;
  keyId?: string;
  permissions: string[];
  authType: "api_key" | "session";
}

/**
 * Checks if a granted permission list satisfies a required permission.
 * Wildcard "*" satisfies all permissions.
 */
export function hasPermission(granted: string[] | undefined | null, required: ApiPermission): boolean {
  if (!granted || granted.length === 0) return true; // Default to full owner access
  if (granted.includes("*")) return true;
  return granted.includes(required);
}

/**
 * Generates a high-entropy cryptographically secure API key.
 * Format: gp_live_[48 hex chars].
 * The full secret is returned ONCE to the user and is never stored in plaintext.
 */
export async function createApiKey(
  userId: string,
  name: string,
  permissions: string[] = ["*"]
): Promise<{ keyItem: ApiKeyItem; rawKey: string }> {
  const secretBytes = crypto.randomBytes(24).toString("hex");
  const rawKey = `gp_live_${secretBytes}`;
  const keyPrefix = `${rawKey.slice(0, 14)}...`;
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  const adminClient = createAdminClient();

  const insertPayload = {
    user_id: userId,
    name: name.trim() || "Default API Key",
    key_prefix: keyPrefix,
    key_hash: keyHash,
    is_active: true,
    permissions,
  };

  const primaryRes = await adminClient
    .from("user_api_keys")
    .insert(insertPayload)
    .select("id, name, key_prefix, created_at, last_used_at, is_active, permissions")
    .single();

  let resData = primaryRes.data as ApiKeyItem | null;
  let resError = primaryRes.error;

  // Graceful fallback if database column 'permissions' hasn't been added by migration yet
  if (resError && (resError.code === "42703" || resError.message?.includes("permissions"))) {
    const fallbackPayload = {
      user_id: userId,
      name: name.trim() || "Default API Key",
      key_prefix: keyPrefix,
      key_hash: keyHash,
      is_active: true,
    };
    const fallbackRes = await adminClient
      .from("user_api_keys")
      .insert(fallbackPayload)
      .select("id, name, key_prefix, created_at, last_used_at, is_active")
      .single();
    resData = fallbackRes.data as ApiKeyItem | null;
    resError = fallbackRes.error;
  }

  if (resError || !resData) {
    throw new Error(resError?.message || "Failed to create API key");
  }

  const item = resData;
  if (!item.permissions) {
    item.permissions = permissions;
  }

  return {
    keyItem: item,
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
  permissions: string[];
} | null> {
  if (!rawKey || !rawKey.startsWith("gp_live_") || rawKey.length < 24) {
    return null;
  }

  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const redisKey = `apikey:${keyHash}`;

  // 1. Check Redis cache
  if (redis) {
    try {
      const cached = await redis.get<{
        userId: string;
        profile: UserProfile;
        keyId: string;
        permissions?: string[];
      }>(redisKey);
      if (cached && cached.userId && cached.profile?.status === "approved") {
        return {
          ...cached,
          permissions: Array.isArray(cached.permissions) && cached.permissions.length > 0 ? cached.permissions : ["*"],
        };
      }
    } catch {
      // Graceful cache fallback
    }
  }

  // 2. Authoritative database lookup with schema fallback
  const adminClient = createAdminClient();

  interface KeyRecordWithPerms {
    id: string;
    user_id: string;
    is_active: boolean;
    permissions?: string[];
  }

  let keyRecord: KeyRecordWithPerms | null = null;

  const primaryRes = await adminClient
    .from("user_api_keys")
    .select("id, user_id, is_active, permissions")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .single();

  if (!primaryRes.error && primaryRes.data) {
    keyRecord = primaryRes.data as KeyRecordWithPerms;
  } else if (
    primaryRes.error &&
    (primaryRes.error.code === "42703" || primaryRes.error.message?.includes("permissions"))
  ) {
    // Schema fallback if 'permissions' column not yet applied
    const fallbackRes = await adminClient
      .from("user_api_keys")
      .select("id, user_id, is_active")
      .eq("key_hash", keyHash)
      .eq("is_active", true)
      .single();

    if (!fallbackRes.error && fallbackRes.data) {
      keyRecord = { ...fallbackRes.data, permissions: ["*"] } as KeyRecordWithPerms;
    }
  }

  if (!keyRecord || !keyRecord.is_active) {
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

  const permissions = Array.isArray(keyRecord.permissions) && keyRecord.permissions.length > 0
    ? keyRecord.permissions
    : ["*"];

  const result = {
    userId: keyRecord.user_id,
    profile,
    keyId: keyRecord.id,
    permissions,
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
 * Authoritative Unified Authentication Middleware Guard.
 * Accepts EITHER:
 * 1. Bearer API Key: 'Authorization: Bearer gp_live_...'
 * 2. Supabase Auth Session Cookie / Bearer JWT (Browser dashboard)
 *
 * Verifies account approval, tenant ownership, and granular API permissions.
 */
export async function authenticateRequest(
  req: NextRequest,
  requiredPermission?: ApiPermission
): Promise<{ auth: ValidatedAuthContext } | { errorResponse: NextResponse }> {
  const authHeader = req.headers.get("authorization") || req.headers.get("x-api-key") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  // Dual-channel Step 1: Check for developer API key (gp_live_...)
  if (token.startsWith("gp_live_")) {
    const keyAuth = await validateApiKey(token);
    if (!keyAuth) {
      return {
        errorResponse: NextResponse.json(
          {
            error: "Unauthorized: Invalid or revoked API key",
            hint: "Verify your API key in Dashboard -> Settings -> API Keys.",
          },
          { status: 401 }
        ),
      };
    }

    if (requiredPermission && !hasPermission(keyAuth.permissions, requiredPermission)) {
      return {
        errorResponse: NextResponse.json(
          {
            error: "Forbidden: API key lacks required permission",
            requiredPermission,
            grantedPermissions: keyAuth.permissions,
          },
          { status: 403 }
        ),
      };
    }

    return {
      auth: {
        userId: keyAuth.userId,
        profile: keyAuth.profile,
        keyId: keyAuth.keyId,
        permissions: keyAuth.permissions,
        authType: "api_key",
      },
    };
  }

  // Dual-channel Step 2: Fall back to browser session cookies or Supabase Auth JWT
  try {
    const { user, profile } = await requireApprovedUser();
    return {
      auth: {
        userId: user.id,
        profile,
        permissions: ["*"], // Authenticated web dashboard sessions have full owner access
        authType: "session",
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "UNAUTHENTICATED";
    if (errorMsg === "UNAUTHENTICATED") {
      return {
        errorResponse: NextResponse.json(
          {
            error: "Authentication required",
            hint: "Provide an API key (Authorization: Bearer gp_live_...) or active dashboard session.",
          },
          { status: 401 }
        ),
      };
    }
    if (errorMsg.startsWith("ACCESS_DENIED")) {
      return {
        errorResponse: NextResponse.json(
          {
            error: "Access denied: Account status is pending or not approved",
          },
          { status: 403 }
        ),
      };
    }
    return {
      errorResponse: NextResponse.json(
        { error: "Authentication failed" },
        { status: 401 }
      ),
    };
  }
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

/**
 * Rotates an API key: Revokes the old key and generates a new raw key with the same name and permissions.
 */
export async function rotateApiKey(
  userId: string,
  keyId: string
): Promise<{ keyItem: ApiKeyItem; rawKey: string }> {
  const adminClient = createAdminClient();

  const { data: existing, error: fetchErr } = await adminClient
    .from("user_api_keys")
    .select("name, key_hash, permissions")
    .eq("id", keyId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  if (fetchErr || !existing) {
    throw new Error("Active API key not found to rotate");
  }

  // Revoke old key
  await revokeApiKey(userId, keyId);

  const permissions = Array.isArray(existing.permissions) ? existing.permissions : ["*"];

  // Create new key with same name & permissions
  return createApiKey(userId, existing.name, permissions);
}

/**
 * Emergency revokes all active API keys for a user and purges all Redis caches.
 */
export async function revokeAllApiKeys(userId: string): Promise<{ success: boolean; count: number }> {
  const adminClient = createAdminClient();

  const { data: activeKeys } = await adminClient
    .from("user_api_keys")
    .select("id, key_hash")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (!activeKeys || activeKeys.length === 0) {
    return { success: true, count: 0 };
  }

  const { error } = await adminClient
    .from("user_api_keys")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error) {
    throw new Error(error.message || "Failed to revoke all API keys");
  }

  // Evict all keys from Redis
  if (redis) {
    for (const k of activeKeys) {
      if (k.key_hash) {
        try {
          await redis.del(`apikey:${k.key_hash}`);
        } catch {}
      }
    }
  }

  return { success: true, count: activeKeys.length };
}

/**
 * Authoritatively records that a file was created, replaced, downloaded, or updated via Owner API keys or API endpoints.
 */
export async function markFileApiAccessed(userId: string, fileId: string): Promise<void> {
  try {
    if (redis && userId && fileId) {
      await Promise.all([
        redis.sadd(`api_managed_files:${userId}`, fileId),
        redis.set(`file_api_accessed:${fileId}`, new Date().toISOString(), { ex: 86400 * 365 }),
      ]);
    }
  } catch (err) {
    console.warn("markFileApiAccessed error:", err);
  }
}

/**
 * Retrieves the set of file IDs accessed or managed via the Owner API for an owner account.
 */
export async function getApiManagedFileIds(userId: string): Promise<Set<string>> {
  try {
    if (!redis || !userId) return new Set();
    const members = await redis.smembers(`api_managed_files:${userId}`);
    return new Set(members || []);
  } catch {
    return new Set();
  }
}
