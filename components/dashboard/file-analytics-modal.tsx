"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Globe2,
  Download,
  Eye,
  Activity,
  Radio,
  Loader2,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import type { FileAnalyticsResponse } from "@/app/api/files/[id]/analytics/route";
import { WorldMap } from "@/components/dashboard/world-map";

interface FileAnalyticsModalProps {
  fileId: string;
  filename: string;
  onClose: () => void;
}

export function FileAnalyticsModal({ fileId, filename, onClose }: FileAnalyticsModalProps) {
  const [data, setData] = useState<FileAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch(`/api/files/${fileId}/analytics`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load telemetry");
      }
      const json: FileAnalyticsResponse = await res.json();
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading analytics");
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchAnalytics();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchAnalytics]);

  const handleRefresh = () => {
    setLoading(true);
    setError(null);
    void fetchAnalytics();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-border flex items-center justify-between gap-4 bg-muted/20">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate flex items-center gap-2">
                <span className="truncate">{filename}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-bold shrink-0">
                  EDGE ANALYTICS
                </span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Real-time Cloudflare edge telemetry & geographical request breakdown
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleRefresh}
              disabled={loading}
              title="Refresh Analytics"
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-500" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-5 overflow-y-auto space-y-5">
          {loading && !data && (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
              <p className="text-xs font-medium">Aggregating edge telemetry logs...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2.5">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {data && (
            <>
              {/* Metric Highlights */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-muted/40 border border-border">
                  <div className="flex items-center justify-between text-muted-foreground mb-1">
                    <span className="text-[11px] font-medium uppercase tracking-wider">Total Views</span>
                    <Eye className="w-3.5 h-3.5 text-blue-500" />
                  </div>
                  <div className="text-xl font-bold font-mono text-foreground">
                    {data.summary.totalViews}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {data.summary.previewViews} preview • {data.summary.rawViews} raw CDN
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-muted/40 border border-border">
                  <div className="flex items-center justify-between text-muted-foreground mb-1">
                    <span className="text-[11px] font-medium uppercase tracking-wider">Downloads</span>
                    <Download className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <div className="text-xl font-bold font-mono text-foreground">
                    {data.summary.totalDownloads}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Completed claims
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-muted/40 border border-border">
                  <div className="flex items-center justify-between text-muted-foreground mb-1">
                    <span className="text-[11px] font-medium uppercase tracking-wider">Direct CDN</span>
                    <Radio className="w-3.5 h-3.5 text-purple-500" />
                  </div>
                  <div className="text-xl font-bold font-mono text-foreground">
                    {data.summary.rawViews}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    0 MB Vercel egress
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-muted/40 border border-border">
                  <div className="flex items-center justify-between text-muted-foreground mb-1">
                    <span className="text-[11px] font-medium uppercase tracking-wider">Unique Geo</span>
                    <Globe2 className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <div className="text-xl font-bold font-mono text-foreground">
                    {data.countries.length}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Countries detected
                  </div>
                </div>
              </div>

              {/* Interactive Vector World Map */}
              <WorldMap countries={data.countries} />

              {/* Geographic Distribution & Referrers Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Geographic Heatmap List */}
                <div className="p-4 rounded-xl bg-muted/20 border border-border space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Globe2 className="w-3.5 h-3.5 text-blue-500" />
                      Top Visitor Countries
                    </h4>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      Cloudflare Edge
                    </span>
                  </div>

                  {data.countries.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      No country telemetry logged yet.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {data.countries.map((c) => {
                        const total = data.summary.totalEvents || 1;
                        const pct = Math.round((c.count / total) * 100);
                        return (
                          <div key={c.country} className="space-y-1">
                            <div className="flex items-center justify-between text-xs font-mono">
                              <span className="font-semibold text-foreground flex items-center gap-1.5">
                                <span className="w-5 h-3.5 rounded bg-muted border border-border inline-flex items-center justify-center text-[9px] text-muted-foreground">
                                  {c.country.slice(0, 2)}
                                </span>
                                {c.country}
                              </span>
                              <span className="text-muted-foreground">
                                {c.count} ({pct}%)
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Top Referrers */}
                <div className="p-4 rounded-xl bg-muted/20 border border-border space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <ExternalLink className="w-3.5 h-3.5 text-emerald-500" />
                      Top Traffic Sources
                    </h4>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      Referrers
                    </span>
                  </div>

                  {data.referrers.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      No referrer data recorded yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {data.referrers.map((r) => (
                        <div
                          key={r.referrer}
                          className="flex items-center justify-between text-xs p-2 rounded-lg bg-card border border-border/60"
                        >
                          <span className="truncate max-w-[180px] font-mono text-[11px] text-foreground" title={r.referrer}>
                            {r.referrer}
                          </span>
                          <span className="font-mono text-[11px] font-semibold text-muted-foreground shrink-0">
                            {r.count} hits
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Live Edge Telemetry Event Feed */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-purple-500" />
                    Recent Edge Events Log
                  </h4>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    Latest 20 hits
                  </span>
                </div>

                {data.recentEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-xl">
                    No edge events logged yet. Request views or downloads will stream here.
                  </p>
                ) : (
                  <div className="border border-border rounded-xl overflow-hidden divide-y divide-border/60 max-h-56 overflow-y-auto">
                    {data.recentEvents.map((ev) => {
                      const isDownload = ev.eventType === "download";
                      const isRaw = ev.eventType === "raw_view";
                      return (
                        <div
                          key={ev.id}
                          className="p-2.5 flex items-center justify-between gap-3 text-xs bg-card hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase shrink-0 ${
                                isDownload
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                  : isRaw
                                  ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                                  : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                              }`}
                            >
                              {ev.eventType}
                            </span>
                            <span className="text-muted-foreground text-[11px] truncate">
                              {ev.city ? `${ev.city}, ` : ""}{ev.countryCode || "Unknown Location"}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                            {new Date(ev.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
