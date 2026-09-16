import { requireAdminUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis/client";
import { getR2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { PlatformHealth, PlatformHealthData } from "@/components/admin/platform-health";
import { ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

async function checkPlatformHealth(): Promise<PlatformHealthData> {
  // 1. PostgreSQL Health Check
  let pgStatus = "unreachable";
  let pgLatencyMs = 0;
  try {
    const adminClient = createAdminClient();
    const start = performance.now();
    const { error } = await adminClient.from("profiles").select("id", { count: "exact", head: true });
    pgLatencyMs = Math.round(performance.now() - start);
    if (!error) pgStatus = "connected";
  } catch {
    pgStatus = "unreachable";
  }

  // 2. Redis Health Check
  let redisStatus = "unreachable";
  let redisLatencyMs = 0;
  try {
    const start = performance.now();
    const pong = await redis.ping();
    redisLatencyMs = Math.round(performance.now() - start);
    if (pong === "PONG") redisStatus = "connected";
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
      const r2Client = getR2Client();
      await r2Client.send(new HeadBucketCommand({ Bucket: R2_BUCKET_NAME }));
      r2Accessible = true;
    } catch {
      r2Accessible = false;
    }
  }

  // 4. Cloudflare Turnstile
  const turnstileConfigured = Boolean(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY
  );

  // 5. Switchyy CDN
  const switchyyConfigured = Boolean(
    process.env.NEXT_PUBLIC_SWITCHYY_PUBLIC_KEY && process.env.NEXT_PUBLIC_SWITCHYY_PROJECT_ID
  );

  return {
    postgres: { status: pgStatus, latency_ms: pgLatencyMs },
    redis: { status: redisStatus, latency_ms: redisLatencyMs },
    r2: {
      status: r2Configured ? "configured" : "unconfigured",
      accessible: r2Accessible,
    },
    turnstile: {
      status: turnstileConfigured ? "configured" : "unconfigured",
    },
    switchyy: {
      status: switchyyConfigured ? "connected" : "unreachable",
      configured: switchyyConfigured,
    },
  };
}

export default async function AdminSettingsPage() {
  const { user } = await requireAdminUser();
  const ownerEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const isOwner = Boolean(ownerEmail && user.email?.toLowerCase() === ownerEmail);

  const initialHealth = isOwner ? await checkPlatformHealth() : null;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider mb-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Infrastructure Diagnostics</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Platform Health & Telemetry
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Real-time service connectivity and operational latency metrics. Hardened for owner-exclusive inspection with zero secrets exposed.
        </p>
      </div>

      <PlatformHealth
        initialHealth={initialHealth}
        isOwner={isOwner}
        ownerEmail={ownerEmail}
      />
    </div>
  );
}
