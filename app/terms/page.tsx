import Link from "next/link";
import { ArrowLeft, Scale, ShieldAlert, Clock, Ban, Key, HardDrive, FileCode, LifeBuoy } from "lucide-react";
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
            Terms &amp; AUC v2.0
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto py-12 px-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-xs font-medium mb-4">
          <Scale className="w-3.5 h-3.5" />
          <span>Legal Framework &bull; Acceptable Use Conditions (AUC)</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-3">
          Terms of Service &amp; Acceptable Use Conditions
        </h1>
        <p className="text-xs text-muted-foreground mb-8">
          Last Updated &amp; Effective: September 2026 &bull; Reference: AUC-2026.09
        </p>

        {/* Notice Alert */}
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs leading-relaxed mb-10 flex items-start gap-3">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div>
            <strong className="font-semibold block mb-0.5 text-amber-900 dark:text-amber-200">
              Ephemeral Service Notice:
            </strong>
            GPHosting is an ephemeral file sharing and direct-transit platform, not an archival storage provider.
            Files are automatically destroyed upon expiration or following single-use claim conditions. Do not use this service as your sole repository for important or irreplaceable files.
          </div>
        </div>

        <div className="space-y-10 text-muted-foreground text-sm leading-relaxed">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Scale className="w-4 h-4 text-indigo-500" />
              <span>1. Agreement to Terms</span>
            </h2>
            <p>
              By accessing, browsing, registering an account on, or interacting with GPHosting (&ldquo;the Service&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), you certify that you are at least 18 years of age (or the legal age of majority in your jurisdiction) and agree to be bound unconditionally by these Terms of Service and Acceptable Use Conditions (&ldquo;AUC&rdquo;). If you do not agree with any part of these terms, you must immediately cease all access and use of the platform.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Ban className="w-4 h-4 text-red-500" />
              <span>2. Acceptable Use Conditions (AUC)</span>
            </h2>
            <p>
              The Service is provided solely for legitimate, non-infringing temporary file sharing. To safeguard our community, upstream infrastructure, and network integrity, you agree strictly not to upload, transmit, link, or distribute any content falling under the following prohibited categories:
            </p>
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div className="p-3.5 rounded-lg border border-border/70 bg-card/40 space-y-1.5">
                <strong className="text-foreground font-medium block">A. Malware &amp; Exploits</strong>
                <span>
                  Viruses, trojans, ransomware, worms, spyware, keyloggers, rootkits, botnet command scripts, exploit payloads, or obfuscated binaries designed to compromise systems.
                </span>
              </div>
              <div className="p-3.5 rounded-lg border border-border/70 bg-card/40 space-y-1.5">
                <strong className="text-foreground font-medium block">B. Intellectual Property Infringements</strong>
                <span>
                  Copyrighted software, media, trade secrets, proprietary documentation, or intellectual property for which you lack express authorization or licensing rights.
                </span>
              </div>
              <div className="p-3.5 rounded-lg border border-border/70 bg-card/40 space-y-1.5">
                <strong className="text-foreground font-medium block">C. Illegal &amp; Abusive Content</strong>
                <span>
                  Child sexual abuse material (CSAM), non-consensual imagery, terrorist propaganda, violent threats, harassment, defamatory material, or unlawful narcotics distribution.
                </span>
              </div>
              <div className="p-3.5 rounded-lg border border-border/70 bg-card/40 space-y-1.5">
                <strong className="text-foreground font-medium block">D. Unauthorized Private Data (PII)</strong>
                <span>
                  Stolen databases, exposed API credentials, private cryptographic keys, intercepted communications, or sensitive personally identifiable records published without consent.
                </span>
              </div>
            </div>
            <p className="text-xs pt-1">
              <strong>System Integrity Violations:</strong> You must not engage in denial-of-service (DoS) attacks, flood API endpoints, manipulate rate limiters, probe security boundaries, or use automated scripts/scrapers to bypass access gates.
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <span>3. Ephemeral Storage &amp; Automated Destruction</span>
            </h2>
            <p>
              GPHosting enforces strict automated data lifecycles:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs">
              <li>
                <strong>Time-to-Live (TTL):</strong> Files automatically expire according to their designated lifecycle (e.g., 24 hours, 7 days, 30 days, or 90 days).
              </li>
              <li>
                <strong>Single-Use (Burn-After-Read):</strong> Files designated for single-use transit are irrevocably destroyed from both our database and object storage buckets immediately following their first successful download claim.
              </li>
              <li>
                <strong>Irreversible Purge:</strong> Once expired or purged, data cannot be recovered, reconstructed, or restored under any circumstances. You bear full responsibility for maintaining your own independent backups.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Key className="w-4 h-4 text-blue-500" />
              <span>4. Account Access &amp; Invitation PIN Controls</span>
            </h2>
            <p>
              Access to file uploads and dashboard utilities is controlled via administrator review or invitation PIN codes. We reserve the unilateral right to approve, reject, rate limit, suspend, or terminate any user account or access credential at any time, with or without notice, if we detect or suspect abuse, policy violations, or suspicious activity.
            </p>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-emerald-500" />
              <span>5. Storage Quotas &amp; Fair Bandwidth Allocation</span>
            </h2>
            <p>
              Each account operates within designated storage capacity tiers and bandwidth limits. Upload requests exceeding assigned limits are automatically refused by our storage coordinator. We reserve the right to modify quota ceilings or throttle transfer speeds if bandwidth consumption poses a threat to platform stability.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <FileCode className="w-4 h-4 text-purple-500" />
              <span>6. Intellectual Property &amp; Source License</span>
            </h2>
            <p>
              The underlying GPHosting codebase is governed by the <strong>GPHosting Source-Available Reference License</strong>. You are permitted to inspect and audit the source code for personal, non-commercial, and educational purposes. Commercial exploitation, unauthorized SaaS re-hosting, branding misappropriation, and unlicensed redistribution are expressly prohibited.
            </p>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <LifeBuoy className="w-4 h-4 text-cyan-500" />
              <span>7. Disclaimer of Warranties &amp; Limitation of Liability</span>
            </h2>
            <p className="text-xs uppercase tracking-wide">
              The service is provided strictly on an &ldquo;as-is&rdquo; and &ldquo;as-available&rdquo; basis without warranties of any kind, whether express, implied, or statutory.
            </p>
            <p>
              To the maximum extent permitted by applicable law, GPHosting and its maintainers shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of data, loss of business, or downtime, arising from your use of or inability to use the platform.
            </p>
          </section>

          {/* Section 8 */}
          <section className="space-y-3 border-t border-border/80 pt-6">
            <h2 className="text-lg font-semibold text-foreground">8. Abuse Reporting &amp; Inquiries</h2>
            <p>
              If you identify any file, link, or user action that violates these Acceptable Use Conditions or infringes on your intellectual property, please report it immediately to the site administrator for rapid investigation and takedown.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
