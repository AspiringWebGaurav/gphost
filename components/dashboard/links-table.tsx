"use client";

import React, { useState, useEffect } from "react";
import {
  Link as LinkIcon,
  Copy,
  Check,
  Globe,
  Lock,
  Flame,
  Trash2,
  ExternalLink,
  Download,
  Activity,
  RotateCw,
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  Film,
  Archive,
  Music,
  Code2,
} from "lucide-react";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { ExpiryStatusBadge } from "@/components/ui/expiry-status-badge";
import { FileAnalyticsModal } from "@/components/dashboard/file-analytics-modal";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { storageEvents } from "@/lib/storage/events";
import { authFetch } from "@/lib/auth/client-fetch";

export interface ShareLinkItem {
  id: string;
  slug: string;
  file_id?: string;
  file_name: string;
  byte_size: number;
  mime_type?: string;
  is_site?: boolean;
  download_count: number;
  max_downloads: number | null;
  is_single_use: boolean;
  is_password_protected: boolean;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  xurl_short_url?: string | null;
  xurl_status?: string | null;
}

function getFileIcon(filename: string, mimeType?: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (mimeType?.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "svg", "avif"].includes(ext)) {
    return <ImageIcon className="w-4 h-4 text-sky-500 shrink-0" />;
  }
  if (mimeType?.startsWith("video/") || ["mp4", "webm", "mov", "avi", "mkv"].includes(ext)) {
    return <Film className="w-4 h-4 text-purple-500 shrink-0" />;
  }
  if (mimeType?.startsWith("audio/") || ["mp3", "wav", "ogg", "flac", "m4a"].includes(ext)) {
    return <Music className="w-4 h-4 text-emerald-500 shrink-0" />;
  }
  if (mimeType?.includes("zip") || ["zip", "tar", "gz", "7z", "rar", "bz2"].includes(ext)) {
    return <Archive className="w-4 h-4 text-amber-500 shrink-0" />;
  }
  if (mimeType === "text/html" || ["html", "htm"].includes(ext)) {
    return <Globe className="w-4 h-4 text-emerald-500 shrink-0" />;
  }
  if (["js", "ts", "json", "py", "sh", "css", "tsx", "jsx", "md"].includes(ext)) {
    return <Code2 className="w-4 h-4 text-blue-500 shrink-0" />;
  }
  return <FileText className="w-4 h-4 text-muted-foreground shrink-0" />;
}

