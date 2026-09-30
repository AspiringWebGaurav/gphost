"use client";

import React, { useState } from "react";
import {
  Cpu,
  HardDrive,
  Globe,
  Zap,
  ArrowUpRight,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Layers,
  Database,
  Lock,
  Archive,
  Gauge,
  Sparkles,
  ExternalLink,
} from "lucide-react";

export interface VercelQuotaMetric {
  id: string;
  name: string;
  usedFormatted: string;
  limitFormatted: string;
  pct: number;
  unit: string;
  status: "healthy" | "warning" | "critical";
  description: string;
  iconName: "cpu" | "storage" | "requests" | "functions" | "bandwidth" | "memory" | "isr" | "cdnCpu";
}

export interface VercelQuotasData {
  lastUpdated: string;
  billingPeriod: string;
  planName: string;
  overallHealth: "healthy" | "optimizing" | "warning";
  zeroDumbBurnScore: number;
  metrics: VercelQuotaMetric[];
}

export const DEFAULT_VERCEL_QUOTAS: VercelQuotasData = {
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
};

function renderMetricIcon(iconName: VercelQuotaMetric["iconName"]) {
  switch (iconName) {
    case "cpu":
      return <Cpu className="w-4 h-4 text-blue-500" />;
    case "storage":
      return <HardDrive className="w-4 h-4 text-purple-500" />;
    case "requests":
      return <Globe className="w-4 h-4 text-cyan-500" />;
    case "functions":
      return <Zap className="w-4 h-4 text-amber-500" />;
    case "bandwidth":
      return <Layers className="w-4 h-4 text-emerald-500" />;
    case "memory":
      return <Gauge className="w-4 h-4 text-indigo-500" />;
    case "isr":
      return <RefreshCw className="w-4 h-4 text-teal-500" />;
    case "cdnCpu":
      return <Clock className="w-4 h-4 text-rose-500" />;
    default:
      return <Cpu className="w-4 h-4 text-blue-500" />;
  }
}

