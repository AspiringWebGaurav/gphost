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
  const [downloadingFormat, setDownloadingFormat] = useState<"json" | "html" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const quotaPercent =
    quotaBytes > 0 ? Math.min(100, Math.round((storageUsedBytes / quotaBytes) * 100)) : 0;

  const handleExport = async (format: "json" | "html") => {
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
          ? "Raw JSON archive exported successfully."
          : "Standalone HTML dossier downloaded. You can open or print it offline."
      );
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch {
      setErrorMessage("Network error while exporting data. Please check your connection.");
    } finally {
      setDownloadingFormat(null);
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 pb-3.5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-bold text-foreground">
                Data Transparency &amp; GDPR Compliance
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                Article 15 &amp; 20
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Full byte-level accountability of your stored files, delivery rules, and audit history.
            </p>
          </div>
        </div>

        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 self-start sm:self-auto shrink-0"
        >
          <span>Privacy Policy</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Alerts */}
      {successMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2 animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2 animate-in fade-in duration-150">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Live Storage Footprint Bar */}
      <div className="p-3.5 rounded-xl bg-muted/30 border border-border/80 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <HardDrive className="w-3.5 h-3.5 text-blue-500" />
            <span>Byte-Level Account Footprint</span>
          </div>
          <span className="font-mono text-muted-foreground">
            {formatBytes(storageUsedBytes)} / {formatBytes(quotaBytes)} ({quotaPercent}%)
          </span>
        </div>

        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(1, quotaPercent))}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between text-[11px] text-muted-foreground pt-0.5">
          <span>Active Storage: {formatBytes(storageUsedBytes)}</span>
          <span>Role Quota: {formatBytes(quotaBytes)}</span>
          <span>Account Created: {new Date(memberSince).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Data Retention & Lifecycle Policies Grid */}
      <div className="space-y-1.5">
        <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-blue-500" />
          <span>Data Retention &amp; Automatic Lifecycles</span>
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

      {/* Export Your Data Action Bar */}
      <div className="p-4 rounded-xl bg-blue-500/[0.04] border border-blue-500/20 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-blue-500" />
              <span>Export Your Personal Data Archive</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Download a complete copy of all your files, links, logs, and account metadata. Rate limited to 5 requests per hour.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* JSON Export */}
            <button
              type="button"
              disabled={downloadingFormat !== null}
              onClick={() => handleExport("json")}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-background hover:bg-muted border border-border text-foreground text-xs font-semibold transition cursor-pointer shadow-2xs disabled:opacity-50"
              title="Download raw structured JSON for automated imports or machine processing"
            >
              {downloadingFormat === "json" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
              ) : (
                <FileCode className="w-3.5 h-3.5 text-blue-500" />
              )}
              <span>{downloadingFormat === "json" ? "Exporting..." : "Export JSON"}</span>
            </button>

            {/* HTML Dossier Export */}
            <button
              type="button"
              disabled={downloadingFormat !== null}
              onClick={() => handleExport("html")}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition cursor-pointer shadow-2xs disabled:opacity-50"
              title="Download standalone, printable HTML dossier with charts and tables"
            >
              {downloadingFormat === "html" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-white" />
              )}
              <span>{downloadingFormat === "html" ? "Generating..." : "Export HTML Dossier"}</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1 border-t border-blue-500/15">
          <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span>
            Compliant with GDPR Article 20. HTML dossiers are completely self-contained and can be opened in any web browser or saved as PDF without an active internet connection.
          </span>
        </div>
      </div>
    </div>
  );
}
