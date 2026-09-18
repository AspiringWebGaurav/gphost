import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Scale,
  ShieldAlert,
  Ban,
  Key,
  HardDrive,
  FileCode,
  Flame,
  Globe,
  Lock,
  LifeBuoy,
  History,
  CheckCircle2,
  ChevronRight,
  Zap,
  Server,
  Terminal,
  ShieldCheck,
  Calendar,
  Layers,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Terms of Service & AUC — GPHosting",
  description:
    "Terms of Service, Acceptable Use Conditions, and legal policies for GPHosting ephemeral direct-transit file hosting.",
};

const SECTIONS = [
  { id: "section-agreement", title: "1. Agreement & Direct-Transit Scope", icon: Scale },
  { id: "section-prohibited", title: "2. Prohibited Content & AUC", icon: Ban },
  { id: "section-transfers", title: "3. Direct Browser-to-R2 Transfers", icon: Server },
  { id: "section-burner", title: "4. Smart Burner & Automated Destruction", icon: Flame },
  { id: "section-raw-cdn", title: "5. Direct Raw & CDN Asset Hosting", icon: Globe },
  { id: "section-encryption", title: "6. Client-Side Zero-Trust Encryption", icon: Lock },
  { id: "section-api-keys", title: "7. Developer API Keys & Terminal Uploads", icon: Terminal },
  { id: "section-admission", title: "8. Onboarding PINs & Account Governance", icon: Key },
  { id: "section-quotas", title: "9. Storage Quotas & Admission Coordinator", icon: HardDrive },
  { id: "section-license", title: "10. Source License & Limitation of Liability", icon: FileCode },
  { id: "section-abuse", title: "11. Abuse Reporting & Rapid Takedowns", icon: LifeBuoy },
  { id: "section-audit", title: "12. Revision History & Audit Log", icon: History },
];