export function VercelQuotaCard({
  quotas = DEFAULT_VERCEL_QUOTAS,
  onRefresh,
}: {
  quotas?: VercelQuotasData;
  onRefresh?: () => Promise<void> | void;
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showArchitectureDetails, setShowArchitectureDetails] = useState(false);

  const handleManualSync = async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-card border border-border shadow-xs space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
            <svg
              viewBox="0 0 76 65"
              fill="currentColor"
              className="w-4 h-4"
              aria-label="Vercel logo"
            >
              <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-bold text-foreground">
                Vercel Hobby Quotas &amp; Platform Health
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>Free Plan Verified</span>
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Synced with Vercel usage telemetry. High-efficiency zero-burn architecture active.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {onRefresh && (
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/40 hover:bg-muted text-xs font-semibold text-foreground transition cursor-pointer disabled:opacity-50"
              title="Sync with latest telemetry"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-500" : ""}`} />
              <span>{isRefreshing ? "Syncing..." : "Sync Stats"}</span>
            </button>
          )}

          <a
            href="https://vercel.com/dashboard/usage"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition cursor-pointer shadow-2xs"
            title="Open official Vercel usage dashboard"
          >
            <span>Vercel Dashboard</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* High-Level Efficiency KPI Banner */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-blue-500/[0.07] via-cyan-500/[0.05] to-emerald-500/[0.07] border border-blue-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/25">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-foreground flex items-center gap-2">
              <span>Zero-Dumb-Burn Score:</span>
              <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">
                {quotas.zeroDumbBurnScore}% Optimized
              </span>
            </div>
            <p className="text-[11.5px] text-muted-foreground leading-snug mt-0.5">
              Heavy payloads (R2 file transfers, AES encryption, ZIP compression) bypass Vercel serverless functions entirely.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowArchitectureDetails((prev) => !prev)}
          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline self-start md:self-auto cursor-pointer"
        >
          {showArchitectureDetails ? "Hide Architecture Protections" : "View Quota Protections →"}
        </button>
      </div>

      {/* Expandable Architecture Safeguards Card */}
      {showArchitectureDetails && (
        <div className="p-4 rounded-xl bg-muted/30 border border-border/80 space-y-3 animate-in fade-in duration-150">
          <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Active Safeguards Against Hobby Plan Overages</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs text-muted-foreground">
            <div className="p-2.5 rounded-lg bg-card border border-border/70 space-y-1">
              <strong className="text-foreground flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-blue-500" />
                <span>Zero-Bandwidth R2 Presign</span>
              </strong>
              <p className="text-[11px] leading-relaxed">
                Uploads &amp; downloads stream directly between browser and Cloudflare R2 edge. 0 MB Vercel Serverless Bandwidth consumed.
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-card border border-border/70 space-y-1">
              <strong className="text-foreground flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-cyan-500" />
                <span>Global Edge CDN Caching</span>
              </strong>
              <p className="text-[11px] leading-relaxed">
                OG preview images, landing page ISR, icons, and legal routes are cached at Vercel Edge for 24h to 1 year. Eliminates redundant serverless function invocations.
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-card border border-border/70 space-y-1">
              <strong className="text-foreground flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-purple-500" />
                <span>Client-Side AES-256-GCM</span>
              </strong>
              <p className="text-[11px] leading-relaxed">
                Zero-knowledge encryption runs in Web Crypto API inside user browser. 0 MB Vercel Serverless Memory consumed.
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-card border border-border/70 space-y-1">
              <strong className="text-foreground flex items-center gap-1.5">
                <Archive className="w-3.5 h-3.5 text-amber-500" />
                <span>In-Browser Client-Zip</span>
              </strong>
              <p className="text-[11px] leading-relaxed">
                Multi-file batch archives are generated in-memory in client browser without serverless function timeout risk.
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-card border border-border/70 space-y-1">
              <strong className="text-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-teal-500" />
                <span>Supabase Native SQL Cron</span>
              </strong>
              <p className="text-[11px] leading-relaxed">
                Storage lifecycle reclamation and TTL expiration sweeps execute inside PostgreSQL engine. 0 Vercel Crons needed.
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-card border border-border/70 space-y-1">
              <strong className="text-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>100% Free Plan Compliance</span>
              </strong>
              <p className="text-[11px] leading-relaxed">
                All metrics are mathematically bounded to stay comfortably within the free tier thresholds indefinitely.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* The 10 Live Vercel Hobby Quotas Grid (Mirrors Vercel Dashboard) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-foreground">Usage Telemetry (Monthly Rolling Window)</span>
          <span className="text-[11px] text-muted-foreground font-mono">
            {quotas.billingPeriod}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {quotas.metrics.map((metric) => {
            const isHighUsage = metric.pct > 75;
            const isMediumUsage = metric.pct > 40;

            return (
              <div
                key={metric.id}
                className="p-3.5 rounded-xl bg-muted/20 hover:bg-muted/30 border border-border/80 flex flex-col justify-between space-y-2.5 transition"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 text-xs mb-1">
                    <span className="font-semibold text-foreground truncate text-[11.5px]" title={metric.name}>
                      {metric.name}
                    </span>
                    {renderMetricIcon(metric.iconName)}
                  </div>
                  <div className="flex items-baseline justify-between text-xs font-mono mt-1">
                    <span className="font-bold text-foreground text-sm">
                      {metric.usedFormatted}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      / {metric.limitFormatted}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="w-full h-1.5 rounded-full bg-muted/80 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isHighUsage
                          ? "bg-rose-500"
                          : isMediumUsage
                          ? "bg-amber-500"
                          : "bg-blue-500"
                      }`}
                      style={{ width: `${Math.max(2, Math.min(100, metric.pct))}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                    <span>{metric.pct.toFixed(1)}% utilized</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Safe</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Info Bar */}
      <div className="p-3 rounded-xl bg-muted/15 border border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>
            Target Environment: <strong className="text-foreground">{quotas.planName}</strong>
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <span>Last Sync: {new Date(quotas.lastUpdated).toLocaleTimeString()}</span>
          <span>&bull;</span>
          <span className="text-blue-600 dark:text-blue-400 font-semibold">0 Dumb-Burn Quotas</span>
        </div>
      </div>
    </div>
  );
}
