import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Shield,
  Lock,
  EyeOff,
  Server,
  Trash2,
  CheckCircle2,
  Calendar,
  Zap,
  Layers,
  ChevronRight,
  Database,
  Cpu,
  History,
  FileText,
  UserCheck,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Privacy Policy — GPHosting",
  description:
    "Simple, clear Privacy Policy for GPHosting. Zero tracking, zero ads, direct storage uploads, and client-side encryption explained in plain English.",
};

const PRIVACY_SECTIONS = [
  { id: "section-promise", title: "1. Our Privacy Promise", icon: Shield },
  { id: "section-direct-transit", title: "2. How Your Files Travel", icon: Server },
  { id: "section-encryption", title: "3. Secret Client-Side Encryption", icon: Lock },
  { id: "section-deletion", title: "4. Permanent File Deletion", icon: Trash2 },
  { id: "section-telemetry", title: "5. Minimal Stats We Collect", icon: EyeOff },
  { id: "section-account-data", title: "6. Account Information We Store", icon: UserCheck },
  { id: "section-turnstile", title: "7. Bot Protection Without Annoying Puzzles", icon: Cpu },
  { id: "section-subprocessors", title: "8. Trusted Cloud Partners", icon: Database },
  { id: "section-rights", title: "9. Your Rights & Total Deletion", icon: FileText },
  { id: "section-audit", title: "10. What Changed Over Time", icon: History },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased transition-colors duration-200">
      {/* Top Header */}
      <header className="h-16 border-b border-border/80 bg-background/80 backdrop-blur-xl px-4 sm:px-8 lg:px-12 flex items-center justify-between sticky top-0 z-50">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
          <span>Back to Home</span>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <div className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-mono px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400">
            <Shield className="w-3 h-3" />
            <span>Privacy v3.1 (Plain English)</span>
          </div>
        </div>
      </header>

      {/* Hero Banner */}
      <section className="border-b border-border/60 bg-gradient-to-b from-muted/30 via-background to-background py-10 px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-20">
        <div className="w-full">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs font-semibold mb-4">
            <Shield className="w-3.5 h-3.5" />
            <span>Privacy First &bull; Zero Data Monetization</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground mb-4">
            Privacy Policy
          </h1>

          <p className="text-sm sm:text-base text-muted-foreground max-w-4xl leading-relaxed mb-6">
            At GPHosting, we believe your personal files and privacy belong entirely to you. We don&rsquo;t track you, we don&rsquo;t sell your data, and we don&rsquo;t show advertisements. Here is our entire privacy policy explained in plain, simple English.
          </p>

          {/* Prominent Dual-Date Revision Strip */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl">
            <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                  Original Inception Date
                </span>
                <strong className="text-xs sm:text-sm font-semibold text-foreground">
                  September 14, 2026 (v1.0)
                </strong>
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-500/5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-blue-600 dark:text-blue-400 block">
                  Last Updated &amp; In Effect
                </span>
                <strong className="text-xs sm:text-sm font-semibold text-foreground">
                  September 19, 2026 (v3.1)
                </strong>
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 flex items-center gap-3 sm:col-span-2 lg:col-span-1">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                  Edition
                </span>
                <strong className="text-xs sm:text-sm font-mono font-medium text-foreground">
                  PRIV-2026.09.19-v3.1
                </strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Layout: Desktop 2-Column Edge-to-Edge Grid */}
      <div className="flex-1 w-full px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 py-8 sm:py-12">
        <div className="lg:grid lg:grid-cols-[280px_1fr] xl:grid-cols-[320px_1fr] gap-8 xl:gap-14 items-start">
          {/* Sticky Navigation Sidebar (Desktop) */}
          <aside className="hidden lg:block sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl border border-border/80 bg-card/50 p-4 backdrop-blur-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3 px-2 flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-blue-500" />
              <span>Policy Sections</span>
            </div>
            <nav className="space-y-1">
              {PRIVACY_SECTIONS.map((item) => {
                const Icon = item.icon;
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground/70" />
                    <span className="truncate">{item.title}</span>
                  </a>
                );
              })}
            </nav>

            <div className="mt-6 pt-4 border-t border-border/80 px-2 space-y-2">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Legal Links
              </div>
              <Link
                href="/terms"
                className="flex items-center justify-between text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                <span>Terms of Service</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/developers"
                className="flex items-center justify-between text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                <span>User Guide &amp; API</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </aside>

          {/* Main Full-Width Content Stream */}
          <main className="min-w-0 space-y-12">
            {/* Section 1 */}
            <section id="section-promise" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  1. Our Simple Privacy Promise
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                GPHosting is designed to collect only the absolute bare minimum information needed to deliver your files. We do not sell, rent, or monetize your personal data. We do not place ad-tracking cookies, record your screen, or build behavioral profiles about you.
              </p>
              <div className="grid gap-3 sm:grid-cols-3 text-xs">
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <strong className="text-foreground font-semibold block">Zero Ad Trackers</strong>
                  <p className="text-muted-foreground">
                    No Google Analytics, no Facebook Pixels, and no sneaky marketing cookies.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <strong className="text-foreground font-semibold block">Zero Cross-Site Cookies</strong>
                  <p className="text-muted-foreground">
                    We only use a single secure session cookie to keep you signed into your account.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <strong className="text-foreground font-semibold block">Zero Data Selling</strong>
                  <p className="text-muted-foreground">
                    Your files, links, and downloads are never sold or shared with advertisers.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 2 */}
            <section id="section-direct-transit" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Server className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  2. How Your Files Travel (Direct to Storage)
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                On most traditional file hosting websites, your file passes through their central servers first, meaning the company can read, inspect, or save copies of your files.
              </p>
              <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs sm:text-sm text-muted-foreground space-y-2">
                <strong className="text-foreground font-semibold block">
                  How GPHosting Direct Transit Protects You:
                </strong>
                <p>
                  GPHosting uses direct storage transfers. When you upload or download a file, the data travels <strong>straight between your browser and Cloudflare R2 storage</strong>. Our web servers never receive the file bytes, never save your files onto server hard drives, and never read your content.
                </p>
              </div>
            </section>

            {/* Section 3 */}
            <section id="section-encryption" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Lock className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  3. Secret Client-Side Encryption (Zero-Knowledge)
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                If you choose to turn on Client-Side Encryption, your file is scrambled directly on your computer using military-grade encryption (AES-GCM 256) before it is uploaded:
              </p>
              <div className="grid gap-4 sm:grid-cols-2 text-xs sm:text-sm">
                <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 space-y-1.5">
                  <strong className="text-foreground font-semibold block">The Key Stays in Your Link</strong>
                  <p className="text-muted-foreground">
                    The secret unlock key is added after the <code>#</code> mark in the link. Web browsers never send the <code>#</code> part of a link to any web server. Because of this, our servers never see, receive, or store your unlock key.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1.5">
                  <strong className="text-foreground font-semibold block">True Zero-Knowledge</strong>
                  <p className="text-muted-foreground">
                    All our storage sees is scrambled mathematical code. Even if our servers were subpoenaed or breached, nobody could decrypt your files without the secret link that only you possess.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 4 */}
            <section id="section-deletion" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Trash2 className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  4. Permanent File Deletion
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                When a file expires, reaches its download limit, or finishes its 60-second Burn on Preview countdown, it is permanently erased:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground">
                <li>The file data is deleted immediately from Cloudflare R2 storage.</li>
                <li>All links, database records, and download logs for that file are completely wiped.</li>
                <li>We do not keep hidden shadow backups or cold archive copies. Once a file is deleted, it is gone forever.</li>
              </ul>
            </section>

            {/* Section 5 */}
            <section id="section-telemetry" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <EyeOff className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  5. Minimal Stats We Collect
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We only collect basic, privacy-friendly numbers so you can see how many people viewed your file:
              </p>
              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <strong className="text-foreground font-semibold block">Approximate Country Only</strong>
                  <p className="text-muted-foreground">
                    We display general location stats (like country) provided by Cloudflare. We do NOT save your visitors&rsquo; exact IP addresses in permanent download records.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <strong className="text-foreground font-semibold block">Temporary Anti-Spam Counters</strong>
                  <p className="text-muted-foreground">
                    To prevent bots from attacking the service, we keep temporary rate-limit counters in Upstash Redis. These counters automatically expire and reset after a few minutes.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 6 */}
            <section id="section-account-data" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <UserCheck className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  6. Account Information We Store
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                If you choose to create an account by signing in with Google:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground">
                <li><strong>Your Profile:</strong> Your email address, your name, and your avatar image from Google.</li>
                <li><strong>Your Storage Space:</strong> How much space you have used out of your total quota (such as 5 GB).</li>
                <li><strong>API Keys:</strong> If you create a developer API key, we only store a secure one-way hash (we can never see your actual key).</li>
              </ul>
            </section>

            {/* Section 7 */}
            <section id="section-turnstile" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
                  <Cpu className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  7. Bot Protection Without Annoying Puzzles
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We use Cloudflare Turnstile to stop spam bots from overloading the website. Unlike older CAPTCHA systems, Turnstile protects the site quietly in the background without tracking your browsing habits across the internet or asking you to click pictures of traffic lights.
              </p>
            </section>

            {/* Section 8 */}
            <section id="section-subprocessors" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                  <Database className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  8. Trusted Cloud Partners
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We only work with trusted, industry-leading cloud infrastructure providers:
              </p>
              <div className="overflow-x-auto rounded-xl border border-border/80 text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border/80 bg-muted/50 font-semibold text-foreground">
                      <th className="p-3">Partner</th>
                      <th className="p-3">Purpose</th>
                      <th className="p-3">What They Handle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-muted-foreground">
                    <tr>
                      <td className="p-3 font-semibold text-foreground">Cloudflare, Inc.</td>
                      <td className="p-3">Storage &amp; Bot Defense</td>
                      <td className="p-3">Stores your files securely in R2 and blocks automated bots via Turnstile.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-foreground">Supabase, Inc.</td>
                      <td className="p-3">Database &amp; Logins</td>
                      <td className="p-3">Handles secure Google logins and keeps records of your active file links.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-foreground">Upstash, Inc.</td>
                      <td className="p-3">Speed &amp; Anti-Spam Cache</td>
                      <td className="p-3">Keeps temporary counters to prevent spam and protect server performance.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-foreground">Vercel, Inc.</td>
                      <td className="p-3">Web Hosting</td>
                      <td className="p-3">Runs our web application and delivers pages to your browser quickly.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Section 9 */}
            <section id="section-rights" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                  <FileText className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  9. Your Rights &amp; Total Deletion (GDPR &amp; CCPA)
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You have 100% control over your data at all times:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground">
                <li><strong>See Your Files:</strong> You can view all your uploaded files and active links directly in your personal dashboard.</li>
                <li><strong>Delete Anytime:</strong> You can delete any individual file with one click at any time.</li>
                <li><strong>Delete Your Account:</strong> You can completely delete your entire account in your account settings. Once confirmed, all your files, links, and profile details are permanently wiped with zero delay.</li>
              </ul>
            </section>

            {/* Section 10: Revision History */}
            <section id="section-audit" className="scroll-mt-24 space-y-4 border-t border-border/80 pt-8">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                  <History className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  10. What Changed Over Time
                </h2>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border/80 text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border/80 bg-muted/50 font-semibold text-foreground">
                      <th className="p-3">Version</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Summary of Privacy Updates</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    <tr className="bg-card/40">
                      <td className="p-3 font-mono font-semibold text-foreground">v1.0.0</td>
                      <td className="p-3 text-muted-foreground">September 14, 2026</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px]">
                          Original Launch
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        Initial privacy commitments, zero ad policy, and basic direct-transit documentation.
                      </td>
                    </tr>
                    <tr className="bg-card/40">
                      <td className="p-3 font-mono font-semibold text-foreground">v2.0.0</td>
                      <td className="p-3 text-muted-foreground">September 16, 2026</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px]">
                          Superseded
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        Documented client-side zero-knowledge encryption and secret key isolation in the link hash.
                      </td>
                    </tr>
                    <tr className="bg-card/40">
                      <td className="p-3 font-mono font-semibold text-foreground">v2.5.0</td>
                      <td className="p-3 text-muted-foreground">September 17, 2026</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px]">
                          Superseded
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        Added auto-deletion details for Burn on Preview (60s countdown) and single-use downloads.
                      </td>
                    </tr>
                    <tr className="bg-card/40">
                      <td className="p-3 font-mono font-semibold text-foreground">v3.0.0</td>
                      <td className="p-3 text-muted-foreground">September 18, 2026</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px]">
                          Superseded
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        Added Upstash Redis anti-spam rate limiting, Cloudflare Turnstile privacy, and hashed API keys.
                      </td>
                    </tr>
                    <tr className="bg-blue-500/5">
                      <td className="p-3 font-mono font-bold text-blue-600 dark:text-blue-400">v3.1.0</td>
                      <td className="p-3 font-medium text-foreground">September 19, 2026</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                          Active &amp; Effective
                        </span>
                      </td>
                      <td className="p-3 text-foreground font-medium">
                        Rewrote the privacy policy in plain, simple English so anyone can easily understand how their data and privacy are protected.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-4 sm:px-8 lg:px-12 text-center text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center justify-center gap-6 mb-3">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          <Link href="/developers" className="hover:text-foreground transition-colors">User Guide &amp; API</Link>
        </div>
        &copy; {new Date().getFullYear()} GPHosting. Fast, Temporary &amp; Private File Sharing.
      </footer>
    </div>
  );
}