interface LinksTableProps {
  initialLinks: ShareLinkItem[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function LinksTable({ initialLinks }: LinksTableProps) {
  const [links, setLinks] = useState<ShareLinkItem[]>(initialLinks);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [linkToDelete, setLinkToDelete] = useState<ShareLinkItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [analyticsFile, setAnalyticsFile] = useState<{ id: string; filename: string } | null>(null);
  const [retryingSlug, setRetryingSlug] = useState<string | null>(null);
  const [xurlActionError, setXurlActionError] = useState<{ [slug: string]: string }>({});

  const [mounted, setMounted] = useState(false);
  // Real-time live countdown ticker (ticks every second after mount)
  const [currentTime, setCurrentTime] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
    setCurrentTime(Date.now());
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const copyToClipboard = (text: string, slug: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const handleGenerateXurl = async (slug: string) => {
    setRetryingSlug(slug);
    setXurlActionError((prev) => ({ ...prev, [slug]: "" }));
    try {
      const res = await authFetch(`/api/share/${slug}/xurl`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.shortUrl) {
        setLinks((prev) =>
          prev.map((l) =>
            l.slug === slug
              ? { ...l, xurl_short_url: data.shortUrl, xurl_status: "active" }
              : l
          )
        );
      } else {
        setXurlActionError((prev) => ({
          ...prev,
          [slug]: data.error || "Failed to generate XURL shortlink",
        }));
      }
    } catch (err: unknown) {
      setXurlActionError((prev) => ({
        ...prev,
        [slug]: err instanceof Error ? err.message : "Network error",
      }));
    } finally {
      setRetryingSlug(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!linkToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      // Nuclear permanent deletion of link via DELETE endpoint (preserves target file)
      const res = await authFetch(`/api/share/${linkToDelete.slug}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setLinks((prev) => prev.filter((l) => l.id !== linkToDelete.id));
        storageEvents.emit("storage:updated", {
          storageUsedBytes: 0,
          source: "local_optimistic",
        });
        setLinkToDelete(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error || "Failed to delete share link");
      }
    } catch (err) {
      console.error("Failed to delete share link:", err);
      setDeleteError("Network error deleting share link");
    } finally {
      setIsDeleting(false);
    }
  };

  const defaultPublicOrigin = (
    (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.startsWith("https://")
      ? process.env.NEXT_PUBLIC_APP_URL
      : null) ||
    "https://gphost.eu.cc"
  ).replace(/\/+$/, "");

  // Safe origin resolution: matches on SSR and client hydration to prevent hydration mismatch.
  // After mount, if user is browsing on HTTPS (e.g. custom domain), updates to current origin.
  const publicGphostOrigin =
    mounted && typeof window !== "undefined" && window.location.protocol === "https:"
      ? window.location.origin
      : defaultPublicOrigin;

  // Filter out expired or exhausted links dynamically
  const visibleLinks = links.filter((link) => {
    if (currentTime && link.expires_at && new Date(link.expires_at).getTime() <= currentTime) {
      return false;
    }
    if (link.max_downloads !== null && link.download_count >= link.max_downloads) {
      return false;
    }
    return true;
  });

  if (visibleLinks.length === 0) {
    return (
      <div className="p-10 text-center rounded-2xl border border-border bg-card shadow-2xs text-muted-foreground">
        <LinkIcon className="w-10 h-10 mx-auto mb-2 opacity-40 text-blue-500" />
        <p className="text-base sm:text-lg font-bold text-foreground">No active share links</p>
        <p className="text-sm text-muted-foreground mt-0.5">Create a share link from your files to share them with others.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden">
      <div className="divide-y divide-border">
        {visibleLinks.map((link) => {
          const gphostPublicUrl = `${publicGphostOrigin}/f/${link.slug}`;
          const gphostOpenUrl = `/f/${link.slug}`;

          const isSite = Boolean(link.is_site);
          const directStreamPath = isSite ? `/site/${link.slug}` : `/raw/${link.slug}`;
          const directStreamPublicUrl = `${publicGphostOrigin}${directStreamPath}`;
          const directStreamOpenUrl = directStreamPath;

          const formattedXurl = link.xurl_short_url
            ? link.xurl_short_url.startsWith("http://") || link.xurl_short_url.startsWith("https://")
              ? link.xurl_short_url
              : `https://${link.xurl_short_url}`
            : null;

          return (
            <div
              key={link.id}
              className="p-4 sm:p-5 flex flex-col gap-3.5 hover:bg-muted/15 transition-colors"
            >
              {/* Header: File identity + Metadata + Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/50">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 border border-border/60">
                    {getFileIcon(link.file_name, link.mime_type)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3
                        className="font-bold text-foreground text-sm sm:text-base truncate max-w-xs sm:max-w-md"
                        title={link.file_name}
                      >
                        {link.file_name}
                      </h3>
                      <span className="text-xs font-mono text-muted-foreground shrink-0">
                        ({formatBytes(link.byte_size)})
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 text-[11px] font-medium shrink-0">
                        <Download className="w-3 h-3 text-purple-500 shrink-0" />
                        <span>
                          <strong>{link.download_count}</strong>{" "}
                          {link.download_count === 1 ? "download" : "downloads"}
                          {link.max_downloads ? ` / ${link.max_downloads} max` : ""}
                        </span>
                      </span>

                      {link.is_single_use && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0">
                          <Flame className="w-3 h-3 shrink-0" />
                          <span>Single-Use</span>
                        </span>
                      )}

                      {link.is_password_protected && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                          <Lock className="w-3 h-3 shrink-0" />
                          <span>Protected</span>
                        </span>
                      )}

                      <ExpiryStatusBadge expiresAt={link.expires_at} size="xs" />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                  {link.file_id && (
                    <button
                      onClick={() => setAnalyticsFile({ id: link.file_id!, filename: link.file_name })}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 text-xs font-medium transition cursor-pointer"
                      title="View File Analytics & Downloads"
                      data-testid={`link-analytics-btn-${link.slug}`}
                    >
                      <Activity className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Analytics</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setDeleteError(null);
                      setLinkToDelete(link);
                    }}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                    title="Delete link"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 3 Active Link Channels with Role Badges & Explanations */}
              <div className="space-y-2">
                {/* 1. Default Public Landing Page */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 rounded-xl bg-muted/20 border border-border/80 hover:border-blue-500/30 transition shadow-2xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25 tracking-wider uppercase">
                      Default
                    </span>
                    <div className="min-w-0 flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-foreground truncate">
                        Public Share Page
                      </span>
                      <InfoTooltip
                        title="Default Public Link"
                        content="The standard public landing page for recipients with live preview, expiry timer, password check, and download slot claim."
                        variant="info"
                        iconClassName="w-3 h-3 text-muted-foreground/60"
                      />
                    </div>
                    <span className="hidden lg:inline font-mono text-[11px] text-muted-foreground truncate max-w-sm">
                      {gphostPublicUrl}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    <a
                      href={gphostOpenUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition shadow-2xs cursor-pointer"
                      title={`Open ${gphostPublicUrl} in new tab`}
                    >
                      <span>Open</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      onClick={() => copyToClipboard(gphostPublicUrl, `default-${link.slug}`)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-medium transition cursor-pointer"
                      title="Copy default share URL"
                    >
                      {copiedSlug === `default-${link.slug}` ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-500" />
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-muted-foreground" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* 2. Direct CDN / Embed Stream */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 rounded-xl bg-muted/20 border border-border/80 hover:border-purple-500/30 transition shadow-2xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/25 tracking-wider uppercase">
                      {isSite ? "Live Site" : "Direct / Embed"}
                    </span>
                    <div className="min-w-0 flex items-center gap-1.5">
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
                        iconClassName="w-3 h-3 text-muted-foreground/60"
                      />
                    </div>
                    <span className="hidden lg:inline font-mono text-[11px] text-muted-foreground truncate max-w-sm">
                      {directStreamPublicUrl}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    <a
                      href={directStreamOpenUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition shadow-2xs cursor-pointer"
                      title={isSite ? "Open live hosted site" : "Open raw CDN stream in new tab"}
                    >
                      <span>Open</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      onClick={() => copyToClipboard(directStreamPublicUrl, `raw-${link.slug}`)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-medium transition cursor-pointer"
                      title={isSite ? "Copy live site URL" : "Copy direct stream URL"}
                    >
                      {copiedSlug === `raw-${link.slug}` ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-500" />
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-muted-foreground" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* 3. XURL Shortlink (Dynamic) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 rounded-xl bg-muted/20 border border-border/80 hover:border-emerald-500/30 transition shadow-2xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 tracking-wider uppercase">
                      XURL Shortlink
                    </span>
                    <div className="min-w-0 flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-foreground truncate">
                        {formattedXurl ? "Short Vanity URL" : "Dynamic Shortlink"}
                      </span>
                      <InfoTooltip
                        title="XURL Shortlink"
                        content="Compact shortened vanity alias for social sharing, chat apps (WhatsApp, Telegram), and SMS. Redirects automatically to the public download portal."
                        variant="emerald"
                        iconClassName="w-3 h-3 text-muted-foreground/60"
                      />
                    </div>
                    {formattedXurl ? (
                      <span className="hidden lg:inline font-mono text-[11px] text-emerald-600 dark:text-emerald-400 truncate max-w-sm">
                        {formattedXurl}
                      </span>
                    ) : (
                      <span className="hidden sm:inline text-[11px] text-muted-foreground truncate">
                        Click generate to create a dynamic short URL
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    {formattedXurl ? (
                      <>
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
                          onClick={() => copyToClipboard(formattedXurl, `xurl-${link.slug}`)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-medium transition cursor-pointer"
                          title="Copy XURL shortlink"
                        >
                          {copiedSlug === `xurl-${link.slug}` ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-500" />
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleGenerateXurl(link.slug)}
                        disabled={retryingSlug === link.slug}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50"
                        title="Generate dynamic XURL shortlink now"
                      >
                        {retryingSlug === link.slug ? (
                          <RotateCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Globe className="w-3 h-3" />
                        )}
                        <span>+ Generate XURL</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* XURL Action Error if any */}
                {(!link.xurl_short_url && link.xurl_status === "failed") || xurlActionError[link.slug] ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-amber-600 dark:text-amber-400 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="text-[11px]">
                      {xurlActionError[link.slug] || "XURL shortlink creation failed"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleGenerateXurl(link.slug)}
                      disabled={retryingSlug === link.slug}
                      className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer disabled:opacity-50"
                    >
                      {retryingSlug === link.slug && <RotateCw className="w-3 h-3 animate-spin" />}
                      <span>Retry XURL</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation Modal for Nuclear Share Link Deletion */}
      <ConfirmationModal
        isOpen={Boolean(linkToDelete)}
        onClose={() => !isDeleting && setLinkToDelete(null)}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
        title="Delete Share Link?"
        description={
          <div className="space-y-2">
            <p>
              Are you sure you want to delete the share link for{" "}
              <strong className="text-foreground">{linkToDelete?.file_name}</strong>?
            </p>
            <p className="font-mono text-[11px] bg-muted/60 p-1.5 rounded border border-border text-foreground truncate">
              {publicGphostOrigin}/f/{linkToDelete?.slug}
            </p>
            <p className="text-[11px] text-rose-600 dark:text-rose-400">
              This will permanently revoke access. Anyone with this link will immediately be unable to download the file.
            </p>
            {deleteError && (
              <p className="text-xs text-red-500 font-medium bg-red-500/10 p-2 rounded border border-red-500/20">
                {deleteError}
              </p>
            )}
          </div>
        }
        confirmText="Yes, Delete Link"
        cancelText="Cancel"
        variant="danger"
      />

      {/* Analytics Modal */}
      {analyticsFile && (
        <FileAnalyticsModal
          fileId={analyticsFile.id}
          filename={analyticsFile.filename}
          onClose={() => setAnalyticsFile(null)}
        />
      )}
    </div>
  );
}
