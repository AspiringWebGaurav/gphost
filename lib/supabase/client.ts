import { createBrowserClient } from "@supabase/ssr";

export const SESSION_MAX_AGE_SECONDS = 30 * 60; // 30-minute persistent session window

/**
 * Creates a browser-side Supabase client for client components.
 * Strictly uses the public publishable key with 30-minute persistent session window.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: {
        maxAge: SESSION_MAX_AGE_SECONDS,
        sameSite: "lax",
        path: "/",
      },
    }
  );
}
