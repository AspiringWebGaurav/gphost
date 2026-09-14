import { requireAdminUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis/client";
import { XurlMonitor, XurlMappingItem } from "@/components/admin/xurl-monitor";
import { Globe } from "lucide-react";

export const dynamic = "force-dynamic";

interface RawXurlMappingRecord {
  id: string;
  share_link_id: string;
  status: string;
  short_url: string | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export default async function AdminXurlPage() {
  await requireAdminUser();
  const adminClient = createAdminClient();

  // Fetch circuit breaker flags from Redis and mappings from Supabase
  const [cooldownBreaker, ratelimitBreaker, mappingsRes, monthlyCountRes] =
    await Promise.all([
      redis.get("circuit:xurl:cooldown"),
      redis.get("circuit:xurl:ratelimit"),
      adminClient
        .from("xurl_mappings")
        .select("id, share_link_id, status, short_url, attempts, last_error, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(50),
      adminClient
        .from("xurl_mappings")
        .select("id", { count: "exact", head: true }),
    ]);

  const initialMappings: XurlMappingItem[] = (
    (mappingsRes.data as unknown as RawXurlMappingRecord[]) || []
  ).map((m: RawXurlMappingRecord) => ({
    id: m.id,
    share_link_id: m.share_link_id,
    status: m.status as "pending" | "active" | "failed",
    short_url: m.short_url,
    attempts: Number(m.attempts),
    last_error: m.last_error,
    created_at: m.created_at,
    updated_at: m.updated_at,
  }));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-purple-400 text-xs font-semibold uppercase tracking-wider mb-1">
          <Globe className="w-3.5 h-3.5" />
          <span>Integration Monitor</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          XURL Shortlink Monitor
        </h1>
        <p className="text-xs text-neutral-400 mt-1">
          Inspect circuit breaker statuses, monthly quotas, and retry failed shortlink requests with strict non-blocking guarantees.
        </p>
      </div>

      <XurlMonitor
        initialMappings={initialMappings}
        isCooldown={Boolean(cooldownBreaker)}
        isRatelimited={Boolean(ratelimitBreaker)}
        totalMonthlyCount={monthlyCountRes.count || 0}
      />
    </div>
  );
}
