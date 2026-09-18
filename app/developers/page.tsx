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
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-static";

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased transition-colors duration-200">
      {/* Header */}
      <header className="h-16 border-b border-border/80 bg-background/80 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-50">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Home</span>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            Simple Guide
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto py-12 px-6">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-medium mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Easy Guide for Everyone</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-3">
          How to Upload &amp; Share Files on GPHost
        </h1>
        <p className="text-base text-muted-foreground max-w-2xl leading-relaxed mb-10">
          No complicated technical jargon. Whether you are a student sharing school projects, a creator hosting pictures, or sending private videos to friends — here is everything you can do.
        </p>

        <div className="space-y-12">
          {/* ========================================================================= */}
          {/* SECTION 1: 3-Step Guide */}
          {/* ========================================================================= */}
          <section className="space-y-6">
            <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
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
                    Drag and drop any file up to 1 GB — photos, videos, homework PDFs, music, or code archives. Fast cloud transfer with zero wait.
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
                    Set a password, pick an expiry date, or turn on <strong>Burn on Preview</strong> so your file deletes immediately after viewing.
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
                    <span>Share the Link</span>
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Copy your link and paste it into Discord, WhatsApp, or Email. Your friend previews or downloads it at top internet speed!
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
              <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-500" />
                <span>2. Services You Get After Uploading</span>
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                Once your file is uploaded, you have a complete toolkit of sharing and security options:
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
                    <span>Instant Share Links</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                    Generates a clean web page where your friends can preview images, watch videos in-browser, or download the original file with one click.
                  </p>
                </div>
                <div className="pt-2 text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                  Clean URLs for Discord &amp; WhatsApp
                </div>
              </div>

              {/* Service 2: Direct Raw CDN Hotlinks */}
              <div className="p-5 rounded-2xl bg-card border border-border space-y-2.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                    <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                      <Globe className="w-4 h-4" />
                    </div>
                    <span>Direct Raw CDN Links</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                    Gives you a pure <code>/raw/[slug]</code> link. Perfect for showing pictures on your website, embedding video streams, or linking in GitHub READMEs.
                  </p>
                </div>
                <div className="pt-2 text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                  Zero landing page, direct asset stream
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
                    Like a disappearing message! Enable &ldquo;Burn on Preview&rdquo; and a 60-second countdown begins as soon as opened. Once expired, the file is gone forever.
                  </p>
                </div>
                <div className="pt-2 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                  Automatic irreversible deletion
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
                    Lock any download link with your own secret passphrase. Anyone opening the link must enter the password to view or download the file.
                  </p>
                </div>
                <div className="pt-2 text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                  Private PIN or custom passphrase
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
                    Choose when your file should automatically expire (10 minutes, 1 hour, 1 day, 7 days, 30 days, or permanent). Automatically cleans up storage.
                  </p>
                </div>
                <div className="pt-2 text-[11px] text-purple-600 dark:text-purple-400 font-medium">
                  Automatic space management
                </div>
              </div>

              {/* Service 6: Real-Time Edge Analytics */}
              <div className="p-5 rounded-2xl bg-card border border-border space-y-2.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                      <Activity className="w-4 h-4" />
                    </div>
                    <span>Live Edge Analytics</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                    See how many times your link was viewed and downloaded in real-time, plus geographic country distribution so you know who accessed it.
                  </p>
                </div>
                <div className="pt-2 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                  Real-time download counts &amp; locations
                </div>
              </div>
            </div>
          </section>

          {/* ========================================================================= */}
          {/* SECTION 3: Advanced Privacy & Multi-File ZIP */}
          {/* ========================================================================= */}
          <section className="space-y-6">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              3. Extra Tools: Bundling &amp; Encryption
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Tool A: Zero-Trust Encryption */}
              <div className="p-5 rounded-2xl bg-card border border-border space-y-2">
                <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                  <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <span>Client-Side Zero-Trust Encryption</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Your computer encrypts your file with AES-GCM 256 inside your browser before uploading. The secret key stays in the URL hash and is never sent to the server.
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
                  Sharing multiple pictures, homework documents, or project files? Select them in your file list and download everything as a single ZIP file with zero server lag.
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
              <span>For Developers &amp; Terminal Geeks</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              If you code, you don&rsquo;t even need to open a web browser. Generate an API key in your Dashboard Settings and upload directly from your terminal or scripts:
            </p>

            <div className="p-3.5 rounded-xl bg-muted/60 border border-border font-mono text-[11px] sm:text-xs overflow-x-auto text-foreground">
              <code>
                curl -X POST https://gphost.eu.cc/api/v1/upload \<br />
                &nbsp;&nbsp;-H &quot;Authorization: Bearer gp_live_your_key_here&quot; \<br />
                &nbsp;&nbsp;-F &quot;file=@my-project.zip&quot;
              </code>
            </div>
            <p className="text-[11px] text-muted-foreground">
              You instantly get back your direct download link and raw CDN asset link in clean JSON.
            </p>
          </section>
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
        &copy; {new Date().getFullYear()} GPHosting. Simple, Fast &amp; Private.
      </footer>
    </div>
  );
}
