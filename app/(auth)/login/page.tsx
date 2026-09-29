"use client";

import Link from "next/link";
import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandLogoSymbol } from "@/components/ui/brand-logo";
import { LogoutButton } from "@/components/auth/logout-button";
import {
  Layers,
  ShieldCheck,
  Lock,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  Timer,
  Shield,
  RotateCcw,
  X,
  UserCheck,
  Sparkles,
} from "lucide-react";

function formatAuthError(raw: string | null): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // Cancelled by user
  if (lower.includes("access_denied") || lower.includes("denied") || lower.includes("cancel")) {
    return "Google sign-in was cancelled. You can try again whenever you're ready.";
  }

  // PKCE code verifier / state mismatch / SSR instructions
  if (
    lower.includes("code verifier") ||
    lower.includes("pkce") ||
    lower.includes("bad_oauth_state") ||
    lower.includes("@supabase/ssr") ||
    lower.includes("ssr frameworks")
  ) {
    return "Your sign-in session expired or was interrupted. Please click 'Continue with Google' to sign in.";
  }

  // Stale refresh token or expired session
  if (lower.includes("refresh_token") || lower.includes("refresh token") || lower.includes("jwt")) {
    return "Your session has ended. Please sign in again with Google.";
  }

  // Rate limiting
  if (
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("too many authentication attempts")
  ) {
    return "Too many sign-in attempts. Please wait a moment before trying again.";
  }

  // Missing code
  if (lower.includes("missing authentication code")) {
    return "Sign-in was interrupted. Please click 'Continue with Google' to sign in.";
  }

  return raw;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const rawError = searchParams.get("error");
  const next = searchParams.get("next") || "/dashboard";

  const [loading, setLoading] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [dismissedRawError, setDismissedRawError] = useState<string | null>(null);

  const mode = searchParams.get("mode");
  const tab = searchParams.get("tab");
  const reason = searchParams.get("reason");
  const isWrongLogin =
    Boolean(rawError) ||
    reason === "unapproved" ||
    reason === "denied" ||
    reason === "unauthorized" ||
    reason === "revoked";

  const [showRequestModal, setShowRequestModal] = useState<boolean>(
    () => mode === "request" || tab === "request"
  );
  const [showDynamicAccessPrompt, setShowDynamicAccessPrompt] = useState<boolean>(
    () => isWrongLogin || mode === "request" || tab === "request"
  );
  const [showAccessToast, setShowAccessToast] = useState<boolean>(
    () => isWrongLogin
  );
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  // Check if there is an active session so user can dynamically sign out back to landing page
  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth.getUser().then((res: { data?: { user?: { email?: string | null } | null } | null }) => {
        if (res?.data?.user?.email) {
          setCurrentUserEmail(res.data.user.email);
        }
      }).catch(() => {});
    } catch {}
  }, []);

  // Clean up error query param from browser address bar without reload
  useEffect(() => {
    if (rawError && typeof window !== "undefined") {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("error");
      cleanUrl.searchParams.delete("error_description");
      window.history.replaceState({}, "", cleanUrl.pathname + cleanUrl.search);
    }
  }, [rawError]);

  // Human-friendly declarative error message without raw developer jargon
  const errorMessage =
    formatAuthError(clientError) ||
    (rawError && rawError !== dismissedRawError
      ? formatAuthError(rawError)
      : null);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetState = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setLoading(false);
  }, [setLoading]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // BFCache and Window Focus Recovery:
  // When user hits browser Back button from Google or switches back to this tab,
  // BFCache (back-forward cache) restores the exact JavaScript heap state where loading was true.
  // Listening to 'pageshow', 'focus', and 'visibilitychange' guarantees the button is never stuck.
  useEffect(() => {
    const handlePageShow = () => {
      resetState();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
        focusTimeoutRef.current = setTimeout(() => {
          resetState();
        }, 400);
      }
    };

    const handleWindowFocus = () => {
      if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
      focusTimeoutRef.current = setTimeout(() => {
        resetState();
      }, 400);
    };

    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [resetState]);

  const handleGoogleLogin = async (customDestination?: string) => {
    try {
      setLoading(true);
      setClientError(null);
      if (rawError) setDismissedRawError(rawError);

      // Watchdog timeout: if redirect hasn't completed within 6s (e.g. adblocker, popup cancelled), auto-recover
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        resetState();
      }, 6000);

      const supabase = createClient();
      const redirectOrigin = window.location.origin;
      const callbackUrl = new URL("/auth/callback", redirectOrigin);
      const targetNext = customDestination || (next && next.startsWith("/") ? next : "/dashboard");
      callbackUrl.searchParams.set("next", targetNext);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
          queryParams: {
            access_type: "offline",
          },
        },
      });

      if (error) {
        setClientError(error.message);
        resetState();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initiate login";
      setClientError(msg);
      resetState();
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col items-center text-center">
      {/* Brand Header */}
      <div className="relative mb-4 group">
        <BrandLogoSymbol size="xl" />
        <div className="absolute -inset-2 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-500 blur-lg -z-10 opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
        Welcome to GPHosting
      </h1>
      <p className="text-xs sm:text-sm text-muted-foreground mt-2 max-w-xs leading-relaxed">
        Fast, simple &amp; secure file sharing. 100% private, no ads, no tracking.
      </p>

      {/* Floating Dynamic Access Toast Notification — ONLY shown dynamically if wrong/unapproved login */}
      {showAccessToast && isWrongLogin && (
        <aside
          role="status"
          aria-label="Account access notification"
          className="fixed top-4 sm:top-5 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] p-3 rounded-2xl bg-card/95 border border-blue-500/40 shadow-2xl backdrop-blur-xl flex items-center justify-between gap-3 text-xs animate-in fade-in slide-in-from-top-4 duration-300"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
            </span>
            <span className="text-foreground font-medium truncate">
              Account not approved yet? <strong className="font-semibold text-blue-600 dark:text-blue-400">Approval or PIN required</strong> to upload.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowRequestModal(true);
                setShowAccessToast(false);
              }}
              className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[11px] transition-colors shadow-xs cursor-pointer"
            >
              Get Access
            </button>
            <button
              type="button"
              onClick={() => setShowAccessToast(false)}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </aside>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div className="w-full mt-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-start gap-2.5 text-rose-600 dark:text-rose-400 text-xs text-left animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed">
            <span className="font-semibold">Notice:</span> {errorMessage}
          </div>
          <button
            type="button"
            onClick={() => {
              setClientError(null);
              if (rawError) setDismissedRawError(rawError);
            }}
            className="text-rose-500/70 hover:text-rose-600 dark:hover:text-rose-300 font-medium cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Account Revoked Notice Banner */}
      {searchParams.get("reason") === "revoked" && (
        <div className="w-full mt-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-rose-600 dark:text-rose-400 text-xs text-left animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
          <div className="flex-1 leading-relaxed">
            <span className="font-semibold">Access Revoked:</span> An administrator has revoked your account access. Your session was terminated immediately. If you require assistance, please contact the administrator.
          </div>
        </div>
      )}

      {/* Idle Inactivity Notice Banner */}
      {(searchParams.get("reason") === "idle_timeout" || searchParams.get("reason") === "timeout") && !errorMessage && (
        <div className="w-full mt-5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-amber-600 dark:text-amber-400 text-xs text-left animate-in fade-in duration-200">
          <Timer className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
          <div className="flex-1 leading-relaxed">
            <span className="font-semibold">Session Paused:</span> You were signed out after 30 minutes of background inactivity. Sign in to resume your active session.
          </div>
        </div>
      )}

      {/* Highlighted Need Access Dynamic Callout Card — ONLY rendered dynamically on unapproved login or when requested */}
      {showDynamicAccessPrompt && (
        <div className="w-full mt-6 p-4 rounded-2xl bg-gradient-to-br from-blue-500/10 via-indigo-500/10 to-purple-500/10 border-2 border-blue-500/35 dark:border-blue-500/45 text-left relative overflow-hidden shadow-sm hover:border-blue-500/60 transition-all duration-300 animate-in fade-in zoom-in-95 group">
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-blue-500/15 rounded-full blur-xl pointer-events-none group-hover:bg-blue-500/25 transition-colors" />

          <div className="flex items-start gap-3 relative z-10">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4 text-blue-500 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-foreground">Need Access to Upload?</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 animate-pulse">
                    Approval Required
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowDynamicAccessPrompt(false)}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition cursor-pointer"
                    aria-label="Dismiss callout"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-[11.5px] text-muted-foreground mt-1 leading-relaxed">
                GPHosting is private. You need an approved account or invite PIN before uploading files.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all shadow-xs cursor-pointer group/btn"
                >
                  <span>Request Access</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform" />
                </button>
                <button
                  type="button"
                  onClick={() => handleGoogleLogin("/access-gate?tab=pin")}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-muted/60 hover:bg-muted text-foreground text-xs font-medium border border-border/70 transition-colors cursor-pointer"
                >
                  <KeyRound className="w-3 h-3 text-purple-500" />
                  <span>Enter PIN</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Existing Active Session Dynamic Card — Allows instant clean logout back to landing page */}
      {currentUserEmail && (
        <div className="w-full mt-5 p-3 rounded-2xl bg-card border border-border/80 flex items-center justify-between gap-3 text-xs text-left shadow-2xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
            <div className="min-w-0">
              <span className="text-[10.5px] text-muted-foreground block truncate">Active session:</span>
              <span className="font-semibold text-foreground truncate block text-xs">
                {currentUserEmail}
              </span>
            </div>
          </div>
          <LogoutButton
            variant="outline"
            userEmail={currentUserEmail}
            label="Sign Out"
            redirectTo="/"
            className="h-8 text-xs px-2.5 rounded-xl shrink-0"
          />
        </div>
      )}

      {/* Primary Google Login Section */}
      <div className="w-full mt-6 space-y-3">
        <button
          type="button"
          id="google-login-btn"
          onClick={() => handleGoogleLogin()}
          disabled={loading}
          className="relative group w-full h-12 px-4 rounded-xl bg-foreground text-background font-semibold text-sm flex items-center justify-center gap-3 transition-all duration-200 shadow-sm hover:shadow-md hover:opacity-95 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer overflow-hidden"
        >
          {/* Hover sheen effect */}
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

          {loading ? (
            <div className="flex items-center gap-2">
              <svg
                className="animate-spin w-4 h-4 text-background shrink-0"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Connecting to Google...</span>
            </div>
          ) : (
            <>
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
              <ArrowRight className="w-4 h-4 ml-auto text-background/60 transition-transform duration-200 group-hover:translate-x-1" />
            </>
          )}
        </button>

        {loading && (
          <div className="flex items-center justify-center gap-1.5 pt-1 text-xs text-muted-foreground animate-in fade-in duration-200">
            <span>Taking longer than expected?</span>
            <button
              type="button"
              onClick={resetState}
              className="font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer transition-colors inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Cancel &amp; Try Again</span>
            </button>
          </div>
        )}

        {/* Clear prompt for users without account */}
        <p className="text-xs text-muted-foreground pt-1">
          Don&apos;t have an approved account yet?{" "}
          <button
            type="button"
            onClick={() => setShowRequestModal(true)}
            className="text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
          >
            <span>Request Access</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </p>
      </div>

      {/* Terms Disclaimer */}
      <div className="mt-4 space-y-2">
        <p className="text-[11px] text-muted-foreground/70">
          By signing in, you agree to our Terms and Privacy Policy.
        </p>
      </div>

      {/* Request Access Interactive Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-5 text-left text-foreground relative">
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setShowRequestModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Modal Header */}
            <div className="flex items-start gap-3.5 pr-6">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold tracking-tight text-foreground">
                  Request Account Access
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Get approved to start uploading and sharing files
                </p>
              </div>
            </div>

            {/* Explanation box */}
            <div className="p-3.5 rounded-xl bg-muted/50 border border-border/80 text-xs text-muted-foreground space-y-2 leading-relaxed">
              <p>
                GPHosting accounts are private to keep uploads ultra-fast and spam-free for everyone. Getting access is quick and easy:
              </p>
              <div className="flex items-center gap-2 text-foreground font-medium pt-1">
                <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span>2 simple steps to get started:</span>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 pl-1 text-[11.5px]">
                <li>Sign in with your Google account so we can verify your email.</li>
                <li>Enter an invite PIN for instant access, or send a quick note to get approved.</li>
              </ol>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={() => handleGoogleLogin("/access-gate?tab=request")}
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-foreground text-background font-semibold text-xs flex items-center justify-center gap-2.5 transition-all shadow-md hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-background border-t-transparent rounded-full animate-spin" />
                    <span>Connecting to Google...</span>
                  </div>
                ) : (
                  <>
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Continue with Google to Request Access</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-auto" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleGoogleLogin("/access-gate?tab=pin")}
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl border border-border bg-muted/40 hover:bg-muted text-foreground font-medium text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5 text-purple-500" />
                <span>Have an Invitation PIN? Redeem Code</span>
              </button>
            </div>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setShowRequestModal(false)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Back to Sign In
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="h-screen max-h-screen w-screen max-w-full overflow-hidden flex flex-col bg-background text-foreground relative">
      {/* Main Split Section: Takes all available height except footer */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden relative">
        {/* Left Column: Edge-to-edge Showcase (Visible on lg+) */}
        <div className="hidden lg:flex lg:col-span-6 xl:col-span-7 h-full flex-col justify-between p-8 xl:p-12 2xl:p-16 border-r border-border/80 bg-muted/25 dark:bg-zinc-950/50 relative overflow-hidden">
          {/* Subtle dot/grid background */}
          <div
            className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none"
            aria-hidden="true"
          />

          {/* Ambient Gradient Glows */}
          <div
            className="absolute -top-20 -left-20 w-80 h-80 bg-blue-600/15 blur-[100px] rounded-full pointer-events-none"
            aria-hidden="true"
          />
          <div
            className="absolute -bottom-20 -right-20 w-80 h-80 bg-indigo-500/15 blur-[100px] rounded-full pointer-events-none"
            aria-hidden="true"
          />

          {/* Left Top Bar: Brand */}
          <div className="flex items-center gap-3 relative z-10">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-cyan-400 flex items-center justify-center text-white shadow-md shadow-blue-500/20 ring-1 ring-white/20 transition-transform duration-200 group-hover:scale-105 shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <span className="font-bold tracking-tight text-foreground text-sm">GPHosting</span>
            </Link>
          </div>

          {/* Left Center Content: Simple wording + Simple Lock Framework */}
          <div className="space-y-6 my-auto max-w-xl relative z-10 py-4">
            {/* Simple Headline & Subtitle */}
            <div className="space-y-2.5">
              <h1 className="text-3xl xl:text-4xl 2xl:text-5xl font-extrabold tracking-tight text-foreground leading-[1.15]">
                Private by design.{" "}
                <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500 bg-clip-text text-transparent">
                  Simple by default.
                </span>
              </h1>
              <p className="text-sm xl:text-base text-muted-foreground leading-relaxed">
                Send files up to 1 GB with secret passwords, auto-delete links, and complete privacy.
              </p>
            </div>

            {/* Simple Privacy & Smart Controls Card */}
            <div className="p-5 rounded-2xl bg-card/75 border border-border/80 shadow-xl backdrop-blur-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <Lock className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-semibold text-foreground tracking-tight">
                    Built-In Privacy &amp; Protection
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Always Active
                </span>
              </div>

              {/* 3 Simple Lock Steps */}
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-blue-500 shrink-0 mt-0.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground">Private by Default</div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Your files stay 100% private. Only you and the people you share with can open them.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-indigo-500 shrink-0 mt-0.5">
                    <KeyRound className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground">Password &amp; PIN Locks</div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Protect any link with a secret password or 4-digit PIN so only your chosen person can open it.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-purple-500 shrink-0 mt-0.5">
                    <Timer className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground">Self-Destructing Links</div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Links automatically delete forever after 1 download or when your timer runs out.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Left subtle brand note */}
          <div className="text-xs text-muted-foreground max-w-xl relative z-10 flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-blue-500" />
            <span>Fast, private &amp; secure file sharing</span>
          </div>
        </div>

        {/* Right Column: Edge-to-edge Auth Panel */}
        <div className="lg:col-span-6 xl:col-span-5 h-full flex flex-col justify-between p-8 xl:p-14 relative bg-background">
          {/* Top Action Row: Back to Home + Theme Toggle */}
          <div className="flex items-center justify-between w-full max-w-sm mx-auto">
            <Link
              href="/"
              aria-label="Return to GPHosting Homepage"
              className="group inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-border/80 bg-muted/40 hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground shadow-xs hover:shadow-sm backdrop-blur-md transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-transform duration-200 group-hover:-translate-x-1" />
              <span>Back to Home</span>
            </Link>
            <ThemeToggle className="shadow-xs rounded-full border-border/80" />
          </div>

          {/* Centered Auth Form */}
          <div className="my-auto w-full py-4">
            <Suspense
              fallback={
                <div className="w-full max-w-sm mx-auto animate-pulse flex flex-col items-center text-center">
                  <div className="w-13 h-13 rounded-2xl bg-muted mb-4" />
                  <div className="h-6 w-44 bg-muted rounded-md mb-2" />
                  <div className="h-4 w-56 bg-muted rounded-md mb-6" />
                  <div className="h-12 w-full bg-muted rounded-xl" />
                </div>
              }
            >
              <LoginForm />
            </Suspense>
          </div>

          {/* Spacer to keep vertical balance */}
          <div className="w-full max-w-sm mx-auto" />
        </div>
      </div>

      {/* Unified Full-Width Edge-to-Edge Footer Bar */}
      <footer className="h-13 border-t border-border/80 bg-card/60 dark:bg-zinc-950/60 backdrop-blur-md px-6 sm:px-8 lg:px-12 flex items-center justify-between text-xs text-muted-foreground shrink-0 z-20 transition-colors">
        {/* Left footer: Copyright */}
        <div>
          <span className="font-medium text-foreground/80">© {new Date().getFullYear()} GPHosting</span>
        </div>

        {/* Right footer: Legal & Access Links */}
        <div className="flex items-center gap-4 sm:gap-6 font-medium">
          <Link href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
            Terms of Service
          </Link>
          <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
          <Link href="/developers" target="_blank" rel="noopener noreferrer" className="hidden md:inline hover:text-foreground transition-colors">
            How to Use
          </Link>
        </div>
      </footer>
    </div>
  );
}
