"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Link as LinkIcon,
  Sparkles,
  KeyRound,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RotateCw,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertTriangle,
  Zap,
  Calendar,
  Database,
  Clock,
} from "lucide-react";

type TestState = "untested" | "testing" | "active" | "expired" | "invalid" | "error";

interface SavedVerificationData {
  status: "connected" | "invalid_key" | "not_configured" | "cooldown" | "network_error" | "expired";
  valid: boolean;
  plan?: "premium_permanent" | "unlimited_api" | "free" | "pro";
  httpStatus?: number;
  maskedKey?: string;
  message: string;
  intervalDays: number;
  testedAt: string;
  nextCheckDueAt: string;
  isDue: boolean;
}

const INTERVAL_OPTIONS = [
  { value: 7, label: "1 Week (7 Days)" },
  { value: 10, label: "10 Days" },
  { value: 14, label: "2 Weeks (14 Days)" },
  { value: 30, label: "1 Month (30 Days)" },
];

function formatRelativeDueDate(isoStr: string): string {
  const diffMs = new Date(isoStr).getTime() - Date.now();
  if (diffMs <= 0) return "Due now";
  const days = Math.ceil(diffMs / 86400000);
  if (days <= 0) return "Due today";
  if (days === 1) return "In 1 day";
  return `In ${days} days`;
}

function formatDateTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoStr;
  }
}

