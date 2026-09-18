import Link from "next/link";
import { getAuthenticatedUser, getUserProfile } from "@/lib/auth/session";
import { LandingNavbar } from "@/components/home/landing-navbar";
import {
  Zap,
  Lock,
  Globe,
  ArrowRight,
  HelpCircle,
  CheckCircle2,
  UploadCloud,
  Sparkles,
  Share2,
  Flame,
  Clock,
  Activity,
  ShieldCheck,
  Terminal,
  HardDrive,
  FileText,
  LayoutDashboard,
} from "lucide-react";
import { BackToTop } from "@/components/ui/back-to-top";
import { BrandLogoSymbol } from "@/components/ui/brand-logo";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getAuthenticatedUser();
  const profile = user ? await getUserProfile(user.id) : null;
  const isApproved = profile?.status === "approved";
  const isAdmin = profile?.role === "admin";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased transition-colors duration-200 selection:bg-blue-500/20 selection:text-blue-500 relative">
      {/* Seamless Document-Wide Background Engine */}
      <div 
        className="absolute inset-0 pointer-events-none z-0 overflow-hidden" 
        aria-hidden="true"
      >
        {/* Subtle Technical Blueprint Grid spanning full document */}
        <div className="absolute inset-0 bg-grid-pattern opacity-50 dark:opacity-25" />

        {/* Outer Left Flank Aurora Orb (Hero) */}
        <div className="absolute top-[4%] -left-28 sm:-left-36 w-[320px] sm:w-[650px] h-[320px] sm:h-[550px] bg-gradient-to-tr from-blue-500/20 via-cyan-400/15 to-indigo-500/10 rounded-full blur-[90px] sm:blur-[130px] dark:from-blue-600/15 dark:via-cyan-500/10 dark:to-indigo-500/10 animate-blob-1" />

        {/* Outer Right Flank Aurora Orb (Hero) */}
        <div className="absolute top-[12%] -right-28 sm:-right-36 w-[320px] sm:w-[650px] h-[320px] sm:h-[550px] bg-gradient-to-bl from-indigo-500/20 via-purple-500/15 to-pink-500/10 rounded-full blur-[90px] sm:blur-[130px] dark:from-indigo-600/15 dark:via-purple-600/10 dark:to-pink-600/10 animate-blob-2" />

        {/* Outer Left Flank Aurora Orb (Features) */}
        <div className="absolute top-[48%] -left-28 sm:-left-36 w-[320px] sm:w-[650px] h-[320px] sm:h-[550px] bg-gradient-to-tr from-teal-500/15 via-blue-500/15 to-indigo-500/10 rounded-full blur-[90px] sm:blur-[130px] dark:from-teal-600/15 dark:via-blue-600/10 dark:to-indigo-600/10 animate-blob-3" />

        {/* Outer Right Flank Aurora Orb (Features/CTA) */}
        <div className="absolute top-[68%] -right-28 sm:-right-36 w-[320px] sm:w-[650px] h-[320px] sm:h-[550px] bg-gradient-to-bl from-blue-500/15 via-indigo-500/15 to-purple-500/10 rounded-full blur-[90px] sm:blur-[130px] dark:from-blue-600/15 dark:via-indigo-600/10 dark:to-purple-600/10 animate-blob-1" />

        {/* Ambient Bottom Glow */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[850px] h-[250px] sm:h-[300px] bg-gradient-to-t from-blue-500/8 via-indigo-500/5 to-transparent blur-[110px] sm:blur-[140px]" />
      </div>

      {/* Dynamic Scroll-Responsive Navbar (Aceternity UI Style) */}
      <LandingNavbar
        user={user ? { id: user.id, email: user.email } : null}
        profile={profile ? { full_name: profile.full_name, role: profile.role, status: profile.status } : null}
        isApproved={Boolean(isApproved)}
        isAdmin={Boolean(isAdmin)}
      />

      {/* Hero Section - Fills full first viewport till screen bottom */}
      <main className="flex-1 relative z-10">
        <section className="relative min-h-[calc(100dvh-3.5rem)] md:min-h-[calc(100dvh-4rem)] pt-4 sm:pt-10 pb-8 sm:pb-10 px-4 sm:px-6 max-w-5xl mx-auto text-center flex flex-col justify-between items-center">
          <div className="w-full flex-1 flex flex-col justify-center items-center my-auto">
            {user && isApproved ? (
            <>
              {/* Dynamic Welcome Heading */}
              <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground max-w-3xl leading-[1.14] sm:leading-[1.12] mb-3 sm:mb-3.5">
                Welcome back,{" "}
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 dark:from-blue-400 dark:via-indigo-300 dark:to-cyan-300">
                  {profile?.full_name || user.email?.split("@")[0] || "User"}
                </span>
              </h1>

              {/* Dynamic Subtitle */}
              <p className="text-xs sm:text-base text-muted-foreground max-w-xl leading-relaxed mb-5 sm:mb-6">
                Your direct storage and secure share links are ready. Your session is active and automatically renews with each action.
              </p>

              {/* Dynamic Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-2.5 sm:gap-3 w-full sm:w-auto mb-6">
                <Link
                  href="/dashboard"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 h-10 rounded-xl text-xs sm:text-sm font-semibold bg-foreground text-background hover:opacity-90 shadow-sm transition-all duration-150 shrink-0"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Go to Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>

                <Link
                  href="/upload"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 h-10 rounded-xl text-xs sm:text-sm font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-sm shadow-blue-500/20 transition-all duration-150 shrink-0"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>Upload File</span>
                </Link>
              </div>
            </>
          ) : (
            <>
              {/* Headline in compact, clear words */}
              <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground max-w-3xl leading-[1.14] sm:leading-[1.12] mb-3 sm:mb-3.5">
                Upload files in seconds.{" "}
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 dark:from-blue-400 dark:via-indigo-300 dark:to-cyan-300">
                  Share with smart link tools.
                </span>
              </h1>

              {/* Subtitle */}
              <p className="text-xs sm:text-base text-muted-foreground max-w-xl leading-relaxed mb-5 sm:mb-6">
                Fast, direct uploads up to 1 GB. Get instant share links, direct CDN hotlinking, password protection, self-destructing links, and live download analytics.
              </p>

              {/* Action Buttons (Directly below subtitle for instant 1-screen landing) */}
              <div className="flex flex-col sm:flex-row items-center gap-2.5 sm:gap-3 w-full sm:w-auto mb-6 sm:mb-7">
                <Link
                  href={user ? "/access-gate" : "/login"}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 h-10 sm:h-11 rounded-xl text-xs sm:text-sm font-semibold bg-foreground text-background hover:opacity-90 shadow-sm transition-all duration-150 shrink-0"
                >
                  <span>{user ? "View Access Status" : "Start Sharing Free"}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>

                <Link
                  href="/developers"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 h-10 sm:h-11 rounded-xl text-xs sm:text-sm font-medium bg-muted/60 hover:bg-muted text-foreground border border-border transition-colors duration-150 shrink-0"
                >
                  <HelpCircle className="w-4 h-4 text-muted-foreground" />
                  <span>How to Use</span>
                </Link>
              </div>

              {/* What You Can Do After Uploading - Compact Desktop Single-Row Showcase */}
              <div className="w-full max-w-4xl mx-auto p-3 sm:p-3.5 rounded-2xl bg-card border border-border shadow-xs text-left">
                <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-border">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-foreground min-w-0">
                    <div className="p-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <span className="truncate">
                      <span className="hidden sm:inline">After You Upload: </span>Choose Link Superpowers
                    </span>
                  </div>
                  <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Ready in 1-Click
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                  {/* Service 1 */}
                  <div className="p-2 sm:p-2.5 rounded-xl bg-muted/40 border border-border/80 flex flex-col gap-1 hover:border-blue-500/40 transition-colors">
                    <div className="flex items-center gap-1.5 font-semibold text-foreground text-[11px] sm:text-xs">
                      <div className="p-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                        <Share2 className="w-3.5 h-3.5" />
                      </div>
                      <span className="truncate">Share Link</span>
                    </div>
                    <span className="text-muted-foreground text-[10px] leading-tight line-clamp-2">Preview pages for chat &amp; socials</span>
                  </div>

                  {/* Service 2 */}
                  <div className="p-2 sm:p-2.5 rounded-xl bg-muted/40 border border-border/80 flex flex-col gap-1 hover:border-indigo-500/40 transition-colors">
                    <div className="flex items-center gap-1.5 font-semibold text-foreground text-[11px] sm:text-xs">
                      <div className="p-1 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
                        <Globe className="w-3.5 h-3.5" />
                      </div>
                      <span className="truncate">Raw CDN</span>
                    </div>
                    <span className="text-muted-foreground text-[10px] leading-tight line-clamp-2">Direct hotlinks for web &amp; markdown</span>
                  </div>

                  {/* Service 3 */}
                  <div className="p-2 sm:p-2.5 rounded-xl bg-muted/40 border border-border/80 flex flex-col gap-1 hover:border-amber-500/40 transition-colors">
                    <div className="flex items-center gap-1.5 font-semibold text-foreground text-[11px] sm:text-xs">
                      <div className="p-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                        <Flame className="w-3.5 h-3.5" />
                      </div>
                      <span className="truncate">Burn Link</span>
                    </div>
                    <span className="text-muted-foreground text-[10px] leading-tight line-clamp-2">Self-destructs after 1 download</span>
                  </div>

                  {/* Service 4 */}
                  <div className="p-2 sm:p-2.5 rounded-xl bg-muted/40 border border-border/80 flex flex-col gap-1 hover:border-rose-500/40 transition-colors">
                    <div className="flex items-center gap-1.5 font-semibold text-foreground text-[11px] sm:text-xs">
                      <div className="p-1 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 shrink-0">
                        <Lock className="w-3.5 h-3.5" />
                      </div>
                      <span className="truncate">Password</span>
                    </div>
                    <span className="text-muted-foreground text-[10px] leading-tight line-clamp-2">Custom PIN or passphrase lock</span>
                  </div>

                  {/* Service 5 */}
                  <div className="p-2 sm:p-2.5 rounded-xl bg-muted/40 border border-border/80 flex flex-col gap-1 hover:border-purple-500/40 transition-colors">
                    <div className="flex items-center gap-1.5 font-semibold text-foreground text-[11px] sm:text-xs">
                      <div className="p-1 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 shrink-0">
                        <Clock className="w-3.5 h-3.5" />
                      </div>
                      <span className="truncate">Auto-Expiry</span>
                    </div>
                    <span className="text-muted-foreground text-[10px] leading-tight line-clamp-2">Expires in 10m, 1h, 1d, 7d, 30d</span>
                  </div>

                  {/* Service 6 */}
                  <div className="p-2 sm:p-2.5 rounded-xl bg-muted/40 border border-border/80 flex flex-col gap-1 hover:border-emerald-500/40 transition-colors">
                    <div className="flex items-center gap-1.5 font-semibold text-foreground text-[11px] sm:text-xs">
                      <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                        <Activity className="w-3.5 h-3.5" />
                      </div>
                      <span className="truncate">Live Stats</span>
                    </div>
                    <span className="text-muted-foreground text-[10px] leading-tight line-clamp-2">Real-time views &amp; geo telemetry</span>
                  </div>
                </div>
              </div>
            </>
          )}
          </div>

          {/* Metrics Row - Anchored at the bottom of the first viewport */}
          <div className="mt-6 sm:mt-auto pt-4 sm:pt-5 pb-2 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-4 text-left max-w-3xl w-full shrink-0">
            <div>
              <div className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">5 GB</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Free Storage</div>
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">1 GB</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Max File Size</div>
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Instant</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Share &amp; Raw CDN Links</div>
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Smart</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Burn &amp; Password Controls</div>
            </div>
          </div>
        </section>

        {/* Features Section - World-Class Bento Grid Showcase */}
        <section id="features" className="py-14 sm:py-20 px-4 sm:px-6 max-w-6xl mx-auto">
          {/* Section Kicker & Title */}
          <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-semibold uppercase tracking-wider mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Next-Gen File Hosting &amp; Link Superpowers</span>
            </div>
            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground mb-3 sm:mb-4">
              Engineered for pure speed.{" "}
              <br className="hidden sm:inline" />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 dark:from-blue-400 dark:via-indigo-300 dark:to-cyan-300">
                Built for total link control.
              </span>
            </h2>
            <p className="text-sm sm:text-lg text-muted-foreground leading-relaxed">
              Direct edge cloud ingestion up to 1 GB without middleman bottlenecks. Instant preview pages, raw CDN streaming, burn links, and zero-trust encryption in one cohesive platform.
            </p>
          </div>

          {/* Bento Grid Architecture */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">

            {/* Bento Card 1: Fast Direct Uploads Studio (2 Cols on Desktop) */}
            <div className="lg:col-span-2 p-5 sm:p-7 rounded-2xl sm:rounded-3xl bg-gradient-to-b from-card via-card/90 to-muted/20 border border-border/80 shadow-xs hover:border-blue-500/40 hover:shadow-xl transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl pointer-events-none -z-10 group-hover:bg-blue-500/10 transition-colors" />

              <div>
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Zap className="w-5 h-5" />
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[11px] sm:text-xs font-semibold border border-blue-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    Direct S3 Presigned • 0 Server RAM
                  </span>
                </div>

                <h3 className="text-lg sm:text-2xl font-bold text-foreground mb-2">
                  Direct Ingestion to Cloudflare R2 Edge
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-xl mb-5 sm:mb-6">
                  Upload large files up to 1 GB with zero gateway bottlenecks. Your browser streams directly to edge storage buckets with automated multi-part chunking.
                </p>

                {/* Interactive File Ingestion Studio Mockup */}
                <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-background/80 border border-border/90 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <div className="flex items-center gap-2 sm:gap-2.5">
                      <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground truncate max-w-[140px] xs:max-w-[200px] sm:max-w-xs text-xs sm:text-sm">
                          master_cut_production_4k.mp4
                        </div>
                        <div className="text-[10px] sm:text-[11px] text-muted-foreground">842.6 MB • Video File</div>
                      </div>
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 sm:px-2.5 py-0.5 rounded-full shrink-0">
                      100% Ingested
                    </span>
                  </div>

                  {/* Gradient Progress Bar */}
                  <div className="w-full h-1.5 sm:h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 rounded-full" />
                  </div>

                  {/* Telemetry Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-1 text-[10px] sm:text-[11px] text-muted-foreground font-mono">
                    <span className="px-2 py-0.5 rounded-md bg-muted/60 border border-border">Speed: 64 MB/s</span>
                    <span className="px-2 py-0.5 rounded-md bg-muted/60 border border-border">Latency: 14ms</span>
                    <span className="px-2 py-0.5 rounded-md bg-muted/60 border border-border">Chunk 42/42 Verified</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 sm:mt-6 pt-3.5 sm:pt-4 border-t border-border flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Multi-part Chunking
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Direct Edge Ingestion
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  1 GB Max File Size
                </span>
              </div>
            </div>

            {/* Bento Card 2: Direct Raw CDN Links (1 Col on Desktop) */}
            <div className="p-5 sm:p-7 rounded-2xl sm:rounded-3xl bg-gradient-to-b from-card via-card/90 to-muted/20 border border-border/80 shadow-xs hover:border-cyan-500/40 hover:shadow-xl transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-60 h-60 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none -z-10 group-hover:bg-cyan-500/10 transition-colors" />

              <div>
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Globe className="w-5 h-5" />
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold border border-emerald-500/20 font-mono">
                    200 OK • HIT
                  </span>
                </div>

                <h3 className="text-lg sm:text-xl font-bold text-foreground mb-2">Direct Raw CDN</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-4 sm:mb-5">
                  Hotlink images, audio, video files, or raw code directly into your apps, websites, or markdown documents with pure asset streaming.
                </p>

                {/* Developer Terminal Snippet */}
                <div className="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl bg-muted/40 border border-border text-[11px] font-mono space-y-1.5 overflow-hidden">
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-2 pb-1.5 border-b border-border/60">
                    <Terminal className="w-3 h-3 text-cyan-500" />
                    <span>Edge CDN Header</span>
                  </div>
                  <div className="text-cyan-600 dark:text-cyan-400 truncate">GET /api/raw/hero-asset.webp</div>
                  <div className="text-muted-foreground text-[10px]">CF-Cache-Status: HIT (Edge POP)</div>
                  <div className="text-muted-foreground text-[10px]">Content-Type: image/webp</div>
                </div>
              </div>

              <div className="mt-5 sm:mt-6 pt-3.5 sm:pt-4 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>Zero wrapper, pure asset streaming</span>
              </div>
            </div>

            {/* Bento Card 3: Self-Destruct Burn Links (1 Col on Desktop) */}
            <div className="p-5 sm:p-7 rounded-2xl sm:rounded-3xl bg-gradient-to-b from-card via-card/90 to-muted/20 border border-border/80 shadow-xs hover:border-amber-500/40 hover:shadow-xl transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-60 h-60 bg-amber-500/5 rounded-full blur-3xl pointer-events-none -z-10 group-hover:bg-amber-500/10 transition-colors" />

              <div>
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Flame className="w-5 h-5" />
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-semibold border border-amber-500/20">
                    <Flame className="w-3 h-3" />
                    Burner Active
                  </span>
                </div>

                <h3 className="text-lg sm:text-xl font-bold text-foreground mb-2">Self-Destruct Burn Links</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-4 sm:mb-5">
                  Send confidential documents that permanently delete themselves after 1 download or 60 seconds after preview.
                </p>

                {/* Self-Destruct Mockup */}
                <div className="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-2 text-xs">
                  <div className="flex items-center justify-between font-semibold text-amber-600 dark:text-amber-400">
                    <span>Burn Policy</span>
                    <span className="font-mono text-[11px]">1 View Remaining</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Once downloaded, keys in Redis and R2 are permanently purged with zero digital trace.
                  </p>
                </div>
              </div>

              <div className="mt-5 sm:mt-6 pt-3.5 sm:pt-4 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>Single-use &amp; smart burner</span>
              </div>
            </div>

            {/* Bento Card 4: Password Protection & Zero-Trust (1 Col on Desktop) */}
            <div className="p-5 sm:p-7 rounded-2xl sm:rounded-3xl bg-gradient-to-b from-card via-card/90 to-muted/20 border border-border/80 shadow-xs hover:border-rose-500/40 hover:shadow-xl transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-60 h-60 bg-rose-500/5 rounded-full blur-3xl pointer-events-none -z-10 group-hover:bg-rose-500/10 transition-colors" />

              <div>
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Lock className="w-5 h-5" />
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-semibold border border-rose-500/20">
                    <ShieldCheck className="w-3 h-3" />
                    AES-GCM-256
                  </span>
                </div>

                <h3 className="text-lg sm:text-xl font-bold text-foreground mb-2">Password Protection</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-4 sm:mb-5">
                  Require a custom PIN or passphrase before anyone can view or download. Includes client-side zero-trust Web Crypto encryption.
                </p>

                {/* Password Mockup */}
                <div className="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl bg-background/80 border border-border/90 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                    <span>Protected File</span>
                    <span className="text-emerald-500 font-semibold flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Encrypted
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-muted/60 border border-border font-mono text-xs tracking-widest text-muted-foreground">
                    <span>•••• •••• ••••</span>
                    <span className="text-[10px] text-foreground font-sans tracking-normal font-semibold">Unlock</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 sm:mt-6 pt-3.5 sm:pt-4 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>Custom passphrases &amp; PINs</span>
              </div>
            </div>

            {/* Bento Card 5: Live Edge Analytics (1 Col on Desktop) */}
            <div className="p-5 sm:p-7 rounded-2xl sm:rounded-3xl bg-gradient-to-b from-card via-card/90 to-muted/20 border border-border/80 shadow-xs hover:border-emerald-500/40 hover:shadow-xl transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-60 h-60 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none -z-10 group-hover:bg-emerald-500/10 transition-colors" />

              <div>
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Activity className="w-5 h-5" />
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live Edge Telemetry
                  </span>
                </div>

                <h3 className="text-lg sm:text-xl font-bold text-foreground mb-2">Live Download Analytics</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-4 sm:mb-5">
                  Track download velocity, visitor country heatmaps, and referrer statistics powered by low-latency Redis hyperloglog counters.
                </p>

                {/* Telemetry Mockup */}
                <div className="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl bg-background/80 border border-border/90 space-y-2.5">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-base sm:text-lg font-bold text-foreground">1,842</div>
                      <div className="text-[10px] text-muted-foreground">Total Downloads</div>
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      +28% this week
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
                    <span className="px-1.5 py-0.5 rounded bg-muted/60">🇺🇸 US 46%</span>
                    <span className="px-1.5 py-0.5 rounded bg-muted/60">🇪🇺 EU 32%</span>
                    <span className="px-1.5 py-0.5 rounded bg-muted/60">🇮🇳 IN 18%</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 sm:mt-6 pt-3.5 sm:pt-4 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>View metrics &amp; geo telemetry</span>
              </div>
            </div>

            {/* Bento Card 6: Instant Share Links Showcase (Full 3-Column Banner on Desktop) */}
            <div className="lg:col-span-3 p-5 sm:p-8 md:p-9 rounded-2xl sm:rounded-3xl bg-gradient-to-b from-card via-card/95 to-muted/20 border border-border/80 shadow-xs hover:border-indigo-500/40 hover:shadow-xl transition-all duration-300 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 sm:gap-8 group relative overflow-hidden">
              <div className="absolute top-0 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none -z-10 group-hover:bg-indigo-500/10 transition-colors" />

              <div className="max-w-md">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4 sm:mb-5 shrink-0 group-hover:scale-105 transition-transform">
                  <Share2 className="w-5 h-5" />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-foreground mb-2.5 sm:mb-3">
                  Instant Share Links with Rich Media Previews
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-5 sm:mb-6">
                  Recipients never encounter forced ad redirects or confusing captchas. Clean, branded preview pages display video streaming, image galleries, audio players, and PDF viewers natively.
                </p>

                <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    Discord &amp; WhatsApp Cards
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    One-Click Quick Copy
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    Bundle ZIP Downloads
                  </span>
                </div>
              </div>

              {/* Realistic Share Link Preview Browser Window */}
              <div className="w-full md:w-auto md:min-w-[320px] lg:min-w-[340px] max-w-sm rounded-xl sm:rounded-2xl bg-background border border-border/90 shadow-xl p-3.5 sm:p-4 space-y-3 shrink-0">
                <div className="flex items-center justify-between pb-2 border-b border-border text-[11px] text-muted-foreground font-mono">
                  <span className="truncate">gphost.app/f/project-deck</span>
                  <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold text-[10px]">
                    1-Click Copy
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-muted/40 border border-border/60 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <HardDrive className="w-5 h-5" />
                  </div>
                  <div className="truncate">
                    <div className="font-semibold text-xs text-foreground truncate">Product_Roadmap_2026.pdf</div>
                    <div className="text-[10px] text-muted-foreground">24.5 MB • Ready to Download</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="h-9 rounded-xl bg-foreground text-background font-semibold flex items-center justify-center text-xs shadow-xs">
                    Download File
                  </div>
                  <div className="h-9 rounded-xl bg-muted border border-border font-medium flex items-center justify-center text-xs text-foreground">
                    Preview Media
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Bottom Conversion CTA Banner */}
          <div className="mt-14 sm:mt-20 p-6 sm:p-12 rounded-2xl sm:rounded-3xl bg-gradient-to-tr from-blue-600/10 via-indigo-500/10 to-transparent border border-blue-500/20 text-center flex flex-col items-center relative overflow-hidden">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3 sm:mb-4 shrink-0">
              <UploadCloud className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>

            <h3 className="text-xl sm:text-3xl font-extrabold tracking-tight text-foreground mb-2.5 sm:mb-3">
              Ready to experience modern file hosting?
            </h3>
            <p className="text-xs sm:text-base text-muted-foreground max-w-xl mb-6 sm:mb-7 leading-relaxed">
              Start uploading files up to 1 GB in seconds. No credit card required. Clean links, direct CDN streams, and total control.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <Link
                href={user ? "/upload" : "/login"}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 sm:px-7 h-11 sm:h-12 rounded-xl text-xs sm:text-sm font-semibold bg-foreground text-background hover:opacity-90 shadow-sm transition-all duration-150"
              >
                <span>{user ? "Upload a File Now" : "Get Started Free"}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/developers"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 sm:px-6 h-11 sm:h-12 rounded-xl text-xs sm:text-sm font-medium bg-muted/60 hover:bg-muted text-foreground border border-border transition-colors duration-150"
              >
                <HelpCircle className="w-4 h-4 text-muted-foreground" />
                <span>How to Use</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-transparent py-8 sm:py-10 px-4 sm:px-6 transition-colors relative z-10">
        <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4 pb-8 sm:pb-0 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <BrandLogoSymbol size="xs" glow={false} />
            <span className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} GPHosting (Gaurav Patil Hosting). All rights reserved.
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 sm:gap-6 text-xs text-muted-foreground font-medium">
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
