import { createClient } from "@/lib/supabase/client";
import {
  extractAccessTokenFromCookies,
  parseCookieString,
  decodeJwtPayload,
} from "@/lib/supabase/cookie-utils";

/**
 * Safely extracts an unexpired Supabase access token directly from document.cookie.
 * Essential for concurrent multi-tab sync when Tab A rotates tokens in cookies
 * while Tab B's in-memory client state has not yet updated.
 */
function getUnexpiredTokenFromCookies(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const cookies = parseCookieString(document.cookie);
    const token = extractAccessTokenFromCookies(cookies);
    if (!token) return null;
    const payload = decodeJwtPayload(token);
    const isUnexpired = Boolean(
      payload?.exp && typeof payload.exp === "number" && payload.exp * 1000 > Date.now()
    );
    return isUnexpired ? token : null;
  } catch {
    return null;
  }
}

/**
 * Retrieves a verified, non-expired Supabase access token from the browser client.
 * Features dual-source recovery (in-memory session + cross-tab cookie storage)
 * so concurrent sessions never get false 401s when one tab rotates tokens.
 */
export async function getValidAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.access_token) {
      const expiresAtMs = (session.expires_at || 0) * 1000;
      // If token is still comfortably valid (>30s remaining), return immediately
      if (expiresAtMs > Date.now() + 30 * 1000) {
        return session.access_token;
      }

      // If token is nearing expiration, attempt refresh
      try {
        const { data: refreshed, error } = await supabase.auth.refreshSession();
        if (!error && refreshed.session?.access_token) {
          return refreshed.session.access_token;
        }
      } catch {
        // Fall through to cookie / fallback checks
      }

      // If refresh failed (e.g. concurrent race), but existing token is still before absolute expiry
      if (expiresAtMs > Date.now()) {
        return session.access_token;
      }
    }

    // Check if another concurrent tab already refreshed and stored a fresh token in cookies
    const cookieToken = getUnexpiredTokenFromCookies();
    if (cookieToken) {
      return cookieToken;
    }

    // Attempt recovery via refreshSession once
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (!error && refreshed.session?.access_token) {
      return refreshed.session.access_token;
    }

    return null;
  } catch {
    return getUnexpiredTokenFromCookies();
  }
}

/**
 * Robust authenticated fetch for client components.
 * 1. Attaches fresh Bearer token to request headers.
 * 2. Ensures credentials: 'same-origin' so auth cookies are also forwarded.
 * 3. On 401 response: checks cross-tab cookies and retries with refreshed token.
 */
export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const token = await getValidAccessToken();

  const headers = new Headers(init?.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: init?.credentials || "same-origin",
  });

  // If unauthorized (401), session may have just expired or rotated concurrently -> retry once
  if (response.status === 401 && typeof window !== "undefined") {
    try {
      // 1. Check if a fresh token exists in cookies (e.g. placed by another concurrent tab)
      const cookieToken = getUnexpiredTokenFromCookies();
      let newToken = cookieToken && cookieToken !== token ? cookieToken : null;

      // 2. If no new token from cookies, attempt refresh
      if (!newToken) {
        const supabase = createClient();
        const { data: refreshed, error } = await supabase.auth.refreshSession();
        if (!error && refreshed.session?.access_token) {
          newToken = refreshed.session.access_token;
        } else {
          newToken = getUnexpiredTokenFromCookies();
        }
      }

      if (newToken && newToken !== token) {
        const retryHeaders = new Headers(init?.headers);
        retryHeaders.set("Authorization", `Bearer ${newToken}`);
        return await fetch(input, {
          ...init,
          headers: retryHeaders,
          credentials: init?.credentials || "same-origin",
        });
      }
    } catch {
      // If retry fails, return original 401 response
    }
  }

  return response;
}
