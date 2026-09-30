"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  X,
  Copy,
  Check,
  ExternalLink,
  Link2,
  Globe,
  RotateCw,
  AlertTriangle,
  Code2,
  QrCode,
} from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { QrCodeModal } from "@/components/ui/qr-code-modal";
import { authFetch } from "@/lib/auth/client-fetch";

export interface FileShareLinksModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: {
    id: string;
    sanitized_name: string;
    byte_size: number;
    mime_type?: string;
    share_slug: string;
    is_site?: boolean;
    xurl_short_url?: string | null;
    xurl_status?: string | null;
  } | null;
  onXurlGenerated?: (fileId: string, slug: string, shortUrl: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function FileShareLinksModal({
  isOpen,
  onClose,
  file,
  onXurlGenerated,
}: FileShareLinksModalProps) {
  const [copiedType, setCopiedType] = useState<"default" | "raw" | "xurl" | null>(null);
  const [prevFileId, setPrevFileId] = useState<string | null>(file?.id || null);
  const [xurlShortUrl, setXurlShortUrl] = useState<string | null>(file?.xurl_short_url || null);
  const [isGeneratingXurl, setIsGeneratingXurl] = useState<boolean>(false);
  const [xurlError, setXurlError] = useState<string | null>(null);
  const [activeQrModal, setActiveQrModal] = useState<{
    url: string;
    title: string;
    subtitle?: string;
    filename?: string;
  } | null>(null);

  if (file && file.id !== prevFileId) {
    setPrevFileId(file.id);
    setXurlShortUrl(file.xurl_short_url || null);
    setXurlError(null);
  }

  if (!isOpen || !file || !file.share_slug) return null;

  const publicGphostOrigin =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL || "https://gphost.eu.cc").replace(/\/+$/, "");

  const gphostPublicUrl = `${publicGphostOrigin}/f/${file.share_slug}`;
  const gphostOpenUrl = `/f/${file.share_slug}`;

  const isSite = Boolean(file.is_site);
  const directPath = isSite ? `/site/${file.share_slug}` : `/raw/${file.share_slug}`;
  const directPublicUrl = `${publicGphostOrigin}${directPath}`;
  const directOpenUrl = directPath;

  const formattedXurl = xurlShortUrl
    ? xurlShortUrl.startsWith("http://") || xurlShortUrl.startsWith("https://")
      ? xurlShortUrl
      : `https://${xurlShortUrl}`
    : null;

  const copyToClipboard = (text: string, type: "default" | "raw" | "xurl") => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleGenerateXurl = async () => {
    if (!file?.share_slug) return;
    setIsGeneratingXurl(true);
    setXurlError(null);

    try {
      const res = await authFetch(`/api/share/${file.share_slug}/xurl`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.shortUrl) {
        setXurlShortUrl(data.shortUrl);
        onXurlGenerated?.(file.id, file.share_slug, data.shortUrl);
      } else {
        setXurlError(data.error || "Failed to generate XURL shortlink");
      }
    } catch (err: unknown) {
      setXurlError(err instanceof Error ? err.message : "Network error generating XURL");
    } finally {
      setIsGeneratingXurl(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-links-modal-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 sm:p-5 border-b border-border/60 bg-muted/20">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Link2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="share-links-modal-title" className="text-base sm:text-lg font-bold text-foreground truncate">
                Active Share Links
              </h2>
              <p className="text-xs text-muted-foreground truncate" title={file.sanitized_name}>
                {file.sanitized_name} <span className="font-mono">({formatBytes(file.byte_size)})</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: 3 Link Channels */}
        <div className="p-4 sm:p-5 space-y-3 overflow-y-auto">
          {/* Channel 1: Default Public Share Page */}
          <div className="p-3.5 rounded-xl bg-muted/20 border border-border/80 hover:border-blue-500/40 transition shadow-2xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25 tracking-wider uppercase">
                  Default
                </span>
                <span className="text-xs font-semibold text-foreground truncate">
                  Public Share Page
                </span>
                <InfoTooltip
                  title="Default Public Share Link"
                  content="The standard public landing page for recipients with live preview, expiry timer, password check, and download slot claim."
                  variant="info"
                  iconClassName="w-3.5 h-3.5 text-muted-foreground/60"
                />
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={gphostOpenUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition shadow-2xs cursor-pointer"
                  title="Open share page in new tab"
                >
                  <span>Open</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  onClick={() => copyToClipboard(gphostPublicUrl, "default")}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-medium transition cursor-pointer"
                  title="Copy default share URL"
                >
                  {copiedType === "default" ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setActiveQrModal({
                      url: gphostPublicUrl,
                      title: file.sanitized_name,
                      subtitle: "Public Share Page",
                      filename: file.sanitized_name,
                    })
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-medium transition cursor-pointer"
                  title="View & Download QR Code"
                >
                  <QrCode className="w-3.5 h-3.5 text-blue-500" />
                  <span>QR</span>
                </button>
              </div>
            </div>

            <div className="p-2 rounded-lg bg-background/80 border border-border/60 text-xs font-mono text-muted-foreground break-all select-all">
              {gphostPublicUrl}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Share this link with recipients to view previews and claim download slots.
            </p>
          </div>

          {/* Channel 2: Direct CDN Stream / Embed */}
          <div className="p-3.5 rounded-xl bg-muted/20 border border-border/80 hover:border-purple-500/40 transition shadow-2xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/25 tracking-wider uppercase">
                  {isSite ? "Live Site" : "Direct / Embed"}
                </span>
                <span className="text-xs font-semibold text-foreground truncate">
                  {isSite ? "Hosted Webpage" : "Direct CDN Stream"}
                </span>
                <InfoTooltip
                  title={isSite ? "Live Hosted Website" : "Direct CDN / Raw Embed"}
                  content={
                    isSite
                      ? "Live sandboxed HTML page stream hosted under /site/[slug]."
                      : "Raw edge stream URL directly from Cloudflare R2 CDN. Use for <img>, <video>, audio, iframes, markdown embeds, or direct download scripts."
                  }
                  variant="purple"
                  iconClassName="w-3.5 h-3.5 text-muted-foreground/60"
                />
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={directOpenUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition shadow-2xs cursor-pointer"
                  title={isSite ? "Open live hosted site" : "Open raw CDN stream in new tab"}
                >
                  <span>Open</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  onClick={() => copyToClipboard(directPublicUrl, "raw")}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-medium transition cursor-pointer"
                  title={isSite ? "Copy live site URL" : "Copy direct stream URL"}
                >
                  {copiedType === "raw" ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setActiveQrModal({
                      url: directPublicUrl,
                      title: file.sanitized_name,
                      subtitle: isSite ? "Hosted Webpage" : "Direct CDN Stream",
                      filename: `${file.sanitized_name}-direct`,
                    })
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-medium transition cursor-pointer"
                  title="View & Download QR Code"
                >
                  <QrCode className="w-3.5 h-3.5 text-purple-500" />
                  <span>QR</span>
                </button>
              </div>
            </div>

            <div className="p-2 rounded-lg bg-background/80 border border-border/60 text-xs font-mono text-muted-foreground break-all select-all flex items-center justify-between gap-1">
              <span className="truncate">{directPublicUrl}</span>
              <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-300 font-semibold shrink-0">
                <Code2 className="w-3 h-3 inline mr-1" />
                CDN
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {isSite
                ? "Direct vanity website URL for live browser viewing."
                : "Hotlink URL for <img> tags, video players, markdown, or terminal curl scripts."}
            </p>
          </div>

          {/* Channel 3: Dynamic XURL Shortlink */}
          <div className="p-3.5 rounded-xl bg-muted/20 border border-border/80 hover:border-emerald-500/40 transition shadow-2xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 tracking-wider uppercase">
                  XURL Shortlink
                </span>
                <span className="text-xs font-semibold text-foreground truncate">
                  {formattedXurl ? "Short Vanity URL" : "Dynamic Shortlink"}
                </span>
                <InfoTooltip
                  title="XURL Shortlink"
                  content="Compact shortened vanity alias for social sharing, chat apps (WhatsApp, Telegram), and SMS. Redirects automatically to the public download portal."
                  variant="emerald"
                  iconClassName="w-3.5 h-3.5 text-muted-foreground/60"
                />
              </div>

              {formattedXurl ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    href={formattedXurl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-2xs cursor-pointer"
                    title={`Open shortlink: ${formattedXurl}`}
                  >
                    <span>Open</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <button
                    onClick={() => copyToClipboard(formattedXurl, "xurl")}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-medium transition cursor-pointer"
                    title="Copy XURL shortlink"
                  >
                    {copiedType === "xurl" ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveQrModal({
                        url: formattedXurl!,
                        title: file.sanitized_name,
                        subtitle: "XURL Shortlink",
                        filename: `${file.sanitized_name}-xurl`,
                      })
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-medium transition cursor-pointer"
                    title="View & Download QR Code"
                  >
                    <QrCode className="w-3.5 h-3.5 text-emerald-500" />
                    <span>QR</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGenerateXurl}
                  disabled={isGeneratingXurl}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50 shrink-0"
                  title="Generate dynamic XURL shortlink now"
                >
                  {isGeneratingXurl ? (
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Globe className="w-3.5 h-3.5" />
                  )}
                  <span>+ Generate XURL</span>
                </button>
              )}
            </div>

            {formattedXurl ? (
              <div className="p-2 rounded-lg bg-background/80 border border-border/60 text-xs font-mono text-emerald-600 dark:text-emerald-400 break-all select-all flex items-center justify-between gap-1">
                <span className="truncate">{formattedXurl}</span>
                <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold shrink-0 uppercase">
                  Active
                </span>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                No short URL generated yet. Click &quot;+ Generate XURL&quot; to create a compact link for social media and chat apps.
              </p>
            )}

            {xurlError && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px] flex-1">{xurlError}</span>
                <button
                  type="button"
                  onClick={handleGenerateXurl}
                  disabled={isGeneratingXurl}
                  className="font-semibold underline hover:no-underline cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between p-3.5 sm:p-4 border-t border-border/60 bg-muted/20">
          <Link
            href="/links"
            onClick={onClose}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <span>Manage in Links Console</span>
            <ExternalLink className="w-3 h-3" />
          </Link>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-foreground text-background text-xs font-semibold hover:opacity-90 transition cursor-pointer shadow-xs"
          >
            Done
          </button>
        </div>
      </div>

      {/* QR Code Viewer & Download Modal */}
      {activeQrModal && (
        <QrCodeModal
          isOpen={Boolean(activeQrModal)}
          onClose={() => setActiveQrModal(null)}
          url={activeQrModal.url}
          title={activeQrModal.title}
          subtitle={activeQrModal.subtitle}
          filename={activeQrModal.filename}
        />
      )}
    </div>
  );
}
