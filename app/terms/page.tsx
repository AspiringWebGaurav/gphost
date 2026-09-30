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
import { TermsAutoScroll } from "@/components/terms-autoscroll";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Terms of Service — GPHosting",
  description:
    "Simple, easy-to-understand Terms of Service for GPHosting. Clear rules on temporary file sharing, auto-deletion, zero-stale lifecycle, and acceptable use.",
};

const SECTIONS = [
  { id: "section-agreement", title: "1. Welcome & Acceptance of Terms", icon: Scale },
  { id: "section-prohibited", title: "2. Acceptable Use Policy (AUP)", icon: Ban },
  { id: "section-transfers", title: "3. Fast Direct Uploads", icon: Server },
  { id: "section-burner", title: "4. Auto-Deletion & Zero-Stale Purge", icon: Flame },
  { id: "section-raw-cdn", title: "5. Direct Links, Slugs & Multi-Sharing", icon: Globe },
  { id: "section-encryption", title: "6. Zero-Knowledge Encryption & SHA-256", icon: Lock },
  { id: "section-api-keys", title: "7. Developer API Keys & 2-Step Flow", icon: Terminal },
  { id: "section-admission", title: "8. Accounts & Anti-Abuse Shield", icon: Key },
  { id: "section-quotas", title: "9. Storage Quotas & Limits", icon: HardDrive },
  { id: "section-license", title: "10. Open Source & Disclaimers", icon: FileCode },
  { id: "section-abuse", title: "11. Reporting Abuse & Getting Help", icon: LifeBuoy },
  { id: "section-audit", title: "12. What Changed Over Time", icon: History },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased transition-colors duration-200">
      <TermsAutoScroll />
      <style>{`
        :target, .highlight-pulse-active {
          scroll-margin-top: 6rem;
          border-radius: 1rem;
          animation: terms-highlight 3.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes terms-highlight {
          0% {
            outline: 3px solid rgba(245, 158, 11, 0.95);
            outline-offset: 6px;
            background-color: rgba(245, 158, 11, 0.12);
            box-shadow: 0 0 35px rgba(245, 158, 11, 0.3);
          }
          60% {
            outline: 2px solid rgba(245, 158, 11, 0.65);
            outline-offset: 6px;
            background-color: rgba(245, 158, 11, 0.06);
            box-shadow: 0 0 20px rgba(245, 158, 11, 0.15);
          }
          100% {
            outline: 1.5px solid rgba(245, 158, 11, 0.35);
            outline-offset: 6px;
            background-color: rgba(245, 158, 11, 0.02);
            box-shadow: none;
          }
        }
      `}</style>

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
            <span>Terms v3.2 (Plain English)</span>
          </div>
        </div>
      </header>

      {/* Hero Banner */}
      <section className="border-b border-border/60 bg-gradient-to-b from-muted/30 via-background to-background py-10 px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-20">
        <div className="w-full">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-xs font-semibold mb-4">
            <Scale className="w-3.5 h-3.5" />
            <span>Simple Terms &bull; Plain English</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground mb-4">
            Terms of Service
          </h1>

          <p className="text-sm sm:text-base text-muted-foreground max-w-4xl leading-relaxed mb-6">
            Welcome to GPHosting! These terms explain the rules and guidelines for using our fast, temporary file-sharing platform. We&rsquo;ve written them in plain, human English without convoluted legal jargon so you know exactly how everything works and what is expected.
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
            <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400 block">
                  Current Effective Date
                </span>
                <strong className="text-xs sm:text-sm font-semibold text-foreground">
                  September 30, 2026 (v3.2)
                </strong>
              </div>
            </div>

            {/* Card 4: Edition Code */}
            <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                  Edition
                </span>
                <strong className="text-xs sm:text-sm font-mono font-medium text-foreground">
                  TOS-2026.09.30-v3.2
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
                href="/acceptable-use"
                className="flex items-center justify-between text-xs text-rose-600 dark:text-rose-400 hover:underline"
              >
                <span>Acceptable Use (AUP)</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/privacy"
                className="flex items-center justify-between text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
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

          {/* Main Full-Width Content Stream */}
          <main className="min-w-0 space-y-12">
            {/* Direct-Transit & Ephemeral Warning Box */}
            <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs sm:text-sm leading-relaxed flex items-start gap-4">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div>
                <strong className="font-bold block mb-1 text-amber-950 dark:text-amber-100 text-sm sm:text-base">
                  Important: GPHosting is for Temporary Sharing, Not Permanent Cloud Storage
                </strong>
                GPHosting is built for quick, secure file sharing. It is <strong>not</strong> a permanent cloud backup drive or storage locker. Files automatically delete when their timer expires, when their download limit is reached, or 60 seconds after viewing if you turn on &ldquo;Burn on Preview&rdquo;. With our Zero-Stale Lifecycle Purge, once a file is deleted, all storage bytes, link metadata, and active download sessions are shredded forever. Please always maintain a local backup copy of your important files on your own device.
              </div>
            </div>

            {/* Section 1: Welcome & Acceptance */}
            <section id="section-agreement" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Scale className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  1. Welcome &amp; Acceptance of Terms
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                By accessing, browsing, uploading to, downloading from, or interacting with GPHosting (including our web application, file landing portals, raw CDN endpoints, and developer API routes), you acknowledge that you have read, understood, and agreed to be legally bound by these Terms of Service and our linked <Link href="/acceptable-use" className="text-indigo-600 dark:text-indigo-400 font-semibold underline underline-offset-2">Acceptable Use Policy (AUP)</Link>. If you do not accept these terms in full, you must not use or access GPHosting.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                These terms govern every feature of GPHosting: web uploads, direct download URLs, preview routes (<code>/f/...</code>), direct raw links (<code>/raw/...</code>), short alias redirects (<code>/x/...</code>), static HTML previews (<code>/site/...</code>), and automated API calls.
              </p>
            </section>

            {/* Section 2: Acceptable Use Policy (AUP) & Acceptance of Use */}
            <section id="section-prohibited" className="scroll-mt-24 space-y-4">
              <div id="section-acceptable-use" className="scroll-mt-24 -mt-24 pt-24" />
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  <Ban className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  2. Acceptable Use Policy (AUP) &amp; Content Rules
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                GPHosting is built for lawful, respectful, and constructive file sharing—such as sending documents, photos, portfolio sites, media, and code assets. You unconditionally agree that you will <strong>never</strong> upload, distribute, link to, or store:
              </p>

              {/* Grid of Prohibited Content Cards */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 space-y-2">
                  <strong className="text-foreground text-sm font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    A. Viruses, Malware &amp; Executable Exploits
                  </strong>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Viruses, trojans, ransomware, rootkits, spyware, keyloggers, botnets, or executable payload scripts designed to compromise, harm, or infiltrate devices.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-2">
                  <strong className="text-foreground text-sm font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    B. Copyrighted Works You Do Not Own
                  </strong>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Pirated movies, cracked software, stolen music albums, paid games, or any media protected by copyright where you lack explicit distribution rights.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 space-y-2">
                  <strong className="text-foreground text-sm font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-600" />
                    C. Illegal, Dangerous or CSAM Material
                  </strong>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Child sexual abuse material (CSAM), non-consensual intimate imagery, violent extremism, extortion, illegal arms, or controlled dangerous substances. Immediate termination and reporting to law enforcement authorities applies.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-2">
                  <strong className="text-foreground text-sm font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    D. Leaked Passwords, PII &amp; Doxxing
                  </strong>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Breached database dumps, stolen credentials, credit card details, government IDs, private health records, or doxxing individuals without authorization.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-2">
                  <strong className="text-foreground text-sm font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    E. Slot Hoarding &amp; Anti-Abuse Evasion
                  </strong>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Automated scripts that monopolize single-use slots, burner links, or attempt to circumvent rate limits or hardware device fingerprinting protections.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-2">
                  <strong className="text-foreground text-sm font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-500" />
                    F. Infrastructure Attacks &amp; Reverse-Engineering
                  </strong>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Denial-of-service (DoS) attempts, API scraping without valid authentication, proxy spoofing, or attempts to bypass authenticated file endpoints.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-border/80 bg-card/40 flex items-center justify-between text-xs text-muted-foreground">
                <span>Looking for the complete standalone policy document?</span>
                <Link
                  href="/acceptable-use"
                  className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400 hover:underline"
                >
                  <span>View Dedicated AUP Policy</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </section>

            {/* Section 3: Fast Direct Uploads */}
            <section id="section-transfers" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Server className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  3. Fast Direct Uploads &amp; Resumable Transfers
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We designed GPHosting to be as fast, private, and resilient as possible using direct storage transfers:
              </p>
              <div className="grid gap-3 sm:grid-cols-3 text-xs">
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1.5">
                  <strong className="text-foreground font-semibold block">Direct to Storage</strong>
                  <p className="text-muted-foreground">
                    Uploads travel directly from your browser to secure cloud storage using secure direct upload tokens. Our application servers never bottleneck or read your raw bytes.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1.5">
                  <strong className="text-foreground font-semibold block">Up to 1 GB per File</strong>
                  <p className="text-muted-foreground">
                    You can upload files as large as 1 GB. Large files use chunked transfers with local browser persistence to recover seamlessly from network drops.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1.5">
                  <strong className="text-foreground font-semibold block">Media Optimization</strong>
                  <p className="text-muted-foreground">
                    Image uploads can be automatically converted to modern WebP right in your browser, saving storage space while stripping privacy-invasive camera EXIF data.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 4: Auto-Deletion & Zero-Stale Purge */}
            <section id="section-burner" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Flame className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  4. Auto-Deletion, Expiration &amp; Zero-Stale Purge
                </h2>
              </div>

              {/* Callout */}
              <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100 flex items-start gap-3.5 text-xs sm:text-sm">
                <Flame className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <strong className="font-bold block text-sm sm:text-base text-foreground">
                    Zero-Stale Lifecycle Purge: Complete Ephemeral Cleanliness
                  </strong>
                  <p className="text-muted-foreground leading-relaxed">
                    When a file reaches its expiration timer, exhausts its download count, or burns after preview, our zero-stale lifecycle engine immediately shreds the storage file, purges all database records, and flushes all temporary download sessions and cache memory. Nothing lingers in cold storage.
                  </p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed">
                You can configure exactly how and when your files disappear:
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-1">
                  <div className="font-bold text-foreground flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-amber-500" />
                    <span>Burn on Preview</span>
                  </div>
                  <p className="text-muted-foreground">
                    The file starts a 60-second self-destruct timer the moment someone views it. When 60 seconds are up, the file is completely wiped.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <div className="font-bold text-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Single-Use Download</span>
                  </div>
                  <p className="text-muted-foreground">
                    The file vanishes permanently the very second someone finishes downloading it once. Single-use access controls prevent multiple concurrent downloads.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <div className="font-bold text-foreground flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-blue-500" />
                    <span>Custom Download Caps</span>
                  </div>
                  <p className="text-muted-foreground">
                    Pick a download limit (like 5, 25, or custom limits). Once that threshold is reached, the file is automatically purged.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <div className="font-bold text-foreground flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-purple-500" />
                    <span>Expiration Timers</span>
                  </div>
                  <p className="text-muted-foreground">
                    Set a time limit: 10 minutes, 1 hour, 24 hours, 7 days, 30 days, or keep it permanent if you are signed in.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 5: Direct Links, Custom Slugs & Multi-Channel Sharing */}
            <section id="section-raw-cdn" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                  <Globe className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  5. Direct Links, Custom Slugs &amp; Multi-Channel Sharing
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                GPHosting allows you to share files effortlessly through multiple distribution channels and custom routing paths:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-muted-foreground">
                <li>
                  <strong>Direct Raw CDN Links (<code>/raw/...</code>):</strong> Stream images, icons, or documentation directly on your GitHub READMEs, portfolio, or blog with automatic Edge CDN 1-hour caching.
                </li>
                <li>
                  <strong>Custom Short Slugs (<code>/x/[alias]</code>):</strong> Create branded, memorable short links (e.g., <code>/x/my-project</code>) for fast sharing without long random character strings.
                </li>
                <li>
                  <strong>Multi-Channel Share Sheet:</strong> Instantly share links via WhatsApp, Telegram, direct clipboard copy, or generate scan-and-go QR codes for fast mobile downloads.
                </li>
                <li>
                  <strong>Safe Content Headers:</strong> Raw files with potentially dangerous MIME types are safely served with strict Content-Disposition headers to prevent browser script injection.
                </li>
              </ul>
            </section>

            {/* Section 6: Zero-Knowledge Encryption & SHA-256 Checksums */}
            <section id="section-encryption" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Lock className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  6. Secret Zero-Knowledge Encryption &amp; SHA-256 Anti-Tamper
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                When you activate Client-Side Encryption, your file is scrambled directly in your browser with AES-GCM 256 before leaving your computer:
              </p>
              <div className="grid gap-4 sm:grid-cols-2 text-xs sm:text-sm">
                <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-2">
                  <strong className="text-foreground font-semibold block text-sm">
                    A. The Secret Key Stays in the URL Hash
                  </strong>
                  <p className="text-muted-foreground leading-relaxed">
                    The secret decryption key is stored exclusively after the <code>#</code> character in the URL. Web standards ensure browsers never transmit hash fragments to our servers. We never possess, see, or log your decryption key.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-2">
                  <strong className="text-foreground font-semibold block text-sm">
                    B. SHA-256 Anti-Tamper Integrity
                  </strong>
                  <p className="text-muted-foreground leading-relaxed">
                    Every upload generates a cryptographic SHA-256 hash verified during download. This guarantees that your file is delivered bit-for-bit identical to the original and has not been altered or tampered with in transit.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 7: Developer API Keys & 2-Step Flow */}
            <section id="section-api-keys" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <Terminal className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  7. Developer API Keys &amp; 2-Step Security Flow
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Developers can generate API keys (prefixed with <code>gp_live_...</code>) for terminal scripting, CLI uploads, and automated CI/CD integrations:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-muted-foreground">
                <li>
                  <strong>2-Step Confirmation Flow:</strong> Your secret key is shown exactly once in a copy-confirmation dialog. GPHosting stores only a secure one-way hash in our database, making it impossible for anyone to recover or view your plaintext key later.
                </li>
                <li>
                  <strong>Rate Limits &amp; Automated Protection:</strong> Programmatic uploads are governed by rate-limiting algorithms to ensure fair performance and prevent server exhaustion.
                </li>
                <li>
                  <strong>Executable Guard:</strong> Automated uploads are screened to prevent the distribution of unauthorized executable scripts or payload viruses.
                </li>
              </ul>
            </section>

            {/* Section 8: Accounts & Anti-Abuse Shield */}
            <section id="section-admission" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <Key className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  8. Accounts, Admissions &amp; Anti-Abuse Shield
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                To maintain a clean platform free from spambots and abuse, we use verified Google Sign-In with an invitation PIN or administrative approval:
              </p>
              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <strong className="text-foreground font-medium block">Google Sign-In &amp; Invitation Admission</strong>
                  <p className="text-muted-foreground">
                    Sign in with Google and submit an onboarding PIN. Once approved, your account receives full storage quota and access to advanced security settings.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <strong className="text-foreground font-medium block">Hardware Device Fingerprinting for Anti-Abuse</strong>
                  <p className="text-muted-foreground">
                    To prevent sybil attacks and slot hoarding on burner links, GPHosting uses lightweight, non-invasive hardware device fingerprinting. This signal is used strictly for real-time abuse defense and is never sold or used for ad targeting.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 9: Storage Quotas & Limits */}
            <section id="section-quotas" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
                  <HardDrive className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  9. Storage Quotas &amp; File Size Ceilings
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Each verified account is assigned an allocated storage quota (typically 5 GB) and an individual file size limit of 1 GB:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground">
                <li>
                  <strong>Real-Time Quota Accounting:</strong> Storage is computed accurately in real time. If an upload is canceled or aborted, storage reservations are immediately released.
                </li>
                <li>
                  <strong>Fair Allocation:</strong> Creating multiple accounts to circumvent quotas is strictly prohibited and results in immediate account suspension.
                </li>
              </ul>
            </section>

            {/* Section 10: Open Source & Disclaimers */}
            <section id="section-license" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                  <FileCode className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  10. Open Source &amp; Disclaimers
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The GPHosting architecture is available for learning and community security audits. However, running commercial clones, unauthorized re-hosting, or removing copyright branding is not permitted.
              </p>
              <div className="p-4 rounded-xl border border-border/80 bg-muted/40 text-xs text-muted-foreground leading-relaxed space-y-2">
                <strong className="text-foreground uppercase tracking-wide block">
                  Service Disclaimer (As-Is Provision)
                </strong>
                <p>
                  GPHosting is provided free of charge on an &ldquo;as-is&rdquo; and &ldquo;as-available&rdquo; basis without warranties of any kind. While we make every reasonable effort to ensure high availability, speed, and integrity, we cannot guarantee uninterrupted service or assume liability for lost files. Always maintain an independent local backup copy of your data.
                </p>
              </div>
            </section>

            {/* Section 11: Reporting Abuse */}
            <section id="section-abuse" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <LifeBuoy className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  11. Reporting Abuse &amp; Contacting Support
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                If you encounter a file hosted on GPHosting that violates these terms, infringes on your intellectual property, or compromises user safety, please notify our team immediately:
              </p>
              <div className="p-4 rounded-xl border border-border/80 bg-card/60 text-xs space-y-2">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>Information to Include with Abuse Reports:</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li>The exact URL of the offending file (e.g., <code>https://gphost.eu.cc/f/...</code> or <code>/raw/...</code>).</li>
                  <li>A clear description of the specific violation or harmful content.</li>
                  <li>For copyright claims, verifiable proof of ownership or authorization to act on the owner&rsquo;s behalf.</li>
                  <li>A valid contact email address for follow-up verification.</li>
                </ul>
                <p className="text-muted-foreground pt-1">
                  Abuse reports are investigated promptly. Verified violations result in immediate, permanent file shredding across all storage buckets and cache layers.
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
                  12. What Changed Over Time (Audit History)
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We believe in total transparency. Here is the complete chronological revision log of our Terms of Service:
              </p>

              <div className="overflow-x-auto rounded-xl border border-border/80">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border/80 bg-muted/50 font-semibold text-foreground">
                      <th className="p-3">Version</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Summary of Changes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    <tr className="bg-card/40">
                      <td className="p-3 font-mono font-semibold text-foreground">v1.0.0</td>
                      <td className="p-3 text-muted-foreground">September 14, 2026</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium">
                          Original Launch
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        Initial release with basic temporary file sharing, auto-deletion timers, and core fair use rules.
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
                        Added direct raw links (<code>/raw/...</code>) for GitHub READMEs, client-side secret encryption, and modern dark mode.
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
                        Added &ldquo;Burn on Preview&rdquo; (60-second destruction), single-use downloads, and custom download limits.
                      </td>
                    </tr>
                    <tr className="bg-card/40">
                      <td className="p-3 font-mono font-semibold text-foreground">v3.0.0</td>
                      <td className="p-3 text-muted-foreground">September 18, 2026</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium">
                          Superseded
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        Added developer API keys, 1 GB file uploads, bot protection, and edge speed optimizations.
                      </td>
                    </tr>
                    <tr className="bg-card/40">
                      <td className="p-3 font-mono font-semibold text-foreground">v3.1.0</td>
                      <td className="p-3 text-muted-foreground">September 19, 2026</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium">
                          Prior Revision (Superseded)
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        Rewrote all terms into clear, simple, human English so anyone can easily understand our rules without needing a law degree.
                      </td>
                    </tr>
                    <tr className="bg-emerald-500/5">
                      <td className="p-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">v3.2.0</td>
                      <td className="p-3 font-medium text-foreground">September 30, 2026</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                          Active &amp; Effective
                        </span>
                      </td>
                      <td className="p-3 text-foreground font-medium">
                        Added hardware device fingerprinting for anti-abuse, Zero-Stale lifecycle purge, 2-step API key flow with hashed secrets, SHA-256 anti-tamper checksums, multi-channel sharing (WhatsApp, Telegram, QR code), custom slug routing, and formalized Acceptable Use Policy (AUP).
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
          <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          <Link href="/how-it-works" className="hover:text-foreground transition-colors">How to Use</Link>
          <Link href="/developers" className="hover:text-foreground transition-colors">User Guide &amp; API</Link>
        </div>
        &copy; {new Date().getFullYear()} GPHosting. Fast, Temporary &amp; Private File Sharing.
      </footer>
    </div>
  );
}
