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
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-static";

export default function TermsPage() {
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
            Terms &amp; AUC v2.5
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto py-12 px-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-xs font-medium mb-4">
          <Scale className="w-3.5 h-3.5" />
          <span>Legal Framework &bull; Acceptable Use Conditions (AUC)</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-3">
          Terms of Service &amp; Acceptable Use Conditions
        </h1>
        <p className="text-xs text-muted-foreground mb-8">
          Last Updated &amp; Effective: September 2026 &bull; Reference: AUC-2026.09-v2.5
        </p>

        {/* Ephemeral Notice */}
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs leading-relaxed mb-10 flex items-start gap-3">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div>
            <strong className="font-semibold block mb-0.5 text-amber-900 dark:text-amber-200">
              Ephemeral &amp; Direct-Transit Notice:
            </strong>
            GPHosting is an ephemeral, direct-to-edge file sharing platform, not a permanent backup service.
            Files automatically expire, burn upon viewing or single-use download, and are irrevocably purged. Always keep an independent copy of your important files.
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
              By accessing, browsing, registering an account on, uploading files to, or integrating with GPHosting (&ldquo;the Service&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), you agree to these Terms of Service and Acceptable Use Conditions. If you do not agree with any portion of these terms, you must discontinue using the platform immediately.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Ban className="w-4 h-4 text-rose-500" />
              <span>2. Acceptable Use Conditions (Prohibited Content)</span>
            </h2>
            <p>
              GPHosting is provided for lawful personal, educational, developer, and non-infringing temporary file hosting. You strictly agree not to upload, link, host, or distribute:
            </p>
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div className="p-3.5 rounded-lg border border-border/70 bg-card/40 space-y-1.5">
                <strong className="text-foreground font-medium block">A. Malware &amp; Exploits</strong>
                <span>
                  Viruses, trojans, spyware, ransomware, keyloggers, botnet controllers, exploit scripts, or binaries intended to compromise systems.
                </span>
              </div>
              <div className="p-3.5 rounded-lg border border-border/70 bg-card/40 space-y-1.5">
                <strong className="text-foreground font-medium block">B. Copyright &amp; IP Infringement</strong>
                <span>
                  Pirated media, proprietary software, unauthorized distribution of commercial works, or trade secrets without explicit authorization.
                </span>
              </div>
              <div className="p-3.5 rounded-lg border border-border/70 bg-card/40 space-y-1.5">
                <strong className="text-foreground font-medium block">C. Harmful or Illegal Material</strong>
                <span>
                  Child sexual abuse material (CSAM), non-consensual imagery, terrorist propaganda, violent threats, harassment, or unlawful substance trafficking.
                </span>
              </div>
              <div className="p-3.5 rounded-lg border border-border/70 bg-card/40 space-y-1.5">
                <strong className="text-foreground font-medium block">D. Stolen &amp; Private Data</strong>
                <span>
                  Leaked passwords, scraped PII databases, private cryptographic keys, intercepted personal chats, or confidential identities published maliciously.
                </span>
              </div>
            </div>
          </section>

          {/* Section 3: Smart Burner & Expiration */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-500" />
              <span>3. Smart Burner &amp; Automated Destruction Rules</span>
            </h2>
            <p>
              GPHosting provides autonomous data lifecycle controls:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs">
              <li>
                <strong>Burn on Preview:</strong> When enabled, the first viewing of the file preview triggers an automated 60-second destruction lease. Once 60 seconds elapse, the file and all associated share links are purged permanently from both database and edge storage.
              </li>
              <li>
                <strong>Single-Use Claim:</strong> Single-use download links are immediately deleted from storage upon the first completed file download.
              </li>
              <li>
                <strong>Preset Expirations:</strong> Files set to 1 hour, 24 hours, 7 days, 30 days, or custom durations are swept and permanently removed upon reaching their expiry timestamp.
              </li>
              <li>
                <strong>Irreversible Purge:</strong> Once deleted or burned, files cannot be restored, retrieved, or recovered under any circumstance.
              </li>
            </ul>
          </section>

          {/* Section 4: Direct CDN & Raw Asset Hosting */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-500" />
              <span>4. Direct Raw / CDN Asset Hosting (/raw/[slug])</span>
            </h2>
            <p>
              Users may utilize direct raw links (<code>/raw/[slug]</code>) to embed approved assets (such as portfolio images, website banners, project documentation, and open-source GitHub README assets):
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs">
              <li>
                Direct asset hosting operates via HTTP 307 redirects to Cloudflare global edge storage with standard 1-hour CDN caching.
              </li>
              <li>
                Fair-use bandwidth applies. Utilizing direct raw hosting for high-volume unauthorized content delivery networks, automated spam bots, or ad networks without prior permission is prohibited.
              </li>
            </ul>
          </section>

          {/* Section 5: Client-Side Zero-Trust Encryption */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-500" />
              <span>5. Client-Side End-to-End Zero-Trust Encryption</span>
            </h2>
            <p>
              When utilizing Client-Side Encryption, cryptographic operations take place exclusively in the user&rsquo;s browser using the Web Crypto API (AES-GCM 256):
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs">
              <li>
                <strong>Zero Server Knowledge:</strong> Decryption keys exist exclusively in the URL hash fragment (e.g., <code>#key=...</code>). Because browsers do not transmit URL hash fragments to web servers, GPHosting servers never receive, store, or log your encryption keys.
              </li>
              <li>
                <strong>User Responsibility:</strong> You are solely responsible for safeguarding your encrypted links and keys. Because GPHosting has zero access to your keys, we cannot reset passwords or recover lost keys.
              </li>
            </ul>
          </section>

          {/* Section 6: Developer API Keys & CLI Tools */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Key className="w-4 h-4 text-purple-500" />
              <span>6. Developer API Keys &amp; Terminal Uploads</span>
            </h2>
            <p>
              Approved users may generate Developer API Keys for terminal uploads (using <code>curl</code> or custom scripts):
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs">
              <li>
                API keys must be kept secure. You are liable for any activity occurring under your key credentials.
              </li>
              <li>
                Automated flood requests, credential stuffing, or bypassing rate limits via API keys is prohibited and will result in immediate key revocation and account termination.
              </li>
            </ul>
          </section>

          {/* Section 7: Storage Quotas & Bandwidth */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-cyan-500" />
              <span>7. Storage Quotas &amp; Fair Bandwidth Allocation</span>
            </h2>
            <p>
              Each account operates under assigned storage limits (e.g. 5 GB default capacity) and single-file ceilings (up to 1 GB). Uploads exceeding available space will be rejected by our quota admission coordinator. Multiple account creation to circumvent quotas is prohibited.
            </p>
          </section>

          {/* Section 8: License & Disclaimers */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <FileCode className="w-4 h-4 text-indigo-500" />
              <span>8. Source License &amp; Limitation of Liability</span>
            </h2>
            <p>
              The GPHosting codebase is governed by the GPHosting Source-Available Reference License for inspection, personal, and educational purposes. The service is provided &ldquo;as-is&rdquo; without warranties of any kind. GPHosting and its maintainers shall not be liable for any data loss, damages, or service interruptions.
            </p>
          </section>

          {/* Section 9: Abuse Reporting */}
          <section className="space-y-3 border-t border-border/80 pt-6">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <LifeBuoy className="w-4 h-4 text-blue-500" />
              <span>9. Abuse Reporting &amp; Takedown Inquiries</span>
            </h2>
            <p className="text-xs">
              If you identify any file or link that violates these Terms or infringes on your legal rights, report it immediately to the site administrator for rapid investigation and immediate takedown.
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
