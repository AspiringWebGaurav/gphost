"use client";

import React, { useState } from "react";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  ExternalLink,
  Loader2,
  RotateCcw,
} from "lucide-react";

export interface XurlMappingItem {
  id: string;
  share_link_id: string;
  status: "pending" | "active" | "failed";
  short_url: string | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface XurlMonitorProps {
  initialMappings: XurlMappingItem[];
  isCooldown: boolean;
  isRatelimited: boolean;
  totalMonthlyCount: number;
}

export function XurlMonitor({
  initialMappings,
  isCooldown,
  isRatelimited,
  totalMonthlyCount,
}: XurlMonitorProps) {
  const [mappings, setMappings] = useState<XurlMappingItem[]>(initialMappings);
  const [cooldownActive, setCooldownActive] = useState(isCooldown);
  const [ratelimitActive, setRatelimitActive] = useState(isRatelimited);

  // Actions
  const [isResetting, setIsResetting] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  const handleResetBreaker = async () => {
    setIsResetting(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    try {
      const res = await fetch("/api/admin/xurl/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetCircuitBreaker: true }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to reset circuit breaker");
      }

      setCooldownActive(false);
      setRatelimitActive(false);
      setFeedbackSuccess("Circuit breaker keys cleared in Redis.");
    } catch (err: unknown) {
      setFeedbackError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setIsResetting(false);
    }
  };

  const handleRetryMapping = async (mapping: XurlMappingItem) => {
    setRetryingId(mapping.id);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    try {
      const res = await fetch("/api/admin/xurl/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retryShareLinkId: mapping.share_link_id }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Retry failed");
      }

      if (data.retryResult?.success) {
        setMappings((prev) =>
          prev.map((m) =>
            m.id === mapping.id
              ? {
                  ...m,
                  status: "active",
                  short_url: data.retryResult.short_url,
                  attempts: m.attempts + 1,
                  last_error: null,
                }
              : m
          )
        );
        setFeedbackSuccess(
          `Successfully shortened: ${data.retryResult.short_url}`
        );
      } else {
        setFeedbackError(
          data.retryResult?.error || "Shortlink creation failed during retry."
        );
      }
    } catch (err: unknown) {
      setFeedbackError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {feedbackError && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{feedbackError}</span>
        </div>
      )}

      {feedbackSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-2 text-xs">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{feedbackSuccess}</span>
        </div>
      )}

      {/* Circuit Breaker & Health Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Monthly Volume */}
        <div className="p-4 bg-card border border-border rounded-2xl shadow-sm">
          <div className="text-muted-foreground text-xs font-medium">
            Monthly Shortlinks Generated
          </div>
          <div className="text-2xl font-bold text-foreground mt-1 font-mono">
            {totalMonthlyCount}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Free tier monthly budget: ~10,000 requests
          </div>
        </div>

        {/* Quota Cooldown Breaker */}
        <div className="p-4 bg-card border border-border rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Quota Exhaustion Breaker
            </span>
            {cooldownActive ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-500 dark:text-red-400 border border-red-500/20">
                TRIPPED (Active)
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                HEALTHY
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            {cooldownActive
              ? "Requests to XURL are halted until monthly quota rolls over."
              : "No quota limits triggered."}
          </p>
        </div>

        {/* Rate Limit Breaker */}
        <div className="p-4 bg-card border border-border rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Rate Limit Cooldown
            </span>
            {ratelimitActive ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                BACKOFF (Active)
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                HEALTHY
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            {ratelimitActive
              ? "HTTP 429 received from XURL; requests temporarily backed off."
              : "No rate limits detected."}
          </p>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between p-4 bg-muted/40 border border-border rounded-2xl">
        <div className="text-xs">
          <span className="font-semibold text-foreground">Circuit Breaker Control</span>
          <p className="text-muted-foreground text-[11px]">
            If quota was increased or rate limit expired, you can manually reset Redis flags.
          </p>
        </div>
        <button
          onClick={handleResetBreaker}
          disabled={isResetting || (!cooldownActive && !ratelimitActive)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium transition border border-border/60 disabled:opacity-40 shadow-sm"
        >
          {isResetting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RotateCcw className="w-3.5 h-3.5" />
          )}
          <span>Reset Circuit Breakers</span>
        </button>
      </div>

      {/* Mappings Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-foreground">
            Recent Shortlink Mappings
          </h3>
          <span className="text-[11px] text-muted-foreground font-mono">
            Total: {mappings.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-muted-foreground font-semibold">
                <th className="px-4 py-3">Short URL</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Last Error</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-foreground">
              {mappings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted-foreground">
                    No shortlinks generated yet.
                  </td>
                </tr>
              ) : (
                mappings.map((m) => {
                  const isPermanentError =
                    m.last_error &&
                    (m.last_error.includes("400") ||
                      m.last_error.includes("401") ||
                      m.last_error.includes("403") ||
                      m.last_error.includes("409"));
                  const canRetry = m.status === "failed" && !isPermanentError;

                  return (
                    <tr key={m.id} className="hover:bg-muted/40 transition">
                      <td className="px-4 py-3">
                        {m.short_url ? (
                          <a
                            href={m.short_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline font-mono font-medium flex items-center gap-1"
                          >
                            <span>{m.short_url}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground font-mono">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {m.status === "active" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <CheckCircle className="w-3 h-3" />
                            ACTIVE
                          </span>
                        )}
                        {m.status === "pending" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            <Clock className="w-3 h-3" />
                            PENDING
                          </span>
                        )}
                        {m.status === "failed" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                            FAILED
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                        {m.attempts} / 3
                      </td>

                      <td className="px-4 py-3 text-muted-foreground max-w-xs truncate text-[11px]">
                        {m.last_error ? (
                          <span
                            className={isPermanentError ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}
                            title={m.last_error}
                          >
                            {m.last_error}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                        {new Date(m.created_at).toLocaleDateString()}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {canRetry ? (
                          <button
                            onClick={() => handleRetryMapping(m)}
                            disabled={retryingId === m.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-[11px] font-medium transition border border-border/60 disabled:opacity-50"
                          >
                            {retryingId === m.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3 h-3" />
                            )}
                            <span>Retry</span>
                          </button>
                        ) : isPermanentError ? (
                          <span className="text-amber-600/80 dark:text-amber-400/70 text-[10px] font-medium">
                            Permanent 4xx
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60 text-[11px] italic">
                            Synced
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
