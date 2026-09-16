import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7-day persistent session window

/**
 * Creates a server-side Supabase client for Server Components, Server Actions,
 * and Route Handlers. Uses async cookies() adhering to Next.js 16 conventions
 * with a persistent session window.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
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
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, {
                ...options,
                maxAge: SESSION_MAX_AGE_SECONDS,
                sameSite: "lax",
                path: "/",
              });
            });
          } catch {
            // The `setAll` method was called from a Server Component render.
            // This is ignored if middleware / proxy is refreshing user sessions.
          }
        },
      },
    }
  );
}
