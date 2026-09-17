import { createBrowserClient } from "@supabase/ssr";

export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7-day persistent session window

let browserClientInstance: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Creates or returns the cached singleton browser-side Supabase client for client components.
 * Strictly uses the public publishable key with persistent session window.
 * Using a singleton prevents multiple WebSocket connection pools, duplicate auth listeners,
 * and browser memory bloat across components and renders.
 */
export function createClient() {
  if (typeof window === "undefined") {
    // SSR / Edge render: create new instance per request
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "";

    return createBrowserClient(
      supabaseUrl,
      supabaseKey,
      {
        cookieOptions: {
          maxAge: SESSION_MAX_AGE_SECONDS,
          sameSite: "lax",
          path: "/",
        },
      }
    );
  }

  if (!browserClientInstance) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "";

    browserClientInstance = createBrowserClient(
      supabaseUrl,
      supabaseKey,
      {
        cookieOptions: {
          maxAge: SESSION_MAX_AGE_SECONDS,
          sameSite: "lax",
          path: "/",
        },
      }
    );
  }

  return browserClientInstance;
}
