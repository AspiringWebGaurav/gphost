import Link from "next/link";
import { getAuthenticatedUser, getUserProfile } from "@/lib/auth/session";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/auth/logout-button";
import {
  Zap,
  Lock,
  Globe,
  ArrowRight,
  HelpCircle,
  CheckCircle2,
  UploadCloud,
} from "lucide-react";
import { BackToTop } from "@/components/ui/back-to-top";
import { BrandLogo, BrandLogoSymbol } from "@/components/ui/brand-logo";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getAuthenticatedUser();
  const profile = user ? await getUserProfile(user.id) : null;
  const isApproved = profile?.status === "approved";
  const isAdmin = profile?.role === "admin";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased transition-colors duration-200 selection:bg-blue-500/20 selection:text-blue-500">
      {/* Top Navbar */}
      <header className="h-16 border-b border-border/80 bg-background/80 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-50 transition-colors duration-200">
        <div className="flex items-center gap-3">
          <BrandLogo size="md" />
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground font-medium">
          {user && isApproved ? (
            <>
              <Link href="/dashboard" className="text-foreground font-semibold hover:text-blue-500 transition-colors">
                Dashboard
              </Link>
              <Link href="/upload" className="hover:text-foreground transition-colors">
                Upload
              </Link>
              {isAdmin && (
                <Link href="/admin" className="text-purple-600 dark:text-purple-400 font-semibold hover:opacity-80 transition-opacity">
                  Admin Panel
                </Link>
              )}
            </>
          ) : (
            <>
              <Link href="#features" className="hover:text-foreground transition-colors duration-150">
                Features
              </Link>
              <Link href="/developers" className="hover:text-foreground transition-colors duration-150">
                How it Works
              </Link>
            </>
          )}
          <Link href="/privacy" className="hover:text-foreground transition-colors duration-150">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground transition-colors duration-150">
            Terms
          </Link>
        </nav>

        <div className="flex items-center gap-2.5">
          {user ? (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted/60 text-xs text-muted-foreground font-medium border border-border">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                <span className="truncate max-w-[150px]">{profile?.full_name || user.email}</span>
              </span>
              <Link
                href={isApproved ? (isAdmin ? "/admin" : "/dashboard") : "/access-gate"}
                className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-semibold bg-foreground text-background hover:opacity-90 transition-opacity shadow-sm shrink-0"
              >
                <span>{isAdmin ? "Admin" : "Dashboard"}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <LogoutButton variant="outline" className="hidden sm:inline-flex h-9 text-xs" />
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-4 h-9 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-sm shadow-blue-500/20 transition-all duration-200 shrink-0"
            >
              <span>Sign In</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}

          {/* Theme Toggle */}
          <ThemeToggle />
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="relative pt-20 sm:pt-28 pb-20 px-6 max-w-6xl mx-auto text-center flex flex-col items-center overflow-hidden">
          {/* Ambient Lighting Background */}
          <div
            className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] sm:w-[850px] h-[350px] sm:h-[450px] bg-gradient-to-tr from-blue-600/20 via-indigo-500/15 to-purple-600/10 blur-[130px] pointer-events-none -z-10 dark:block hidden rounded-full"
            aria-hidden="true"
          />
          <div
            className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] sm:w-[700px] h-[300px] bg-gradient-to-tr from-blue-100/70 via-indigo-50/50 to-transparent blur-[100px] pointer-events-none -z-10 dark:hidden block rounded-full"
            aria-hidden="true"
          />

          {user && isApproved ? (
            <>
              {/* Active Session Status Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium mb-6">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Active Session • 30m Auto-Renewing Window</span>
              </div>

              {/* Dynamic Welcome Heading */}
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground max-w-4xl leading-[1.12] mb-6">
                Welcome back,{" "}
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 dark:from-blue-400 dark:via-indigo-300 dark:to-cyan-300">
                  {profile?.full_name || user.email?.split("@")[0] || "User"}
                </span>
              </h1>

              {/* Dynamic Subtitle */}
              <p className="text-base sm:text-lg text-muted-foreground max-w-2xl leading-relaxed mb-10">
                Your direct storage and secure share links are ready. Your session is active and automatically renews with each action.
              </p>

              {/* Dynamic Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3.5 w-full sm:w-auto">
                <Link
                  href={isAdmin ? "/admin" : "/dashboard"}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 h-12 rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90 shadow-sm transition-all duration-150 shrink-0"
                >
                  <span>{isAdmin ? "Enter Admin Center" : "Open Dashboard"}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>

                <Link
                  href="/upload"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 h-12 rounded-xl text-sm font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-sm shadow-blue-500/20 transition-all duration-150 shrink-0"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>Upload File</span>
                </Link>
              </div>
            </>
          ) : (
            <>
              {/* Headline in simple, clear words */}
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground max-w-4xl leading-[1.12] mb-6">
                Fast, private file sharing.{" "}
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 dark:from-blue-400 dark:via-indigo-300 dark:to-cyan-300">
                  Without the middleman.
                </span>
              </h1>

              {/* Subtitle in simple, clear words */}
              <p className="text-base sm:text-lg text-muted-foreground max-w-2xl leading-relaxed mb-10">
                Upload files up to 1 GB in seconds. Share them with self-destructing links, password protection, and automatic expiration. No tracking, no hassle.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3.5 w-full sm:w-auto">
                <Link
                  href={user ? "/access-gate" : "/login"}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 h-12 rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90 shadow-sm transition-all duration-150 shrink-0"
                >
                  <span>{user ? "View Access Status" : "Start Sharing Free"}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>

                <Link
                  href="/developers"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 h-12 rounded-xl text-sm font-medium bg-muted/60 hover:bg-muted text-foreground border border-border transition-colors duration-150 shrink-0"
                >
                  <HelpCircle className="w-4 h-4 text-muted-foreground" />
                  <span>How it Works</span>
                </Link>
              </div>
            </>
          )}

          {/* Metrics Row */}
          <div className="mt-16 pt-10 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-6 text-left max-w-4xl w-full">
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">5 GB</div>
              <div className="text-xs text-muted-foreground mt-1">Free Storage</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">1 GB</div>
              <div className="text-xs text-muted-foreground mt-1">Max File Size</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Direct</div>
              <div className="text-xs text-muted-foreground mt-1">Fast Uploads</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Protected</div>
              <div className="text-xs text-muted-foreground mt-1">Password &amp; Burn Links</div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-20 px-6 max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-3">
              Everything you need to share files safely
            </h2>
            <p className="text-sm text-muted-foreground">
              Built to be fast, simple, and keep you in complete control of your files.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="p-6 rounded-2xl bg-card border border-border shadow-xs hover:border-zinc-400/40 dark:hover:border-zinc-700/80 transition-all duration-200 flex flex-col justify-between group">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-5 shrink-0 transition-transform duration-200 group-hover:scale-105">
                  <Zap className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-card-foreground mb-2">Direct Uploads</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Files upload directly from your browser to storage. No middleman server slows down your upload or looks at your data.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                <span>Fast &amp; reliable uploads</span>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="p-6 rounded-2xl bg-card border border-border shadow-xs hover:border-zinc-400/40 dark:hover:border-zinc-700/80 transition-all duration-200 flex flex-col justify-between group">
              <div>
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-5 shrink-0 transition-transform duration-200 group-hover:scale-105">
                  <Lock className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-card-foreground mb-2">Self-Destructing Links</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Create links that delete automatically after they are downloaded once. Perfect for sending sensitive files to one person.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                <span>Deletes after 1 download</span>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="p-6 rounded-2xl bg-card border border-border shadow-xs hover:border-zinc-400/40 dark:hover:border-zinc-700/80 transition-all duration-200 flex flex-col justify-between group">
              <div>
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center mb-5 shrink-0 transition-transform duration-200 group-hover:scale-105">
                  <Globe className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-card-foreground mb-2">Short &amp; Clean Links</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Create short, easy-to-share links with one click. Clean, simple, and ready to send to anyone via chat or email.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                <span>Short, clean URLs</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/80 bg-muted/30 py-6 px-6 transition-colors">
        <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4 pb-10 sm:pb-0">
          <div className="flex items-center gap-3">
            <BrandLogoSymbol size="xs" glow={false} />
            <span className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} GPHosting (Gaurav Patil Hosting). All rights reserved.
            </span>
          </div>

          <div className="flex items-center gap-6 text-xs text-muted-foreground font-medium">
            <Link
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Terms of Service
            </Link>
            <Link
              href="/developers"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              How it Works
            </Link>
          </div>
        </div>
      </footer>

      {/* Floating Back to top button */}
      <BackToTop />
    </div>
  );
}
