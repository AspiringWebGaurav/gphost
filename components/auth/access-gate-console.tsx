"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Turnstile } from "@marsidev/react-turnstile";
import { useTheme } from "@/components/theme-provider";
import {
  KeyRound,
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  ShieldAlert,
  UserX,
  ArrowRight,
  Sparkles,
  X,
  RotateCcw,
} from "lucide-react";

interface AccessGateConsoleProps {
  userEmail: string;
  hasExistingPendingRequest: boolean;
  existingRequestReason?: string | null;
  existingRequestDate?: string | null;
  status: "pending" | "rejected" | "revoked";
  initialTab?: "pin" | "request";
}

export function AccessGateConsole({
  userEmail,
  hasExistingPendingRequest,
  existingRequestDate,
  status,
  initialTab = "pin",
}: AccessGateConsoleProps) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

  const [activeTab, setActiveTab] = useState<"pin" | "request">(initialTab);

  // PIN Form State
  const pinInputRef = useRef<HTMLInputElement>(null);
  const [pin, setPin] = useState("");
  const [pinTurnstile, setPinTurnstile] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);

  const handleClearPin = () => {
    setPin("");
    setPinError(null);
    pinInputRef.current?.focus();
  };

  // Request Access Form State
  const [reason, setReason] = useState("");
  const [requestTurnstile, setRequestTurnstile] = useState<string | null>(null);
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [hasPending, setHasPending] = useState(hasExistingPendingRequest);

  // Handle PIN verification
  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!/^\d{4}$/.test(pin)) {
      setPinError("Please enter a valid 4-digit numeric PIN.");
      pinInputRef.current?.focus();
      return;
    }

    if (siteKey && !pinTurnstile) {
      setPinError("Please complete the security verification challenge.");
      return;
    }

    try {
      setPinLoading(true);
      setPinError(null);

      const res = await fetch("/api/onboarding/pin-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          turnstileToken: pinTurnstile || "turnstile-dev-token",
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setPinError(data.error || "Failed to verify PIN");
        setPinLoading(false);
        setTimeout(() => {
          pinInputRef.current?.select();
        }, 50);
        return;
      }

      setPinSuccess("PIN verified! Activating account and loading vault...");
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 900);
    } catch {
      setPinError("Network error while verifying PIN. Please try again.");
      setPinLoading(false);
    }
  };

  // Handle Access Request Submission
  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (reason.trim().length < 10) {
      setRequestError("Please provide a reason with at least 10 characters.");
      return;
    }

    if (siteKey && !requestTurnstile) {
      setRequestError("Please complete the security verification challenge.");
      return;
    }

    try {
      setRequestLoading(true);
      setRequestError(null);

      const res = await fetch("/api/onboarding/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason.trim(),
          turnstileToken: requestTurnstile || "turnstile-dev-token",
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        setHasPending(true);
        setRequestError(data.error || "An access request is already under review.");
        setRequestLoading(false);
        return;
      }

      if (!res.ok || !data.success) {
        setRequestError(data.error || "Failed to submit request.");
        setRequestLoading(false);
        return;
      }

      setHasPending(true);
      setRequestSuccess("Access request submitted successfully! An administrator will review your account.");
      setRequestLoading(false);
    } catch {
      setRequestError("Network error while submitting request. Please try again.");
      setRequestLoading(false);
    }
  };

  // If account is Rejected
  if (status === "rejected") {
    return (
      <div className="w-full max-w-md mx-auto text-center space-y-5 animate-in fade-in duration-300">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center mx-auto text-rose-500 shadow-lg shadow-rose-500/10">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Access Not Approved</h2>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            Your account request could not be approved at this time. If you believe this is an error, contact the site administrator.
          </p>
        </div>
        <div className="p-4 rounded-xl bg-muted/60 border border-border text-xs text-muted-foreground">
          Administrator: <span className="text-foreground font-mono font-medium">gauravpatil9262@gmail.com</span>
        </div>
      </div>
    );
  }

  // If account is Revoked
  if (status === "revoked") {
    return (
      <div className="w-full max-w-md mx-auto text-center space-y-5 animate-in fade-in duration-300">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center mx-auto text-rose-500 shadow-lg shadow-rose-500/10">
          <UserX className="w-7 h-7" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Account Access Revoked</h2>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            Your upload privileges have been deactivated. Please contact support if you require assistance.
          </p>
        </div>
        <div className="p-4 rounded-xl bg-muted/60 border border-border text-xs text-muted-foreground">
          Administrator: <span className="text-foreground font-mono font-medium">gauravpatil9262@gmail.com</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto flex flex-col justify-center">
      {/* Mode Switcher Tabs */}
      <div className="p-1 rounded-xl bg-muted/70 border border-border flex items-center mb-6">
        <button
          type="button"
          onClick={() => setActiveTab("pin")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
            activeTab === "pin"
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <KeyRound className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>Enter 4-Digit PIN</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("request")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
            activeTab === "request"
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Send className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>Request Approval</span>
        </button>
      </div>

      {/* Tab 1: Enter 4-Digit PIN */}
      {activeTab === "pin" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="text-left">
            <h2 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
              <span>Onboarding Fast-Track</span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                <Sparkles className="w-2.5 h-2.5" />
                Instant Access
              </span>
            </h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Enter the 4-digit authorization code issued for{" "}
              <span className="text-foreground font-medium font-mono">{userEmail}</span>.
            </p>
          </div>

          {/* Messages */}
          {pinError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start justify-between gap-2.5 text-rose-600 dark:text-rose-400 text-xs animate-in fade-in duration-200">
              <div className="flex items-start gap-2.5 flex-1">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{pinError}</span>
              </div>
              <button
                type="button"
                onClick={handleClearPin}
                className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 hover:underline shrink-0 cursor-pointer flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Clear</span>
              </button>
            </div>
          )}

          {pinSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{pinSuccess}</span>
            </div>
          )}

          <form onSubmit={handlePinSubmit} className="space-y-4 text-left">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="access-pin-input" className="block text-xs font-medium text-muted-foreground">
                  4-Digit Security PIN
                </label>
                {pin.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearPin}
                    className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Clear Code</span>
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="access-pin-input"
                  ref={pinInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  autoComplete="one-time-code"
                  autoFocus
                  value={pin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setPin(val);
                    if (pinError) setPinError(null);
                  }}
                  placeholder="••••"
                  className="w-full text-center tracking-[0.7em] text-3xl font-mono py-3 px-4 rounded-xl bg-muted/40 hover:bg-muted/60 focus:bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200"
                />
                {pin.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearPin}
                    aria-label="Clear PIN"
                    title="Clear input"
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all cursor-pointer hover:scale-105 active:scale-95"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Turnstile Protection */}
            {siteKey && (
              <div className="flex justify-center py-1">
                <Turnstile
                  siteKey={siteKey}
                  onSuccess={(token) => setPinTurnstile(token)}
                  onError={() => setPinError("Security check challenge failed. Please reload.")}
                  options={{ theme: resolvedTheme, size: "flexible" }}
                />
              </div>
            )}

            <button
              type="submit"
              id="submit-pin-btn"
              disabled={pinLoading || pin.length !== 4 || (siteKey ? !pinTurnstile : false)}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all duration-200 shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99]"
            >
              {pinLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying PIN...</span>
                </>
              ) : (
                <>
                  <span>Unlock Storage Vault</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          {/* Quick link to switch */}
          <div className="pt-2 text-center text-xs text-muted-foreground">
            Don&apos;t have an invitation code?{" "}
            <button
              type="button"
              onClick={() => setActiveTab("request")}
              className="text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
            >
              Request manual access &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Request Access */}
      {activeTab === "request" && (
        <div className="space-y-4 animate-in fade-in duration-200 text-left">
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">Request Account Approval</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Submit your request to the administrator for manual review and account approval.
            </p>
          </div>

          {/* If request is already pending */}
          {hasPending ? (
            <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-500 shrink-0 mt-0.5">
                  <Clock className="w-4 h-4 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-foreground">Request Pending Review</h3>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                    Your request was received and is queued for administrative review.
                    {existingRequestDate && (
                      <span className="block text-[10px] text-muted-foreground/80 mt-1 font-mono">
                        Submitted: {new Date(existingRequestDate).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-amber-500/20 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Received a 4-digit PIN?</span>
                <button
                  type="button"
                  onClick={() => setActiveTab("pin")}
                  className="text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer inline-flex items-center gap-1"
                >
                  <span>Enter PIN now</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ) : (
            <>
              {requestError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-rose-600 dark:text-rose-400 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{requestError}</span>
                </div>
              )}

              {requestSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400 text-xs">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{requestSuccess}</span>
                </div>
              )}

              <form onSubmit={handleRequestSubmit} className="space-y-4">
                <div>
                  <label htmlFor="reason-textarea" className="block text-xs font-medium text-muted-foreground mb-1.5">
                    How do you plan to use GPHosting?
                  </label>
                  <textarea
                    id="reason-textarea"
                    rows={3}
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value);
                      if (requestError) setRequestError(null);
                    }}
                    placeholder="Briefly tell us what types of files you plan to share..."
                    className="w-full text-xs p-3 rounded-xl bg-muted/40 hover:bg-muted/60 focus:bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200 resize-none"
                  />
                  <div className="flex justify-between items-center mt-1 text-[10px] text-muted-foreground">
                    <span>Minimum 10 characters</span>
                    <span>{reason.length}/1000</span>
                  </div>
                </div>

                {/* Turnstile Protection */}
                {siteKey && (
                  <div className="flex justify-center py-1">
                    <Turnstile
                      siteKey={siteKey}
                      onSuccess={(token) => setRequestTurnstile(token)}
                      onError={() => setRequestError("Security verification challenge failed.")}
                      options={{ theme: resolvedTheme, size: "flexible" }}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  id="submit-request-btn"
                  disabled={requestLoading || reason.trim().length < 10 || (siteKey ? !requestTurnstile : false)}
                  className="w-full py-2.5 px-4 rounded-xl bg-foreground hover:opacity-90 text-background font-semibold text-xs flex items-center justify-center gap-2 transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99]"
                >
                  {requestLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Submitting Request...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Submit Request for Approval</span>
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {/* Quick link to switch back */}
          <div className="pt-2 text-center text-xs text-muted-foreground">
            Already have an access code?{" "}
            <button
              type="button"
              onClick={() => setActiveTab("pin")}
              className="text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
            >
              Enter 4-digit PIN &rarr;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
