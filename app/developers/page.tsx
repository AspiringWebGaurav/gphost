import Link from "next/link";
import {
  ArrowLeft,
  UploadCloud,
  Lock,
  Share2,
  Sparkles,
  Flame,
  Globe,
  Archive,
  Terminal,
  ShieldCheck,
  Activity,
  Clock,
  Calendar,
  History,
  Zap,
  Layers,
  Cpu,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-static";

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased transition-colors duration-200">
      {/* Header */}
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
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            Guide v3.2
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto py-10 px-4 sm:px-8">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-medium mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Complete How-to-Use Guide</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground mb-3">
          How to Upload, Secure &amp; Share on GPHosting
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground max-w-2xl leading-relaxed mb-6">
          Everything you need to know about sharing files, setting up expiring links, custom vanity slugs, client-side encryption, and developer automation in plain, easy-to-understand words.
        </p>

        {/* Multi-Date Revision Strip */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-10">
          <div className="p-3 rounded-xl border border-border/80 bg-card/60 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
              <Calendar className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground block">
                Original Launch
              </span>
              <strong className="text-xs font-semibold text-foreground">
                Sep 14, 2026 (v1.0)
              </strong>
            </div>
          </div>

          <div className="p-3 rounded-xl border border-border/80 bg-card/60 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
              <History className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground block">
                Prior Revision
              </span>
              <strong className="text-xs font-semibold text-foreground">
                Sep 19, 2026 (v3.1)
              </strong>
            </div>
          </div>

          <div className="p-3 rounded-xl border border-blue-500/30 bg-blue-500/5 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold tracking-wider text-blue-600 dark:text-blue-400 block">
                Effective Date
              </span>
              <strong className="text-xs font-semibold text-foreground">
                Sep 30, 2026 (v3.2)
              </strong>
            </div>
          </div>

          <div className="p-3 rounded-xl border border-border/80 bg-card/60 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Layers className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground block">
                Edition
              </span>
              <strong className="text-xs font-mono font-medium text-foreground">
                GUIDE-2026.09.30
              </strong>
            </div>
          </div>
        </div>

        <div className="space-y-12">
          {/* ========================================================================= */}
          {/* SECTION 1: 3-Step Guide */}
          {/* ========================================================================= */}
          <section className="space-y-6">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <span>1. Upload Anything in 3 Easy Steps</span>
            </h2>

            <div className="grid gap-4 sm:grid-cols-3">
              {/* Step 1 */}
              <div className="p-5 rounded-2xl bg-card border border-border flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-base mb-3">
                    1
                  </div>
                  <h3 className="font-bold text-foreground text-sm mb-1.5 flex items-center gap-1.5">
                    <UploadCloud className="w-4 h-4 text-blue-500" />
                    <span>Drop Your File</span>
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Drag and drop any file up to 1 GB — photos, videos, homework PDFs, music, or code archives. Includes automatic in-browser WebP media conversion and local browser resumable transfer persistence.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="p-5 rounded-2xl bg-card border border-border flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-base mb-3">
                    2
                  </div>
                  <h3 className="font-bold text-foreground text-sm mb-1.5 flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-purple-500" />
                    <span>Choose Your Rules</span>
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Set a secret password, choose an expiry timer, activate <strong>Burn on Preview</strong> (60s self-destruction), or specify exact download limits (e.g. 1 single-use download).
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="p-5 rounded-2xl bg-card border border-border flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-base mb-3">
                    3
                  </div>
                  <h3 className="font-bold text-foreground text-sm mb-1.5 flex items-center gap-1.5">
                    <Share2 className="w-4 h-4 text-emerald-500" />
                    <span>Multi-Channel Share</span>
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Copy your link, generate custom short vanity URLs (<code>/x/[slug]</code>), share directly to WhatsApp or Telegram, or show a QR code for instantaneous mobile downloads.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ========================================================================= */}
          {/* SECTION 2: After-Upload Services */}
          {/* ========================================================================= */}
          <section className="space-y-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-500" />
                <span>2. Services &amp; Protections After Uploading</span>
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                Every file uploaded to GPHosting is backed by an enterprise-grade toolkit of sharing and security features:
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Service 1: Instant Share Links */}
              <div className="p-5 rounded-2xl bg-card border border-border space-y-2.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                    <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                      <Share2 className="w-4 h-4" />
                    </div>
                    <span>Multi-Channel Share Links</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                    Generates a modern web preview where friends can view photos, stream audio/video, inspect contents, or download directly. Share easily via WhatsApp, Telegram, or QR Code.
                  </p>
                </div>
                <div className="pt-2 text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                  WhatsApp &bull; Telegram &bull; QR Code &bull; Clean Links
                </div>
              </div>

              {/* Service 2: Direct Raw CDN Hotlinks */}
              <div className="p-5 rounded-2xl bg-card border border-border space-y-2.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                    <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                      <Globe className="w-4 h-4" />
                    </div>
                    <span>Direct Raw CDN &amp; Custom Slugs</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                    Get pure asset links under <code>/raw/[slug]</code> and custom aliases under <code>/x/[alias]</code>. Ideal for embedding images in GitHub READMEs, personal blogs, and documentation.
                  </p>
                </div>
                <div className="pt-2 text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                  Edge CDN 1-hour caching &bull; Custom short aliases
                </div>
              </div>

              {/* Service 3: Smart Burner */}
              <div className="p-5 rounded-2xl bg-card border border-border space-y-2.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                    <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                      <Flame className="w-4 h-4" />
                    </div>
                    <span>Smart Burner (Self-Destruct)</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                    Enable &ldquo;Burn on Preview&rdquo; and an automatic 60-second self-destruct begins when the page opens. Our Zero-Stale Lifecycle Purge ensures storage, database records, and active download sessions are wiped simultaneously.
                  </p>
                </div>
                <div className="pt-2 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                  60s destruction &bull; Zero-Stale lifecycle purge
                </div>
              </div>

              {/* Service 4: Password Protection */}
              <div className="p-5 rounded-2xl bg-card border border-border space-y-2.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                    <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500">
                      <Lock className="w-4 h-4" />
                    </div>
                    <span>Password Protection</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                    Lock any download link with a secret passphrase or PIN. The download gate requires entering the correct passphrase before any preview or transfer begins.
                  </p>
                </div>
                <div className="pt-2 text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                  Private PIN &bull; Cryptographically hardened security
                </div>
              </div>

              {/* Service 5: Custom Expiration */}
              <div className="p-5 rounded-2xl bg-card border border-border space-y-2.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                    <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-500">
                      <Clock className="w-4 h-4" />
                    </div>
                    <span>Auto-Expiry Timers</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                    Select your expiry schedule: 10 minutes, 1 hour, 24 hours, 7 days, 30 days, or permanent. When the timer elapses, storage space is automatically recovered.
                  </p>
                </div>
                <div className="pt-2 text-[11px] text-purple-600 dark:text-purple-400 font-medium">
                  Automatic background cleanup sweep
                </div>
              </div>

              {/* Service 6: Live Edge Analytics */}
              <div className="p-5 rounded-2xl bg-card border border-border space-y-2.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                      <Activity className="w-4 h-4" />
                    </div>
                    <span>Live Edge Analytics</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                    Track live views and download counts in real-time, inspect geographic country distribution, and view remaining download allowances without invasive trackers.
                  </p>
                </div>
                <div className="pt-2 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                  Real-time views &bull; Country stats &bull; Privacy-safe
                </div>
              </div>
            </div>
          </section>

          {/* ========================================================================= */}
          {/* SECTION 3: Advanced Privacy & Extra Tools */}
          {/* ========================================================================= */}
          <section className="space-y-6">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              3. Extra Tools: Bundling, Hosting &amp; Security
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Tool A: Zero-Trust Encryption */}
              <div className="p-5 rounded-2xl bg-card border border-border space-y-2">
                <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                  <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <span>Zero-Trust Encryption &amp; SHA-256 Checksums</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Scramble your files inside your browser using AES-GCM 256 before uploading. Decryption keys live strictly in the URL hash, and cryptographic SHA-256 checksums verify that files are tamper-free.
                </p>
              </div>

              {/* Tool B: 1-Click ZIP Download */}
              <div className="p-5 rounded-2xl bg-card border border-border space-y-2">
                <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                  <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-500">
                    <Archive className="w-4 h-4" />
                  </div>
                  <span>Batch Multi-File ZIP Download</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Sharing multiple pictures, homework documents, or project files? Select them in your file dashboard and download everything as a single compressed ZIP archive with zero server lag.
                </p>
              </div>

              {/* Tool C: Zero-Download ZIP Inspector */}
              <div className="p-5 rounded-2xl bg-card border border-border space-y-2">
                <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                    <Archive className="w-4 h-4" />
                  </div>
                  <span>Zero-Download ZIP Archive Inspector</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Inspect the internal folder structure of any ZIP file directly in your browser. Extract and download single files on the fly without downloading massive multi-gigabyte archives.
                </p>
              </div>

              {/* Tool D: GP-Sites Static Web Previews */}
              <div className="p-5 rounded-2xl bg-card border border-border space-y-2">
                <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                  <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-500">
                    <Globe className="w-4 h-4" />
                  </div>
                  <span>GP-Sites: Drop-and-Host Static Webpages</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Upload any HTML portfolio, landing page, or mockup. Host and view it instantly under <code>/site/[slug]</code> with an isolated sandbox and automatic lifecycle cleanup.
                </p>
              </div>

              {/* Tool E: In-Browser Media Optimizer */}
              <div className="p-5 rounded-2xl bg-card border border-border space-y-2">
                <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                  <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <span>In-Browser WebP Image Optimizer</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Automatically convert bulky JPG and PNG images into modern WebP format right in your browser. Strips private camera EXIF data and shrinks storage consumption by up to 70%.
                </p>
              </div>

              {/* Tool F: Hardware Anti-Abuse Shield */}
              <div className="p-5 rounded-2xl bg-card border border-border space-y-2">
                <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <span>Hardware Anti-Abuse Shield &amp; Fair Access</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Lightweight hardware device fingerprinting guarantees download slots for real humans and stops automated bots from exhausting single-use links or monopolizing burner files.
                </p>
              </div>
            </div>
          </section>

          {/* ========================================================================= */}
          {/* SECTION 4: Developer & Terminal Access */}
          {/* ========================================================================= */}
          <section className="space-y-4 p-6 rounded-2xl bg-card border border-border">
            <div className="flex items-center gap-2 font-bold text-foreground text-base">
              <Terminal className="w-5 h-5 text-purple-500" />
              <span>Developer API &amp; 2-Step Key Generation</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Upload directly from your terminal, CI/CD scripts, or custom applications. Create an API key in your Dashboard Settings with our secure 2-step confirmation workflow:
            </p>

            <div className="p-3.5 rounded-xl bg-muted/60 border border-border font-mono text-[11px] sm:text-xs overflow-x-auto text-foreground">
              <code>
                curl -X POST https://gphost.eu.cc/api/v1/upload \<br />
                &nbsp;&nbsp;-H &quot;Authorization: Bearer gp_live_your_key_here&quot; \<br />
                &nbsp;&nbsp;-F &quot;file=@my-project.zip&quot;
              </code>
            </div>
            <p className="text-[11px] text-muted-foreground">
              You instantly get back your direct download link and raw CDN asset link in clean JSON. Looking for code examples in Python, Windows CMD, and PowerShell? Check our <Link href="/docs" className="text-purple-600 dark:text-purple-400 font-semibold underline underline-offset-2">Interactive API Docs</Link>.
            </p>
          </section>

          {/* Policy Links Callout */}
          <div className="p-5 rounded-2xl border border-border/80 bg-card/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
            <div className="space-y-1 text-center sm:text-left">
              <strong className="font-semibold text-foreground block">Explore our Legal &amp; Security Standards</strong>
              <p className="text-muted-foreground">Review our plain-English policies covering acceptable use, privacy promises, and zero-stale file shredding.</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link
                href="/acceptable-use"
                className="px-3.5 py-1.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-medium hover:bg-rose-500/20 transition-colors"
              >
                Acceptable Use
              </Link>
              <Link
                href="/terms"
                className="px-3.5 py-1.5 rounded-xl bg-muted text-foreground hover:bg-muted/80 transition-colors font-medium"
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>

        {/* Ready to start button */}
        <div className="mt-12 text-center pt-8 border-t border-border">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 h-12 rounded-xl text-sm font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-sm shadow-blue-500/20 transition-all duration-150"
          >
            <span>Start Sharing Free</span>
            <ArrowLeft className="w-4 h-4 rotate-180" />
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-6 text-center text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center justify-center gap-6 mb-3">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <Link href="/acceptable-use" className="hover:text-foreground transition-colors">Acceptable Use Policy</Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          <Link href="/docs" className="hover:text-foreground transition-colors">API Docs</Link>
        </div>
        &copy; {new Date().getFullYear()} GPHosting. Simple, Fast &amp; Private.
      </footer>
    </div>
  );
}
