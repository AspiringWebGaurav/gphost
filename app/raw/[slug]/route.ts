import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getR2ObjectStream } from "@/lib/storage/r2";
import { getUnlockCookieName, verifyUnlockToken } from "@/lib/security/unlock-token";
import { redis } from "@/lib/redis/client";
import { isHtmlDocument } from "@/lib/storage/sanitizer";
import { logFileEvent } from "@/lib/telemetry/events";
import { formatTimeElapsedSinceExpiry, formatExpiryTimestamp } from "@/lib/storage/expiry";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type, Authorization",
  "Access-Control-Expose-Headers": "Content-Length, Content-Type, Content-Range, ETag",
  "Timing-Allow-Origin": "*",
};

interface RawCachedMeta {
  shareId: string;
  fileId: string;
  r2_key: string;
  sanitized_name: string;
  mime_type: string;
  password_hash: string | null;
  is_active: boolean;
  status: string;
  expires_at: string | null;
  file_expires_at: string | null;
  max_downloads: number | null;
  download_count: number;
  is_expired?: boolean;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug || typeof slug !== "string" || slug.length > 64) {
      return NextResponse.json({ error: "Invalid resource slug" }, { status: 400, headers: CORS_HEADERS });
    }

    const isBrowserHtmlReq = (req.headers.get("accept") || "").includes("text/html");

    let meta: RawCachedMeta | null = null;
    try {
      meta = await redis.get<RawCachedMeta>(`raw:meta:${slug}`);
    } catch {}

    // Fast-path: Expired tombstone in Redis returns 410 immediately without hitting database
    if (meta?.is_expired) {
      const now = Date.now();
      const expiryIso = meta.expires_at || meta.file_expires_at || new Date(now).toISOString();
      const elapsedAgo = formatTimeElapsedSinceExpiry(expiryIso, now);
      const formattedUtc = formatExpiryTimestamp(expiryIso);

      if (isBrowserHtmlReq) {
        return new NextResponse(
          generateExpiredCdnHtml({
            slug,
            sanitizedName: meta.sanitized_name,
            expiredAtIso: expiryIso,
            elapsedAgo,
            formattedUtc,
          }),
          {
            status: 410,
            headers: {
              ...CORS_HEADERS,
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-cache, no-store, must-revalidate",
            },
          }
        );
      }

      return NextResponse.json(
        {
          error: "This CDN asset link has expired",
          status: "expired",
          expired_at: expiryIso,
          expired_at_formatted: formattedUtc,
          expired_ago: elapsedAgo,
          slug,
        },
        {
          status: 410,
          headers: {
            ...CORS_HEADERS,
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        }
      );
    }

    if (!meta) {
      const adminClient = createAdminClient();
      const { data: share, error: shareErr } = await adminClient
        .from("share_links")
        .select(`
          id,
          slug,
          is_active,
          expires_at,
          max_downloads,
          download_count,
          is_single_use,
          password_hash,
          file:files (
            id,
            sanitized_name,
            r2_key,
            byte_size,
            mime_type,
            status,
            expires_at
          )
        `)
        .eq("slug", slug)
        .single();

      if (shareErr || !share || !share.file) {
        if (isBrowserHtmlReq) {
          return new NextResponse(generateNotFoundCdnHtml(), {
            status: 404,
            headers: { ...CORS_HEADERS, "Content-Type": "text/html; charset=utf-8" },
          });
        }
        return NextResponse.json({ error: "Asset not found" }, { status: 404, headers: CORS_HEADERS });
      }

      const file = Array.isArray(share.file) ? share.file[0] : share.file;
      if (!file) {
        if (isBrowserHtmlReq) {
          return new NextResponse(generateNotFoundCdnHtml(), {
            status: 404,
            headers: { ...CORS_HEADERS, "Content-Type": "text/html; charset=utf-8" },
          });
        }
        return NextResponse.json({ error: "Asset not found" }, { status: 404, headers: CORS_HEADERS });
      }

      meta = {
        shareId: share.id,
        fileId: file.id,
        r2_key: file.r2_key,
        sanitized_name: file.sanitized_name,
        mime_type: file.mime_type,
        password_hash: share.password_hash,
        is_active: share.is_active,
        status: file.status,
        expires_at: share.expires_at,
        file_expires_at: file.expires_at,
        max_downloads: share.max_downloads,
        download_count: share.download_count,
      };

      if (share.is_active && file.status === "ACTIVE") {
        const shareExpTime = share.expires_at ? new Date(share.expires_at).getTime() : Infinity;
        const fileExpTime = file.expires_at ? new Date(file.expires_at).getTime() : Infinity;
        const earliestExpTime = Math.min(shareExpTime, fileExpTime);
        const nowMs = Date.now();
        const remainingSecs = earliestExpTime !== Infinity
          ? Math.floor((earliestExpTime - nowMs) / 1000)
          : null;

        if (remainingSecs === null || remainingSecs > 0) {
          // Clamp Redis TTL: max 60s, but never exceed remaining lifetime!
          const redisTtl = remainingSecs !== null
            ? Math.max(1, Math.min(60, remainingSecs))
            : 60;
          try {
            await redis.set(`raw:meta:${slug}`, meta, { ex: redisTtl });
          } catch {}
        }
      }
    }

    // Expiration lifecycle check (evaluated first so expired assets report exact dynamic elapsed time)
    const now = Date.now();
    const shareExpTime = meta.expires_at ? new Date(meta.expires_at).getTime() : Infinity;
    const fileExpTime = meta.file_expires_at ? new Date(meta.file_expires_at).getTime() : Infinity;
    const earliestExpTime = Math.min(shareExpTime, fileExpTime);
    const isExpired = (earliestExpTime !== Infinity && earliestExpTime <= now) || meta.status === "EXPIRED";

    if (isExpired) {
      const expiryIso = earliestExpTime !== Infinity
        ? new Date(earliestExpTime).toISOString()
        : (meta.expires_at || meta.file_expires_at || new Date(now).toISOString());
      const elapsedAgo = formatTimeElapsedSinceExpiry(expiryIso, now);
      const formattedUtc = formatExpiryTimestamp(expiryIso);

      // Cache expired tombstone in Redis for 60s to prevent database hammering
      try {
        await redis.set(
          `raw:meta:${slug}`,
          {
            shareId: meta.shareId,
            fileId: meta.fileId,
            r2_key: "",
            sanitized_name: meta.sanitized_name,
            mime_type: meta.mime_type,
            password_hash: null,
            is_active: false,
            status: "EXPIRED",
            expires_at: expiryIso,
            file_expires_at: expiryIso,
            max_downloads: meta.max_downloads,
            download_count: meta.download_count,
            is_expired: true,
          },
          { ex: 60 }
        );
      } catch {}

      if (isBrowserHtmlReq) {
        return new NextResponse(
          generateExpiredCdnHtml({
            slug,
            sanitizedName: meta.sanitized_name,
            expiredAtIso: expiryIso,
            elapsedAgo,
            formattedUtc,
          }),
          {
            status: 410,
            headers: {
              ...CORS_HEADERS,
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-cache, no-store, must-revalidate",
            },
          }
        );
      }

      return NextResponse.json(
        {
          error: "This CDN asset link has expired",
          status: "expired",
          expired_at: expiryIso,
          expired_at_formatted: formattedUtc,
          expired_ago: elapsedAgo,
          slug,
        },
        {
          status: 410,
          headers: {
            ...CORS_HEADERS,
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        }
      );
    }

    if (!meta.is_active || meta.status !== "ACTIVE") {
      if (isBrowserHtmlReq) {
        return new NextResponse(
          generateInactiveCdnHtml(),
          {
            status: 410,
            headers: {
              ...CORS_HEADERS,
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-cache, no-store, must-revalidate",
            },
          }
        );
      }
      return NextResponse.json(
        { error: "This asset is no longer available" },
        { status: 410, headers: CORS_HEADERS }
      );
    }

    if (meta.max_downloads !== null && meta.download_count >= meta.max_downloads) {
      if (isBrowserHtmlReq) {
        return new NextResponse(
          generateLimitReachedCdnHtml({
            slug,
            sanitizedName: meta.sanitized_name,
            downloadCount: meta.download_count,
            maxDownloads: meta.max_downloads,
          }),
          {
            status: 410,
            headers: {
              ...CORS_HEADERS,
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-cache, no-store, must-revalidate",
            },
          }
        );
      }
      return NextResponse.json(
        { error: "This asset has reached its maximum download limit" },
        { status: 410, headers: CORS_HEADERS }
      );
    }

    // Password verification check
    if (meta.password_hash) {
      const cookieName = getUnlockCookieName(slug);
      const unlockCookie = req.cookies.get(cookieName)?.value;
      const queryToken = req.nextUrl.searchParams.get("token") || req.nextUrl.searchParams.get("key");

      const tokenToVerify = unlockCookie || queryToken;
      if (!tokenToVerify || !verifyUnlockToken(tokenToVerify, slug, meta.fileId)) {
        if (isBrowserHtmlReq) {
          return NextResponse.redirect(new URL(`/f/${slug}`, req.url));
        }
        return NextResponse.json(
          {
            error: "Password protection enabled. Provide valid unlock token in cookie or ?token= query parameter.",
            code: "PASSWORD_REQUIRED",
          },
          { status: 401, headers: CORS_HEADERS }
        );
      }
    }

    // Non-blocking telemetry
    void logFileEvent({
      fileId: meta.fileId,
      shareLinkId: meta.shareId,
      eventType: "raw_view",
      req,
    });

    // 100% Backend Secure Proxy Stream:
    // Fetches object directly from Cloudflare R2 on the backend and streams payload to client.
    // The browser address bar strictly stays on the custom slug link (/site/[slug] or /raw/[slug]).
    // Cloudflare R2 bucket URLs, keys, account IDs, and presigned tokens are never leaked to the public.
    const range = req.headers.get("range") || undefined;
    const s3Res = await getR2ObjectStream(meta.r2_key, range);

    if (!s3Res.Body) {
      return NextResponse.json(
        { error: "Failed to read storage stream" },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    const mime = meta.mime_type || s3Res.ContentType || "application/octet-stream";
    const isHtml = isHtmlDocument(meta.sanitized_name, mime);

    const headers = new Headers();
    for (const [key, val] of Object.entries(CORS_HEADERS)) {
      headers.set(key, val);
    }

    if (isHtml) {
      headers.set("Content-Type", "text/html; charset=utf-8");
      headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(meta.sanitized_name)}"`);
    } else {
      headers.set("Content-Type", mime);
      headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(meta.sanitized_name)}"`);
    }

    // Complete payload buffering for HTML and assets <= 15MB without range headers:
    // Prevents chunked encoding stream stalls (ERR_INCOMPLETE_CHUNKED_ENCODING)
    // and delivers a complete, intact document with exact Content-Length so the browser loads cleanly.
    let responseBody: BodyInit;
    const bodyObj = s3Res.Body as unknown as {
      transformToByteArray?: () => Promise<Uint8Array>;
      transformToWebStream?: () => ReadableStream;
    };

    if (
      !range &&
      (isHtml || (s3Res.ContentLength !== undefined && s3Res.ContentLength <= 15 * 1024 * 1024)) &&
      typeof bodyObj.transformToByteArray === "function"
    ) {
      const bytes = await bodyObj.transformToByteArray();
      responseBody = bytes as unknown as BodyInit;
      headers.set("Content-Length", String(bytes.byteLength));
    } else {
      responseBody =
        typeof bodyObj.transformToWebStream === "function"
          ? bodyObj.transformToWebStream()
          : (s3Res.Body as unknown as ReadableStream);

      if (s3Res.ContentLength !== undefined) {
        headers.set("Content-Length", String(s3Res.ContentLength));
      }
    }

    if (s3Res.ContentRange) {
      headers.set("Content-Range", s3Res.ContentRange);
      headers.set("Accept-Ranges", "bytes");
    } else {
      headers.set("Accept-Ranges", "bytes");
    }
    if (s3Res.ETag) {
      headers.set("ETag", s3Res.ETag.replace(/^"|"$/g, ""));
    }
    if (s3Res.LastModified) {
      headers.set("Last-Modified", s3Res.LastModified.toUTCString());
    }

    // Authoritative dynamic HTTP & CDN edge cache policy
    if (meta.password_hash || meta.max_downloads !== null) {
      // Password-protected and quota-limited assets MUST NEVER be publicly cached on CDN edges
      headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
    } else if (isHtml) {
      // Hosted HTML documents MUST NOT be cached by browser disk cache without revalidation
      // This ensures that when the link expires, a standard visit/reload immediately detects 410 without needing Ctrl+F5 hard refresh!
      headers.set("Cache-Control", "no-cache, must-revalidate");
    } else if (earliestExpTime !== Infinity) {
      // Ephemeral assets with a scheduled expiration (images, media, pdf, zip):
      // Edge cache TTL MUST NEVER exceed the remaining time to live!
      const remainingSecs = Math.max(0, Math.floor((earliestExpTime - Date.now()) / 1000));
      const edgeMaxAge = Math.min(300, remainingSecs);
      if (edgeMaxAge <= 0) {
        headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      } else {
        // Public CDN caching bounded strictly by TTL, with NO stale-while-revalidate past expiry!
        headers.set(
          "Cache-Control",
          `public, max-age=${edgeMaxAge}, s-maxage=${edgeMaxAge}, must-revalidate`
        );
      }
    } else {
      // Permanent assets with no password and no download limits
      headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400");
    }

    return new NextResponse(responseBody, {
      status: s3Res.ContentRange ? 206 : 200,
      headers,
    });
  } catch (err) {
    console.error("Error serving raw asset redirect:", err);
    return NextResponse.json(
      { error: "Failed to resolve raw asset" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function HEAD(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  return GET(req, context);
}

function generateExpiredCdnHtml({
  expiredAtIso,
  elapsedAgo,
  formattedUtc,
}: {
  slug?: string;
  sanitizedName?: string;
  expiredAtIso: string;
  elapsedAgo: string;
  formattedUtc: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>This link has expired — GPHost</title>
  <script>
    (function(){
      try {
        localStorage.removeItem('gphost_theme');
        var userChoice = localStorage.getItem('gphost_user_theme');
        var theme = userChoice === 'dark' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
      } catch(e) {}
    })();
  </script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #ffffff;
      --text: #202124;
      --text-muted: #5f6368;
      --text-dim: #80868b;
      --border: #dadce0;
      --btn-primary-bg: #1a73e8;
      --btn-primary-hover: #1557b0;
      --btn-primary-text: #ffffff;
      --btn-secondary-bg: #ffffff;
      --btn-secondary-border: #dadce0;
      --btn-secondary-hover: #f8f9fa;
      --btn-secondary-text: #1a73e8;
      --chip-bg: #f1f3f4;
      --chip-border: #e8eaed;
      --chip-text: #202124;
      --link-color: #1a73e8;
      --link-hover: #1557b0;
      --font-sans: -apple-system, BlinkMacSystemFont, "Google Sans", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Monaco, Consolas, monospace;
    }
    [data-theme="dark"] {
      --bg: #202124;
      --text: #e8eaed;
      --text-muted: #9aa0a6;
      --text-dim: #80868b;
      --border: #3c4043;
      --btn-primary-bg: #8ab4f8;
      --btn-primary-hover: #93bbf9;
      --btn-primary-text: #202124;
      --btn-secondary-bg: #202124;
      --btn-secondary-border: #5f6368;
      --btn-secondary-hover: #303134;
      --btn-secondary-text: #8ab4f8;
      --chip-bg: #303134;
      --chip-border: #3c4043;
      --chip-text: #e8eaed;
      --link-color: #8ab4f8;
      --link-hover: #aecbfa;
    }
    html {
      height: 100%;
      height: 100dvh;
    }
    body {
      height: 100%;
      min-height: 100vh;
      min-height: 100dvh;
      max-height: 100dvh;
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      transition: background-color 0.2s ease, color 0.2s ease;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
      position: relative;
    }
    @media (max-height: 480px) {
      body {
        overflow-y: auto;
        height: auto;
        max-height: none;
      }
    }
    .stream-loader {
      position: fixed;
      top: 0;
      left: 0;
      height: 2.5px;
      width: 100%;
      background: linear-gradient(90deg, #1a73e8 0%, #8ab4f8 50%, #1a73e8 100%);
      background-size: 200% 100%;
      animation: streamLoad 1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      z-index: 9999;
      transition: opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1), transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      will-change: transform, opacity;
    }
    .stream-loader.loaded {
      opacity: 0;
      transform: translateY(-2.5px);
      pointer-events: none;
    }
    @keyframes streamLoad {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    .theme-toggle-btn {
      position: fixed;
      top: 20px;
      right: 24px;
      z-index: 50;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text);
      cursor: pointer;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      transition: all 0.15s ease;
    }
    .theme-toggle-btn:hover {
      background: var(--btn-secondary-hover);
      transform: scale(1.06);
    }
    .container {
      width: 100%;
      max-width: 640px;
      margin: 0 auto;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .brand-header {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      text-decoration: none;
      color: var(--text);
      margin-bottom: 20px;
      user-select: none;
    }
    .brand-logo {
      color: var(--btn-primary-bg);
    }
    .brand-text {
      font-size: 22px;
      font-weight: 500;
      letter-spacing: -0.02em;
      color: var(--text);
    }
    .hero-title {
      font-size: clamp(36px, 5.6vw, 45px);
      font-weight: 500;
      letter-spacing: -0.02em;
      line-height: 1.2;
      color: var(--text);
      margin-bottom: 14px;
    }
    .text-stack {
      margin-bottom: 32px;
      display: flex;
      flex-direction: column;
      gap: 7px;
      align-items: center;
    }
    .text-line {
      font-size: 14.5px;
      line-height: 1.45;
      color: var(--text-muted);
      margin: 0;
    }
    @media (min-width: 480px) {
      .text-line, .elapsed-line {
        white-space: nowrap;
      }
    }
    .elapsed-line {
      font-size: 15.5px;
      line-height: 1.45;
      color: var(--text-muted);
      margin: 0;
    }
    .highlight-ago {
      font-size: 18.5px;
      font-weight: 600;
      color: var(--text);
      cursor: help;
    }
    .footer-minimal {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
    }
    .footer-minimal a {
      color: var(--link-color);
      text-decoration: none;
      transition: color 0.15s ease;
    }
    .footer-minimal a:hover {
      text-decoration: underline;
      color: var(--link-hover);
    }
    .footer-minimal .sep {
      color: var(--border);
      user-select: none;
    }
  </style>
</head>
<body>
  <div id="stream-loader" class="stream-loader"></div>

  <button type="button" id="theme-btn" class="theme-toggle-btn" title="Toggle theme">
    <span id="theme-icon">🌙</span>
  </button>

  <main class="container">
    <a href="/" class="brand-header">
      <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="brand-logo">
        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
        <path d="M2 17l10 5 10-5"></path>
        <path d="M2 12l10 5 10-5"></path>
      </svg>
      <span class="brand-text">GPHost</span>
    </a>

    <h1 class="hero-title">This link has expired</h1>

    <div class="text-stack">
      <p class="text-line">
        Files are temporary and deleted after expiry.
      </p>
      <p class="elapsed-line">
        This link expired <strong id="elapsed-hero" class="highlight-ago" title="${formattedUtc}">${elapsedAgo}</strong>.
      </p>
    </div>

    <div class="footer-minimal">
      <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
      <span class="sep">|</span>
      <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
      <span class="sep">|</span>
      <a href="/terms#section-burner" target="_blank" rel="noopener noreferrer">Why am I seeing this?</a>
    </div>
  </main>

  <script>
    (function() {
      // 1. Stream loader dismissal with fallback and lifecycle
      var streamLoader = document.getElementById('stream-loader');
      function dismissLoader() {
        if (streamLoader && !streamLoader.classList.contains('loaded')) {
          streamLoader.classList.add('loaded');
        }
      }
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(dismissLoader, 80);
      } else {
        window.addEventListener('DOMContentLoaded', function() { setTimeout(dismissLoader, 80); });
        window.addEventListener('load', dismissLoader);
      }
      setTimeout(dismissLoader, 1200);
      window.addEventListener('pageshow', function() { dismissLoader(); });

      // 2. Theme Management with Storage Sync
      var root = document.documentElement;
      function updateThemeIcon(t) {
        var iconEl = document.getElementById('theme-icon');
        if (iconEl) {
          iconEl.textContent = t === 'dark' ? '☀️' : '🌙';
          iconEl.parentElement.title = t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
        }
      }
      var currentTheme = root.getAttribute('data-theme') || 'light';
      updateThemeIcon(currentTheme);

      var themeBtn = document.getElementById('theme-btn');
      if (themeBtn) {
        themeBtn.addEventListener('click', function() {
          var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
          root.setAttribute('data-theme', next);
          try { localStorage.setItem('gphost_user_theme', next); } catch(e) {}
          updateThemeIcon(next);
        });
      }

      // 3. Lifecycle-aware Elapsed Duration Ticker
      var iso = ${JSON.stringify(expiredAtIso)};
      var d = new Date(iso);
      if (!isNaN(d.getTime())) {
        var formattedLocal = "";
        try {
          formattedLocal = d.toLocaleString(undefined, {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short'
          });
        } catch(e) {}

        function updateElapsed() {
          var now = Date.now();
          var diffMs = now - d.getTime();
          var elapsed = "just now";
          if (diffMs > 0) {
            var s = Math.floor(diffMs / 1000);
            var m = Math.floor(s / 60);
            var h = Math.floor(m / 60);
            var days = Math.floor(h / 24);
            if (days >= 30) {
              var months = Math.floor(days / 30);
              elapsed = months === 1 ? "1 month ago" : months + " months ago";
            } else if (days >= 7) {
              var weeks = Math.floor(days / 7);
              elapsed = weeks === 1 ? "1 week ago" : weeks + " weeks ago";
            } else if (days > 0) {
              elapsed = days === 1 ? "1 day ago" : days + " days ago";
            } else if (h > 0) {
              elapsed = h === 1 ? "1 hour ago" : h + " hours ago";
            } else if (m > 0) {
              elapsed = m === 1 ? "1 minute ago" : m + " minutes ago";
            } else {
              elapsed = s <= 5 ? "just now" : s + " seconds ago";
            }
          }
          var heroAgo = document.getElementById('elapsed-hero');
          if (heroAgo) {
            heroAgo.textContent = elapsed;
            if (formattedLocal) heroAgo.title = "Expired on: " + formattedLocal;
          }
        }

        updateElapsed();
        var timerId = setInterval(updateElapsed, 5000);

        document.addEventListener('visibilitychange', function() {
          if (document.visibilityState === 'visible') {
            updateElapsed();
            if (!timerId) timerId = setInterval(updateElapsed, 5000);
          } else {
            if (timerId) { clearInterval(timerId); timerId = null; }
          }
        });
      }
    })();
  </script>
</body>
</html>`;
}

function generateNotFoundCdnHtml(): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Not Found — GPHost</title>
  <script>
    (function(){
      try {
        localStorage.removeItem('gphost_theme');
        var userChoice = localStorage.getItem('gphost_user_theme');
        var theme = userChoice === 'dark' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
      } catch(e) {}
    })();
  </script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #ffffff;
      --text: #202124;
      --text-muted: #5f6368;
      --text-dim: #80868b;
      --border: #dadce0;
      --btn-primary-bg: #1a73e8;
      --btn-primary-hover: #1557b0;
      --btn-primary-text: #ffffff;
      --btn-secondary-bg: #ffffff;
      --btn-secondary-border: #dadce0;
      --btn-secondary-hover: #f8f9fa;
      --btn-secondary-text: #1a73e8;
      --chip-bg: #f1f3f4;
      --chip-border: #e8eaed;
      --chip-text: #202124;
      --link-color: #1a73e8;
      --link-hover: #1557b0;
      --font-sans: -apple-system, BlinkMacSystemFont, "Google Sans", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Monaco, Consolas, monospace;
    }
    [data-theme="dark"] {
      --bg: #202124;
      --text: #e8eaed;
      --text-muted: #9aa0a6;
      --text-dim: #80868b;
      --border: #3c4043;
      --btn-primary-bg: #8ab4f8;
      --btn-primary-hover: #93bbf9;
      --btn-primary-text: #202124;
      --btn-secondary-bg: #202124;
      --btn-secondary-border: #5f6368;
      --btn-secondary-hover: #303134;
      --btn-secondary-text: #8ab4f8;
      --chip-bg: #303134;
      --chip-border: #3c4043;
      --chip-text: #e8eaed;
      --link-color: #8ab4f8;
      --link-hover: #aecbfa;
    }
    html {
      height: 100%;
      height: 100dvh;
    }
    body {
      height: 100%;
      min-height: 100vh;
      min-height: 100dvh;
      max-height: 100dvh;
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      transition: background-color 0.2s ease, color 0.2s ease;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
      position: relative;
    }
    @media (max-height: 480px) {
      body {
        overflow-y: auto;
        height: auto;
        max-height: none;
      }
    }
    .stream-loader {
      position: fixed;
      top: 0;
      left: 0;
      height: 2.5px;
      width: 100%;
      background: linear-gradient(90deg, #1a73e8 0%, #8ab4f8 50%, #1a73e8 100%);
      background-size: 200% 100%;
      animation: streamLoad 1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      z-index: 9999;
      transition: opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1), transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      will-change: transform, opacity;
    }
    .stream-loader.loaded { opacity: 0; transform: translateY(-2.5px); pointer-events: none; }
    @keyframes streamLoad {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    .theme-toggle-btn {
      position: fixed;
      top: 20px;
      right: 24px;
      z-index: 50;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text);
      cursor: pointer;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      transition: all 0.15s ease;
    }
    .theme-toggle-btn:hover {
      background: var(--btn-secondary-hover);
      transform: scale(1.06);
    }
    .container {
      width: 100%;
      max-width: 640px;
      margin: 0 auto;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .brand-header {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      text-decoration: none;
      color: var(--text);
      margin-bottom: 20px;
      user-select: none;
    }
    .brand-logo { color: var(--btn-primary-bg); }
    .brand-text {
      font-size: 22px;
      font-weight: 500;
      letter-spacing: -0.02em;
      color: var(--text);
    }
    .hero-title {
      font-size: clamp(36px, 5.6vw, 45px);
      font-weight: 500;
      letter-spacing: -0.02em;
      line-height: 1.2;
      color: var(--text);
      margin-bottom: 14px;
    }
    .text-stack {
      margin-bottom: 26px;
      display: flex;
      flex-direction: column;
      gap: 7px;
      align-items: center;
    }
    .text-line {
      font-size: 14.5px;
      line-height: 1.45;
      color: var(--text-muted);
      margin: 0;
    }
    @media (min-width: 480px) {
      .text-line {
        white-space: nowrap;
      }
    }
    .file-tag {
      font-family: var(--font-mono);
      font-size: 13px;
      color: var(--text);
      background: var(--chip-bg);
      border: 1px solid var(--chip-border);
      padding: 1.5px 7px;
      border-radius: 5px;
      font-weight: 500;
    }
    .link-why {
      font-size: 13.5px;
      color: var(--link-color);
      text-decoration: none;
      font-weight: 500;
      margin-top: 4px;
      display: inline-block;
    }
    .link-why:hover {
      text-decoration: underline;
      color: var(--link-hover);
    }
    .btn-group {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-bottom: 28px;
    }
    .btn-primary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--btn-primary-bg);
      color: var(--btn-primary-text);
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      padding: 9px 24px;
      border-radius: 20px;
      transition: background 0.15s ease;
    }
    .btn-primary:hover {
      background: var(--btn-primary-hover);
    }
    .footer-minimal {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
    }
    .footer-minimal a {
      color: var(--link-color);
      text-decoration: none;
    }
    .footer-minimal a:hover {
      text-decoration: underline;
      color: var(--link-hover);
    }
    .footer-minimal .sep {
      color: var(--border);
      user-select: none;
    }
  </style>
</head>
<body>
  <div id="stream-loader" class="stream-loader"></div>
  <button type="button" id="theme-btn" class="theme-toggle-btn" title="Toggle theme">
    <span id="theme-icon">🌙</span>
  </button>
  <main class="container">
    <a href="/" class="brand-header">
      <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="brand-logo">
        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
        <path d="M2 17l10 5 10-5"></path>
        <path d="M2 12l10 5 10-5"></path>
      </svg>
      <span class="brand-text">GPHost</span>
    </a>
    <h1 class="hero-title">Page not found</h1>
    <div class="text-stack">
      <p class="text-line">
        This link could not be found.
      </p>
      <p class="text-line">
        It may have expired or been mistyped.
      </p>
    </div>
    <div class="footer-minimal">
      <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
      <span class="sep">|</span>
      <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
      <span class="sep">|</span>
      <a href="/terms#section-raw-cdn" target="_blank" rel="noopener noreferrer">Why am I seeing this?</a>
    </div>
  </main>
  <script>
    (function(){
      var streamLoader = document.getElementById('stream-loader');
      function dismissLoader() {
        if (streamLoader && !streamLoader.classList.contains('loaded')) {
          streamLoader.classList.add('loaded');
        }
      }
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(dismissLoader, 80);
      } else {
        window.addEventListener('DOMContentLoaded', function() { setTimeout(dismissLoader, 80); });
        window.addEventListener('load', dismissLoader);
      }
      setTimeout(dismissLoader, 1200);
      window.addEventListener('pageshow', function() { dismissLoader(); });

      var root = document.documentElement;
      function updateIcon(t) {
        var el = document.getElementById('theme-icon');
        if (el) el.textContent = t === 'dark' ? '☀️' : '🌙';
      }
      updateIcon(root.getAttribute('data-theme') || 'light');
      var btn = document.getElementById('theme-btn');
      if (btn) {
        btn.addEventListener('click', function() {
          var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
          root.setAttribute('data-theme', next);
          try { localStorage.setItem('gphost_user_theme', next); } catch(e) {}
          updateIcon(next);
        });
      }
    })();
  </script>
</body>
</html>`;
}

function generateInactiveCdnHtml(): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Link Disabled — GPHost</title>
  <script>
    (function(){
      try {
        localStorage.removeItem('gphost_theme');
        var userChoice = localStorage.getItem('gphost_user_theme');
        var theme = userChoice === 'dark' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
      } catch(e) {}
    })();
  </script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #ffffff;
      --text: #202124;
      --text-muted: #5f6368;
      --text-dim: #80868b;
      --border: #dadce0;
      --btn-primary-bg: #1a73e8;
      --btn-primary-hover: #1557b0;
      --btn-primary-text: #ffffff;
      --btn-secondary-bg: #ffffff;
      --btn-secondary-border: #dadce0;
      --btn-secondary-hover: #f8f9fa;
      --btn-secondary-text: #1a73e8;
      --chip-bg: #f1f3f4;
      --chip-border: #e8eaed;
      --chip-text: #202124;
      --link-color: #1a73e8;
      --link-hover: #1557b0;
      --font-sans: -apple-system, BlinkMacSystemFont, "Google Sans", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Monaco, Consolas, monospace;
    }
    [data-theme="dark"] {
      --bg: #202124;
      --text: #e8eaed;
      --text-muted: #9aa0a6;
      --text-dim: #80868b;
      --border: #3c4043;
      --btn-primary-bg: #8ab4f8;
      --btn-primary-hover: #93bbf9;
      --btn-primary-text: #202124;
      --btn-secondary-bg: #202124;
      --btn-secondary-border: #5f6368;
      --btn-secondary-hover: #303134;
      --btn-secondary-text: #8ab4f8;
      --chip-bg: #303134;
      --chip-border: #3c4043;
      --chip-text: #e8eaed;
      --link-color: #8ab4f8;
      --link-hover: #aecbfa;
    }
    html {
      height: 100%;
      height: 100dvh;
    }
    body {
      height: 100%;
      min-height: 100vh;
      min-height: 100dvh;
      max-height: 100dvh;
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      transition: background-color 0.2s ease, color 0.2s ease;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
      position: relative;
    }
    @media (max-height: 480px) {
      body {
        overflow-y: auto;
        height: auto;
        max-height: none;
      }
    }
    .stream-loader {
      position: fixed;
      top: 0;
      left: 0;
      height: 2.5px;
      width: 100%;
      background: linear-gradient(90deg, #1a73e8 0%, #8ab4f8 50%, #1a73e8 100%);
      background-size: 200% 100%;
      animation: streamLoad 1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      z-index: 9999;
      transition: opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1), transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      will-change: transform, opacity;
    }
    .stream-loader.loaded { opacity: 0; transform: translateY(-2.5px); pointer-events: none; }
    @keyframes streamLoad {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    .theme-toggle-btn {
      position: fixed;
      top: 20px;
      right: 24px;
      z-index: 50;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text);
      cursor: pointer;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      transition: all 0.15s ease;
    }
    .theme-toggle-btn:hover {
      background: var(--btn-secondary-hover);
      transform: scale(1.06);
    }
    .container {
      width: 100%;
      max-width: 640px;
      margin: 0 auto;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .brand-header {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      text-decoration: none;
      color: var(--text);
      margin-bottom: 20px;
      user-select: none;
    }
    .brand-logo { color: var(--btn-primary-bg); }
    .brand-text {
      font-size: 22px;
      font-weight: 500;
      letter-spacing: -0.02em;
      color: var(--text);
    }
    .hero-title {
      font-size: clamp(36px, 5.6vw, 45px);
      font-weight: 500;
      letter-spacing: -0.02em;
      line-height: 1.2;
      color: var(--text);
      margin-bottom: 14px;
    }
    .text-stack {
      margin-bottom: 26px;
      display: flex;
      flex-direction: column;
      gap: 7px;
      align-items: center;
    }
    .text-line {
      font-size: 14.5px;
      line-height: 1.45;
      color: var(--text-muted);
      margin: 0;
    }
    @media (min-width: 480px) {
      .text-line {
        white-space: nowrap;
      }
    }
    .file-tag {
      font-family: var(--font-mono);
      font-size: 13px;
      color: var(--text);
      background: var(--chip-bg);
      border: 1px solid var(--chip-border);
      padding: 1.5px 7px;
      border-radius: 5px;
      font-weight: 500;
    }
    .link-why {
      font-size: 13.5px;
      color: var(--link-color);
      text-decoration: none;
      font-weight: 500;
      margin-top: 4px;
      display: inline-block;
    }
    .link-why:hover {
      text-decoration: underline;
      color: var(--link-hover);
    }
    .btn-group {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-bottom: 28px;
    }
    .btn-primary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--btn-primary-bg);
      color: var(--btn-primary-text);
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      padding: 9px 24px;
      border-radius: 20px;
      transition: background 0.15s ease;
    }
    .btn-primary:hover {
      background: var(--btn-primary-hover);
    }
    .footer-minimal {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
    }
    .footer-minimal a {
      color: var(--link-color);
      text-decoration: none;
    }
    .footer-minimal a:hover {
      text-decoration: underline;
      color: var(--link-hover);
    }
    .footer-minimal .sep {
      color: var(--border);
      user-select: none;
    }
  </style>
</head>
<body>
  <div id="stream-loader" class="stream-loader"></div>
  <button type="button" id="theme-btn" class="theme-toggle-btn" title="Toggle theme">
    <span id="theme-icon">🌙</span>
  </button>
  <main class="container">
    <a href="/" class="brand-header">
      <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="brand-logo">
        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
        <path d="M2 17l10 5 10-5"></path>
        <path d="M2 12l10 5 10-5"></path>
      </svg>
      <span class="brand-text">GPHost</span>
    </a>
    <h1 class="hero-title">Link disabled</h1>
    <div class="text-stack">
      <p class="text-line">
        This link was disabled by its owner.
      </p>
      <p class="text-line">
        Access has been temporarily or permanently closed.
      </p>
    </div>
    <div class="footer-minimal">
      <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
      <span class="sep">|</span>
      <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
      <span class="sep">|</span>
      <a href="/terms#section-burner" target="_blank" rel="noopener noreferrer">Why am I seeing this?</a>
    </div>
  </main>
  <script>
    (function(){
      var streamLoader = document.getElementById('stream-loader');
      function dismissLoader() {
        if (streamLoader && !streamLoader.classList.contains('loaded')) {
          streamLoader.classList.add('loaded');
        }
      }
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(dismissLoader, 80);
      } else {
        window.addEventListener('DOMContentLoaded', function() { setTimeout(dismissLoader, 80); });
        window.addEventListener('load', dismissLoader);
      }
      setTimeout(dismissLoader, 1200);
      window.addEventListener('pageshow', function() { dismissLoader(); });

      var root = document.documentElement;
      function updateIcon(t) {
        var el = document.getElementById('theme-icon');
        if (el) el.textContent = t === 'dark' ? '☀️' : '🌙';
      }
      updateIcon(root.getAttribute('data-theme') || 'light');
      var btn = document.getElementById('theme-btn');
      if (btn) {
        btn.addEventListener('click', function() {
          var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
          root.setAttribute('data-theme', next);
          try { localStorage.setItem('gphost_user_theme', next); } catch(e) {}
          updateIcon(next);
        });
      }
    })();
  </script>
</body>
</html>`;
}

function generateLimitReachedCdnHtml({
  maxDownloads,
}: {
  slug?: string;
  sanitizedName?: string;
  downloadCount?: number;
  maxDownloads: number;
}): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Download Limit Reached — GPHost</title>
  <script>
    (function(){
      try {
        localStorage.removeItem('gphost_theme');
        var userChoice = localStorage.getItem('gphost_user_theme');
        var theme = userChoice === 'dark' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
      } catch(e) {}
    })();
  </script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #ffffff;
      --text: #202124;
      --text-muted: #5f6368;
      --text-dim: #80868b;
      --border: #dadce0;
      --btn-primary-bg: #1a73e8;
      --btn-primary-hover: #1557b0;
      --btn-primary-text: #ffffff;
      --btn-secondary-bg: #ffffff;
      --btn-secondary-border: #dadce0;
      --btn-secondary-hover: #f8f9fa;
      --btn-secondary-text: #1a73e8;
      --chip-bg: #f1f3f4;
      --chip-border: #e8eaed;
      --chip-text: #202124;
      --link-color: #1a73e8;
      --link-hover: #1557b0;
      --font-sans: -apple-system, BlinkMacSystemFont, "Google Sans", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Monaco, Consolas, monospace;
    }
    [data-theme="dark"] {
      --bg: #202124;
      --text: #e8eaed;
      --text-muted: #9aa0a6;
      --text-dim: #80868b;
      --border: #3c4043;
      --btn-primary-bg: #8ab4f8;
      --btn-primary-hover: #93bbf9;
      --btn-primary-text: #202124;
      --btn-secondary-bg: #202124;
      --btn-secondary-border: #5f6368;
      --btn-secondary-hover: #303134;
      --btn-secondary-text: #8ab4f8;
      --chip-bg: #303134;
      --chip-border: #3c4043;
      --chip-text: #e8eaed;
      --link-color: #8ab4f8;
      --link-hover: #aecbfa;
    }
    html {
      height: 100%;
      height: 100dvh;
    }
    body {
      height: 100%;
      min-height: 100vh;
      min-height: 100dvh;
      max-height: 100dvh;
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      transition: background-color 0.2s ease, color 0.2s ease;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
      position: relative;
    }
    @media (max-height: 480px) {
      body {
        overflow-y: auto;
        height: auto;
        max-height: none;
      }
    }
    .stream-loader {
      position: fixed;
      top: 0;
      left: 0;
      height: 2.5px;
      width: 100%;
      background: linear-gradient(90deg, #1a73e8 0%, #8ab4f8 50%, #1a73e8 100%);
      background-size: 200% 100%;
      animation: streamLoad 1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      z-index: 9999;
      transition: opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1), transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      will-change: transform, opacity;
    }
    .stream-loader.loaded { opacity: 0; transform: translateY(-2.5px); pointer-events: none; }
    @keyframes streamLoad {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    .theme-toggle-btn {
      position: fixed;
      top: 20px;
      right: 24px;
      z-index: 50;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text);
      cursor: pointer;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      transition: all 0.15s ease;
    }
    .theme-toggle-btn:hover {
      background: var(--btn-secondary-hover);
      transform: scale(1.06);
    }
    .container {
      width: 100%;
      max-width: 640px;
      margin: 0 auto;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .brand-header {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      text-decoration: none;
      color: var(--text);
      margin-bottom: 20px;
      user-select: none;
    }
    .brand-logo { color: var(--btn-primary-bg); }
    .brand-text {
      font-size: 22px;
      font-weight: 500;
      letter-spacing: -0.02em;
      color: var(--text);
    }
    .hero-title {
      font-size: clamp(36px, 5.6vw, 45px);
      font-weight: 500;
      letter-spacing: -0.02em;
      line-height: 1.2;
      color: var(--text);
      margin-bottom: 14px;
    }
    .text-stack {
      margin-bottom: 26px;
      display: flex;
      flex-direction: column;
      gap: 7px;
      align-items: center;
    }
    .text-line {
      font-size: 14.5px;
      line-height: 1.45;
      color: var(--text-muted);
      margin: 0;
    }
    @media (min-width: 480px) {
      .text-line {
        white-space: nowrap;
      }
    }
    .file-tag {
      font-family: var(--font-mono);
      font-size: 13px;
      color: var(--text);
      background: var(--chip-bg);
      border: 1px solid var(--chip-border);
      padding: 1.5px 7px;
      border-radius: 5px;
      font-weight: 500;
    }
    .link-why {
      font-size: 13.5px;
      color: var(--link-color);
      text-decoration: none;
      font-weight: 500;
      margin-top: 4px;
      display: inline-block;
    }
    .link-why:hover {
      text-decoration: underline;
      color: var(--link-hover);
    }
    .btn-group {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-bottom: 28px;
    }
    .btn-primary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--btn-primary-bg);
      color: var(--btn-primary-text);
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      padding: 9px 24px;
      border-radius: 20px;
      transition: background 0.15s ease;
    }
    .btn-primary:hover {
      background: var(--btn-primary-hover);
    }
    .footer-minimal {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
    }
    .footer-minimal a {
      color: var(--link-color);
      text-decoration: none;
    }
    .footer-minimal a:hover {
      text-decoration: underline;
      color: var(--link-hover);
    }
    .footer-minimal .sep {
      color: var(--border);
      user-select: none;
    }
  </style>
</head>
<body>
  <div id="stream-loader" class="stream-loader"></div>
  <button type="button" id="theme-btn" class="theme-toggle-btn" title="Toggle theme">
    <span id="theme-icon">🌙</span>
  </button>
  <main class="container">
    <a href="/" class="brand-header">
      <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="brand-logo">
        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
        <path d="M2 17l10 5 10-5"></path>
        <path d="M2 12l10 5 10-5"></path>
      </svg>
      <span class="brand-text">GPHost</span>
    </a>
    <h1 class="hero-title">Download limit reached</h1>
    <div class="text-stack">
      <p class="text-line">
        This link reached its limit of ${maxDownloads} downloads.
      </p>
      <p class="text-line">
        Access is automatically closed once the download limit is reached.
      </p>
    </div>
    <div class="footer-minimal">
      <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
      <span class="sep">|</span>
      <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
      <span class="sep">|</span>
      <a href="/terms#section-burner" target="_blank" rel="noopener noreferrer">Why am I seeing this?</a>
    </div>
  </main>
  <script>
    (function(){
      var streamLoader = document.getElementById('stream-loader');
      function dismissLoader() {
        if (streamLoader && !streamLoader.classList.contains('loaded')) {
          streamLoader.classList.add('loaded');
        }
      }
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(dismissLoader, 80);
      } else {
        window.addEventListener('DOMContentLoaded', function() { setTimeout(dismissLoader, 80); });
        window.addEventListener('load', dismissLoader);
      }
      setTimeout(dismissLoader, 1200);
      window.addEventListener('pageshow', function() { dismissLoader(); });

      var root = document.documentElement;
      function updateIcon(t) {
        var el = document.getElementById('theme-icon');
        if (el) el.textContent = t === 'dark' ? '☀️' : '🌙';
      }
      updateIcon(root.getAttribute('data-theme') || 'light');
      var btn = document.getElementById('theme-btn');
      if (btn) {
        btn.addEventListener('click', function() {
          var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
          root.setAttribute('data-theme', next);
          try { localStorage.setItem('gphost_user_theme', next); } catch(e) {}
          updateIcon(next);
        });
      }
    })();
  </script>
</body>
</html>`;
}
