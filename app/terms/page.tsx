import Link from "next/link";
import { ArrowLeft, Scale } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

export default function TermsPage() {
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
            Terms
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto py-12 px-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-xs font-medium mb-4">
          <Scale className="w-3.5 h-3.5" />
          <span>Simple Terms &bull; Fair Use</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-4">
          Terms of Service
        </h1>
        <p className="text-xs text-muted-foreground mb-8">
          Last Updated: September 2026
        </p>

        <div className="space-y-8 text-muted-foreground text-sm leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">1. Using GPHosting</h2>
            <p>
              By using GPHosting, you agree to use the service responsibly.
              You must not upload illegal content, malicious software, or material that infringes on others&apos; intellectual property rights.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">2. Account Access</h2>
            <p>
              Access to upload files is granted by the site administrator or through a valid invite PIN. We reserve the right to revoke access for abuse or policy violations.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">3. Temporary Storage</h2>
            <p>
              GPHosting is an ephemeral file sharing service, not a permanent backup solution. Files are automatically deleted when they expire or when their download conditions are met. Always keep your own backup of important files.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">4. Service Availability</h2>
            <p>
              We strive to keep the service fast, reliable, and online, but we provide it as-is without warranties of any kind.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
