import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis/client";
import { adminOpRatelimit } from "@/lib/redis/ratelimit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { user } = await requireAdminUser();

    // Rate Limit
    const { success: allowed } = await adminOpRatelimit.limit(user.id);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "RATE_LIMITED", message: "Admin rate limit exceeded." },
        { status: 429 }
      );
    }

    // Check Redis cache first (15-second TTL to withstand bursts & rapid tab switching)
    const CACHE_KEY = "admin:dashboard:stats";
    try {
      const cached = await redis.get<Record<string, unknown>>(CACHE_KEY);
      if (cached) {
        return NextResponse.json({
          success: true,
          stats: cached,
          cached: true,
        });
      }
    } catch {}

    const adminClient = createAdminClient();

    // Parallel aggregate queries
    const [
      profilesRes,
      filesRes,
      requestsRes,
      pinsRes,
      downloadsRes,
      sharesRes,
      cooldownBreaker,
      ratelimitBreaker,
    ] = await Promise.all([
      adminClient.from("profiles").select("status, role, quota_bytes, storage_used_bytes, reserved_bytes"),
      adminClient.from("files").select("status, byte_size"),
      adminClient.from("access_requests").select("status"),
      adminClient.from("onboarding_pins").select("is_active"),
      adminClient.from("file_downloads").select("id", { count: "exact", head: true }),
      adminClient.from("share_links").select("id", { count: "exact", head: true }).eq("is_active", true),
      redis.get("circuit:xurl:cooldown"),
      redis.get("circuit:xurl:ratelimit"),
    ]);

    // Aggregate users
    const profiles = profilesRes.data || [];
    const totalUsers = profiles.length;
    let approvedUsers = 0;
    let pendingUsers = 0;
    let rejectedUsers = 0;
    let revokedUsers = 0;
    let totalStorageUsed = 0;
    let totalReservedBytes = 0;

    for (const p of profiles) {
      if (p.status === "approved") approvedUsers++;
      else if (p.status === "pending") pendingUsers++;
      else if (p.status === "rejected") rejectedUsers++;
      else if (p.status === "revoked") revokedUsers++;

      totalStorageUsed += Number(p.storage_used_bytes || 0);
      totalReservedBytes += Number(p.reserved_bytes || 0);
    }

    // Aggregate files
    const files = filesRes.data || [];
    let activeFiles = 0;
    let uploadingFiles = 0;
    let expiringFiles = 0;
    let expiredFiles = 0;
    let deletePendingFiles = 0;

    for (const f of files) {
      if (f.status === "ACTIVE") activeFiles++;
      else if (f.status === "UPLOADING") uploadingFiles++;
      else if (f.status === "EXPIRING") expiringFiles++;
      else if (f.status === "EXPIRED") expiredFiles++;
      else if (f.status === "DELETE_PENDING") deletePendingFiles++;
    }

    // Aggregate requests
    const requests = requestsRes.data || [];
    const pendingRequests = requests.filter((r) => r.status === "pending").length;

    // Aggregate PINs
    const pins = pinsRes.data || [];
    const activePins = pins.filter((p) => p.is_active).length;

    const stats = {
      users: {
        total: totalUsers,
        approved: approvedUsers,
        pending: pendingUsers,
        rejected: rejectedUsers,
        revoked: revokedUsers,
      },
      storage: {
        totalCommittedBytes: totalStorageUsed,
        totalReservedBytes: totalReservedBytes,
      },
      files: {
        total: files.length,
        active: activeFiles,
        uploading: uploadingFiles,
        expiring: expiringFiles,
        expired: expiredFiles,
        deletePending: deletePendingFiles,
      },
      shares: {
        activeCount: sharesRes.count || 0,
      },
      downloads: {
        totalClaims: downloadsRes.count || 0,
      },
      onboarding: {
        pendingRequests,
        activePins,
      },
      xurl: {
        isQuotaCooldown: Boolean(cooldownBreaker),
        isRateLimited: Boolean(ratelimitBreaker),
      },
    };

    // Cache in Redis for 15 seconds
    try {
      await redis.set(CACHE_KEY, stats, { ex: 15 });
    } catch {}

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ success: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (errorMsg.includes("FORBIDDEN")) {
      return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
    }
    console.error("[Admin Stats API] Error:", errorMsg);
    return NextResponse.json({ success: false, error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
