import { createClient } from "@/lib/supabase/client";

/**
 * Retrieves a verified, non-expired Supabase access token from the browser client.
 * If the current token is expired or within 2 minutes of expiration, it transparently
 * refreshes the session first.
 */
export async function getValidAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      // Attempt refresh once in case session can be recovered from refresh token
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (!error && refreshed.session?.access_token) {
        return refreshed.session.access_token;
      }
      return null;
    }

    // If token expires in less than 120 seconds, preemptively refresh it
    const expiresAtMs = (session.expires_at || 0) * 1000;
    if (expiresAtMs > 0 && expiresAtMs - Date.now() < 120 * 1000) {
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (!error && refreshed.session?.access_token) {
        return refreshed.session.access_token;
      }
    }

    return session.access_token;
  } catch (err) {
    console.warn("Failed to get valid access token:", err);
    return null;
  }
}

/**
 * Robust authenticated fetch for client components.
 * 1. Attaches fresh Bearer token to request headers.
 * 2. Ensures credentials: 'same-origin' so auth cookies are also forwarded.
 * 3. On 401 response: automatically triggers Supabase refreshSession() and retries once.
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

  // If unauthorized (401), session may have just expired or rotated -> transparently refresh and retry
  if (response.status === 401 && typeof window !== "undefined") {
    try {
      const supabase = createClient();
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (!error && refreshed.session?.access_token) {
        const retryHeaders = new Headers(init?.headers);
        retryHeaders.set("Authorization", `Bearer ${refreshed.session.access_token}`);
        return await fetch(input, {
          ...init,
          headers: retryHeaders,
          credentials: init?.credentials || "same-origin",
        });
      }
    } catch {
      // If refresh fails, return original 401 response
    }
  }

  return response;
}
