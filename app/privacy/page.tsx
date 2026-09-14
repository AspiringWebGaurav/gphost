import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased transition-colors duration-200">
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
            Privacy
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto py-12 px-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs font-medium mb-4">
          <Shield className="w-3.5 h-3.5" />
          <span>Privacy First &bull; No Tracking</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-4">
          Privacy Policy
        </h1>
        <p className="text-xs text-muted-foreground mb-8">
          Last Updated: September 2026
        </p>

        <div className="space-y-8 text-muted-foreground text-sm leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">1. Our Promise</h2>
            <p>
              GPHosting is built from the ground up to respect your privacy.
              We do not track you across the web, we do not use advertising trackers, and we never sell or share your personal data.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">2. Information We Collect</h2>
            <p>
              When you sign in with Google, we only store your email address and profile picture to identify your account and enforce storage limits.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">3. File Storage &amp; Deletion</h2>
            <p>
              Files you upload are stored securely and deleted automatically when they expire or when their download limit is reached.
              Single-use files are permanently deleted after the first successful download.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">4. Passwords &amp; Encryption</h2>
            <p>
              If you protect a file with a password, it is hashed with industry-standard cryptographic algorithms (Argon2id). We never store your password in plain text.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">5. Contact</h2>
            <p>
              If you have any questions about how your files or account are handled, please contact the site administrator.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
