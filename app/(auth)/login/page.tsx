"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme-toggle";
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
} from "lucide-react";

function LoginForm() {
  const searchParams = useSearchParams();
  const rawError = searchParams.get("error");
  const next = searchParams.get("next") || "/dashboard";

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(rawError);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);

      const supabase = createClient();
      const redirectOrigin = window.location.origin;
      const callbackUrl = new URL("/auth/callback", redirectOrigin);
      if (next && next.startsWith("/")) {
        callbackUrl.searchParams.set("next", next);
      }

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
        setErrorMessage(error.message);
        setLoading(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initiate login";
      setErrorMessage(msg);
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col items-center text-center">
      {/* Brand Header */}
      <div className="relative mb-4 group">
        <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-cyan-400 flex items-center justify-center text-white shadow-xl shadow-blue-500/30 ring-1 ring-white/25 transition-transform duration-300 group-hover:scale-105">
          <Layers className="w-6 h-6" />
        </div>
        <div className="absolute -inset-2 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-500 blur-lg -z-10 opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
        Welcome to GPHosting
      </h1>
      <p className="text-xs sm:text-sm text-muted-foreground mt-2 max-w-xs leading-relaxed">
        Fast, simple &amp; secure file sharing with zero third-party telemetry.
      </p>

      {/* Error Banner */}
      {errorMessage && (
        <div className="w-full mt-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-start gap-2.5 text-rose-600 dark:text-rose-400 text-xs text-left animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed">
            <span className="font-semibold">Error:</span> {errorMessage}
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-500/70 hover:text-rose-600 dark:hover:text-rose-300 font-medium cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Primary Google Login Button */}
      <div className="w-full mt-7 space-y-3">
        <button
          type="button"
          id="google-login-btn"
          onClick={handleGoogleLogin}
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
      </div>

      {/* Onboarding Link & Disclaimer */}
      <div className="mt-6 space-y-2">
        <div className="text-xs text-muted-foreground">
          Don&apos;t have an approved account yet?{" "}
          <Link
            href="/request-access"
            className="font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 transition-colors"
          >
            <span>Request Access</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <p className="text-[11px] text-muted-foreground/60">
          By signing in, you agree to our Terms and Privacy Policy.
        </p>
      </div>
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
                  Secure by default.
                </span>
              </h1>
              <p className="text-sm xl:text-base text-muted-foreground leading-relaxed">
                Fast, encrypted file sharing with custom access locks and disappearing links.
              </p>
            </div>

            {/* Simple Lock Framework Card */}
            <div className="p-5 rounded-2xl bg-card/75 border border-border/80 shadow-xl backdrop-blur-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <Lock className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-semibold text-foreground tracking-tight">
                    Security &amp; Lock Framework
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </span>
              </div>

              {/* 3 Simple Lock Steps */}
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-blue-500 shrink-0 mt-0.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground">Client Encryption</div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Files are encrypted on transfer. No one else can read your files.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-indigo-500 shrink-0 mt-0.5">
                    <KeyRound className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground">Access PIN &amp; Password Lock</div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Secure any shared link with single-use pins or private passwords.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-purple-500 shrink-0 mt-0.5">
                    <Timer className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground">Auto-Destruct &amp; Expiry</div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Links automatically expire and delete after your set download limit.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Left subtle brand note */}
          <div className="text-xs text-muted-foreground max-w-xl relative z-10 flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-blue-500" />
            <span>Encrypted cloud architecture powered by Cloudflare R2</span>
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
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Terms of Service
          </Link>
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
          <Link href="/developers" className="hidden md:inline hover:text-foreground transition-colors">
            API &amp; Docs
          </Link>
        </div>
      </footer>
    </div>
  );
}