export function XurlSettingsCard() {
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [testing, setTesting] = useState<boolean>(false);
  const [testingCandidate, setTestingCandidate] = useState<boolean>(false);
  const [rotating, setRotating] = useState<boolean>(false);
  const [updatingInterval, setUpdatingInterval] = useState<boolean>(false);

  // Active key coordinates
  const [maskedKey, setMaskedKey] = useState<string>("");
  const [isConfigured, setIsConfigured] = useState<boolean>(false);

  // Database-persisted test state & interval
  const [savedTest, setSavedTest] = useState<SavedVerificationData | null>(null);
  const [intervalDays, setIntervalDays] = useState<number>(7);
  const [testState, setTestState] = useState<TestState>("untested");

  // Rotation drawer states
  const [showRotateForm, setShowRotateForm] = useState<boolean>(false);
  const [candidateKey, setCandidateKey] = useState<string>("");
  const [showCandidateKeyText, setShowCandidateKeyText] = useState<boolean>(false);
  const [candidateTestResult, setCandidateTestResult] = useState<{
    valid: boolean;
    status: string;
    plan?: string;
    message?: string;
  } | null>(null);

  // UI feedback states
  const [copiedMasked, setCopiedMasked] = useState<boolean>(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Load saved verification test from database / Redis on mount
  useEffect(() => {
    let isMounted = true;
    async function loadInitial() {
      try {
        const res = await fetch("/api/xurl/status", { cache: "no-store" });
        const data = await res.json();
        if (isMounted && data) {
          if (data.maskedKey) setMaskedKey(data.maskedKey);
          setIsConfigured(Boolean(data.configured));

          if (data.intervalDays) setIntervalDays(data.intervalDays);

          if (data.savedTest) {
            setSavedTest(data.savedTest);
            if (data.savedTest.valid) {
              setTestState("active");
            } else if (data.savedTest.status === "expired") {
              setTestState("expired");
            } else if (data.savedTest.status === "invalid_key") {
              setTestState("invalid");
            } else {
              setTestState("error");
            }
          } else {
            setTestState("untested");
          }
        }
      } catch (err) {
        console.warn("[XURL Settings] Initial status load warning:", err);
      } finally {
        if (isMounted) setLoadingInitial(false);
      }
    }
    loadInitial();
    return () => {
      isMounted = false;
    };
  }, []);

  // Live test runner: calls upstream via /api/xurl/status?fresh=1, persists to database & Redis
  const runLiveTest = useCallback(
    async (overrideInterval?: number) => {
      setTesting(true);
      setTestState("testing");
      setErrorBanner(null);
      setSuccessBanner(null);

      const resolvedInterval = overrideInterval ?? intervalDays;

      try {
        const res = await fetch(`/api/xurl/status?fresh=1&interval=${resolvedInterval}`, {
          cache: "no-store",
        });
        const data = await res.json();

        if (data && data.success) {
          if (data.maskedKey) setMaskedKey(data.maskedKey);
          setIsConfigured(Boolean(data.configured));

          if (data.savedTest) {
            setSavedTest(data.savedTest);
            setIntervalDays(data.savedTest.intervalDays);
          }

          if (data.valid) {
            setTestState("active");
            setSuccessBanner(
              `Live test passed (HTTP 200 OK) & saved to database! Next check in ${resolvedInterval} days.`
            );
          } else if (data.status === "expired") {
            setTestState("expired");
            setErrorBanner(
              "Subscription Expired (HTTP 402): Upstream API access is paused. Test saved to database."
            );
          } else if (data.status === "invalid_key") {
            setTestState("invalid");
            setErrorBanner(
              "Invalid API Key (HTTP 401): Upstream rejected the key. Test saved to database."
            );
          } else {
            setTestState("error");
            setErrorBanner(data.message || "Connection check returned an error.");
          }
        } else {
          setTestState("error");
          setErrorBanner(data?.error || "Failed to contact XURL service.");
        }
      } catch (err: unknown) {
        setTestState("error");
        const msg = err instanceof Error ? err.message : "Network failure";
        setErrorBanner(`Test failed: ${msg}`);
      } finally {
        setTesting(false);
      }
    },
    [intervalDays]
  );

  // Update check interval (e.g. 7 days or 10 days) and recalculate due date in database
  const handleIntervalChange = async (newDays: number) => {
    setIntervalDays(newDays);
    setUpdatingInterval(true);
    setErrorBanner(null);

    try {
      const res = await fetch("/api/xurl/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalDays: newDays }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.savedTest) {
        setSavedTest(data.savedTest);
        setSuccessBanner(
          `Verification interval updated to ${newDays} days (next check due ${formatDateTime(data.savedTest.nextCheckDueAt)}).`
        );
      }
    } catch (err: unknown) {
      console.warn("Error updating interval:", err);
    } finally {
      setUpdatingInterval(false);
    }
  };

  const handleCopyMasked = () => {
    if (maskedKey) {
      navigator.clipboard.writeText(maskedKey);
      setCopiedMasked(true);
      setTimeout(() => setCopiedMasked(false), 2000);
    }
  };

  // Dry-run live test of candidate key in rotation form
  const handleTestCandidateKey = async () => {
    if (!candidateKey.trim()) {
      setErrorBanner("Please enter an API key to test.");
      return;
    }
    setTestingCandidate(true);
    setErrorBanner(null);
    setCandidateTestResult(null);

    try {
      const res = await fetch("/api/xurl/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: candidateKey.trim(), testOnly: true }),
      });
      const data = await res.json();
      setCandidateTestResult({
        valid: Boolean(data.valid),
        status: data.status || (res.ok ? "connected" : "failed"),
        plan: data.plan,
        message: data.message || data.error,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error testing key";
      setErrorBanner(msg);
    } finally {
      setTestingCandidate(false);
    }
  };

  // Rotate & persist key (persists to Redis, .env.local, and saves verified test to database)
  const handleRotateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateKey.trim()) {
      setErrorBanner("Please enter a new XURL API key.");
      return;
    }

    setRotating(true);
    setErrorBanner(null);
    setSuccessBanner(null);

    try {
      const res = await fetch("/api/xurl/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: candidateKey.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessBanner(
          data.message || "XURL API key rotated, verified, and saved to database!"
        );
        if (data.maskedKey) setMaskedKey(data.maskedKey);
        setIsConfigured(true);

        setCandidateKey("");
        setCandidateTestResult(null);
        setShowRotateForm(false);

        // Fetch fresh saved status from database
        const statusRes = await fetch("/api/xurl/status", { cache: "no-store" });
        const freshData = await statusRes.json();
        if (freshData?.savedTest) {
          setSavedTest(freshData.savedTest);
          setTestState("active");
        }
      } else {
        setErrorBanner(data.error || "Failed to rotate XURL API key.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error rotating key";
      setErrorBanner(msg);
    } finally {
      setRotating(false);
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border/80 shadow-xs space-y-4 sm:space-y-5">
      {/* Symmetrical Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3 sm:pb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/20 shadow-2xs">
            <LinkIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-bold text-foreground truncate">
                XURL Shortlink Integration &amp; Key Rotation
              </h3>

              {/* Dynamic Status Badge (Driven by Database-persisted verification) */}
              {loadingInitial ? (
                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-muted text-muted-foreground border border-border flex items-center gap-1">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  Loading...
                </span>
              ) : testing ? (
                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center gap-1 animate-pulse">
                  <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-500" />
                  Testing live...
                </span>
              ) : testState === "active" ? (
                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 flex items-center gap-1 shadow-2xs">
                  <Sparkles className="w-3 h-3 text-emerald-500" />
                  <span>✨ Premium Permanent Plan (Verified)</span>
                </span>
              ) : testState === "expired" ? (
                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-rose-500" />
                  <span>Subscription Expired</span>
                </span>
              ) : testState === "invalid" ? (
                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 text-rose-500" />
                  <span>Invalid Key</span>
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-muted/80 text-muted-foreground border border-border flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
                  <span>Untested · Click Test</span>
                </span>
              )}

              {/* Database-synced badge if persisted test exists */}
              {savedTest && (
                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center gap-1">
                  <Database className="w-2.5 h-2.5 text-blue-500" />
                  <span>Saved in DB</span>
                </span>
              )}
            </div>
            <p className="text-[11.5px] text-muted-foreground mt-0.5 truncate">
              Manage your connected XURL API key, database-backed verification lifecycle, and auto-check interval.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
          <a
            href="https://xurl.eu.cc"
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1.5 rounded-xl border border-border/80 hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors shadow-2xs"
            title="Open XURL Dashboard"
          >
            <span>xurl.eu.cc</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Live Feedback Banners */}
      {successBanner && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="truncate">{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-600 dark:text-emerald-400 hover:text-foreground text-xs shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {errorBanner && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span className="truncate">{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-rose-600 dark:text-rose-400 hover:text-foreground text-xs shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {/* Box 1: Active API Key Section */}
        <div className="p-4 rounded-xl bg-muted/30 border border-border/70 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-primary" />
              <span>Active API Key</span>
            </span>
            <span className="text-[11px] text-muted-foreground font-mono">
              {isConfigured ? "Configured" : "Not Set"}
            </span>
          </div>

          {/* Full-width Masked Key Display Box (Zero clipping, full width) */}
          <div className="w-full flex items-center justify-between gap-2 font-mono text-xs text-foreground bg-card px-3 py-2.5 rounded-xl border border-border/80 shadow-2xs select-all min-w-0">
            <span className="truncate flex-1 font-mono tracking-tight">
              {maskedKey || "No API key configured in environment"}
            </span>
            {maskedKey && (
              <button
                type="button"
                onClick={handleCopyMasked}
                className="px-2 py-1 rounded-lg hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors shrink-0"
                title="Copy masked key"
              >
                {copiedMasked ? (
                  <Check className="w-3 h-3 text-emerald-500" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>{copiedMasked ? "Copied" : "Copy"}</span>
              </button>
            )}
          </div>

          {/* Action Toolbar Row */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <button
              type="button"
              onClick={() => runLiveTest()}
              disabled={testing}
              className="flex-1 min-w-[130px] px-3 py-2 rounded-xl bg-card hover:bg-muted border border-border/80 text-xs font-semibold text-foreground flex items-center justify-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50"
              title="Test connection against xurl.eu.cc and save result in database"
            >
              <RotateCw className={`w-3.5 h-3.5 ${testing ? "animate-spin text-primary" : ""}`} />
              <span>{testing ? "Testing..." : "Test Connection"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowRotateForm(!showRotateForm);
                setCandidateTestResult(null);
                setErrorBanner(null);
              }}
              className="flex-1 min-w-[110px] px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{showRotateForm ? "Close" : "Rotate Key"}</span>
            </button>
          </div>
        </div>

        {/* Box 2: Plan Status & Scheduled Interval Check (Database Backed) */}
        <div className="p-4 rounded-xl bg-muted/30 border border-border/70 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
              <span>Plan Status &amp; Re-Check Schedule</span>
            </span>

            {/* Check Interval Selector Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground hidden sm:inline">Interval:</span>
              <select
                value={intervalDays}
                onChange={(e) => handleIntervalChange(parseInt(e.target.value, 10))}
                disabled={updatingInterval || testing}
                className="text-[11px] font-semibold bg-card border border-border/80 rounded-lg px-2 py-0.5 text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary shadow-2xs cursor-pointer"
                title="Interval between verification tests"
              >
                {INTERVAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dynamic Content based on database test state */}
          <div className="min-w-0">
            {testing ? (
              <div className="space-y-1.5 py-1">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 shrink-0" />
                  <span className="text-sm font-bold text-foreground">Testing Connection...</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Contacting xurl.eu.cc upstream API and persisting test verification to PostgreSQL...
                </p>
              </div>
            ) : savedTest ? (
              <div className="space-y-2 py-0.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        savedTest.valid ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                      }`}
                    />
                    <span
                      className={`text-sm font-bold ${
                        savedTest.valid
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {savedTest.valid
                        ? "Premium Permanent Plan"
                        : savedTest.status === "expired"
                        ? "Subscription Expired"
                        : "Invalid Key"}
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                      HTTP {savedTest.httpStatus || (savedTest.valid ? 200 : 402)}
                    </span>
                  </div>

                  {savedTest.isDue && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5 text-amber-500" />
                      <span>Re-Check Due</span>
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  {savedTest.valid
                    ? "Verified active with permanent link creation and custom vanity routes."
                    : savedTest.message || "Upstream verification requires attention."}
                </p>

                {/* Schedule & Verification Metadata Rows */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 border-t border-border/50 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1.5 truncate">
                    <Database className="w-3 h-3 text-blue-500 shrink-0" />
                    <span>Verified: {formatDateTime(savedTest.testedAt)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 truncate sm:justify-end">
                    <Calendar className="w-3 h-3 text-primary shrink-0" />
                    <span>
                      Next Check:{" "}
                      <strong className="text-foreground font-semibold">
                        {formatRelativeDueDate(savedTest.nextCheckDueAt)}
                      </strong>{" "}
                      ({formatDateTime(savedTest.nextCheckDueAt).split(",")[0]})
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 py-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40 shrink-0" />
                  <span className="text-sm font-bold text-foreground">Untested</span>
                  <span className="text-[10.5px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/70 font-medium">
                    Pending Verification
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Click &ldquo;Test Connection&rdquo; to test this API key against xurl.eu.cc live. Results will be saved in the database with an auto-check interval.
                </p>
              </div>
            )}
          </div>

          {/* Quick Trigger Button */}
          {(!savedTest || savedTest.isDue) && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => runLiveTest()}
                disabled={testing}
                className="w-full px-3 py-1.5 rounded-xl bg-card hover:bg-muted border border-border/80 text-xs font-semibold text-primary hover:text-primary/90 flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
              >
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span>
                  {savedTest?.isDue ? "Run Scheduled Re-Check Now" : "Run Live Test & Save to Database"}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Rotation Drawer / Form */}
      {showRotateForm && (
        <form
          onSubmit={handleRotateSubmit}
          className="p-4 sm:p-5 rounded-xl bg-muted/30 border border-primary/20 space-y-3.5 transition-all"
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-foreground">
              <KeyRound className="w-4 h-4 text-primary" />
              <span>Rotate XURL Account API Key</span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Live test and database persistence upon saving
            </span>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Enter your secret key from your{" "}
            <a
              href="https://xurl.eu.cc"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-semibold"
            >
              xurl.eu.cc dashboard
            </a>
            . You can test it live with &ldquo;Test Key&rdquo; before saving to verify its plan tier dynamically.
          </p>

          <div className="space-y-2">
            <div className="relative">
              <input
                type={showCandidateKeyText ? "text" : "password"}
                value={candidateKey}
                onChange={(e) => {
                  setCandidateKey(e.target.value);
                  setCandidateTestResult(null);
                }}
                placeholder="xurl_sk_live_..."
                className="w-full px-3.5 py-2.5 pr-10 text-xs font-mono bg-card border border-border/80 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary/40 focus:border-primary text-foreground placeholder:text-muted-foreground shadow-2xs"
                autoComplete="off"
                disabled={rotating || testingCandidate}
              />
              <button
                type="button"
                onClick={() => setShowCandidateKeyText(!showCandidateKeyText)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showCandidateKeyText ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Candidate Test Result Banner */}
            {candidateTestResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                  candidateTestResult.valid
                    ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300"
                    : "bg-rose-500/10 border-rose-500/25 text-rose-700 dark:text-rose-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  {candidateTestResult.valid ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                  <span>
                    {candidateTestResult.valid
                      ? `✨ Key Verified! Plan detected: ${candidateTestResult.plan === "premium_permanent" ? "Premium Permanent Plan" : candidateTestResult.plan || "Active"}`
                      : candidateTestResult.message || "Key verification failed."}
                  </span>
                </div>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-md bg-background/50 border border-current">
                  {candidateTestResult.status}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <button
              type="button"
              onClick={handleTestCandidateKey}
              disabled={testingCandidate || rotating || !candidateKey.trim()}
              className="px-3.5 py-2 rounded-xl bg-card hover:bg-muted border border-border/80 text-xs font-semibold text-foreground flex items-center justify-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${testingCandidate ? "animate-spin text-primary" : ""}`} />
              <span>{testingCandidate ? "Testing Key..." : "Test Key (Live)"}</span>
            </button>

            <button
              type="submit"
              disabled={rotating || testingCandidate || !candidateKey.trim()}
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"
            >
              {rotating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying &amp; Saving...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Test &amp; Save Key</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowRotateForm(false);
                setCandidateKey("");
                setCandidateTestResult(null);
              }}
              disabled={rotating || testingCandidate}
              className="px-3 py-2 rounded-xl border border-border/80 hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
