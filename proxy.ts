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
  // 1. Generate 128-bit cryptographically random base64 nonce
  const nonce = crypto.randomBytes(16).toString("base64");

  // 2. Build strict Content-Security-Policy (allow 'unsafe-eval' in development for React/Turbopack debugging)
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc = `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com https://switchyy.eu.cc;`;

  const cspHeader = `
    default-src 'self';
    ${scriptSrc}
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob: https:;
    font-src 'self';
    connect-src 'self' https://*.supabase.co https://*.r2.cloudflarestorage.com https://challenges.cloudflare.com https://switchyy.eu.cc https://xurl.eu.cc;
    frame-src 'self' https://challenges.cloudflare.com https://*.r2.cloudflarestorage.com blob:;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
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

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
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

  // Refresh auth session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = request.nextUrl.clone();
  const { pathname } = url;

  const isProtectedPath =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/upload") ||
    pathname.startsWith("/files") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/admin");

  const isAuthPage =
    pathname === "/login" ||
    pathname === "/access-gate" ||
    pathname === "/request-access";

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

  // Authenticated user: verify profile status
  const { data: profile } = await supabase
    .from("profiles")
    .select("status, role")
    .eq("id", user.id)
    .single();

  const isApproved = profile?.status === "approved";
  const isAdmin = profile?.role === "admin";

  if (isApproved) {
    // Approved users visiting auth gate/login screens redirect to dashboard
    if (isAuthPage && pathname !== "/request-access") {
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
    // Unapproved (pending, rejected, revoked) users attempting to access dashboard
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
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images, png, svg, ico
     * - api routes that have their own authoritative token/session auth
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
