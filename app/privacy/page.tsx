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
    "Privacy Policy and Zero-Knowledge Architecture of GPHosting. Direct-to-storage transfers, client-side encryption, and zero data harvesting.",
};

const PRIVACY_SECTIONS = [
  { id: "section-promise", title: "1. Zero-Harvesting Commitment", icon: Shield },
  { id: "section-direct-transit", title: "2. Direct-to-Storage Architecture", icon: Server },
  { id: "section-encryption", title: "3. Zero-Knowledge Client Cryptography", icon: Lock },
  { id: "section-deletion", title: "4. Autonomous Irreversible Purging", icon: Trash2 },
  { id: "section-telemetry", title: "5. Privacy-Preserving Telemetry", icon: EyeOff },
  { id: "section-account-data", title: "6. Account & Identity Data Stored", icon: UserCheck },
  { id: "section-turnstile", title: "7. Bot Mitigation (Cloudflare Turnstile)", icon: Cpu },
  { id: "section-subprocessors", title: "8. Subprocessors & Cloud Infrastructure", icon: Database },
  { id: "section-rights", title: "9. Your Rights & Instant Account Purge", icon: FileText },
  { id: "section-audit", title: "10. Revision History & Audit Log", icon: History },
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
            <span>Privacy v3.0 Production</span>
          </div>
        </div>
      </header>

      {/* Hero Banner — Edge-to-Edge Fluid Container */}
      <section className="border-b border-border/60 bg-gradient-to-b from-muted/30 via-background to-background py-10 px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-20">
        <div className="w-full">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs font-semibold mb-4">
            <Shield className="w-3.5 h-3.5" />
            <span>Privacy First &bull; Zero Data Monetization</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground mb-4">
            Privacy Policy &amp; Zero-Knowledge Architecture
          </h1>

          <p className="text-sm sm:text-base text-muted-foreground max-w-4xl leading-relaxed mb-6">
            GPHosting is built from the ground up to respect user autonomy. We do not track you, run advertisements, profile behavior, or retain your unencrypted files.
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
                  September 14, 2026 (v1.0.0)
                </strong>
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-500/5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-blue-600 dark:text-blue-400 block">
                  Last Revised &amp; Effective Date
                </span>
                <strong className="text-xs sm:text-sm font-semibold text-foreground">
                  September 18, 2026 (v3.0.0)
                </strong>
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 flex items-center gap-3 sm:col-span-2 lg:col-span-1">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                  Policy Reference
                </span>
                <strong className="text-xs sm:text-sm font-mono font-medium text-foreground">
                  PRIV-2026.09.18-v3.0
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
                  1. Our Core Privacy Promise
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                GPHosting is designed to operate on minimal necessary data. We do not sell, rent, monetize, or broker your personal information. We do not execute third-party ad-tracking beacons, fingerprint browser hardware, or maintain surveillance dossiers.
              </p>
              <div className="grid gap-3 sm:grid-cols-3 text-xs">
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <strong className="text-foreground font-semibold block">Zero Ad Trackers</strong>
                  <p className="text-muted-foreground">
                    No Google Analytics, no Facebook Pixels, no behavioral trackers.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <strong className="text-foreground font-semibold block">Zero Cross-Site Cookies</strong>
                  <p className="text-muted-foreground">
                    Only strictly essential session cookies are used for authenticated dashboard access.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <strong className="text-foreground font-semibold block">Zero Commercial Profiling</strong>
                  <p className="text-muted-foreground">
                    Your files, share links, and download frequency are never monetized.
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
                  2. Direct-to-Storage Architecture &amp; Buffer-Free Transit
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Traditional file hosting services proxy all file transfers through their central servers, allowing them to inspect, virus-scan, read, or cache your documents on host disks.
              </p>
              <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs sm:text-sm text-muted-foreground space-y-2">
                <strong className="text-foreground font-semibold block">
                  How GPHosting Direct Transit Protects You:
                </strong>
                <p>
                  GPHosting uses presigned AWS S3-compatible leases. Uploads and downloads travel <strong>directly</strong> between your web browser and Cloudflare R2 global object storage. Our Next.js application servers never buffer file contents into memory, write bytes to application disks, or inspect document bodies.
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
                  3. Zero-Knowledge Client-Side Cryptography
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                When you activate Client-Side Encryption, your files are encrypted on your local computer using the browser&rsquo;s native Web Crypto API (AES-GCM 256) before leaving your machine:
              </p>
              <div className="grid gap-4 sm:grid-cols-2 text-xs sm:text-sm">
                <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 space-y-1.5">
                  <strong className="text-foreground font-semibold block">URL Hash Isolation (RFC 3986)</strong>
                  <p className="text-muted-foreground">
                    The symmetric decryption key is placed strictly inside the URL hash fragment (e.g. <code>#key=...</code>). Because web browsers never send URL hash fragments to web servers in HTTP requests, GPHosting servers never see, receive, or store your key.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1.5">
                  <strong className="text-foreground font-semibold block">Zero Server Knowledge</strong>
                  <p className="text-muted-foreground">
                    Stored R2 objects are pure encrypted ciphertext. Even in the event of an infrastructure subpoena or database breach, stored files cannot be decrypted without the client-side URL hash key.
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
                  4. Autonomous Irreversible Purging
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                When a file reaches its TTL expiration date, completes a single-use download claim, or expires its 60-second Burn on Preview timer, it is permanently and irreversibly purged:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground">
                <li>Database metadata, download logs, and access tokens are deleted via Supabase PostgreSQL cascading triggers.</li>
                <li>The underlying binary object is deleted from the Cloudflare R2 bucket via S3 API calls.</li>
                <li>No hidden tape archives, cold snapshot backups, or shadow copies of deleted files are retained.</li>
              </ul>
            </section>

            {/* Section 5 */}
            <section id="section-telemetry" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <EyeOff className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  5. Privacy-Preserving Telemetry &amp; Anonymous Metrics
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                To provide file owners with aggregate view counters and download analytics, our edge routing layer records non-invasive summaries:
              </p>
              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <strong className="text-foreground font-semibold block">Coarse Geographic Approximations</strong>
                  <p className="text-muted-foreground">
                    Derived from Cloudflare edge headers (<code>cf-ipcountry</code>, <code>cf-ipcity</code>). We do NOT record or store raw user IP addresses in persistent download logs.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <strong className="text-foreground font-semibold block">Transient Rate Limit Hashes</strong>
                  <p className="text-muted-foreground">
                    To safeguard quotas and prevent brute-force attacks, client IP hashes are stored in Upstash Redis cache strictly on short sliding windows (expiring in minutes).
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
                  6. Account &amp; Identity Data Stored
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                For users who create an account via Google OAuth or Onboarding PINs:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground">
                <li><strong>Identity:</strong> Email address, Google display name, avatar URL, and Supabase auth UID.</li>
                <li><strong>Quota &amp; Balances:</strong> Assigned storage limit (e.g. 5 GB) and current bytes utilized.</li>
                <li><strong>API Keys:</strong> SHA-256 cryptographic hashes of generated keys (raw keys are never stored).</li>
              </ul>
            </section>

            {/* Section 7 */}
            <section id="section-turnstile" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
                  <Cpu className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  7. Bot Mitigation (Cloudflare Turnstile)
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                To prevent automated upload abuse without annoying visual CAPTCHAs, we employ Cloudflare Turnstile. Turnstile validates browser authenticity without cross-site tracking or storing personal behavioral cookies.
              </p>
            </section>

            {/* Section 8 */}
            <section id="section-subprocessors" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                  <Database className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  8. Subprocessors &amp; Cloud Infrastructure
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We partner strictly with industry-standard, security-compliant infrastructure vendors:
              </p>
              <div className="overflow-x-auto rounded-xl border border-border/80 text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border/80 bg-muted/50 font-semibold text-foreground">
                      <th className="p-3">Partner</th>
                      <th className="p-3">Function</th>
                      <th className="p-3">Data Processed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-muted-foreground">
                    <tr>
                      <td className="p-3 font-semibold text-foreground">Cloudflare, Inc.</td>
                      <td className="p-3">R2 Object Storage &amp; Turnstile</td>
                      <td className="p-3">Encrypted / raw file objects, transit bot tokens</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-foreground">Supabase, Inc.</td>
                      <td className="p-3">PostgreSQL Database &amp; Auth</td>
                      <td className="p-3">User profiles, share metadata, quota records</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-foreground">Upstash, Inc.</td>
                      <td className="p-3">Serverless Redis</td>
                      <td className="p-3">Transient sliding-window rate limit counters</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-foreground">Vercel, Inc.</td>
                      <td className="p-3">Next.js Edge &amp; Serverless Hosting</td>
                      <td className="p-3">Application routing, HTTP execution</td>
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
                  9. Your Rights &amp; Instant Account Purge (GDPR &amp; CCPA)
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Under global privacy standards including GDPR and CCPA, you retain complete sovereignty over your data:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground">
                <li><strong>Right of Access &amp; Portability:</strong> View and export all your files and active share links directly from the management dashboard.</li>
                <li><strong>Right of Total Erasure:</strong> Delete individual files or purge your complete account profile with zero latency. Deletion is irrevocable.</li>
              </ul>
            </section>

            {/* Section 10: Revision History */}
            <section id="section-audit" className="scroll-mt-24 space-y-4 border-t border-border/80 pt-8">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                  <History className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  10. Revision History &amp; Audit Log
                </h2>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border/80 text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border/80 bg-muted/50 font-semibold text-foreground">
                      <th className="p-3">Version</th>
                      <th className="p-3">Publication Date</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Privacy Highlights</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    <tr className="bg-card/40">
                      <td className="p-3 font-mono font-semibold text-foreground">v1.0.0</td>
                      <td className="p-3 text-muted-foreground">September 14, 2026</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px]">
                          Original Inception
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
                        Documented Client-Side Zero-Trust AES-GCM 256 encryption and URL hash isolation.
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
                        Added Burn on Preview (60s lease) and Single-Use download claim irreversible purge details.
                      </td>
                    </tr>
                    <tr className="bg-blue-500/5">
                      <td className="p-3 font-mono font-bold text-blue-600 dark:text-blue-400">v3.0.0</td>
                      <td className="p-3 font-medium text-foreground">September 18, 2026</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                          Active &amp; Effective
                        </span>
                      </td>
                      <td className="p-3 text-foreground font-medium">
                        Added Upstash Redis rate limiting telemetry specifics, Cloudflare Turnstile bot privacy, SHA-256 hashed API key handling, and full edge-to-edge layout parity.
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
        &copy; {new Date().getFullYear()} GPHosting. Ephemeral, Direct-Transit &amp; Zero-Knowledge.
      </footer>
    </div>
  );
}
