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
    "Simple, easy-to-understand Terms of Service for GPHosting. Clear rules on temporary file sharing, auto-deletion, and acceptable use.",
};

const SECTIONS = [
  { id: "section-agreement", title: "1. Welcome & How It Works", icon: Scale },
  { id: "section-prohibited", title: "2. What You Can & Cannot Upload", icon: Ban },
  { id: "section-transfers", title: "3. Fast Direct Uploads", icon: Server },
  { id: "section-burner", title: "4. Auto-Deletion & Expiration", icon: Flame },
  { id: "section-raw-cdn", title: "5. Direct Links for READMEs & Sites", icon: Globe },
  { id: "section-encryption", title: "6. Secret End-to-End Encryption", icon: Lock },
  { id: "section-api-keys", title: "7. Developer API Keys", icon: Terminal },
  { id: "section-admission", title: "8. Accounts & Invitations", icon: Key },
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
            <span>Terms v3.1 (Plain English)</span>
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
            Welcome to GPHosting! These terms explain the simple rules for using our fast, temporary file-sharing platform. We&rsquo;ve written them in plain, human English without complicated legal jargon so you know exactly how everything works.
          </p>

          {/* Prominent Dual-Date Revision Strip */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl">
            <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                  Original Launch
                </span>
                <strong className="text-xs sm:text-sm font-semibold text-foreground">
                  September 14, 2026 (v1.0)
                </strong>
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400 block">
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
                  TOS-2026.09.19-v3.1
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
                <span>User Guide &amp; API</span>
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
                  Important: GPHosting is for Temporary Sharing, Not Permanent Storage
                </strong>
                GPHosting is built for quick, secure file sharing. It is <strong>not</strong> a permanent cloud backup drive or storage locker. Files automatically delete when their timer expires, when their download limit is reached, or 60 seconds after viewing if you turn on &ldquo;Burn on Preview&rdquo;. Once a file is deleted, it is gone forever. Please always keep a backup copy of your important files on your own device.
              </div>
            </div>

            {/* Section 1 */}
            <section id="section-agreement" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Scale className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  1. Welcome &amp; How GPHosting Works
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                By using GPHosting (visiting our website, uploading files, opening download links, or using our developer tools), you agree to these simple terms. If you do not agree with them, please do not use the service.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                These rules apply to everything on GPHosting: our web application, direct download links, preview pages (<code>/f/...</code>), direct raw links for images and files (<code>/raw/...</code>), and our developer API routes.
              </p>
            </section>

            {/* Section 2 */}
            <section id="section-prohibited" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/70">
                <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  <Ban className="w-5 h-5" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  2. What You Can and Cannot Upload (Fair Use)
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                GPHosting is built for helpful, lawful sharing—such as sending documents to friends, sharing screenshots, linking assets in GitHub READMEs, or testing code. You agree that you will <strong>never</strong> upload or share:
              </p>

              {/* Grid of Prohibited Content Cards */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
                <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 space-y-2">
                  <strong className="text-foreground text-sm font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    A. Viruses, Malware &amp; Hacking Tools
                  </strong>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Viruses, trojans, ransomware, spyware, keyloggers, botnet tools, or any software designed to damage, hack, or take over someone else&rsquo;s computer or phone.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-2">
                  <strong className="text-foreground text-sm font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    B. Copyrighted Material You Don&rsquo;t Own
                  </strong>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Pirated movies, cracked software, stolen music albums, paid games, or any other copyrighted content you do not have permission from the creator to share.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 space-y-2">
                  <strong className="text-foreground text-sm font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-600" />
                    C. Illegal, Abusive or Dangerous Material
                  </strong>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Child sexual abuse material (CSAM), non-consensual private pictures, violent extremism, extortion, illegal weapons, or dangerous illegal substances.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-2">
                  <strong className="text-foreground text-sm font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    D. Stolen Passwords &amp; Private Information
                  </strong>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Leaked password databases, stolen credit cards, leaked personal ID cards, private medical records, or doxxing someone without their permission.
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
                  3. Fast Direct Uploads
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We designed GPHosting to be as fast and smooth as possible using direct uploads:
              </p>
              <div className="grid gap-3 sm:grid-cols-3 text-xs">
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1.5">
                  <strong className="text-foreground font-semibold block">Direct to Storage</strong>
                  <p className="text-muted-foreground">
                    When you upload, files travel straight from your browser to secure Cloudflare R2 storage. Our web servers never slow down or inspect your transfer.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1.5">
                  <strong className="text-foreground font-semibold block">Up to 1 GB per File</strong>
                  <p className="text-muted-foreground">
                    You can upload files as large as 1 GB. Large files are safely sent in pieces with automatic retries if your internet blinks.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1.5">
                  <strong className="text-foreground font-semibold block">Fast for Everyone</strong>
                  <p className="text-muted-foreground">
                    Because our web servers don&rsquo;t bottleneck your bandwidth, downloads and uploads stay fast and reliable even during busy hours.
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
                  4. Auto-Deletion &amp; How Files Expire
                </h2>
              </div>

              {/* Explicit Why You Are Seeing This Callout */}
              <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100 flex items-start gap-3.5 text-xs sm:text-sm">
                <Flame className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <strong className="font-bold block text-sm sm:text-base text-foreground">
                    Why files disappear: Built-In Privacy &amp; Cleanliness
                  </strong>
                  <p className="text-muted-foreground leading-relaxed">
                    We don&rsquo;t hoard your files forever. When an expiration timer ends, a download limit is reached, or a burner file is viewed, it is completely erased from our storage and databases.
                  </p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed">
                You can choose exactly how and when your files disappear:
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
                    The file vanishes permanently the very second someone finishes downloading it once.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <div className="font-bold text-foreground flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-blue-500" />
                    <span>Download Limits</span>
                  </div>
                  <p className="text-muted-foreground">
                    Pick a download limit (like 5 or 25 downloads). Once that number of downloads is hit, the file is automatically deleted.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <div className="font-bold text-foreground flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-purple-500" />
                    <span>Expiration Timers</span>
                  </div>
                  <p className="text-muted-foreground">
                    Set a time limit: 1 hour, 24 hours, 7 days, 30 days, 90 days, or keep it forever if you are signed in.
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
                  5. Direct Links for READMEs &amp; Sites (<code>/raw/...</code>)
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You can create direct raw links (like <code>/raw/your-file-name</code>) to display images, icons, or documentation directly on your GitHub projects, personal website, or blog:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-muted-foreground">
                <li>
                  <strong>Fast Global Delivery:</strong> Images and assets load quickly worldwide using Cloudflare&rsquo;s global content network with automatic 1-hour caching.
                </li>
                <li>
                  <strong>Safe File Handling:</strong> Files that could run unsafe code are safely served as regular downloads instead of opening directly inside a web browser.
                </li>
                <li>
                  <strong>Fair Usage:</strong> Raw links are meant for normal websites, README files, and documentation. Please do not use them to run commercial streaming services, ad tracking networks, or automated scrapers.
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
                  6. Secret End-to-End Encryption
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                When you turn on Client-Side Encryption, your file is scrambled directly on your own computer before it ever leaves your device:
              </p>
              <div className="grid gap-4 sm:grid-cols-2 text-xs sm:text-sm">
                <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-2">
                  <strong className="text-foreground font-semibold block text-sm">
                    A. The Secret Key Stays with You
                  </strong>
                  <p className="text-muted-foreground leading-relaxed">
                    The secret password to unlock your file lives only in the link after the <code>#</code> symbol. Web browsers never send that part to our servers. That means we cannot see your password and we cannot view your file contents.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-2">
                  <strong className="text-foreground font-semibold block text-sm">
                    B. No Password Recovery
                  </strong>
                  <p className="text-muted-foreground leading-relaxed">
                    Because only you have the secret key, we have no way to reset or recover it for you. If you lose the link with the secret key, the file cannot be recovered by anyone, including our team.
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
                  7. Developer API Keys
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Developers can generate API keys (starting with <code>gp_live_...</code>) to upload files automatically from terminal scripts, command-line tools, or CI/CD pipelines:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-muted-foreground">
                <li>
                  <strong>Safe Key Storage:</strong> Your key is shown once when you create it. We only save a secure one-way hash in our database, so no one can read your real key if they look at our records.
                </li>
                <li>
                  <strong>Speed &amp; Rate Limits:</strong> Automated uploads are protected by fair rate limits to ensure that scripts don&rsquo;t overload the service or slow it down for others.
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
                  8. Accounts &amp; Invitations
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                To keep our servers clean and prevent spam bots, we use simple Google Sign-In combined with an invitation PIN or admin approval:
              </p>
              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <strong className="text-foreground font-medium block">Simple Sign-In with Google</strong>
                  <p className="text-muted-foreground">
                    Enter an invitation PIN or request access from the administrator. Once approved, your account is immediately active with full storage quota.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-1">
                  <strong className="text-foreground font-medium block">Keeping the Platform Clean</strong>
                  <p className="text-muted-foreground">
                    We reserve the right to suspend or remove any account or access key that breaks our fair use rules or tries to spam or abuse the system.
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
                  9. Storage Quotas &amp; Limits
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Each registered account has an allocated storage space (usually 5 GB) and a 1 GB maximum size for any individual file:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground">
                <li>
                  <strong>Live Storage Balance:</strong> Your available space updates as you upload or delete files. If an upload gets interrupted or canceled, your storage balance is automatically restored.
                </li>
                <li>
                  <strong>Fair Play:</strong> Please do not create multiple fake accounts to bypass storage limits or bypass upload limits.
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
                  10. Open Source &amp; Disclaimers
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The GPHosting codebase is open for everyone to review, learn from, and audit for security. However, you may not copy the service to run a paid clone or remove our branding for commercial re-hosting.
              </p>
              <div className="p-4 rounded-xl border border-border/80 bg-muted/40 text-xs text-muted-foreground leading-relaxed space-y-2">
                <strong className="text-foreground uppercase tracking-wide block">
                  Service Disclaimer (As-Is)
                </strong>
                <p>
                  GPHosting is provided free of charge on an &ldquo;as-is&rdquo; and &ldquo;as-available&rdquo; basis. While we do everything we can to keep the service fast, secure, and always online, we cannot guarantee that the service will never have bugs or downtime. We are not responsible for any lost files or data. Always keep a personal copy of your important documents!
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
                  11. Reporting Abuse &amp; Getting Help
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                If you ever see a file hosted on GPHosting that violates these rules, infringes on your copyright, or makes you feel unsafe, please let us know right away. When reporting, please include:
              </p>
              <div className="p-4 rounded-xl border border-border/80 bg-card/60 text-xs space-y-2">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>What to Include in Your Report:</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li>The exact link to the file (such as <code>https://gphost.eu.cc/f/...</code> or <code>/raw/...</code>).</li>
                  <li>A brief explanation of what is wrong with the file.</li>
                  <li>If it is a copyright issue, proof that you own the work.</li>
                  <li>Your email address so we can reply to you.</li>
                </ul>
                <p className="text-muted-foreground pt-1">
                  We review reports quickly. Once verified, violating files are immediately deleted forever from both our storage and our databases.
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
                  12. What Changed Over Time
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We believe in full transparency. Here is the history of updates to our terms:
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
                        Added developer API keys, 1 GB file uploads, bot protection, edge speed optimizations, and modern Node 24 runtime.
                      </td>
                    </tr>
                    <tr className="bg-emerald-500/5">
                      <td className="p-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">v3.1.0</td>
                      <td className="p-3 font-medium text-foreground">September 19, 2026</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                          Active &amp; Effective
                        </span>
                      </td>
                      <td className="p-3 text-foreground font-medium">
                        Rewrote all terms into clear, simple, human English so anyone can easily understand our rules without needing a law degree.
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
        &copy; {new Date().getFullYear()} GPHosting. Fast, Temporary &amp; Private File Sharing.
      </footer>
    </div>
  );
}
