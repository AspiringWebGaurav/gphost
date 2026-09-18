import Link from "next/link";
import { ArrowLeft, Shield, Lock, EyeOff, Server, Trash2, CheckCircle2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-static";

export default function PrivacyPage() {
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
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">
            Privacy v2.5
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto py-12 px-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs font-medium mb-4">
          <Shield className="w-3.5 h-3.5" />
          <span>Privacy First &bull; Zero Data Harvesting</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-3">
          Privacy Policy
        </h1>
        <p className="text-xs text-muted-foreground mb-8">
          Last Updated &amp; Effective: September 2026
        </p>

        <div className="space-y-8 text-muted-foreground text-sm leading-relaxed">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>1. Our Core Privacy Promise</span>
            </h2>
            <p>
              GPHosting is built from the ground up to respect human privacy. We do not track you across the internet, we do not run advertising scripts, we do not profile users, and we <strong>never</strong> sell, rent, or monetize your personal data.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-500" />
              <span>2. Direct-to-Storage Architecture &amp; Privacy</span>
            </h2>
            <p>
              Unlike traditional cloud hosts where files pass through central company servers that can buffer, scan, or index your content, GPHosting streams files <strong>directly</strong> between your browser and high-speed Cloudflare storage. Our application servers never inspect, read, or hold your file contents in memory.
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-500" />
              <span>3. Zero-Trust Client-Side Encryption</span>
            </h2>
            <p>
              If you enable Zero-Trust Encryption, your file is encrypted inside your own web browser using AES-GCM 256 before upload. The secret key is placed in the URL hash fragment (<code>#key=...</code>). Because web browsers do not send URL hash fragments to web servers, <strong>GPHosting never sees or stores your key</strong>. Only people who have your exact link can decrypt and view the file.
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-amber-500" />
              <span>4. Automatic &amp; Permanent Deletion</span>
            </h2>
            <p>
              When a file reaches its expiration date, single-use download claim, or 60-second preview self-destruct timer, it is permanently and irreversibly purged from both our database and storage buckets. We do not keep residual backups or hidden archives of expired files.
            </p>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-teal-500" />
              <span>5. Anonymous Analytics &amp; Telemetry</span>
            </h2>
            <p>
              To provide file owners with basic download statistics, our edge proxies record simple aggregated view counters and approximate country/city locations. We do not link download telemetry to personal identities, do not perform IP fingerprinting, and do not use cross-site tracking cookies.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">6. Information We Store for Accounts</h2>
            <p>
              When you sign in with Google, we store your email address and profile name/avatar strictly to identify your account, display your dashboard, and enforce your storage quota.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-border py-8 px-6 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} GPHosting. Simple, Fast &amp; Private.
      </footer>
    </div>
  );
}
