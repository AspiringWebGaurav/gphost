"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  Download,
  FileCode,
  FileText,
  Clock,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Sparkles,
  Info,
  Copy,
  Check,
  FileCheck,
  Shield,
  HelpCircle,
  Globe,
} from "lucide-react";

interface GdprComplianceCardProps {
  storageUsedBytes: number;
  quotaBytes: number;
  role: string;
  memberSince: string;
}

function formatBytes(bytes: number): string {
  if (bytes === -1) return "Unlimited";
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function GdprComplianceCard({
  storageUsedBytes,
  quotaBytes,
  role,
  memberSince,
}: GdprComplianceCardProps) {
  const [downloadingFormat, setDownloadingFormat] = useState<"json" | "html" | "txt" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [latestChecksum, setLatestChecksum] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);
  const [showFormatGuide, setShowFormatGuide] = useState(false);

  const quotaPercent =
    quotaBytes > 0 ? Math.min(100, Math.round((storageUsedBytes / quotaBytes) * 100)) : 0;

  const handleExport = async (format: "json" | "html" | "txt") => {
    setDownloadingFormat(format);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/user/data-export?format=${format}`);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 429) {
          setErrorMessage(
            errorData.error ||
              "Rate limit reached. Data exports are restricted to 5 requests per hour. Please try again later."
          );
        } else {
          setErrorMessage(errorData.error || "Failed to generate GDPR data export.");
        }
        return;
      }

      // Capture authoritative SHA-256 header
      const shaHeader = res.headers.get("X-SHA256-Checksum");
      if (shaHeader) {
        setLatestChecksum(shaHeader);
      }

      // Extract filename from header or fallback
      const disposition = res.headers.get("Content-Disposition");
      let filename = `gphost-gdpr-data-export.${format}`;
      if (disposition && disposition.includes("filename=")) {
        const match = disposition.match(/filename=["']?([^"';]+)["']?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);

      setSuccessMessage(
        format === "json"
          ? "Raw JSON archive downloaded. Includes machine-readable database records & SHA-256 seal."
          : format === "html"
          ? "Visual Web Report downloaded. You can open it in any browser or save it as PDF offline."
          : "Audit Certificate & License downloaded with official SHA-256 integrity seal."
      );
      setTimeout(() => setSuccessMessage(null), 6000);
    } catch {
      setErrorMessage("Network error while exporting data. Please check your connection.");
    } finally {
      setDownloadingFormat(null);
    }
  };

  const handleCopyHash = () => {
    if (!latestChecksum) return;
    navigator.clipboard.writeText(latestChecksum);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  return (
    <div className="p-4 sm:p-6 rounded-2xl bg-card border border-border/80 shadow-xs space-y-5">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20 shadow-xs">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-bold text-foreground">
                Data Transparency &amp; Ownership
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                GDPR Articles 15 &amp; 20
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              You own 100% of your data. Full byte-level accounting of your stored files, active links, and audit history.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs self-start sm:self-auto shrink-0">
          <a
            href="https://gauravpatil.site"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            title="Visit Gaurav's developer portfolio"
          >
            <Globe className="w-3.5 h-3.5 text-blue-500" />
            <span>gauravpatil.site</span>
            <ExternalLink className="w-2.5 h-2.5 opacity-70" />
          </a>
          <span className="text-border">•</span>
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <span>Privacy Policy</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2.5 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
          <span className="leading-snug">{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2.5 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
          <span className="leading-snug">{errorMessage}</span>
        </div>
      )}

      {/* Live Storage Footprint Bar */}
      <div className="p-4 rounded-xl bg-muted/30 border border-border/80 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <HardDrive className="w-3.5 h-3.5 text-blue-500" />
            <span>Byte-Level Account Footprint</span>
          </div>
          <span className="font-mono text-muted-foreground font-medium">
            {formatBytes(storageUsedBytes)} / {formatBytes(quotaBytes)} ({quotaPercent}%)
          </span>
        </div>

        <div className="w-full h-2 rounded-full bg-muted/80 overflow-hidden p-0.5 border border-border/50">
          <div
            className="h-full bg-gradient-to-r from-blue-600 to-cyan-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(1, quotaPercent))}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between text-[11px] text-muted-foreground pt-0.5">
          <span>Active Storage: <strong className="text-foreground font-mono">{formatBytes(storageUsedBytes)}</strong></span>
          <span>Role Quota: <strong className="text-foreground font-mono">{formatBytes(quotaBytes)}</strong> ({role})</span>
          <span>Account Created: <strong className="text-foreground">{new Date(memberSince).toLocaleDateString()}</strong></span>
        </div>
      </div>

      {/* Primary Export Suite */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-blue-500" />
              <span>Export Your Personal Data Archive</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Download your complete personal archive with cryptographic SHA-256 verification.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowFormatGuide((prev) => !prev)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-500 transition cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>{showFormatGuide ? "Hide format guide" : "What are these formats?"}</span>
          </button>
        </div>

        {/* Friendly explanation guide (answers "what is this html report?") */}
        {showFormatGuide && (
          <div className="p-3.5 rounded-xl bg-blue-500/[0.06] border border-blue-500/20 text-xs text-foreground space-y-2 animate-in fade-in duration-150">
            <p className="font-semibold text-blue-700 dark:text-blue-300">
              Understanding Your 3 Export Options:
            </p>
            <ul className="space-y-1.5 text-muted-foreground text-[11.5px] leading-relaxed">
              <li className="flex items-start gap-2">
                <strong className="text-foreground shrink-0 font-medium">🌐 Web Report (HTML):</strong>
                <span>A visual document that opens in any browser on your phone or computer. Shows styled tables and charts of your files, links, and logs. You can save or print it as a clean PDF with one click.</span>
              </li>
              <li className="flex items-start gap-2">
                <strong className="text-foreground shrink-0 font-medium">⚡ Raw Data (JSON):</strong>
                <span>The complete raw database export in standard JSON format. Best for developers, custom backup scripts, or migrating to another service.</span>
              </li>
              <li className="flex items-start gap-2">
                <strong className="text-foreground shrink-0 font-medium">🛡️ License &amp; Checksum (TXT):</strong>
                <span>A signed text certificate containing your official SHA-256 security fingerprint, personal data ownership license from Gaurav, and verification instructions.</span>
              </li>
            </ul>
          </div>
        )}

        {/* 3 Download Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Option 1: Web Report (HTML) */}
          <div className="p-3.5 rounded-xl bg-muted/20 hover:bg-muted/30 border border-border/80 flex flex-col justify-between space-y-3 transition">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 font-bold text-xs text-foreground">
                  <FileText className="w-4 h-4 text-blue-500" />
                  <span>Web Report (HTML)</span>
                </div>
                <span className="text-[10px] font-semibold font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  Visual / PDF
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Interactive report with charts and tables. Opens in any browser offline or saves as PDF.
              </p>
            </div>

            <button
              type="button"
              disabled={downloadingFormat !== null}
              onClick={() => handleExport("html")}
              className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50"
            >
              {downloadingFormat === "html" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>{downloadingFormat === "html" ? "Generating..." : "Download Web Report"}</span>
            </button>
          </div>

          {/* Option 2: Raw Backup (JSON) */}
          <div className="p-3.5 rounded-xl bg-muted/20 hover:bg-muted/30 border border-border/80 flex flex-col justify-between space-y-3 transition">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 font-bold text-xs text-foreground">
                  <FileCode className="w-4 h-4 text-purple-500" />
                  <span>Raw Data (JSON)</span>
                </div>
                <span className="text-[10px] font-semibold font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                  Developer Backup
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Machine-readable database records for migrations, automated scripts, or external backup tools.
              </p>
            </div>

            <button
              type="button"
              disabled={downloadingFormat !== null}
              onClick={() => handleExport("json")}
              className="w-full py-2 px-3 rounded-lg bg-background hover:bg-muted border border-border text-foreground text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs disabled:opacity-50"
            >
              {downloadingFormat === "json" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-500" />
              ) : (
                <FileCode className="w-3.5 h-3.5 text-purple-500" />
              )}
              <span>{downloadingFormat === "json" ? "Exporting..." : "Download Raw JSON"}</span>
            </button>
          </div>

          {/* Option 3: License & Checksum (TXT) */}
          <div className="p-3.5 rounded-xl bg-muted/20 hover:bg-muted/30 border border-border/80 flex flex-col justify-between space-y-3 transition">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 font-bold text-xs text-foreground">
                  <FileCheck className="w-4 h-4 text-emerald-500" />
                  <span>Audit License (.TXT)</span>
                </div>
                <span className="text-[10px] font-semibold font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  SHA-256 Sealed
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Plain text certificate with SHA-256 fingerprint, data license, and verification instructions from Gaurav.
              </p>
            </div>

            <button
              type="button"
              disabled={downloadingFormat !== null}
              onClick={() => handleExport("txt")}
              className="w-full py-2 px-3 rounded-lg bg-background hover:bg-muted border border-border text-foreground text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs disabled:opacity-50"
            >
              {downloadingFormat === "txt" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              )}
              <span>{downloadingFormat === "txt" ? "Generating..." : "Download License & Hash"}</span>
            </button>
          </div>
        </div>

        {/* Live SHA-256 Cryptographic Scrutiny Certificate */}
        <div className="p-3.5 rounded-xl bg-muted/30 border border-border/80 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="text-xs font-bold text-foreground">Cryptographic Data Scrutiny (SHA-256)</span>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">FIPS 180-4 Standard</span>
          </div>

          <p className="text-[11.5px] text-muted-foreground leading-relaxed">
            Every export is stamped with an immutable SHA-256 digital fingerprint. If even one byte is modified, the hash changes completely. You can verify your file integrity anytime by running <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-foreground text-[10.5px]">sha256sum &lt;file&gt;</code>.
          </p>

          {latestChecksum ? (
            <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-background border border-border text-xs font-mono">
              <span className="truncate text-blue-600 dark:text-blue-400 select-all">{latestChecksum}</span>
              <button
                type="button"
                onClick={handleCopyHash}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted hover:bg-muted/80 text-[11px] font-medium transition cursor-pointer shrink-0"
              >
                {copiedHash ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                <span>{copiedHash ? "Copied" : "Copy Hash"}</span>
              </button>
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground/80 italic">
              Your official SHA-256 checksum will display here when you generate a data export.
            </div>
          )}
        </div>
      </div>

      {/* Data Retention & Lifecycles Grid */}
      <div className="space-y-2 pt-1 border-t border-border/60">
        <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-blue-500" />
          <span>Automated Data Lifecycles &amp; Retention Policy</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-xl bg-muted/20 border border-border/80 space-y-1">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>Standard Files</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Retained up to preset TTL (1h to 90d). Automatically and physically destroyed from Cloudflare R2 upon expiration.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-muted/20 border border-border/80 space-y-1">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              <span>Single-Use Links</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Purged 50 seconds after download lease expires. Zero residual bytes or orphaned storage.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-muted/20 border border-border/80 space-y-1">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Telemetry Logs</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Download counts and edge locations are retained for a rolling 90-day window, then auto-purged.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-muted/20 border border-border/80 space-y-1">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Right to Erasure</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              GDPR Article 17: Account termination instantly wipes all storage objects, share links, and credentials.
            </p>
          </div>
        </div>
      </div>

      {/* Footer Attribution Card */}
      <div className="p-3 rounded-xl bg-muted/15 border border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span>
            GPHost Automated Cloud Engine &bull; Built by <strong className="text-foreground">Gaurav</strong>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://gauravpatil.site"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
          >
            <span>Developer Portfolio: gauravpatil.site</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <span className="text-border">•</span>
          <span>Rate Limit: 5/hr</span>
        </div>
      </div>
    </div>
  );
}
