import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis/client";
import {
  Users,
  HardDrive,
  FileBox,
  UserCheck,
  KeyRound,
  Globe,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default async function AdminOverviewPage() {
  await requireAdminUser();
  const adminClient = createAdminClient();

  // Fetch aggregates
  const [
    profilesRes,
    filesRes,
    requestsRes,
    pinsRes,
    cooldownBreaker,
    ratelimitBreaker,
  ] = await Promise.all([
    adminClient.from("profiles").select("status, storage_used_bytes, reserved_bytes"),
    adminClient.from("files").select("status, byte_size"),
    adminClient.from("access_requests").select("status"),
    adminClient.from("onboarding_pins").select("is_active"),
    redis.get("circuit:xurl:cooldown"),
    redis.get("circuit:xurl:ratelimit"),
  ]);

  const profiles = profilesRes.data || [];
  let approvedCount = 0;
  let pendingUsersCount = 0;
  let totalStorageUsed = 0;
  let totalReservedBytes = 0;

  for (const p of profiles) {
    if (p.status === "approved") approvedCount++;
    else if (p.status === "pending") pendingUsersCount++;
    totalStorageUsed += Number(p.storage_used_bytes || 0);
    totalReservedBytes += Number(p.reserved_bytes || 0);
  }

  const files = filesRes.data || [];
  let activeFilesCount = 0;
  for (const f of files) {
    if (f.status === "ACTIVE") activeFilesCount++;
  }

  const requests = requestsRes.data || [];
  const pendingRequests = requests.filter((r) => r.status === "pending").length;

  const pins = pinsRes.data || [];
  const activePins = pins.filter((p) => p.is_active).length;

  const isQuotaCooldown = Boolean(cooldownBreaker);
  const isRateLimited = Boolean(ratelimitBreaker);

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Overview Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 text-xs font-medium mb-3">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Platform Administration &amp; Oversight</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2">
          Control Center Overview
        </h1>
        <p className="text-sm text-neutral-400 max-w-2xl leading-relaxed">
          Authoritative oversight of registered users, storage allocations, access request pipeline, and third-party integrations.
        </p>
      </div>

      {/* Pending Access Requests Banner */}
      {pendingRequests > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center flex-shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                {pendingRequests} Onboarding {pendingRequests === 1 ? "Request" : "Requests"} Pending Review
              </div>
              <div className="text-xs text-amber-300/80">
                New users waiting for account approval or rejection.
              </div>
            </div>
          </div>
          <Link
            href="/admin/requests"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-semibold transition shadow-md shadow-amber-500/20 self-start sm:self-auto"
          >
            <span>Review Queue</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Metric 1: Users */}
        <div className="p-5 rounded-2xl bg-neutral-900/60 border border-neutral-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400 mb-3">
            <span className="text-xs font-medium">Registered Users</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{profiles.length}</div>
            <div className="text-xs text-neutral-500 mt-1">
              <span className="text-emerald-400 font-medium">{approvedCount} approved</span>
              {pendingUsersCount > 0 && ` &bull; ${pendingUsersCount} pending`}
            </div>
          </div>
        </div>

        {/* Metric 2: Storage */}
        <div className="p-5 rounded-2xl bg-neutral-900/60 border border-neutral-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400 mb-3">
            <span className="text-xs font-medium">Committed Storage</span>
            <HardDrive className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{formatBytes(totalStorageUsed)}</div>
            <div className="text-xs text-neutral-500 mt-1 font-mono">
              {totalReservedBytes > 0
                ? `+ ${formatBytes(totalReservedBytes)} reserved`
                : "Zero in-flight reservations"}
            </div>
          </div>
        </div>

        {/* Metric 3: Active Files */}
        <div className="p-5 rounded-2xl bg-neutral-900/60 border border-neutral-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400 mb-3">
            <span className="text-xs font-medium">Active File Objects</span>
            <FileBox className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{activeFilesCount}</div>
            <div className="text-xs text-neutral-500 mt-1">
              {files.length} total historical files
            </div>
          </div>
        </div>

        {/* Metric 4: Active PINs */}
        <div className="p-5 rounded-2xl bg-neutral-900/60 border border-neutral-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400 mb-3">
            <span className="text-xs font-medium">Fast-Track PINs</span>
            <KeyRound className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{activePins}</div>
            <div className="text-xs text-neutral-500 mt-1">
              {pins.length} total created PINs
            </div>
          </div>
        </div>
      </div>

      {/* Integration & Health Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* XURL Status Card */}
        <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              <span>XURL Integration Health</span>
            </h3>
            <Link
              href="/admin/xurl"
              className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1"
            >
              <span>Inspect</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800">
              <div className="text-neutral-500 mb-0.5">24h Quota Circuit Breaker</div>
              <div className="font-semibold text-white flex items-center gap-1.5">
                {isQuotaCooldown ? (
                  <span className="text-rose-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Tripped (403)
                  </span>
                ) : (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Healthy
                  </span>
                )}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800">
              <div className="text-neutral-500 mb-0.5">60s Rate Limit Breaker</div>
              <div className="font-semibold text-white flex items-center gap-1.5">
                {isRateLimited ? (
                  <span className="text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Throttled (429)
                  </span>
                ) : (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Normal
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Operations Links */}
        <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-3">
          <h3 className="text-base font-semibold text-white">Administrative Actions</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Link
              href="/admin/users"
              className="p-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white transition flex items-center justify-between"
            >
              <span>Manage Quotas</span>
              <ArrowRight className="w-3.5 h-3.5 text-neutral-500" />
            </Link>
            <Link
              href="/admin/pins"
              className="p-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white transition flex items-center justify-between"
            >
              <span>Create PIN</span>
              <ArrowRight className="w-3.5 h-3.5 text-neutral-500" />
            </Link>
            <Link
              href="/admin/files"
              className="p-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white transition flex items-center justify-between"
            >
              <span>Global File Audit</span>
              <ArrowRight className="w-3.5 h-3.5 text-neutral-500" />
            </Link>
            <Link
              href="/admin/activity"
              className="p-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white transition flex items-center justify-between"
            >
              <span>View Audit Logs</span>
              <ArrowRight className="w-3.5 h-3.5 text-neutral-500" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
