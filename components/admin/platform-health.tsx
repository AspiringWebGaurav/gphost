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
      <div className="p-8 bg-neutral-900/40 border border-neutral-800/80 rounded-2xl text-center space-y-3 backdrop-blur-sm max-w-lg mx-auto">
        <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-400">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-white">
          Owner-Exclusive Authority Required
        </h3>
        <p className="text-xs text-neutral-400 leading-relaxed">
          Platform infrastructure diagnostics, health telemetry, and service configurations are restricted exclusively to the platform owner (<span className="text-neutral-300 font-mono">{ownerEmail}</span>).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex items-center justify-between p-4 bg-neutral-900/60 border border-neutral-800/80 rounded-2xl backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-white">
              Status-Only Hardened Health Diagnostics
            </div>
            <div className="text-[11px] text-neutral-400">
              Zero secrets, raw connection strings, or keys are exposed across any API or UI layer.
            </div>
          </div>
        </div>

        <button
          onClick={refreshHealth}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* PostgreSQL */}
        <div className="p-4 bg-neutral-900/60 border border-neutral-800/80 rounded-2xl backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-semibold text-white">PostgreSQL (Supabase)</span>
            </div>
            {health?.postgres.status === "connected" ? (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <CheckCircle className="w-3 h-3" />
                ONLINE
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                <AlertCircle className="w-3 h-3" />
                OFFLINE
              </span>
            )}
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-neutral-400">
              <span>Round-Trip Latency:</span>
              <span className="font-mono text-white">
                {health?.postgres.latency_ms ?? 0} ms
              </span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>Authority Role:</span>
              <span className="text-neutral-300">Authoritative Store</span>
            </div>
          </div>
        </div>

        {/* Redis */}
        <div className="p-4 bg-neutral-900/60 border border-neutral-800/80 rounded-2xl backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-red-400" />
              <span className="text-xs font-semibold text-white">Redis (Upstash)</span>
            </div>
            {health?.redis.status === "connected" ? (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <CheckCircle className="w-3 h-3" />
                ONLINE
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                <AlertCircle className="w-3 h-3" />
                OFFLINE
              </span>
            )}
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-neutral-400">
              <span>Ping Latency:</span>
              <span className="font-mono text-white">
                {health?.redis.latency_ms ?? 0} ms
              </span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>Role:</span>
              <span className="text-neutral-300">Ephemeral Rate Limiting</span>
            </div>
          </div>
        </div>

        {/* Cloudflare R2 */}
        <div className="p-4 bg-neutral-900/60 border border-neutral-800/80 rounded-2xl backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-semibold text-white">Cloudflare R2</span>
            </div>
            {health?.r2.accessible ? (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <CheckCircle className="w-3 h-3" />
                READY
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                <AlertCircle className="w-3 h-3" />
                UNREACHABLE
              </span>
            )}
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-neutral-400">
              <span>Configuration:</span>
              <span className="text-neutral-300 capitalize">
                {health?.r2.status}
              </span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>Bucket Accessibility:</span>
              <span className="text-neutral-300">
                {health?.r2.accessible ? "Accessible" : "Error"}
              </span>
            </div>
          </div>
        </div>

        {/* Cloudflare Turnstile */}
        <div className="p-4 bg-neutral-900/60 border border-neutral-800/80 rounded-2xl backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-semibold text-white">Cloudflare Turnstile</span>
            </div>
            {health?.turnstile.status === "configured" ? (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <CheckCircle className="w-3 h-3" />
                ACTIVE
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                UNCONFIGURED
              </span>
            )}
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-neutral-400">
              <span>Bot Protection:</span>
              <span className="text-neutral-300">Strict Challenge</span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>Status:</span>
              <span className="text-neutral-300 capitalize">
                {health?.turnstile.status}
              </span>
            </div>
          </div>
        </div>

        {/* Switchyy CDN */}
        <div className="p-4 bg-neutral-900/60 border border-neutral-800/80 rounded-2xl backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-white">Switchyy CDN</span>
            </div>
            {health?.switchyy.configured ? (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <CheckCircle className="w-3 h-3" />
                VERIFIED
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                UNCONFIGURED
              </span>
            )}
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-neutral-400">
              <span>Connection:</span>
              <span className="text-neutral-300 capitalize">
                {health?.switchyy.status}
              </span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>Public CDN:</span>
              <span className="text-neutral-300">Enabled</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
