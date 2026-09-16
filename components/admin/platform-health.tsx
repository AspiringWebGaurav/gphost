"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  Database,
  Layers,
  HardDrive,
  Shield,
  Globe,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Lock,
} from "lucide-react";

export interface PlatformHealthData {
  postgres: { status: string; latency_ms: number };
  redis: { status: string; latency_ms: number };
  r2: { status: string; accessible: boolean };
  turnstile: { status: string };
  switchyy: { status: string; configured: boolean };
}

interface PlatformHealthProps {
  initialHealth: PlatformHealthData | null;
  isOwner: boolean;
  ownerEmail: string;
}

export function PlatformHealth({
  initialHealth,
  isOwner,
  ownerEmail,
}: PlatformHealthProps) {
  const [health, setHealth] = useState<PlatformHealthData | null>(initialHealth);
  const [isLoading, setIsLoading] = useState(false);

  const refreshHealth = async () => {
    if (!isOwner) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/settings");
      if (res.ok) {
        const data = await res.json();
        if (data.health) {
          setHealth(data.health);
        }
      }
    } catch {
      // Ignored
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOwner) {
    return (
      <div className="p-8 bg-card border border-border rounded-2xl text-center space-y-3 shadow-sm max-w-lg mx-auto">
        <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-500">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-foreground">
          Owner-Exclusive Authority Required
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Platform infrastructure diagnostics, health telemetry, and service configurations are restricted exclusively to the platform owner (<span className="text-foreground font-mono">{ownerEmail}</span>).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex items-center justify-between p-4 bg-card border border-border rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-primary shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-foreground">
              Status-Only Hardened Health Diagnostics
            </div>
            <div className="text-[11px] text-muted-foreground">
              Zero secrets, raw connection strings, or keys are exposed across any API or UI layer.
            </div>
          </div>
        </div>

        <button
          onClick={refreshHealth}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium transition border border-border/60 shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* PostgreSQL */}
        <div className="p-4 bg-card border border-border rounded-2xl shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-purple-500" />
              <span className="text-xs font-semibold text-foreground">PostgreSQL (Supabase)</span>
            </div>
            {health?.postgres.status === "connected" ? (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <CheckCircle className="w-3 h-3" />
                ONLINE
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                <AlertCircle className="w-3 h-3" />
                OFFLINE
              </span>
            )}
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Round-Trip Latency:</span>
              <span className="font-mono text-foreground">
                {health?.postgres.latency_ms ?? 0} ms
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Authority Role:</span>
              <span className="text-foreground">Authoritative Store</span>
            </div>
          </div>
        </div>

        {/* Redis */}
        <div className="p-4 bg-card border border-border rounded-2xl shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-red-500" />
              <span className="text-xs font-semibold text-foreground">Redis (Upstash)</span>
            </div>
            {health?.redis.status === "connected" ? (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <CheckCircle className="w-3 h-3" />
                ONLINE
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                <AlertCircle className="w-3 h-3" />
                OFFLINE
              </span>
            )}
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Ping Latency:</span>
              <span className="font-mono text-foreground">
                {health?.redis.latency_ms ?? 0} ms
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Role:</span>
              <span className="text-foreground">Ephemeral Rate Limiting</span>
            </div>
          </div>
        </div>

        {/* Cloudflare R2 */}
        <div className="p-4 bg-card border border-border rounded-2xl shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-semibold text-foreground">Cloudflare R2</span>
            </div>
            {health?.r2.accessible ? (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <CheckCircle className="w-3 h-3" />
                READY
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                <AlertCircle className="w-3 h-3" />
                UNREACHABLE
              </span>
            )}
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Configuration:</span>
              <span className="text-foreground capitalize">
                {health?.r2.status}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Bucket Accessibility:</span>
              <span className="text-foreground">
                {health?.r2.accessible ? "Accessible" : "Error"}
              </span>
            </div>
          </div>
        </div>

        {/* Cloudflare Turnstile */}
        <div className="p-4 bg-card border border-border rounded-2xl shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-sky-500" />
              <span className="text-xs font-semibold text-foreground">Cloudflare Turnstile</span>
            </div>
            {health?.turnstile.status === "configured" ? (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <CheckCircle className="w-3 h-3" />
                ACTIVE
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                UNCONFIGURED
              </span>
            )}
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Bot Protection:</span>
              <span className="text-foreground">Strict Challenge</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Status:</span>
              <span className="text-foreground capitalize">
                {health?.turnstile.status}
              </span>
            </div>
          </div>
        </div>

        {/* Switchyy CDN */}
        <div className="p-4 bg-card border border-border rounded-2xl shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-semibold text-foreground">Switchyy CDN</span>
            </div>
            {health?.switchyy.configured ? (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <CheckCircle className="w-3 h-3" />
                VERIFIED
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                UNCONFIGURED
              </span>
            )}
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Connection:</span>
              <span className="text-foreground capitalize">
                {health?.switchyy.status}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Public CDN:</span>
              <span className="text-foreground">Enabled</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
