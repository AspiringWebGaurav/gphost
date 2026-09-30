import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Calendar,
  Zap,
  Layers,
  ChevronRight,
  History,
  ShieldCheck,
  Server,
  Lock,
  Cpu,
  FileCode,
  LifeBuoy,
  Scale,
  Sparkles,
  Flame,
  Globe,
  Terminal,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Acceptable Use Policy (AUP) — GPHosting",
  description:
    "Plain-English Acceptable Use Policy (AUP) for GPHosting. Clear rules on permitted content, prohibited uploads, hardware device anti-abuse protection, and slot limits.",
};

const AUP_SECTIONS = [
  { id: "section-acceptance", title: "1. Acceptance & Scope of Agreement", icon: Scale },
  { id: "section-permitted", title: "2. Permitted & Recommended Uses", icon: Sparkles },
  { id: "section-prohibited", title: "3. Strictly Prohibited Content", icon: Ban },
  { id: "section-anti-abuse", title: "4. Anti-Abuse & Slot Protection", icon: Cpu },
  { id: "section-api-rules", title: "5. Developer API & Automated Access", icon: Terminal },
  { id: "section-enforcement", title: "6. Enforcement & Instant Shredding", icon: Flame },
  { id: "section-reporting", title: "7. Reporting Violations & Abuse", icon: LifeBuoy },
  { id: "section-audit", title: "8. Revision History & Audit Trail", icon: History },
];

