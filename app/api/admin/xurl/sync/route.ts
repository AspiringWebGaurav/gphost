import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis/client";
import { shortenUrl } from "@/lib/xurl/client";
import { updateXurlMapping } from "@/lib/xurl/mapping";
import { adminOpRatelimit } from "@/lib/redis/ratelimit";
import { getClientIp, hashClientIp } from "@/lib/security/ip";

export const dynamic = "force-dynamic";

const syncQuerySchema = z
  .object({
    retryShareLinkId: z.string().uuid().optional(),
    resetCircuitBreaker: z.boolean().optional(),
  })
  .strict();

/**
 * Admin XURL Sync & Inspection Endpoint.
 * Strict authorization: requires admin role in Supabase profiles.
 * Preserves all locked Phase 5 XURL retry, timing, circuit breaker, and non-retry semantics.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, profile } = await requireAdminUser();

    // Rate Limit
    const { success: allowed } = await adminOpRatelimit.limit(user.id);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "RATE_LIMITED", message: "Admin rate limit exceeded." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parseResult = syncQuerySchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: "INVALID_REQUEST", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { retryShareLinkId, resetCircuitBreaker } = parseResult.data;
    const adminClient = createAdminClient();
    const clientIp = getClientIp(req.headers);
    const ipHash = hashClientIp(clientIp);

    // 1. Reset circuit breaker if requested
    if (resetCircuitBreaker) {
      await redis.del("circuit:xurl:cooldown");
      await redis.del("circuit:xurl:ratelimit");
    }

    // 2. Retry specific share link if requested
    let retryResult = null;
    if (retryShareLinkId) {
      const { data: mapping, error: mappingError } = await adminClient
        .from("xurl_mappings")
        .select("*")
        .eq("share_link_id", retryShareLinkId)
        .single();

      if (mappingError || !mapping) {
        return NextResponse.json(
          { success: false, error: "MAPPING_NOT_FOUND", message: "Mapping not found for share link" },
          { status: 404 }
        );
      }

      // Check allowed mapping states: only failed or stale pending (> 60s)
      const isStalePending =
        mapping.status === "pending" &&
        Date.now() - new Date(mapping.created_at).getTime() > 60000;
      const isFailed = mapping.status === "failed";

      if (!isFailed && !isStalePending) {
        return NextResponse.json(
          {
            success: false,
            error: "INVALID_MAPPING_STATE",
            message: `Cannot retry mapping in status '${mapping.status}'. Only failed or stale pending mappings may be retried.`,
          },
          { status: 400 }
        );
      }

      // Permanent error protection: Do not retry if last_error indicated permanent client error (400, 401, 403, 409)
      const lastErr = mapping.last_error || "";
      if (
        lastErr.includes("400") ||
        lastErr.includes("401") ||
        lastErr.includes("403") ||
        lastErr.includes("409")
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "PERMANENT_ERROR_NON_RETRYABLE",
            message: `Cannot retry mapping with permanent error (${lastErr}). Verify API credentials or quota configuration.`,
          },
          { status: 400 }
        );
      }

      // Execute Phase 5 resilient shortenUrl (Attempt 1: immediate, Attempt 2: ~1s + jitter, Attempt 3: ~2s + jitter)
      const shortenRes = await shortenUrl(mapping.target_url);
      const updated = await updateXurlMapping(retryShareLinkId, {
        status: shortenRes.status,
        xurlId: shortenRes.xurlId,
        xurlShortUrl: shortenRes.shortUrl,
        lastError: shortenRes.error,
        retryCount: (mapping.retry_count || 0) + (shortenRes.attempts || 1),
      });

      retryResult = {
        success: shortenRes.success,
        status: shortenRes.status,
        shortUrl: shortenRes.shortUrl,
        error: shortenRes.error,
        mapping: updated,
      };
    }

    // 3. Inspect Redis circuit breakers
    const isQuotaCooldown = Boolean(await redis.get("circuit:xurl:cooldown"));
    const isRateLimited = Boolean(await redis.get("circuit:xurl:ratelimit"));

    // 4. Query recent XURL mappings
    const { data: recentMappings, error: listError } = await adminClient
      .from("xurl_mappings")
      .select("id, share_link_id, xurl_id, xurl_short_url, target_url, status, retry_count, last_error, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(25);

    if (listError) {
      console.error("[XURL Admin] Error fetching recent mappings:", listError);
    }

    // 5. Record audit log
    await adminClient.from("audit_logs").insert({
      actor_id: user.id,
      event_type: "ADMIN_XURL_SYNC",
      resource_type: "xurl_mapping",
      resource_id: retryShareLinkId || null,
      metadata: {
        resetCircuitBreaker: Boolean(resetCircuitBreaker),
        retryShareLinkId: retryShareLinkId || null,
        retrySuccess: retryResult?.success ?? null,
      },
      ip_hash: ipHash,
    });

    return NextResponse.json({
      success: true,
      admin: {
        id: user.id,
        email: profile.email,
      },
      circuitBreaker: {
        isQuotaCooldown,
        isRateLimited,
      },
      retryResult,
      recentMappings: recentMappings || [],
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ success: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (errorMsg.includes("FORBIDDEN")) {
      return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
    }
    console.error("[XURL Admin] Unhandled error:", err);
    return NextResponse.json({ success: false, error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
