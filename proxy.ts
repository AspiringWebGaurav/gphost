import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import crypto from "crypto";

export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7-day persistent session window (active users stay logged in)
export const IDLE_TIMEOUT_SECONDS = 30 * 60; // 30-minute inactivity window (background idle timeout)

/**
 * Next.js 16 Proxy (formerly middleware.ts):
 * 1. Generates dynamic 128-bit cryptographically secure per-request CSP nonce.
 * 2. Injects Content-Security-Policy header and forwards x-nonce to server components.
 * 3. Synchronizes and refreshes Supabase Auth cookies on incoming/outgoing requests.
 * 4. Enforces 30-minute background idle timeout while keeping live/active sessions uninterrupted.
 * 5. Enforces preliminary route gating and safe redirects.
 * Note: Proxy is NEVER the sole authorization boundary. Server Actions and Route Handlers
 * independently enforce authoritative database checks.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/temp-preview/raw") {
    return NextResponse.redirect(new URL("/temp-preview", request.url));
  }

  // Immediately bypass Next.js internal paths, static assets, preview routes, direct raw streams, live sites, and generated metadata images
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/temp-preview") ||
    pathname.startsWith("/raw/") ||
    pathname.startsWith("/api/raw/") ||
    pathname.startsWith("/site/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/apple-icon") ||
    pathname.startsWith("/opengraph-image")
  ) {
    return NextResponse.next();
  }

  // 1. Generate 128-bit cryptographically random base64 nonce
  const nonce = crypto.randomBytes(16).toString("base64");

  // 2. Build strict Content-Security-Policy
  // In development, allow 'unsafe-inline', 'unsafe-eval', and 'ws:' / 'wss:' so Turbopack HMR and React hydration function seamlessly on LAN IPs
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc = `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-inline' 'unsafe-eval'" : ""} https://challenges.cloudflare.com https://switchyy.eu.cc;`;
  const connectSrc = `connect-src 'self' ${isDev ? "ws: wss: " : ""}https://*.supabase.co https://*.r2.cloudflarestorage.com https://challenges.cloudflare.com https://switchyy.eu.cc https://xurl.eu.cc;`;

  // Only upgrade insecure requests in production when accessed over HTTPS.
  // In development (or over local network HTTP such as 192.168.x.x:3000), upgrade-insecure-requests causes mobile
  // browsers to rewrite HTTP sub-resource URLs (CSS, JS, fonts) to HTTPS, breaking stylesheet and script loading completely.
  const upgradeInsecureDirective = !isDev && request.nextUrl.protocol === "https:" ? "upgrade-insecure-requests;" : "";

  const cspHeader = `
    default-src 'self';
    ${scriptSrc}
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob: https:;
    font-src 'self';
    ${connectSrc}
    frame-src 'self' https://challenges.cloudflare.com https://*.r2.cloudflarestorage.com blob:;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    ${upgradeInsecureDirective}
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  // Forward x-nonce to Server Components in request headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const supabaseResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Attach CSP header to the outgoing response
  supabaseResponse.headers.set("Content-Security-Policy", cspHeader);

  const isProtectedPath =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/upload") ||
    pathname.startsWith("/files") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/admin");

  const url = request.nextUrl.clone();

  // Helper to attach CSP and forward refreshed session cookies to redirect responses
  const redirectWithCsp = (targetUrl: URL) => {
    const res = NextResponse.redirect(targetUrl);
    res.headers.set("Content-Security-Policy", cspHeader);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      res.cookies.set(cookie.name, cookie.value, {
        path: cookie.path || "/",
        sameSite: (cookie.sameSite as "lax" | "strict" | "none") || "lax",
        maxAge: SESSION_MAX_AGE_SECONDS,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
      });
    });
    return res;
  };

  // Fast-Path Auth Cookie Check for Vercel Hobby Quota Preservation:
  // If the browser presents no Supabase auth cookies, skip initializing Supabase SSR
  // and avoid redundant network roundtrips completely.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") || c.name.includes("auth-token"));

  if (!hasAuthCookie) {
    if (isProtectedPath) {
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return redirectWithCsp(url);
    }
    return supabaseResponse;
  }

  // IMPORTANT: For OAuth callback & verification routes, bypass middleware session manipulation.
  // The route handler specifically exchanges the PKCE code for a session using the incoming code verifier cookie.
  if (pathname.startsWith("/auth/callback") || pathname.startsWith("/auth/confirm")) {
    return supabaseResponse;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookieOptions: {
        maxAge: SESSION_MAX_AGE_SECONDS,
        sameSite: "lax",
        path: "/",
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) => {
            const cookieOptions = {
              ...options,
              maxAge: SESSION_MAX_AGE_SECONDS,
              sameSite: "lax" as const,
              path: "/",
            };
            request.cookies.set(name, value);
            supabaseResponse.cookies.set(name, value, cookieOptions);
          });
          if (headers) {
            Object.entries(headers).forEach(([key, value]) => {
              supabaseResponse.headers.set(key, value);
            });
          }
        },
      },
    }
  );

  // Refresh auth session safely
  let user = null;
  try {
    const userRes = await supabase.auth.getUser();
    if (userRes.error) {
      // If refresh token is invalid/purged, clear stale cookies so errors do not repeat
      const err = userRes.error as { status?: number; message?: string; code?: string };
      if (
        err.status === 400 ||
        err.code === "refresh_token_not_found" ||
        err.message?.includes("Refresh Token")
      ) {
        request.cookies.getAll().forEach((c) => {
          // Strictly protect PKCE code verifier cookies
          if (c.name.includes("code-verifier") || c.name.includes("code_verifier")) {
            return;
          }
          if (c.name.startsWith("sb-") || c.name.includes("auth-token")) {
            supabaseResponse.cookies.delete(c.name);
          }
        });
      }
    } else {
      user = userRes.data?.user ?? null;
    }
  } catch (err: unknown) {
    // Catch AuthApiError gracefully and purge invalid cookies
    const authErr = err as { code?: string; status?: number; message?: string };
    if (
      authErr?.code === "refresh_token_not_found" ||
      authErr?.status === 400 ||
      authErr?.message?.includes("Refresh Token")
    ) {
      request.cookies.getAll().forEach((c) => {
        // Strictly protect PKCE code verifier cookies
        if (c.name.includes("code-verifier") || c.name.includes("code_verifier")) {
          return;
        }
        if (c.name.startsWith("sb-") || c.name.includes("auth-token")) {
          supabaseResponse.cookies.delete(c.name);
        }
      });
    }
  }

  // 5. Inactivity / Idle Timeout Check:
  // If user is authenticated on a protected route, verify they haven't been idle in background > 30 minutes.
  // Live users actively interacting have their timestamp continuously updated.
  const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_SECONDS * 1000;
  const now = Date.now();
  const lastActiveCookie = request.cookies.get("gphost_last_active")?.value;

  if (user && isProtectedPath && lastActiveCookie) {
    const lastActiveTime = parseInt(lastActiveCookie, 10);
    if (!isNaN(lastActiveTime) && now - lastActiveTime > IDLE_TIMEOUT_MS) {
      // User was completely idle in background for > 30 minutes -> log out
      await supabase.auth.signOut();
      url.pathname = "/login";
      url.searchParams.set("reason", "idle_timeout");
      const res = redirectWithCsp(url);
      res.cookies.delete("gphost_last_active");
      return res;
    }
  }

  // Update activity timestamp cookie on protected requests for active users
  if (user && isProtectedPath) {
    supabaseResponse.cookies.set("gphost_last_active", now.toString(), {
      path: "/",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_SECONDS,
      httpOnly: false, // Accessible to client JavaScript for cross-tab activity synchronization
    });
  }

  // Unauthenticated user attempting to access a protected route
  if (!user) {
    if (isProtectedPath) {
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return redirectWithCsp(url);
    }
    return supabaseResponse;
  }

  // Quota & Latency Optimization:
  // Only query PostgreSQL profiles table if visiting a protected path or the login screen.
  // Authenticated users browsing public static pages (e.g. /, /terms, /privacy, /developers, /f/*)
  // bypass this database call completely.
  if (!isProtectedPath && pathname !== "/login") {
    return supabaseResponse;
  }

  // Authenticated user on protected path or login: verify profile status
  const { data: profile } = await supabase
    .from("profiles")
    .select("status, role")
    .eq("id", user.id)
    .single();

  const isApproved = profile?.status === "approved";
  const isRevoked = profile?.status === "revoked";
  const isAdmin = profile?.role === "admin";

  // Instant Revocation Gate: Immediately log out revoked users and strip credentials
  if (isRevoked) {
    try {
      await supabase.auth.signOut();
    } catch {}
    url.pathname = "/login";
    url.searchParams.set("reason", "revoked");
    const res = redirectWithCsp(url);
    res.cookies.delete("gphost_last_active");
    request.cookies.getAll().forEach((cookie) => {
      if (cookie.name.includes("code-verifier") || cookie.name.includes("code_verifier")) {
        return;
      }
      if (cookie.name.startsWith("sb-")) {
        res.cookies.delete(cookie.name);
      }
    });
    return res;
  }

  if (isApproved) {
    // Approved users visiting login screen redirect to dashboard
    if (pathname === "/login") {
      url.pathname = "/dashboard";
      url.searchParams.delete("next");
      return redirectWithCsp(url);
    }

    // Non-admin attempting to access admin routes
    if (pathname.startsWith("/admin") && !isAdmin) {
      url.pathname = "/dashboard";
      return redirectWithCsp(url);
    }
  } else {
    // Unapproved (pending, rejected) users attempting to access dashboard
    if (isProtectedPath) {
      url.pathname = "/access-gate";
      return redirectWithCsp(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next (static files, image optimization, HMR websocket)
     * - api (API routes that have their own authoritative token/session auth)
     * - raw (public direct CDN redirect streaming)
     * - static assets: favicon.ico, robots.txt, sitemap.xml, manifest.webmanifest, icon, apple-icon, opengraph-image
     * - media and font files (svg, png, jpg, jpeg, gif, webp, woff, woff2, ico)
     */
    "/((?!_next|api|raw|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|icon|apple-icon|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|ico)$).*)",
  ],
};
