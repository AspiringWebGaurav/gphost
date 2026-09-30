import { type NextRequest, NextResponse } from "next/server";

export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7-day persistent session window

/**
 * Checks whether a given cookie is a Supabase authentication session cookie.
 * Strictly distinguishes session cookies from OAuth / PKCE code verifiers
 * and empty tombstone values.
 */
export function isSupabaseSessionCookie(cookie: { name: string; value?: string }): boolean {
  const { name, value } = cookie;

  // Strictly protect OAuth / PKCE code verifier and flow tracking cookies
  if (name.includes("code-verifier") || name.includes("code_verifier")) {
    return false;
  }

  // Must match Supabase auth token convention (sb-<ref>-auth-token or chunked .0, .1)
  const isTokenName = name.startsWith("sb-") || name.includes("auth-token");
  if (!isTokenName) {
    return false;
  }

  // If value is provided, must have a non-empty, non-tombstone value
  if (value !== undefined) {
    if (!value || typeof value !== "string") {
      return false;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed === '""' || trimmed === "deleted") {
      return false;
    }
  }

  return true;
}

/**
 * Parses a standard HTTP Cookie header or document.cookie string into an array of { name, value }.
 */
export function parseCookieString(cookieString?: string | null): { name: string; value: string }[] {
  if (!cookieString || typeof cookieString !== "string") return [];
  return cookieString
    .split(";")
    .map((part) => {
      const eqIdx = part.indexOf("=");
      if (eqIdx === -1) return null;
      const name = part.slice(0, eqIdx).trim();
      const value = part.slice(eqIdx + 1).trim();
      return { name, value };
    })
    .filter((c): c is { name: string; value: string } => Boolean(c && c.name));
}

/**
 * Extracts and reconstructs the Supabase access token (JWT) from raw cookies.
 * Handles single-cookie, chunked (.0, .1), and base64-prefixed storage formats.
 * Compatible with Node.js, Edge, and browser runtimes.
 * Essential for concurrent multi-tab and multi-device resilience when a refresh
 * token was rotated in one place while the access token remains active and valid.
 */
export function extractAccessTokenFromCookies(
  cookieSource: { getAll: () => { name: string; value: string }[] } | { name: string; value: string }[]
): string | null {
  try {
    const allCookies = Array.isArray(cookieSource) ? cookieSource : cookieSource.getAll();
    const authCookies = allCookies.filter((c) => isSupabaseSessionCookie(c));

    if (authCookies.length === 0) return null;

    // Handle chunking: sort by chunk index (e.g. .0, .1)
    authCookies.sort((a, b) => {
      const aMatch = a.name.match(/\.(\d+)$/);
      const bMatch = b.name.match(/\.(\d+)$/);
      const aIdx = aMatch ? parseInt(aMatch[1], 10) : -1;
      const bIdx = bMatch ? parseInt(bMatch[1], 10) : -1;
      return aIdx - bIdx;
    });

    const combinedValue = authCookies.map((c) => c.value).join("");
    if (!combinedValue) return null;

    let jsonStr = combinedValue;
    if (combinedValue.startsWith("base64-")) {
      const b64 = combinedValue.slice(7);
      if (typeof window !== "undefined" && typeof atob === "function") {
        const standardB64 = b64.replace(/-/g, "+").replace(/_/g, "/");
        try {
          jsonStr = decodeURIComponent(
            atob(standardB64)
              .split("")
              .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
              .join("")
          );
        } catch {
          jsonStr = atob(standardB64);
        }
      } else {
        jsonStr = Buffer.from(b64, "base64url").toString("utf8");
      }
    } else {
      try {
        jsonStr = decodeURIComponent(combinedValue);
      } catch {
        jsonStr = combinedValue;
      }
    }

    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.access_token === "string" && parsed.access_token) {
        return parsed.access_token;
      }
      if (Array.isArray(parsed) && typeof parsed[0] === "string" && parsed[0]) {
        return parsed[0];
      }
    }
  } catch {
    // Malformed JSON or unparseable chunks
  }

  return null;
}

/**
 * Safely decodes a JWT payload without external dependencies or verification.
 * Supports both Node.js (Buffer) and browser (atob) execution environments.
 * Used to inspect expiration timestamps (`exp`) and claims during concurrent auth validation.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    let jsonStr: string;
    if (typeof window !== "undefined" && typeof atob === "function") {
      const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      try {
        jsonStr = decodeURIComponent(
          atob(b64)
            .split("")
            .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
            .join("")
        );
      } catch {
        jsonStr = atob(b64);
      }
    } else {
      jsonStr = Buffer.from(parts[1], "base64url").toString("utf8");
    }
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/**
 * Purges stale/invalid Supabase authentication cookies from both:
 * 1. The outgoing response (via Set-Cookie with maxAge: 0, expires: 1970) so the browser deletes them.
 * 2. The incoming request headers forwarded to downstream Server Components, preventing
 *    subsequent duplicate refresh attempts in the same request cycle.
 */
export function purgeStaleAuthCookies(
  request: NextRequest,
  requestHeaders: Headers,
  cspHeader?: string
): NextResponse {
  // Collect all stale auth cookie names
  const staleCookieNames = request.cookies
    .getAll()
    .filter((c) => isSupabaseSessionCookie(c))
    .map((c) => c.name);

  // 1. Remove from in-memory request.cookies
  staleCookieNames.forEach((name) => {
    request.cookies.delete(name);
  });
  request.cookies.delete("gphost_last_active");

  // 2. Rebuild the Cookie header on requestHeaders without stale auth cookies
  const remainingCookies = request.cookies
    .getAll()
    .filter((c) => !staleCookieNames.includes(c.name) && c.name !== "gphost_last_active");

  const updatedCookieHeader = remainingCookies
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  if (updatedCookieHeader) {
    requestHeaders.set("cookie", updatedCookieHeader);
  } else {
    requestHeaders.delete("cookie");
  }

  // 3. Create a fresh NextResponse with the sanitized request headers
  const sanitizedResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // 4. Attach Set-Cookie deletion headers on the outgoing response so the browser purges them
  staleCookieNames.forEach((name) => {
    sanitizedResponse.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
      sameSite: "lax",
    });
  });

  sanitizedResponse.cookies.set("gphost_last_active", "", {
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    sameSite: "lax",
  });

  if (cspHeader) {
    sanitizedResponse.headers.set("Content-Security-Policy", cspHeader);
  }

  return sanitizedResponse;
}