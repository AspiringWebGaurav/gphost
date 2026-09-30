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
    "Simple, clear Privacy Policy for GPHosting. Zero tracking, zero ads, direct storage uploads, hardware device anti-abuse protection, and client-side encryption explained in plain English.",
};

const PRIVACY_SECTIONS = [
  { id: "section-promise", title: "1. Our Privacy Promise", icon: Shield },
  { id: "section-direct-transit", title: "2. How Your Files Travel", icon: Server },
  { id: "section-encryption", title: "3. Secret Client-Side Encryption & SHA-256", icon: Lock },
  { id: "section-deletion", title: "4. Permanent Deletion & Zero-Stale Purge", icon: Trash2 },
  { id: "section-telemetry", title: "5. Minimal Stats & Device Anti-Abuse Shield", icon: EyeOff },
  { id: "section-account-data", title: "6. Account Information We Store", icon: UserCheck },
  { id: "section-bot-protection", title: "7. Bot Protection Without Tracking", icon: Cpu },
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
            <span>Privacy v3.2 (Plain English)</span>
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
            At GPHosting, we believe your personal files and privacy belong entirely to you. We don&rsquo;t track you across the web, we don&rsquo;t sell your data, and we don&rsquo;t serve advertisements. Here is our complete privacy policy explained in plain, simple English.
          </p>

          {/* Prominent Multi-Date Revision Strip: Keeps Old Launch & Previous Revision alongside New Effective Date */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 max-w-6xl">
            {/* Card 1: Original Inception */}
            <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                  Original Inception
                </span>
                <strong className="text-xs sm:text-sm font-semibold text-foreground">
                  September 14, 2026 (v1.0)
                </strong>
              </div>
            </div>

            {/* Card 2: Prior Revision */}
            <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                <History className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                  Prior Revision
                </span>
                <strong className="text-xs sm:text-sm font-semibold text-foreground">
                  September 19, 2026 (v3.1)
                </strong>
              </div>
            </div>

            {/* Card 3: New Effective Date */}
            <div className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-500/5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-blue-600 dark:text-blue-400 block">
                  Current Effective Date
                </span>
                <strong className="text-xs sm:text-sm font-semibold text-foreground">
                  September 30, 2026 (v3.2)
                </strong>
              </div>
            </div>

            {/* Card 4: Edition */}
            <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                  Edition
                </span>
                <strong className="text-xs sm:text-sm font-mono font-medium text-foreground">
                  PRIV-2026.09.30-v3.2
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
                href="/acceptable-use"
                className="flex items-center justify-between text-xs text-rose-600 dark:text-rose-400 hover:underline"
              >
                <span>Acceptable Use (AUP)</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/terms"
                className="flex items-center justify-between text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                <span>Terms of Service</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/how-it-works"
                className="flex items-center justify-between text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                <span>How to Use Guide</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/developers"
                className="flex items-center justify-between text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                <span>Developer Guide &amp; API</span>
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
                GPHosting is designed from the ground up to collect only the absolute bare minimum data needed to process and deliver your files. We do not sell, rent, monetize, or broker your personal data. We do not place ad-tracking cookies, record your screen, or build behavioral profiles about you.
              </p>
              <div className="grid gap-3 sm:grid-cols-3 text-xs">
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <strong className="text-foreground font-semibold block">Zero Ad Trackers</strong>
                  <p className="text-muted-foreground">
                    No Google Analytics, no Meta / Facebook Pixels, and no covert marketing tags.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <strong className="text-foreground font-semibold block">Zero Cross-Site Cookies</strong>
                  <p className="text-muted-foreground">
                    We use only a single secure, encrypted session cookie to keep you logged into your account.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <strong className="text-foreground font-semibold block">Zero Data Monetization</strong>
                  <p className="text-muted-foreground">
                    Your files, share links, and download traffic are never inspected or sold to third parties.
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
                On typical legacy file hosts, your file is routed through intermediary proxy servers, allowing the hosting provider to sniff, buffer, or retain unauthorized copies.
              </p>
              <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs sm:text-sm text-muted-foreground space-y-2">
                <strong className="text-foreground font-semibold block">
                  How Direct Transit Protects You:
                </strong>
                <p>
                  GPHosting uses direct storage architecture. When you upload or download a file, your browser communicates <strong>directly with secure cloud storage</strong> using secure, short-lived direct upload authorizations. Our application servers never receive the raw file payload, never write your files to application server disks, and cannot read your contents.
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
                  3. Secret Client-Side Encryption &amp; SHA-256 Verification
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                When you activate Client-Side Encryption, your file is scrambled directly on your device using AES-GCM 256 prior to transit:
              </p>
              <div className="grid gap-4 sm:grid-cols-2 text-xs sm:text-sm">
                <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 space-y-1.5">
                  <strong className="text-foreground font-semibold block">The Key Stays in Your URL Fragment</strong>
                  <p className="text-muted-foreground">
                    The secret unlock key is appended strictly after the <code>#</code> character in the link. HTTP specifications mandate that web browsers never send hash fragments to any server. Consequently, our servers never receive, store, or have access to your decryption key.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1.5">
                  <strong className="text-foreground font-semibold block">True Zero-Knowledge &amp; SHA-256 Integrity</strong>
                  <p className="text-muted-foreground">
                    Our storage backend holds only ciphertext. In addition, an anti-tamper SHA-256 checksum is computed on upload and verified on receipt to guarantee that nobody has modified or corrupted your data.
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
                  4. Permanent Deletion &amp; Zero-Stale Lifecycle Purge
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                When a file reaches its expiry timestamp, exhausts its download allowance, or finishes its 60-second Burn on Preview countdown, it is permanently purged:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground">
                <li><strong>Storage Blobs:</strong> Raw encrypted or unencrypted file bytes are immediately and irreversibly deleted from cloud storage.</li>
                <li><strong>Database Records:</strong> File metadata, share link records, and access logs are permanently wiped from the database.</li>
                <li><strong>Active Memory Shredding:</strong> All ephemeral download session tokens, active lease reservations, and rate-limit counters associated with that link are evicted instantly from high-speed memory.</li>
                <li><strong>Zero Shadow Backups:</strong> We do not keep cold archive duplicates or unpurged snapshots. Deletion is absolute.</li>
              </ul>
            </section>

            {/* Section 5 */}
            <section id="section-telemetry" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <EyeOff className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  5. Minimal Stats &amp; Hardware Device Anti-Abuse Shield
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We collect only aggregate, privacy-safe analytics and use lightweight device signals strictly to protect users from automated abuse:
              </p>
              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-1.5">
                  <strong className="text-foreground font-semibold block">Approximate Country Level Only</strong>
                  <p className="text-muted-foreground">
                    We display high-level geographic counts (e.g. view count by country) so you know who accessed your link. We do NOT save visitor IP addresses in your persistent download logs.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl border border-teal-500/20 bg-teal-500/5 space-y-1.5">
                  <strong className="text-foreground font-semibold block">Hardware Device Fingerprinting for Anti-Abuse</strong>
                  <p className="text-muted-foreground">
                    To prevent malicious bots from exhausting single-use download slots, hoarding burner links, or conducting sybil attacks, we generate a privacy-preserving mathematical hash based on browser/hardware entropy. This hash is used strictly for real-time abuse prevention in ephemeral memory, never for user profiling, and is never shared or sold.
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
                When you create an account using Google authentication:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground">
                <li><strong>Profile Details:</strong> Your email address, full name, and avatar image URL provided by Google OAuth.</li>
                <li><strong>Storage Tracking:</strong> The current aggregate size of your uploaded files to monitor your storage quota (typically 5 GB).</li>
                <li><strong>Developer API Keys:</strong> Created via a 2-step verification flow. We display the secret key once and store only a cryptographic one-way hash in our database. We can never view or retrieve your plaintext key.</li>
              </ul>
            </section>

            {/* Section 7 */}
            <section id="section-bot-protection" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
                  <Cpu className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  7. Bot Protection Without Annoying Puzzles
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We use privacy-preserving smart bot verification to shield our upload and login endpoints from automated bot spam. Unlike legacy CAPTCHAs, it runs seamlessly in the background without cross-site tracking cookies or interactive puzzle games.
              </p>
            </section>

            {/* Section 8 */}
            <section id="section-subprocessors" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                  <Database className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  8. Trusted Cloud Partners &amp; Infrastructure
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We collaborate strictly with enterprise-grade cloud infrastructure partners:
              </p>
              <div className="overflow-x-auto rounded-xl border border-border/80 text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border/80 bg-muted/50 font-semibold text-foreground">
                      <th className="p-3">Infrastructure Layer</th>
                      <th className="p-3">Operational Role</th>
                      <th className="p-3">Privacy &amp; Data Handling</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-muted-foreground">
                    <tr>
                      <td className="p-3 font-semibold text-foreground">Encrypted Cloud Storage</td>
                      <td className="p-3">Storage &amp; Delivery</td>
                      <td className="p-3">Stores encrypted file blobs securely and delivers downloads directly with zero payload inspection.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-foreground">Authentication &amp; Records</td>
                      <td className="p-3">Database &amp; Access Control</td>
                      <td className="p-3">Provides secure account authentication and manages access control records for active share links.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-foreground">High-Speed Memory Cache</td>
                      <td className="p-3">Speed &amp; Rate Limiting</td>
                      <td className="p-3">Manages temporary rate-limit counters and ephemeral session state to prevent automated abuse.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-foreground">Global Web Hosting &amp; Edge CDN</td>
                      <td className="p-3">Application Delivery &amp; Routing</td>
                      <td className="p-3">Delivers web application pages, applies strict security headers, and caches public static media at the edge.</td>
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
                You retain complete autonomy and ownership of your data at all times:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground">
                <li><strong>Right of Access (Article 15):</strong> You have complete visibility into every byte stored on GPHost. Your dashboard and Settings display real-time storage metrics, categorized byte breakdowns, active links, and audit history.</li>
                <li><strong>Right to Data Portability (Article 20 &mdash; 1-Click Export):</strong> You can export your entire personal data archive directly from <Link href="/settings" className="text-blue-600 dark:text-blue-400 font-semibold underline underline-offset-2">Account Settings</Link> in both Structured JSON and a Standalone HTML Dossier. Data export requests are rate-limited to 5 requests per hour per account to safeguard platform availability.</li>
                <li><strong>Data Retention Lifecycles:</strong> Uploaded files are strictly governed by their configured expiration presets (1 hour to 90 days TTL, or permanent if granted) and are physically destroyed immediately upon expiration. Single-use links are purged 50 seconds after their download lease concludes. Download telemetry and access audit records are retained on a strict 90-day rolling lifecycle, after which older records are permanently purged by our automated lifecycle sweeper.</li>
                <li><strong>Right to Erasure (1-Click File Deletion):</strong> You can delete any uploaded file or share link instantly with one click.</li>
                <li><strong>Complete Account Deletion:</strong> You can permanently delete your entire account in Account Settings. Doing so immediately purges all your profile information, files, database records, and API keys with zero grace period.</li>
              </ul>
            </section>

            {/* Section 10: Revision History */}
            <section id="section-audit" className="scroll-mt-24 space-y-4 border-t border-border/80 pt-8">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                  <History className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  10. What Changed Over Time (Privacy Revision History)
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
                        Added smart anti-spam rate limiting, privacy-first bot protection, and hashed API keys.
                      </td>
                    </tr>
                    <tr className="bg-card/40">
                      <td className="p-3 font-mono font-semibold text-foreground">v3.1.0</td>
                      <td className="p-3 text-muted-foreground">September 19, 2026</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px]">
                          Prior Revision (Superseded)
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        Rewrote the privacy policy in plain, simple English so anyone can easily understand how their data and privacy are protected.
                      </td>
                    </tr>
                    <tr className="bg-blue-500/5">
                      <td className="p-3 font-mono font-bold text-blue-600 dark:text-blue-400">v3.2.0</td>
                      <td className="p-3 font-medium text-foreground">September 30, 2026</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                          Active &amp; Effective
                        </span>
                      </td>
                      <td className="p-3 text-foreground font-medium">
                        Documented privacy safeguards for hardware device fingerprinting (anti-abuse only), Zero-Stale lifecycle purge, 2-step API key one-way hashing, and SHA-256 anti-tamper checksum integrity.
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
          <Link href="/acceptable-use" className="hover:text-foreground transition-colors">Acceptable Use Policy</Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          <Link href="/how-it-works" className="hover:text-foreground transition-colors">How to Use</Link>
          <Link href="/developers" className="hover:text-foreground transition-colors">User Guide &amp; API</Link>
        </div>
        &copy; {new Date().getFullYear()} GPHosting. Fast, Temporary &amp; Private File Sharing.
      </footer>
    </div>
  );
}
