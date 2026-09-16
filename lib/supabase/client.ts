import { createBrowserClient } from "@supabase/ssr";

export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7-day persistent session window

/**
 * Creates a browser-side Supabase client for client components.
 * Strictly uses the public publishable key with persistent session window.
 */
export function createClient() {
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
