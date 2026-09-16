import { NextResponse } from "next/server";
import { requireOwnerUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis/client";
import { getR2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { adminOpRatelimit } from "@/lib/redis/ratelimit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { user } = await requireOwnerUser();

    // Rate Limit
    const { success: allowed } = await adminOpRatelimit.limit(user.id);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "RATE_LIMITED", message: "Admin rate limit exceeded." },
        { status: 429 }
      );
    }

    // 1. PostgreSQL Health Check (Ping latency via count query)
    let pgStatus = "unreachable";
    let pgLatencyMs = 0;
    try {
      const adminClient = createAdminClient();
      const start = performance.now();
      const { error } = await adminClient.from("profiles").select("id", { count: "exact", head: true });
      pgLatencyMs = Math.round(performance.now() - start);
      if (!error) {
        pgStatus = "connected";
      }
    } catch {
      pgStatus = "unreachable";
    }

    // 2. Redis Health Check (Ping latency)
    let redisStatus = "unreachable";
    let redisLatencyMs = 0;
    try {
      const start = performance.now();
      const pong = await redis.ping();
      redisLatencyMs = Math.round(performance.now() - start);
      if (pong === "PONG") {
        redisStatus = "connected";
      }
    } catch {
      redisStatus = "unreachable";
    }

    // 3. Cloudflare R2 Health Check
    const r2Configured = Boolean(
      process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      R2_BUCKET_NAME
    );
    let r2Accessible = false;
    if (r2Configured) {
      try {
        const client = getR2Client();
        await client.send(new HeadBucketCommand({ Bucket: R2_BUCKET_NAME }));
        r2Accessible = true;
      } catch {
        r2Accessible = false;
      }
    }


    // 4. Cloudflare Turnstile Health Check
    const turnstileConfigured = Boolean(
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY
    );

    // 5. Switchyy CDN Health Check
    const switchyyConfigured = Boolean(
      process.env.NEXT_PUBLIC_SWITCHYY_PUBLIC_KEY && process.env.NEXT_PUBLIC_SWITCHYY_PROJECT_ID
    );
    let switchyyStatus = "unknown";
    if (switchyyConfigured) {
      try {
        const res = await fetch("https://switchyy.eu.cc/switchy.js", { method: "HEAD", signal: AbortSignal.timeout(6000) });
        switchyyStatus = res.ok ? "connected" : "unreachable";
      } catch {
        switchyyStatus = "unreachable";
      }
    }

    // STRICT SECURITY: Never expose raw environment variables, API keys, tokens, peppers, secrets, or connection strings.
    return NextResponse.json({
      success: true,
      health: {
        database: {
          status: pgStatus,
          latencyMs: pgLatencyMs,
        },
        redis: {
          status: redisStatus,
          latencyMs: redisLatencyMs,
        },
        r2: {
          status: r2Configured ? "configured" : "unconfigured",
          accessible: r2Accessible,
        },
        turnstile: {
          status: turnstileConfigured ? "configured" : "unconfigured",
        },
        switchyy: {
          status: switchyyStatus,
          configured: switchyyConfigured,
        },
      },
      environment: {
        nodeEnv: process.env.NODE_ENV || "development",
        appUrlConfigured: Boolean(process.env.NEXT_PUBLIC_APP_URL),
        ownerEmailConfigured: Boolean(process.env.ADMIN_EMAIL),
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ success: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (errorMsg.includes("FORBIDDEN")) {
      return NextResponse.json(
        { success: false, error: "FORBIDDEN_OWNER_REQUIRED", message: "Owner authority required." },
        { status: 403 }
      );
    }
    console.error("[Admin Settings API] Error:", errorMsg);
    return NextResponse.json({ success: false, error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
