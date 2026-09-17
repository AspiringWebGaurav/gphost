import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser, getUserProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { LogoutButton } from "@/components/auth/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccessGateConsole } from "@/components/auth/access-gate-console";
import { BrandLogo } from "@/components/ui/brand-logo";
import { ShieldCheck, CheckCircle2, Lock, Clock, Shield } from "lucide-react";

export const dynamic = "force-dynamic";

interface AccessGatePageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function AccessGatePage({ searchParams }: AccessGatePageProps) {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  const profile = await getUserProfile(user.id);
  const status = profile?.status || "pending";

  if (status === "revoked") {
    redirect("/login?reason=revoked");
  }

  const params = await searchParams;
  const adminClient = createAdminClient();
  const nowIso = new Date().toISOString();

  // Check database for active unredeemed PIN, pending request, and approved request
  const [
    { data: activeIssuedPin },
    { data: existingPendingRequest },
    { data: latestApprovedRequest },
  ] = await Promise.all([
    user.email
      ? adminClient
          .from("onboarding_pins")
          .select("id")
          .eq("is_active", true)
          .ilike("label", `%User: ${user.email}%`)
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    adminClient
      .from("access_requests")
      .select("id, status, created_at, reason")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle(),
    adminClient
      .from("access_requests")
      .select("id, status, created_at, reviewed_at, rejection_reason")
      .eq("user_id", user.id)
      .eq("status", "approved")
      .order("reviewed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // If approved AND no pending unredeemed PIN exists, route to dashboard
  if (status === "approved" && !activeIssuedPin) {
    redirect("/dashboard");
  }

  const isApprovedByAdmin = !existingPendingRequest && (!!latestApprovedRequest || !!activeIssuedPin);
  const initialTab = isApprovedByAdmin ? "pin" : (params?.tab === "request" ? "request" : "pin");

  return (
    <div className="min-h-screen lg:h-screen lg:max-h-screen w-screen max-w-full lg:overflow-hidden flex flex-col bg-background text-foreground relative">
      {/* Main Split Section */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 lg:overflow-hidden relative">
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
            <BrandLogo size="sm" />
            <span className="text-muted-foreground/40">/</span>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
              <ShieldCheck className="w-3 h-3" />
              <span>Identity Gate</span>
            </div>
          </div>

          {/* Left Center Content: Status & Workflow Context */}
          <div className="space-y-6 my-auto max-w-xl relative z-10 py-4">
            <div className="space-y-2.5">
              <h1 className="text-3xl xl:text-4xl 2xl:text-5xl font-extrabold tracking-tight text-foreground leading-[1.15]">
                Account Verification.{" "}
                <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500 bg-clip-text text-transparent">
                  Access Required.
                </span>
              </h1>
              <p className="text-sm xl:text-base text-muted-foreground leading-relaxed">
                Your Google identity is authenticated. Enter a 4-digit invitation PIN to unlock your encrypted file vault immediately, or submit a request for manual review.
              </p>
            </div>

            {/* 3-Step Verification Progress Card */}
            <div className="p-5 rounded-2xl bg-card/75 border border-border/80 shadow-xl backdrop-blur-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <Lock className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-semibold text-foreground tracking-tight">
                    Onboarding Verification Status
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Action Required
                </span>
              </div>

              {/* Progress Steps */}
              <div className="space-y-3">
                {/* Step 1: Complete */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground">Google Identity Verified</div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Authenticated as <span className="font-mono text-foreground font-medium">{user.email}</span>
                    </p>
                  </div>
                </div>

                {/* Step 2: In Progress */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground">Onboarding PIN Authorization</div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Enter 4-digit invitation PIN or submit request for account clearance.
                    </p>
                  </div>
                </div>

                {/* Step 3: Locked */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-md bg-muted text-muted-foreground flex items-center justify-center shrink-0 mt-0.5">
                    <Shield className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground">Cloudflare R2 Encrypted Vault</div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Unlocks full upload privileges, password locks, and auto-destruct links.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Left subtle footer info */}
          <div className="text-xs text-muted-foreground max-w-xl relative z-10 flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-blue-500" />
            <span>Argon2id Salted PIN Security • Protected by Cloudflare Turnstile</span>
          </div>
        </div>

        {/* Right Column: Edge-to-edge Interactive Console */}
        <div className="lg:col-span-6 xl:col-span-5 h-full flex flex-col justify-between p-6 sm:p-8 xl:p-14 relative bg-background overflow-y-auto lg:overflow-hidden">
          {/* Top Header Row: User info, Theme, Sign Out */}
          <div className="flex items-center justify-between w-full max-w-md mx-auto pb-4">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
              <span className="text-xs text-muted-foreground truncate font-medium">
                {user.email}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <ThemeToggle className="shadow-xs rounded-xl border-border/80" />
              <LogoutButton variant="outline" className="h-8 text-xs px-2.5 rounded-xl" />
            </div>
          </div>

          {/* Centered Interactive Console */}
          <div className="my-auto w-full py-2">
            <AccessGateConsole
              userEmail={user.email || ""}
              hasExistingPendingRequest={!!existingPendingRequest}
              existingRequestReason={existingPendingRequest?.reason}
              existingRequestDate={existingPendingRequest?.created_at}
              isApprovedByAdmin={isApprovedByAdmin}
              approvalDecision={latestApprovedRequest?.rejection_reason}
              status={status as "pending" | "rejected" | "revoked"}
              initialTab={initialTab}
              adminContactEmail={process.env.ADMIN_EMAIL || "support@gphost.eu.cc"}
            />
          </div>

          {/* Spacer to keep vertical balance */}
          <div className="w-full max-w-md mx-auto hidden lg:block" />
        </div>
      </div>

      {/* Unified Full-Width Edge-to-Edge Footer Bar */}
      <footer className="h-13 border-t border-border/80 bg-card/60 dark:bg-zinc-950/60 backdrop-blur-md px-6 sm:px-8 lg:px-12 flex items-center justify-between text-xs text-muted-foreground shrink-0 z-20 transition-colors">
        <div>
          <span className="font-medium text-foreground/80">
            &copy; {new Date().getFullYear()} GPHosting (Gaurav Patil Hosting)
          </span>
        </div>

        <div className="flex items-center gap-4 sm:gap-6 font-medium">
          <Link href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
            Terms of Service
          </Link>
          <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
          <Link href="/developers" target="_blank" rel="noopener noreferrer" className="hidden sm:inline hover:text-foreground transition-colors">
            How to Use
          </Link>
        </div>
      </footer>
    </div>
  );
}
