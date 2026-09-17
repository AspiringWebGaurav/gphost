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
  CheckCircle2,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

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
          How to Host &amp; Share Files on GPHost
        </h1>
        <p className="text-base text-muted-foreground max-w-2xl leading-relaxed mb-10">
          No complicated technical words. Whether you are a student sharing school projects, a creator hosting pictures, or just sending a private video to a friend — here is how it works.
        </p>

        <div className="space-y-12">
          {/* ========================================================================= */}
          {/* SECTION 1: 3-Step Guide */}
          {/* ========================================================================= */}
          <section className="space-y-6">
            <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <span>1. Host Anything in 3 Easy Steps</span>
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
                    Drag and drop any file up to 1 GB — photos, videos, homework PDFs, music, or code archives.
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
                    Set a password, choose when it expires, or turn on <strong>Burn on Preview</strong> so it self-destructs after viewing.
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
                    Copy your secret link and paste it into Discord, WhatsApp, or Email. Your friend downloads it at full speed!
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ========================================================================= */}
          {/* SECTION 2: What is the Middleman? */}
          {/* ========================================================================= */}
          <section className="space-y-4 p-6 sm:p-7 rounded-2xl bg-muted/40 border border-border">
            <div className="flex items-center gap-2 font-bold text-foreground text-lg">
              <Sparkles className="w-5 h-5 text-blue-500" />
              <span>What Does &ldquo;Without the Middleman&rdquo; Mean?</span>
            </div>

            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Most websites act like a slow, nosy middleman. Here is how GPHost is completely different:
            </p>

            <div className="grid gap-4 sm:grid-cols-2 pt-2">
              {/* Old Way */}
              <div className="p-4 rounded-xl bg-card border border-rose-500/20 text-xs space-y-2">
                <div className="font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                  <span>❌ Old Slow Way (With Middleman)</span>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  Your file first uploads to a company server. The server reads it, stores temporary copies, scans your data, and bottlenecks your upload speed.
                </p>
              </div>

              {/* GPHost Way */}
              <div className="p-4 rounded-xl bg-card border border-emerald-500/30 text-xs space-y-2">
                <div className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>⚡ GPHost Way (Direct &amp; Private)</span>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  Your browser connects <strong>directly</strong> to Cloudflare high-speed edge storage. Our web server never touches, reads, or buffers your file. It flies straight to the storage vault at maximum internet speed.
                </p>
              </div>
            </div>
          </section>

          {/* ========================================================================= */}
          {/* SECTION 3: Powerful Features Explained Simply */}
          {/* ========================================================================= */}
          <section className="space-y-6">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              2. Cool Features You Get
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Feature A: Smart Burner */}
              <div className="p-5 rounded-2xl bg-card border border-border space-y-2">
                <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                    <Flame className="w-4 h-4" />
                  </div>
                  <span>Smart Burner (Self-Destruct)</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Like a disappearing message! Turn on &ldquo;Burn on Preview&rdquo; and as soon as your friend views the file, a 60-second self-destruct timer starts. Once the timer hits zero, the file is deleted forever.
                </p>
              </div>

              {/* Feature B: Zero-Trust Encryption */}
              <div className="p-5 rounded-2xl bg-card border border-border space-y-2">
                <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                  <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <span>End-to-End Encryption</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Your computer locks your file with a 256-bit military-grade key inside your own browser before it ever leaves your machine. The secret key stays in your link. Even the server owner cannot open your file!
                </p>
              </div>

              {/* Feature C: Direct Raw CDN Link */}
              <div className="p-5 rounded-2xl bg-card border border-border space-y-2">
                <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                  <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                    <Globe className="w-4 h-4" />
                  </div>
                  <span>Direct Raw / CDN Links</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Need to show an image on your personal website, in a Discord embed, or on a GitHub README? GPHost gives you a clean <code>/raw/[slug]</code> link that displays the image or file directly without any download page.
                </p>
              </div>

              {/* Feature D: 1-Click ZIP Download */}
              <div className="p-5 rounded-2xl bg-card border border-border space-y-2">
                <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                  <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-500">
                    <Archive className="w-4 h-4" />
                  </div>
                  <span>Batch Multi-File ZIP</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Sharing multiple school slides, homework PDFs, or vacation photos? The recipient can click one button to download everything bundled together in a ZIP file, created right in their browser.
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