export default function AcceptableUsePage() {
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
          <div className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-mono px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400">
            <ShieldCheck className="w-3 h-3" />
            <span>AUP v3.2 (Plain English)</span>
          </div>
        </div>
      </header>

      {/* Hero Banner */}
      <section className="border-b border-border/60 bg-gradient-to-b from-muted/30 via-background to-background py-10 px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-20">
        <div className="w-full">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-semibold mb-4">
            <Ban className="w-3.5 h-3.5" />
            <span>Fair Play &bull; Safe Sharing Guidelines</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground mb-4">
            Acceptable Use Policy (AUP)
          </h1>

          <p className="text-sm sm:text-base text-muted-foreground max-w-4xl leading-relaxed mb-6">
            GPHosting exists to make temporary file sharing fast, effortless, and private for good-faith creators, students, and engineers. This Acceptable Use Policy defines the boundaries of respectful service usage, prohibited content, and our fair-access guarantees.
          </p>

          {/* Prominent Multi-Date Revision Strip */}
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
            <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-rose-600 dark:text-rose-400 block">
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
                  AUP-2026.09.30-v3.2
                </strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Layout: Desktop 2-Column Edge-to-Edge Grid */}
      <div className="flex-1 w-full px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 py-8 sm:py-12">
        <div className="lg:grid lg:grid-cols-[280px_1fr] xl:grid-cols-[320px_1fr] gap-8 xl:gap-14 items-start">
          {/* Sticky Navigation Sidebar */}
          <aside className="hidden lg:block sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl border border-border/80 bg-card/50 p-4 backdrop-blur-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3 px-2 flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-rose-500" />
              <span>AUP Sections</span>
            </div>
            <nav className="space-y-1">
              {AUP_SECTIONS.map((item) => {
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
                Related Policies
              </div>
              <Link
                href="/terms"
                className="flex items-center justify-between text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <span>Terms of Service</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/privacy"
                className="flex items-center justify-between text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                <span>Privacy Policy</span>
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

          {/* Main Content Stream */}
          <main className="min-w-0 space-y-12">
            {/* Section 1 */}
            <section id="section-acceptance" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Scale className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  1. Acceptance &amp; Scope of Agreement
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                By accessing GPHosting, creating an account, uploading or transferring files, downloading shared media, embedding <code>/raw/...</code> or <code>/x/...</code> links, or interacting with our developer API endpoints, you enter into a legally binding agreement to comply with this Acceptable Use Policy and our linked <Link href="/terms" className="text-indigo-600 dark:text-indigo-400 underline underline-offset-2 font-medium">Terms of Service</Link>.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                If you do not accept these terms or cannot comply with these standards, you must immediately cease all access and use of GPHosting.
              </p>
            </section>

            {/* Section 2 */}
            <section id="section-permitted" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  2. Permitted &amp; Recommended Uses
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                GPHosting is optimized for high-speed, temporary, and friction-free file transfers. Welcomed use cases include:
              </p>
              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1.5">
                  <strong className="text-foreground font-semibold block flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Personal &amp; Academic Sharing</span>
                  </strong>
                  <p className="text-muted-foreground">
                    Sending homework documents, lecture recordings, project archives, photography, family clips, and creative assets to friends and classmates.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1.5">
                  <strong className="text-foreground font-semibold block flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Open Source &amp; Developer Assets</span>
                  </strong>
                  <p className="text-muted-foreground">
                    Hosting README badges, screenshots, architecture diagrams, benchmark logs, and build artifacts via direct <code>/raw/...</code> CDN links.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1.5">
                  <strong className="text-foreground font-semibold block flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Drop-and-Host Static Web Previews</span>
                  </strong>
                  <p className="text-muted-foreground">
                    Deploying HTML/CSS mockups and portfolio pages under <code>/site/[slug]</code> for instant client feedback within isolated sandboxes.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1.5">
                  <strong className="text-foreground font-semibold block flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Confidential Ephemeral Handoffs</span>
                  </strong>
                  <p className="text-muted-foreground">
                    Sharing sensitive keys, contract drafts, or credentials utilizing client-side AES-GCM 256 encryption and 60-second Burn on Preview self-destruction.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 3 */}
            <section id="section-prohibited" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  <Ban className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  3. Strictly Prohibited Content &amp; Actions
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                GPHosting maintains zero tolerance for dangerous, illicit, or predatory material. You agree that you will never transmit, store, or share:
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 space-y-2">
                  <strong className="text-foreground text-sm font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    Malware &amp; Exploit Payloads
                  </strong>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Viruses, worms, trojans, ransomware, keyloggers, botnet droppers, or automated script exploits designed to compromise target devices.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-2">
                  <strong className="text-foreground text-sm font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Copyright Infringement &amp; Piracy
                  </strong>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Cracked commercial software, unauthorized movie/audio streams, serial keygens, or proprietary works you lack authorization to share.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 space-y-2">
                  <strong className="text-foreground text-sm font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-600" />
                    CSAM &amp; Violent Harassment
                  </strong>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Child sexual abuse material (CSAM), non-consensual intimate imagery, terrorism, violent extortion, illegal weapons, or hate crimes.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-2">
                  <strong className="text-foreground text-sm font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    PII Leaks &amp; Identity Theft
                  </strong>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Breached database dumps, credit card collections, national identification numbers, private medical logs, or unconsented doxxing packages.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 4 */}
            <section id="section-anti-abuse" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <Cpu className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  4. Anti-Abuse, Device Fingerprinting &amp; Slot Protection
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                To guarantee that file download slots and bandwidth remain available for legitimate users, GPHosting implements strict defense measures:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-muted-foreground">
                <li>
                  <strong>Hardware Device Fingerprint Compliance:</strong> Our platform computes a privacy-preserving mathematical hash from client entropy to prevent bots from exhausting single-use links. Attempts to spoof, bypass, or flood requests using headless bot farms are strictly prohibited.
                </li>
                <li>
                  <strong>Prohibition on Slot Hoarding:</strong> You may not trigger concurrent download requests or maintain artificial open connections designed to monopolize or prematurely deplete limited-download or burner links.
                </li>
                <li>
                  <strong>Denial-of-Service (DoS) Attacks:</strong> Any attempt to stress, overwhelm, probe, or exhaust our edge network, database systems, or caching infrastructure will result in instantaneous IP/device blacklisting.
                </li>
              </ul>
            </section>

            {/* Section 5 */}
            <section id="section-api-rules" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <Terminal className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  5. Developer API &amp; Automated Access Rules
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Programmatic uploads via our REST API (<code>gp_live_...</code> keys) must adhere to these operational criteria:
              </p>
              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <strong className="text-foreground font-semibold block">Key Masking &amp; Custody</strong>
                  <p className="text-muted-foreground">
                    API keys are issued with a 2-step confirmation modal and stored as one-way cryptographic hashes. You are solely responsible for securing your key; do not commit live keys to public repositories.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <strong className="text-foreground font-semibold block">Rate Limits &amp; Throttling</strong>
                  <p className="text-muted-foreground">
                    Automated scripts must respect HTTP 429 rate limit responses. Automated scrapers attempting to systematically probe link IDs or brute force password-protected links are permanently barred.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 6 */}
            <section id="section-enforcement" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Flame className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  6. Enforcement &amp; Zero-Stale Shredding
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We enforce these standards decisively to protect our platform and community:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground">
                <li>
                  <strong>Instant File Shredding:</strong> Files reported and verified to breach this policy are purged immediately from storage buckets, database tables, and active cache layers with zero opportunity for retrieval.
                </li>
                <li>
                  <strong>Account Termination:</strong> Repeated or severe violations result in immediate account revocation, quota forfeit, and permanent device/IP bans.
                </li>
                <li>
                  <strong>Law Enforcement Referral:</strong> In cases involving CSAM, imminent physical harm, or severe cyberattacks, GPHosting cooperates fully with competent law enforcement and regulatory authorities.
                </li>
              </ul>
            </section>

            {/* Section 7 */}
            <section id="section-reporting" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <LifeBuoy className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  7. Reporting Violations &amp; Abuse
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                If you encounter content hosted on GPHosting that violates this policy, please submit an urgent notice including:
              </p>
              <div className="p-4 rounded-xl border border-border/80 bg-card/60 text-xs space-y-2">
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li>The exact URL of the offending file (e.g. <code>https://gphost.eu.cc/f/...</code>, <code>/raw/...</code>, or <code>/x/...</code>).</li>
                  <li>A concise statement detailing the violation.</li>
                  <li>For copyright claims, proof of intellectual property ownership.</li>
                  <li>Your contact email for verification purposes.</li>
                </ul>
              </div>
            </section>

            {/* Section 8: Revision History */}
            <section id="section-audit" className="scroll-mt-24 space-y-4 border-t border-border/80 pt-8">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                  <History className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  8. Revision History &amp; Audit Trail
                </h2>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border/80 text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border/80 bg-muted/50 font-semibold text-foreground">
                      <th className="p-3">Version</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Summary of Updates</th>
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
                        Initial acceptable use guidelines and core fair sharing restrictions.
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
                        Added guidelines for direct raw CDN embeds (<code>/raw/...</code>) and encryption key confidentiality.
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
                        Integrated terms for Burn on Preview (60s countdown) and single-use slot mechanics.
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
                        Expanded restrictions on automated API flooding, executable bot payloads, and automated bot deterrence.
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
                        Re-architected all fair play provisions into accessible, plain-English principles.
                      </td>
                    </tr>
                    <tr className="bg-rose-500/5">
                      <td className="p-3 font-mono font-bold text-rose-600 dark:text-rose-400">v3.2.0</td>
                      <td className="p-3 font-medium text-foreground">September 30, 2026</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-700 dark:text-rose-300 text-[10px] font-bold">
                          Active &amp; Effective
                        </span>
                      </td>
                      <td className="p-3 text-foreground font-medium">
                        Formalized standalone Acceptable Use Policy (AUP) with explicit rules covering hardware device fingerprinting for anti-abuse, Zero-Stale lifecycle purging, SHA-256 anti-tamper checksums, and 2-step API key management.
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
          <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          <Link href="/how-it-works" className="hover:text-foreground transition-colors">How to Use</Link>
          <Link href="/developers" className="hover:text-foreground transition-colors">User Guide &amp; API</Link>
        </div>
        &copy; {new Date().getFullYear()} GPHosting. Fast, Temporary &amp; Private File Sharing.
      </footer>
    </div>
  );
}
