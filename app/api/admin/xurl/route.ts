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

    const adminClient = createAdminClient();

    const [isQuotaCooldown, isRateLimited, mappingsRes, countRes] = await Promise.all([
      redis.get("circuit:xurl:cooldown"),
      redis.get("circuit:xurl:ratelimit"),
      adminClient
        .from("xurl_mappings")
        .select("id, share_link_id, xurl_id, xurl_short_url, target_url, status, retry_count, last_error, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(50),
      adminClient.from("xurl_mappings").select("status", { count: "exact" }),
    ]);

    const mappings = mappingsRes.data || [];
    let activeCount = 0;
    let pendingCount = 0;
    let failedCount = 0;

    for (const m of mappings) {
      if (m.status === "active") activeCount++;
      else if (m.status === "pending") pendingCount++;
      else if (m.status === "failed") failedCount++;
    }

    return NextResponse.json({
      success: true,
      circuitBreaker: {
        isQuotaCooldown: Boolean(isQuotaCooldown),
        isRateLimited: Boolean(isRateLimited),
      },
      stats: {
        totalMappings: countRes.count || 0,
        sampleActive: activeCount,
        samplePending: pendingCount,
        sampleFailed: failedCount,
      },
      recentMappings: mappings,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ success: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (errorMsg.includes("FORBIDDEN")) {
      return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
    }
    console.error("[Admin XURL API] Error:", errorMsg);
    return NextResponse.json({ success: false, error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
