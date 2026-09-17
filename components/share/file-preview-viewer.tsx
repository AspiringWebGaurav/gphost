"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Download,
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Flame,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AutoScrollingFilename } from "@/components/share/auto-scrolling-filename";

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

interface FilePreviewViewerProps {
  slug: string;
  filename: string;
  byteSize: number;
  mimeType: string;
  previewType: "image" | "pdf";
  previewUrl: string;
  expiresAt: string | null;
  isSingleUse?: boolean;
  burnAfterPreview?: boolean;
}

export function FilePreviewViewer({
  slug,
  filename,
  byteSize,
  mimeType,
  previewType,
  previewUrl,
  expiresAt,
  isSingleUse = false,
  burnAfterPreview = false,
}: FilePreviewViewerProps) {
  // Zoom state for images
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [imageLoading, setImageLoading] = useState(true);
  const [showGrid, setShowGrid] = useState(false);

  // Download state
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [leaseSeconds, setLeaseSeconds] = useState<number | null>(null);
  const [isSingleUseClaimed, setIsSingleUseClaimed] = useState(false);

  const handleZoomIn = () => setZoomScale((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoomScale((prev) => Math.max(prev - 0.25, 0.5));
  const handleZoomReset = () => setZoomScale(1);

  const handleDownload = async () => {
    if (claiming || isSingleUseClaimed) return;

    try {
      setClaiming(true);
      setClaimError(null);
      setDownloadProgress(30);

      const t1 = setTimeout(() => {
        setDownloadProgress((prev) => (prev < 65 ? 65 : prev));
      }, 150);

      const res = await fetch(`/api/share/${encodeURIComponent(slug)}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      clearTimeout(t1);
      const data = await res.json();

      if (!res.ok || !data.success) {
        setDownloadProgress(0);
        setClaimError(data.error || "Failed to claim download slot");
        setClaiming(false);
        return;
      }

      setDownloadProgress(90);
      setDownloadSuccess(true);
      setLeaseSeconds(data.expires_in_seconds || 50);

      if (isSingleUse) {
        setIsSingleUseClaimed(true);
      }

      // Trigger download
      const a = document.createElement("a");
      a.href = data.downloadUrl;
      a.download = data.filename || filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => {
        setDownloadProgress(100);
        setClaiming(false);
      }, 300);
    } catch {
      setDownloadProgress(0);
      setClaimError("Network error starting download. Please try again.");
      setClaiming(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        {/* Left: Back Link & File Identity */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/f/${slug}`}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 border border-border/80 transition flex items-center gap-1.5 text-xs font-medium shrink-0 cursor-pointer"
            title="Return to share page"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </Link>

          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              {previewType === "image" ? (
                <ImageIcon className="w-4 h-4" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0 max-w-[200px] sm:max-w-xs md:max-w-md">
              <AutoScrollingFilename
                filename={filename}
                className="text-xs sm:text-sm font-semibold text-foreground"
              />
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{formatBytes(byteSize)}</span>
                <span>•</span>
                <span className="font-mono text-[10px]">{mimeType}</span>
                {expiresAt && (
                  <>
                    <span>•</span>
                    <span className="hidden sm:inline-flex items-center gap-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span>{new Date(expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </span>
                  </>
                )}
                {isSingleUse && (
                  <>
                    <span>•</span>
                    <span className="text-rose-500 font-medium flex items-center gap-0.5">
                      <Flame className="w-3 h-3" />
                      Single-use
                    </span>
                  </>
                )}
                {burnAfterPreview && (
                  <>
                    <span>•</span>
                    <span className="text-rose-500 font-semibold flex items-center gap-0.5 animate-pulse">
                      <Flame className="w-3 h-3 text-rose-500" />
                      Burn on Preview (60s)
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Controls & Download Action */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Zoom controls for Image Preview */}
          {previewType === "image" && (
            <div className="hidden sm:flex items-center gap-1 p-1 bg-muted/60 rounded-xl border border-border">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoomScale <= 0.5}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 transition cursor-pointer"
                title="Zoom out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono font-medium px-1 min-w-[40px] text-center text-muted-foreground">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoomScale >= 3}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 transition cursor-pointer"
                title="Zoom in"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleZoomReset}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
                title="Reset zoom"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowGrid((prev) => !prev)}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  showGrid ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                title="Toggle transparency grid"
              >
                <Layers className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Raw File Link */}
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 border border-border transition hidden md:flex items-center gap-1.5 text-xs font-medium cursor-pointer"
            title="Open raw stream in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Raw</span>
          </a>

          {/* Download Button */}
          {!isSingleUseClaimed ? (
            <button
              type="button"
              onClick={handleDownload}
              disabled={claiming}
              className="h-9 px-3 sm:px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-muted disabled:to-muted disabled:text-muted-foreground text-white text-xs sm:text-sm font-semibold flex items-center gap-2 shadow-xs transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {claiming ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="hidden sm:inline">Downloading...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </>
              )}
            </button>
          ) : (
            <span className="px-3 py-1.5 rounded-xl bg-muted text-muted-foreground text-xs font-medium">
              Downloaded
            </span>
          )}

          <ThemeToggle />
        </div>
      </header>

      {/* Burn on Preview Notice */}
      {burnAfterPreview && (
        <div className="bg-rose-500/10 border-b border-rose-500/25 text-rose-600 dark:text-rose-400 px-4 py-2 text-xs flex items-center justify-center gap-2 font-medium">
          <Flame className="w-4 h-4 text-rose-500 animate-bounce shrink-0" />
          <span>Burn on Preview active: file is scheduled to auto-destruct 60 seconds after first opening!</span>
        </div>
      )}

      {/* Optional Download Notification Banner */}
      {claimError && (
        <div className="bg-rose-500/10 border-b border-rose-500/20 text-rose-600 dark:text-rose-400 px-4 py-2 text-xs flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{claimError}</span>
        </div>
      )}

      {(claiming || downloadSuccess) && (
        <div className="bg-background/95 border-b border-border/80 px-4 py-2.5 shadow-xs transition-all">
          <div className="max-w-xl mx-auto space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
                {downloadSuccess ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                ) : (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500 shrink-0" />
                )}
                <span>
                  {downloadSuccess
                    ? `Direct download active! Secure transfer slot valid for ${leaseSeconds ?? 50}s to initiate.`
                    : "Connecting to Cloudflare R2 edge network..."}
                </span>
              </div>
              <span className="font-mono text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                {downloadProgress}%
              </span>
            </div>

            <div className="relative w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="relative h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-300 ease-out shadow-[0_0_8px_rgba(16,185,129,0.5)] overflow-hidden"
                style={{ width: `${Math.max(4, downloadProgress)}%` }}
              >
                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent animate-progress-shimmer" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Preview Container */}
      <main className="flex-1 flex items-center justify-center p-2 sm:p-6 overflow-auto bg-muted/20">
        {previewType === "image" ? (
          <div className="relative w-full h-full min-h-[70vh] flex items-center justify-center overflow-auto p-4">
            {showGrid && (
              <div className="absolute inset-0 bg-[radial-gradient(#80808020_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
            )}

            {imageLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-card/40 backdrop-blur-xs z-10">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
              </div>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={filename}
              onLoad={() => setImageLoading(false)}
              style={{
                transform: `scale(${zoomScale})`,
                transition: "transform 0.15s ease-out",
              }}
              className={`max-w-[90vw] max-h-[82vh] object-contain rounded-2xl shadow-xl border border-border/80 ${
                imageLoading ? "opacity-0" : "opacity-100"
              }`}
            />
          </div>
        ) : (
          <div className="w-full h-full min-h-[85vh] max-w-6xl mx-auto rounded-2xl overflow-hidden border border-border bg-background shadow-lg flex flex-col">
            <iframe
              src={`${previewUrl}#toolbar=1&navpanes=0&view=FitH`}
              title={`PDF Preview — ${filename}`}
              className="w-full flex-1 min-h-[82vh] border-0 bg-background"
            />
          </div>
        )}
      </main>
    </div>
  );
}