export default function TermsPage() {
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
          <div className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-mono px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
            <ShieldCheck className="w-3 h-3" />
            <span>AUC v3.0 Production</span>
          </div>
        </div>
      </header>

      {/* Hero Banner — Edge-to-Edge Fluid Container */}
      <section className="border-b border-border/60 bg-gradient-to-b from-muted/30 via-background to-background py-10 px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-20">
        <div className="w-full">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-xs font-semibold mb-4">
            <Scale className="w-3.5 h-3.5" />
            <span>Legal Framework &bull; Acceptable Use Conditions (AUC)</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground mb-4">
            Terms of Service &amp; Acceptable Use Conditions
          </h1>

          <p className="text-sm sm:text-base text-muted-foreground max-w-4xl leading-relaxed mb-6">
            These Terms govern your use of GPHosting&rsquo;s ephemeral, direct-to-storage transit platform, client-side encryption utilities, developer REST APIs, and CDN asset routing.
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

            <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400 block">
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
                  Governance Reference
                </span>
                <strong className="text-xs sm:text-sm font-mono font-medium text-foreground">
                  AUC-2026.09.18-v3.0
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
              <Scale className="w-3.5 h-3.5 text-indigo-500" />
              <span>Table of Contents</span>
            </div>
            <nav className="space-y-1">
              {SECTIONS.map((item) => {
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
                Quick Navigation
              </div>
              <Link
                href="/privacy"
                className="flex items-center justify-between text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <span>Privacy Policy</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/developers"
                className="flex items-center justify-between text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                <span>API &amp; User Guide</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </aside>

          {/* Main Full-Width Content Stream */}
          <main className="min-w-0 space-y-12">
            {/* Direct-Transit & Ephemeral Warning Box */}
            <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs sm:text-sm leading-relaxed flex items-start gap-4">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div>
                <strong className="font-bold block mb-1 text-amber-950 dark:text-amber-100 text-sm sm:text-base">
                  Direct Transit &amp; Ephemeral Architecture Notice
                </strong>
                GPHosting is engineered strictly as an ephemeral, zero-knowledge, high-speed direct transit platform. It is <strong>not</strong> a permanent storage locker, cold backup depository, or archiving service. Files expire automatically according to configured Time-to-Live (TTL) deadlines, burn upon viewing or single-use download claims, and are permanently wiped from Cloudflare R2 edge storage and Supabase databases. Always retain independent copies of your essential documents and assets.
              </div>
            </div>

            {/* Section 1 */}
            <section id="section-agreement" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Scale className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  1. Agreement &amp; Direct-Transit Scope
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                By visiting, accessing, authenticating on, uploading files to, linking assets from, or invoking programmatic developer endpoints on GPHosting (&ldquo;the Service&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;), you expressly agree to be bound by these Terms of Service and Acceptable Use Conditions (&ldquo;AUC&rdquo;). If you disagree with any portion of these conditions, you must immediately terminate access and discontinue use of the platform.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                These conditions govern all interfaces, including our web application interface, direct presigned upload pipelines, <code>/raw/[slug]</code> content delivery redirects, <code>/f/[slug]</code> preview portals, XURL shortlinks, and developer API routes located at <code>/api/v1/*</code>.
              </p>
            </section>

            {/* Section 2 */}
            <section id="section-prohibited" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  <Ban className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  2. Acceptable Use Conditions (Prohibited Content)
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                GPHosting is designated for lawful personal, educational, developer, open-source documentation, and temporary transit sharing. You agree not to upload, transit, mirror, or generate share links for any of the following categories:
              </p>

              {/* Edge-to-Edge Grid of Prohibited Content Cards */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
                <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 space-y-2">
                  <strong className="text-foreground text-sm font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    A. Malware, Exploits &amp; Toolkits
                  </strong>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Viruses, trojans, ransomware, worms, keyloggers, rootkits, infostealers, botnet command controllers, uncompiled zero-day exploit payloads, or automated attack scripts designed to compromise system integrity.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-2">
                  <strong className="text-foreground text-sm font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    B. Copyright &amp; Intellectual Property Infringement
                  </strong>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Unlicensed commercial software, cracked digital goods, pirated cinema, proprietary trade secrets, or copyrighted audio/video archives without verified authorization from the legitimate copyright holder.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 space-y-2">
                  <strong className="text-foreground text-sm font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-600" />
                    C. Child Exploitation, CSAM &amp; Violent Material
                  </strong>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Child sexual abuse material (CSAM), non-consensual sexual media, terrorist propaganda, violent extremism, extortion payloads, illegal firearms trafficking, or unlawful controlled substance sales.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-2">
                  <strong className="text-foreground text-sm font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    D. Stolen PII, Credential Dumps &amp; Private Keys
                  </strong>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Doxxing repositories, intercepted confidential conversations, scraped Personally Identifiable Information (PII) databases, stolen payment credentials, identity documents, or leaked server cryptographic certificates.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 3 */}
            <section id="section-transfers" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Server className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  3. Direct Browser-to-Cloudflare R2 Transfers
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                GPHosting utilizes an optimized zero-proxy architecture:
              </p>
              <div className="grid gap-3 sm:grid-cols-3 text-xs">
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1.5">
                  <strong className="text-foreground font-semibold block">Presigned S3 Leases</strong>
                  <p className="text-muted-foreground">
                    Upload authorization occurs through short-lived presigned AWS S3-compatible URLs. Payloads stream straight from your browser to Cloudflare R2 object storage with zero intermediary server buffering.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1.5">
                  <strong className="text-foreground font-semibold block">1 GB Single-File Ceiling</strong>
                  <p className="text-muted-foreground">
                    Multipart chunking enables reliable transfers up to 1 GB per file with client-side verification, SHA-256 fingerprinting, and automatic retry coordination.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1.5">
                  <strong className="text-foreground font-semibold block">Zero Server Bandwidth Saturation</strong>
                  <p className="text-muted-foreground">
                    Because application servers never proxy file bytes, uploads and downloads remain immune to server CPU throttling or memory starvation.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 4 */}
            <section id="section-burner" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Flame className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  4. Smart Burner &amp; Automated Destruction Rules
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                To guarantee privacy and prevent data accumulation, GPHosting provides autonomous lifecycle policies that trigger irrevocable deletion:
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-1">
                  <div className="font-bold text-foreground flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-amber-500" />
                    <span>Burn on Preview</span>
                  </div>
                  <p className="text-muted-foreground">
                    The first viewing opens an autonomous 60-second destruction window. Upon expiry, the file and share links are completely wiped.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <div className="font-bold text-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Single-Use Claim</span>
                  </div>
                  <p className="text-muted-foreground">
                    The file object is purged from Cloudflare R2 storage immediately upon the first completed file download stream.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <div className="font-bold text-foreground flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-blue-500" />
                    <span>Download Ceilings</span>
                  </div>
                  <p className="text-muted-foreground">
                    Set explicit download limits (e.g. 5 or 25 downloads). Once reached, the file is decommissioned and purged automatically.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <div className="font-bold text-foreground flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-purple-500" />
                    <span>Configurable TTL</span>
                  </div>
                  <p className="text-muted-foreground">
                    Preset expirations (1h, 24h, 7d, 30d, 90d, custom, or permanent for authorized users) are swept continuously.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 5 */}
            <section id="section-raw-cdn" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                  <Globe className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  5. Direct Raw &amp; CDN Asset Hosting (/raw/[slug])
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Users may generate direct raw links (<code>/raw/[slug]</code>) to embed public assets in documentation, GitHub README files, developer portfolios, and static websites:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-muted-foreground">
                <li>
                  <strong>Edge CDN Routing:</strong> Direct raw URLs respond with an HTTP 307 temporary redirect to Cloudflare global edge storage with 1-hour CDN caching (<code>Cache-Control: public, max-age=3600</code>).
                </li>
                <li>
                  <strong>Content-Disposition Sandboxing:</strong> Non-media file types are forced to download attachments to prevent cross-site scripting (XSS) vectors.
                </li>
                <li>
                  <strong>Fair Use &amp; Prohibited Bandwidth Abuse:</strong> Direct raw hosting is intended for legitimate developer and documentation embeds. Leveraging direct raw links for commercial video streaming networks, ad tech pixels, or automated bot scraping networks is prohibited.
                </li>
              </ul>
            </section>

            {/* Section 6 */}
            <section id="section-encryption" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Lock className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  6. Client-Side End-to-End Zero-Trust Encryption
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                When enabling Client-Side Encryption, cryptographic operations occur strictly in your browser using the native Web Crypto API:
              </p>
              <div className="grid gap-4 sm:grid-cols-2 text-xs sm:text-sm">
                <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-2">
                  <strong className="text-foreground font-semibold block text-sm">
                    A. URL Hash Fragment Key Isolation
                  </strong>
                  <p className="text-muted-foreground leading-relaxed">
                    Decryption keys are embedded exclusively in the URL hash fragment (e.g. <code>#key=...</code>). Per RFC 3986, browsers do not transmit URL hash fragments over the wire to servers. GPHosting servers never receive, log, or store your decryption keys.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-2">
                  <strong className="text-foreground font-semibold block text-sm">
                    B. Zero Password Recovery Guarantee
                  </strong>
                  <p className="text-muted-foreground leading-relaxed">
                    Because GPHosting operates with zero knowledge of your encryption keys, we cannot reset passwords, decrypt files, or recover links if you lose the URL hash key. You bear sole responsibility for retaining your keys.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 7 */}
            <section id="section-api-keys" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <Terminal className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  7. Developer API Keys &amp; Terminal Uploads
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Approved accounts may generate Developer API Keys (formatted <code>gp_live_...</code>) for terminal scripts, CI/CD pipelines, and headless automation via <code>/api/v1/upload</code>:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-muted-foreground">
                <li>
                  <strong>Bearer Authentication:</strong> API keys must be passed in the <code>Authorization: Bearer gp_live_...</code> header. The raw key is displayed once upon creation and stored exclusively as a one-way SHA-256 hash.
                </li>
                <li>
                  <strong>Edge Rate Limiting:</strong> All API requests pass through Upstash Redis sliding-window limiters. Circumventing rate limiters through distributed proxies or credential abuse triggers automatic key revocation.
                </li>
              </ul>
            </section>

            {/* Section 8 */}
            <section id="section-admission" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <Key className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  8. Onboarding PINs &amp; Account Governance
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                To prevent automated spam and infrastructure abuse, user registration is managed via Google OAuth (PKCE) combined with an invitation PIN access gate or administrator approval queue:
              </p>
              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <strong className="text-foreground font-medium block">Invite PIN Verification</strong>
                  <p className="text-muted-foreground">
                    Valid single-use or multi-use onboarding PINs admit verified users to the platform with instant quota allocation.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <strong className="text-foreground font-medium block">Unilateral Suspension Right</strong>
                  <p className="text-muted-foreground">
                    We reserve the unilateral right to approve, reject, rate limit, or terminate any account or access credential if policy violations or suspicious activities are detected.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 9 */}
            <section id="section-quotas" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
                  <HardDrive className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  9. Storage Quotas &amp; Admission Coordinator
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Accounts operate under allocated storage quotas (default 5 GB capacity) and individual file ceilings (up to 1 GB). Uploads are managed by our real-time admission coordinator:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground">
                <li>
                  <strong>Quota Reservation:</strong> Before receiving an S3 presigned lease, required bytes are temporarily reserved. Abandoned uploads are automatically released back to the user balance.
                </li>
                <li>
                  <strong>Sybil Attack Prevention:</strong> Registering multiple alternate accounts to circumvent storage limits or bypass rate limits is strictly forbidden.
                </li>
              </ul>
            </section>

            {/* Section 10 */}
            <section id="section-license" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                  <FileCode className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  10. Source-Available License &amp; Limitation of Liability
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The GPHosting codebase is published under the <strong>GPHosting Source-Available Reference License</strong>. You may inspect, audit, and clone the repository for personal, educational, and security research purposes. Commercial distribution, unauthorized public SaaS re-hosting, and trademark removal are prohibited.
              </p>
              <div className="p-4 rounded-xl border border-border/80 bg-muted/40 text-xs text-muted-foreground leading-relaxed space-y-2">
                <strong className="text-foreground uppercase tracking-wide block">
                  Disclaimer of Warranties &amp; Limitation of Damages
                </strong>
                <p>
                  THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. TO THE MAXIMUM EXTENT PERMITTED BY LAW, GPHOSTING AND ITS MAINTAINERS SHALL NOT BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES, INCLUDING LOSS OF DATA, CORRUPTION OF ASSETS, OR SERVICE INTERRUPTIONS ARISING OUT OF USE OF THE SERVICE.
                </p>
              </div>
            </section>

            {/* Section 11 */}
            <section id="section-abuse" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <LifeBuoy className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  11. Abuse Reporting &amp; Rapid Takedowns
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                If you encounter content hosted on GPHosting that violates these Acceptable Use Conditions, infringes upon your copyright, or compromises personal safety, submit a notice containing:
              </p>
              <div className="p-4 rounded-xl border border-border/80 bg-card/60 text-xs space-y-2">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>Required Takedown Details:</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li>Exact URL or link slug (e.g. <code>https://gphost.eu.cc/f/[slug]</code> or <code>/raw/[slug]</code>).</li>
                  <li>Clear description of the alleged violation or infringement.</li>
                  <li>Evidence of copyright ownership or legal representation authority.</li>
                  <li>Direct contact email for verification.</li>
                </ul>
                <p className="text-muted-foreground pt-1">
                  Report all abuse directly to the site administrator. Confirmed violations result in immediate asset termination and permanent edge purge.
                </p>
              </div>
            </section>

            {/* Section 12: Comprehensive Version & Audit Log */}
            <section id="section-audit" className="scroll-mt-24 space-y-4 border-t border-border/80 pt-8">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                  <History className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  12. Revision History &amp; Audit Log
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                GPHosting maintains an open audit record of terms and policy adjustments:
              </p>

              <div className="overflow-x-auto rounded-xl border border-border/80">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border/80 bg-muted/50 font-semibold text-foreground">
                      <th className="p-3">Version</th>
                      <th className="p-3">Publication Date</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Key Changes &amp; Architectural Additions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    <tr className="bg-card/40">
                      <td className="p-3 font-mono font-semibold text-foreground">v1.0.0</td>
                      <td className="p-3 text-muted-foreground">September 14, 2026</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium">
                          Original Inception
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        Initial platform release: basic ephemeral transit, file lifecycles, and core acceptable use rules.
                      </td>
                    </tr>
                    <tr className="bg-card/40">
                      <td className="p-3 font-mono font-semibold text-foreground">v2.0.0</td>
                      <td className="p-3 text-muted-foreground">September 16, 2026</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium">
                          Superseded
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        Added 360° brand identity, PWA suite, direct Cloudflare CDN raw routing (<code>/raw/[slug]</code>), and client-side encryption.
                      </td>
                    </tr>
                    <tr className="bg-card/40">
                      <td className="p-3 font-mono font-semibold text-foreground">v2.5.0</td>
                      <td className="p-3 text-muted-foreground">September 17, 2026</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium">
                          Superseded
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        Introduced Smart Burner (Burn on Preview 60s lease), single-use download claims, download limits, and beginner how-to guide.
                      </td>
                    </tr>
                    <tr className="bg-emerald-500/5">
                      <td className="p-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">v3.0.0</td>
                      <td className="p-3 font-medium text-foreground">September 18, 2026</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                          Active &amp; Effective
                        </span>
                      </td>
                      <td className="p-3 text-foreground font-medium">
                        Developer API Keys (<code>/api/v1/upload</code>), Upstash Redis rate limiting, Cloudflare Turnstile, 1 GB multipart R2 upload ceilings, edge-to-edge layout, and Node.js 24.x LTS runtime parity.
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
          <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          <Link href="/developers" className="hover:text-foreground transition-colors">User Guide &amp; API</Link>
        </div>
        &copy; {new Date().getFullYear()} GPHosting. Ephemeral, Direct-Transit &amp; Zero-Knowledge.
      </footer>
    </div>
  );
}
