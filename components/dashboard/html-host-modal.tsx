"use client";

import React, { useState, useRef } from "react";
import {
  X,
  Globe,
  Loader2,
  Check,
  Copy,
  ExternalLink,
  QrCode,
  Clock,
  AlertCircle,
  FileCode,
  RotateCcw,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

interface HtmlHostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  canCreatePermanent?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function HtmlHostModal({
  isOpen,
  onClose,
  onSuccess,
  canCreatePermanent = false,
}: HtmlHostModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [customSlug, setCustomSlug] = useState("");
  const [expiryPreset, setExpiryPreset] = useState("30d");
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployPhase, setDeployPhase] = useState("");
  const [deployProgress, setDeployProgress] = useState(0);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployedResult, setDeployedResult] = useState<{
    slug: string;
    siteUrl: string;
    rawUrl: string;
    filename: string;
    byteSize: number;
    expiresAt: string | null;
  } | null>(null);

  const [copiedSiteUrl, setCopiedSiteUrl] = useState(false);
  const [copiedRawUrl, setCopiedRawUrl] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const currentHost =
    typeof window !== "undefined" ? window.location.host : "gphost.eu.cc";
  const protocol =
    typeof window !== "undefined" ? window.location.protocol : "https:";
  const origin = `${protocol}//${currentHost}`;

  const handleFileSelect = (selected: File) => {
    if (!selected.name.toLowerCase().endsWith(".html") && !selected.name.toLowerCase().endsWith(".htm")) {
      setDeployError("Please select a valid HTML file (.html or .htm).");
      return;
    }
    setDeployError(null);
    setFile(selected);

    if (!customSlug) {
      const base = selected.name
        .replace(/\.(html|htm)$/i, "")
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 32);
      const randomSuffix = Math.random().toString(36).substring(2, 6);
      setCustomSlug(base && base !== "index" ? `${base}-${randomSuffix}` : `site-${randomSuffix}`);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDeploy = async () => {
    if (!file) {
      setDeployError("Please select an HTML file to host.");
      return;
    }

    const sanitizedSlug = customSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!sanitizedSlug || sanitizedSlug.length < 3) {
      setDeployError("Custom slug must be at least 3 characters (letters, numbers, hyphens).");
      return;
    }

    try {
      setIsDeploying(true);
      setDeployError(null);
      setDeployProgress(15);
      setDeployPhase("Reserving edge storage and custom web address...");

      // 1. Initiate Upload
      const initRes = await fetch("/api/files/initiate-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          byte_size: file.size,
          mime_type: "text/html",
          expiry_preset: expiryPreset,
        }),
      });

      const initData = await initRes.json();
      if (!initRes.ok || (!initData.presignedUrl && !initData.fileId)) {
        throw new Error(initData.error || initData.message || "Failed to initialize upload.");
      }

      setDeployProgress(45);
      setDeployPhase("Streaming HTML directly to Cloudflare R2 edge network...");

      // 2. Direct R2 Presigned Upload (Content-Type must match presigned URL signature)
      const uploadRes = await fetch(initData.presignedUrl, {
        method: "PUT",
        headers: { "Content-Type": "text/html" },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error(`Failed to transfer static HTML to storage (HTTP ${uploadRes.status}).`);
      }

      setDeployProgress(75);
      setDeployPhase("Verifying storage checksum and binding domain route...");

      // 3. Complete Upload
      const compRes = await fetch("/api/files/complete-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: initData.fileId }),
      });

      const compData = await compRes.json();
      if (!compRes.ok || !compData.success) {
        throw new Error(compData.error || compData.message || "Failed to finalize storage commit.");
      }

      setDeployProgress(90);
      setDeployPhase(`Registering live site under ${origin}/site/${sanitizedSlug}...`);

      // 4. Create Share Link with Custom Slug
      const shareRes = await fetch("/api/share/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: initData.fileId,
          customSlug: sanitizedSlug,
          expiresInPreset: expiryPreset,
        }),
      });

      const shareData = await shareRes.json();
      if (!shareRes.ok || !shareData.success) {
        throw new Error(shareData.error || shareData.message || "Failed to attach custom domain slug.");
      }

      const finalSlug = shareData.share?.slug || sanitizedSlug;
      const liveSiteUrl = `${origin}/site/${finalSlug}`;
      const directRawUrl = `${origin}/raw/${finalSlug}`;

      setDeployProgress(100);
      setDeployPhase("Webpage deployed and live!");

      setDeployedResult({
        slug: finalSlug,
        siteUrl: liveSiteUrl,
        rawUrl: directRawUrl,
        filename: file.name,
        byteSize: file.size,
        expiresAt: shareData.share?.expires_at || null,
      });

      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      console.error("HTML deploy error:", err);
      setDeployError(err instanceof Error ? err.message : "Deployment failed. Please try again.");
    } finally {
      setIsDeploying(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setCustomSlug("");
    setDeployError(null);
    setDeployedResult(null);
    setDeployProgress(0);
    setDeployPhase("");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl bg-card border border-border/80 p-5 sm:p-7 shadow-2xl relative space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0 shadow-xs">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-foreground">
                  GP-Sites: Host Static Webpage
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                  Instant Live URL
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Drop your HTML page, choose your custom slug, and deploy with 0 server maintenance.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ============================================================ */}
        {/* VIEW 1: SUCCESS LIVE SHOWCASE                                */}
        {/* ============================================================ */}
        {deployedResult ? (
          <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
            {/* Live Banner */}
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <div>
                  <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    Webpage Live &amp; Globally Distributed
                  </div>
                  <div className="text-[11px] text-emerald-600/90 dark:text-emerald-400/90 font-mono">
                    Direct R2 Edge CDN Delivery (0 Vercel compute)
                  </div>
                </div>
              </div>

              <a
                href={deployedResult.siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-xs cursor-pointer active:scale-[0.98]"
              >
                <span>Launch Live Site</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Attached Domain URL Bar */}
            <div className="space-y-1.5 p-3.5 rounded-2xl bg-muted/40 border border-border">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Hosted Domain Address</span>
                </span>
                <span className="text-[10.5px] font-mono text-muted-foreground">
                  {formatBytes(deployedResult.byteSize)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={deployedResult.siteUrl}
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-background border border-cyan-500/30 text-xs font-mono text-cyan-600 dark:text-cyan-400 font-semibold select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(deployedResult.siteUrl);
                    setCopiedSiteUrl(true);
                    setTimeout(() => setCopiedSiteUrl(false), 2000);
                  }}
                  className="px-3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs shrink-0"
                >
                  {copiedSiteUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSiteUrl ? "Copied" : "Copy"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowQrCode(!showQrCode)}
                  className={`p-2 rounded-xl border text-xs transition cursor-pointer shrink-0 ${
                    showQrCode
                      ? "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30"
                      : "bg-background hover:bg-muted text-foreground border-border"
                  }`}
                  title="Mobile QR Code"
                >
                  <QrCode className="w-4 h-4" />
                </button>
              </div>

              {/* Raw CDN Hotlink */}
              <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
                <span className="truncate">Direct CDN stream: <code className="font-mono text-foreground">{deployedResult.rawUrl}</code></span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(deployedResult.rawUrl);
                    setCopiedRawUrl(true);
                    setTimeout(() => setCopiedRawUrl(false), 2000);
                  }}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer ml-2 shrink-0"
                >
                  {copiedRawUrl ? "Copied raw!" : "Copy raw"}
                </button>
              </div>
            </div>

            {/* QR Code expansion */}
            {showQrCode && (
              <div className="p-4 rounded-2xl bg-card border border-border flex items-center gap-4 animate-in fade-in duration-150">
                <div className="p-2.5 bg-white rounded-xl shadow-xs border shrink-0">
                  <QRCodeSVG value={deployedResult.siteUrl} size={110} />
                </div>
                <div className="space-y-1 text-xs">
                  <div className="font-semibold text-foreground">Mobile Instant Preview</div>
                  <p className="text-muted-foreground leading-relaxed">
                    Scan with your mobile camera to instantly view your hosted HTML page on your phone.
                  </p>
                </div>
              </div>
            )}

            {/* Live Sandboxed Embedded Preview Frame */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Embedded Sandbox Preview</span>
                <span className="text-[10.5px]">Isolated iframe</span>
              </div>
              <div className="h-64 sm:h-72 w-full rounded-2xl border border-border/80 overflow-hidden bg-white dark:bg-zinc-950 shadow-inner">
                <iframe
                  src={deployedResult.rawUrl}
                  title="Live preview"
                  sandbox="allow-scripts allow-forms allow-same-origin"
                  className="w-full h-full border-0"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-border/60">
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Host Another Page</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-foreground text-background text-xs font-semibold hover:opacity-90 transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* ============================================================ */
          /* VIEW 2: UPLOAD & CONFIGURE HOSTING FORM                      */
          /* ============================================================ */
          <div className="space-y-4">
            {/* HTML File Selection Dropzone */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.htm,text/html"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileSelect(e.target.files[0]);
                }
              }}
            />

            {!file ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-6 sm:p-8 rounded-2xl border-2 border-dashed text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-3 ${
                  isDragOver
                    ? "border-cyan-500 bg-cyan-500/10 scale-[1.01]"
                    : "border-border/80 hover:border-cyan-500/50 bg-muted/20 hover:bg-muted/40"
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 flex items-center justify-center">
                  <FileCode className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">
                    Drop your HTML file here, or <span className="text-cyan-600 dark:text-cyan-400 underline">browse</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Supports <code className="font-mono text-foreground">.html</code> and <code className="font-mono text-foreground">.htm</code> landing pages, documentation, or mockups
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/80 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/25 flex items-center justify-center shrink-0">
                    <FileCode className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-foreground truncate" title={file.name}>
                      {file.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-2 flex-wrap">
                      <span>{formatBytes(file.size)} &bull; HTML Webpage</span>
                      <a
                        href="/temp-preview"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-600 dark:text-cyan-400 hover:underline inline-flex items-center gap-1 font-sans font-medium"
                        title="Compare and preview in studio"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Compare / Preview Studio</span>
                      </a>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setFile(null)}
                  disabled={isDeploying}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition cursor-pointer"
                  title="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* DOMAIN ATTACHED CUSTOM SLUG INPUT */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-semibold text-foreground/90 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Choose Your Live Web Address (Domain + Custom Slug)</span>
                </label>
                <span className="text-[10.5px] text-muted-foreground font-mono">
                  letters, numbers, dashes
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center h-10 sm:h-11 rounded-xl bg-background/90 hover:bg-background border border-border/80 hover:border-cyan-500/60 focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-500/20 transition-all duration-200 shadow-2xs hover:shadow-xs focus-within:shadow-xs overflow-hidden group">
                  {/* Attached Domain Prefix */}
                  <div className="h-full flex items-center px-3 bg-muted/50 group-hover:bg-muted/70 text-xs text-muted-foreground font-mono font-medium border-r border-border/80 select-none transition-colors duration-200 gap-0.5 shrink-0">
                    <span className="hidden xs:inline text-muted-foreground/60">https://</span>
                    <span className="font-semibold text-cyan-600 dark:text-cyan-400">
                      {currentHost}
                    </span>
                    <span className="text-muted-foreground/80">/site/</span>
                  </div>

                  {/* Editable Slug Input */}
                  <input
                    type="text"
                    placeholder="e.g. my-portfolio"
                    value={customSlug}
                    onChange={(e) =>
                      setCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
                    }
                    maxLength={48}
                    disabled={isDeploying}
                    className="w-full h-full px-3 text-xs sm:text-[13px] text-foreground font-mono font-semibold tracking-tight bg-transparent focus:outline-none placeholder:text-muted-foreground/50 placeholder:font-sans placeholder:font-normal"
                  />

                  {customSlug && !isDeploying && (
                    <button
                      type="button"
                      onClick={() => setCustomSlug("")}
                      className="p-1.5 mr-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg cursor-pointer transition-colors shrink-0"
                      aria-label="Clear custom slug"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Live Reactive URL Preview with Domain Attachment */}
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 truncate">
                  <span className="font-medium text-foreground">Live URL will be:</span>
                  <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold truncate">
                    {origin}/site/{customSlug || "your-custom-slug"}
                  </span>
                </div>
              </div>
            </div>

            {/* EXPIRY DURATION PRESET */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-semibold text-foreground/90 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Hosting Duration (Auto-Expiry)</span>
                </label>
                <span className="text-[10.5px] text-muted-foreground">
                  Auto-purged when expired (0 stale data)
                </span>
              </div>

              <select
                value={expiryPreset}
                onChange={(e) => setExpiryPreset(e.target.value)}
                disabled={isDeploying}
                className="w-full h-10 px-3.5 rounded-xl bg-background border border-border/80 hover:border-cyan-500/50 text-xs text-foreground focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition cursor-pointer"
              >
                <option value="1h">1 Hour (Quick Demo)</option>
                <option value="24h">24 Hours (1 Day)</option>
                <option value="7d">7 Days</option>
                <option value="30d">30 Days (Recommended)</option>
                <option value="90d">90 Days</option>
                {canCreatePermanent && <option value="never">Permanent (Never Expire)</option>}
              </select>
            </div>

            {/* DEPLOYING PROGRESS BAR */}
            {isDeploying && (
              <div className="p-3.5 rounded-2xl bg-card border border-cyan-500/30 shadow-md space-y-2.5 animate-in fade-in duration-150">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-500" />
                    <span className="font-semibold text-foreground">{deployPhase}</span>
                  </div>
                  <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">
                    {deployProgress}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted/60 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300"
                    style={{ width: `${Math.max(5, deployProgress)}%` }}
                  />
                </div>
              </div>
            )}

            {/* ERROR ALERT */}
            {deployError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{deployError}</span>
              </div>
            )}

            {/* ACTION FOOTER */}
            <div className="pt-2 border-t border-border/60 flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground hidden sm:block">
                Streamed directly from Cloudflare R2 edge servers.
              </p>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isDeploying}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeploy}
                  disabled={!file || isDeploying || !customSlug}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition shadow-md shadow-cyan-600/20 hover:shadow-cyan-600/30 cursor-pointer active:scale-[0.98]"
                >
                  {isDeploying ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Deploying Site...</span>
                    </>
                  ) : (
                    <>
                      <Globe className="w-3.5 h-3.5" />
                      <span>Deploy &amp; Host Webpage</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
