import { redis } from "@/lib/redis/client";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Retrieves the maximum active files allowed for a specific user.
 * Returns null if the user has unlimited file uploads.
 *
 * Checks Upstash Redis cache first for sub-millisecond resolution,
 * falling back to PostgreSQL audit log records.
 */
export async function getUserMaxFiles(userId: string): Promise<number | null> {
  if (!userId) return null;

  try {
    const cached = await redis.get<string | number>(`user:max_files:${userId}`);
    if (cached !== null && cached !== undefined) {
      const num = Number(cached);
      return isNaN(num) || num < 0 ? null : num;
    }
  } catch (err) {
    console.warn("[getUserMaxFiles] Redis read error:", err);
  }

  // Fallback: Check audit logs for the user's latest assigned file limit
  try {
    const adminClient = createAdminClient();
    const { data: log } = await adminClient
      .from("audit_logs")
      .select("metadata")
      .or(`resource_id.eq.${userId},actor_id.eq.${userId}`)
      .in("event_type", ["PROFILE_QUOTA_ASSIGNED", "PIN_ONBOARDING_SUCCESS", "ADMIN_USER_LIMIT_UPDATE"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (log?.metadata && typeof log.metadata === "object") {
      const meta = log.metadata as Record<string, unknown>;
      if ("max_files" in meta) {
        const val = Number(meta.max_files);
        const resolved = isNaN(val) || val < 0 ? null : val;
        // Populate cache
        try {
          if (resolved !== null) {
            await redis.set(`user:max_files:${userId}`, resolved);
          } else {
            await redis.set(`user:max_files:${userId}`, -1);
          }
        } catch {}
        return resolved;
      }
    }
  } catch (err) {
    console.warn("[getUserMaxFiles] Database fallback error:", err);
  }

  return null; // Unlimited by default
}

/**
 * Sets the maximum active files allowed for a specific user.
 * Pass null or -1 for unlimited files.
 */
export async function setUserMaxFiles(
  userId: string,
  maxFiles: number | null | undefined,
  adminId?: string
): Promise<void> {
  if (!userId) return;

  const resolved = maxFiles === null || maxFiles === undefined || maxFiles < 0 ? null : Math.floor(maxFiles);

  try {
    if (resolved !== null) {
      await redis.set(`user:max_files:${userId}`, resolved);
    } else {
      await redis.set(`user:max_files:${userId}`, -1);
    }
  } catch (err) {
    console.warn("[setUserMaxFiles] Redis write error:", err);
  }

  // Record audit log for permanent persistence
  try {
    const adminClient = createAdminClient();
    await adminClient.from("audit_logs").insert({
      actor_id: adminId || userId,
      event_type: "ADMIN_USER_LIMIT_UPDATE",
      resource_type: "profile",
      resource_id: userId,
      ip_hash: "system_authoritative",
      metadata: {
        target_user_id: userId,
        max_files: resolved,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[setUserMaxFiles] Audit log insert error:", err);
  }
}
