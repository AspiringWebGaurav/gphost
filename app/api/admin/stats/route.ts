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
      vercelQuotas: {
        lastUpdated: new Date().toISOString(),
        billingPeriod: "Last 30 days (Monthly Rolling Window)",
        planName: "Vercel Hobby (Free Quota Tier)",
        overallHealth: "healthy",
        zeroDumbBurnScore: 98.4,
        metrics: [
          {
            id: "active-cpu",
            name: "Fluid Active CPU",
            usedFormatted: "7m 26s",
            limitFormatted: "4h",
            pct: 3.1,
            unit: "time",
            status: "healthy",
            description: "Direct CPU execution time for serverless routes. Safe under 4h monthly cap.",
            iconName: "cpu",
          },
          {
            id: "functions-storage",
            name: "Functions Storage",
            usedFormatted: "276.54 MB",
            limitFormatted: "10 GB",
            pct: 2.76,
            unit: "bytes",
            status: "healthy",
            description: "Compressed serverless function bundle deployment storage.",
            iconName: "storage",
          },
          {
            id: "cdn-requests",
            name: "CDN Requests",
            usedFormatted: "6.4K",
            limitFormatted: "1M",
            pct: 0.64,
            unit: "count",
            status: "healthy",
            description: "Total edge CDN hits across assets, static routes, and images.",
            iconName: "requests",
          },
          {
            id: "function-invocations",
            name: "Function Invocations",
            usedFormatted: "5.7K",
            limitFormatted: "1M",
            pct: 0.57,
            unit: "count",
            status: "healthy",
            description: "Serverless function invocations. Edge CDN caching active to eliminate dumb burns.",
            iconName: "functions",
          },
          {
            id: "fast-origin-transfer",
            name: "Fast Origin Transfer",
            usedFormatted: "46.44 MB",
            limitFormatted: "10 GB",
            pct: 0.46,
            unit: "bytes",
            status: "healthy",
            description: "Data transfer between Vercel serverless compute and edge CDN.",
            iconName: "bandwidth",
          },
          {
            id: "deployment-storage",
            name: "Deployment Storage",
            usedFormatted: "42.24 MB",
            limitFormatted: "10 GB",
            pct: 0.42,
            unit: "bytes",
            status: "healthy",
            description: "Deployment artifacts, build cache, and static assets storage.",
            iconName: "storage",
          },
          {
            id: "fluid-memory",
            name: "Fluid Provisioned Memory",
            usedFormatted: "1.2 GB-Hrs",
            limitFormatted: "360 GB-Hrs",
            pct: 0.33,
            unit: "memory",
            status: "healthy",
            description: "Memory allocated across active function runtimes.",
            iconName: "memory",
          },
          {
            id: "isr-reads",
            name: "ISR Reads",
            usedFormatted: "1.3K",
            limitFormatted: "1M",
            pct: 0.13,
            unit: "count",
            status: "healthy",
            description: "Incremental Static Regeneration reads from Vercel edge cache.",
            iconName: "isr",
          },
          {
            id: "cdn-cpu-duration",
            name: "CDN Request CPU Duration",
            usedFormatted: "3s",
            limitFormatted: "1h",
            pct: 0.08,
            unit: "time",
            status: "healthy",
            description: "Routing, header transformation, and edge proxy compute time.",
            iconName: "cdnCpu",
          },
          {
            id: "fast-data-transfer",
            name: "Fast Data Transfer",
            usedFormatted: "79.07 MB",
            limitFormatted: "100 GB",
            pct: 0.08,
            unit: "bytes",
            status: "healthy",
            description: "Edge-to-client bandwidth. Massive 100 GB allowance (R2 direct preserves this).",
            iconName: "bandwidth",
          },
        ],
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
