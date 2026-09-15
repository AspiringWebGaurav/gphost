import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient, SESSION_MAX_AGE_SECONDS } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/auth/session";
import { getSafeRedirectUrl } from "@/lib/auth/redirect";
import { authCallbackRatelimit } from "@/lib/redis/ratelimit";

/**
 * Supabase OAuth Callback Route Handler:
 * Exchanges temporary OAuth code for a persistent session cookie.
 * Authoritatively determines initial routing based on database profile status.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next");
  const errorParam = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");

  // Handle provider-level error callback
  if (errorParam) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", errorDescription || errorParam);
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "Missing authentication code");
    return NextResponse.redirect(loginUrl);
  }

  // Rate limiting to prevent code flood attacks
  const clientIp = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { success: rateLimitOk } = await authCallbackRatelimit.limit(clientIp);
  if (!rateLimitOk) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "Too many authentication attempts. Please wait a moment.");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", exchangeError.message);
    return NextResponse.redirect(loginUrl);
  }

  // Fetch authenticated user
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "Failed to retrieve authenticated user session");
    return NextResponse.redirect(loginUrl);
  }

  // Authoritatively inspect user profile in PostgreSQL
  let profile = await getUserProfile(user.id);

  // Auto-sync Google avatar from user metadata
  const googleAvatar =
    (user.user_metadata?.avatar_url as string | undefined) ||
    (user.user_metadata?.picture as string | undefined) ||
    null;

  if (profile && googleAvatar && profile.avatar_url !== googleAvatar) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const adminClient = createAdminClient();
    await adminClient
      .from("profiles")
      .update({ avatar_url: googleAvatar, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    profile = await getUserProfile(user.id);
  }



  // If approved (including permanent admin Gaurav Patil), route to safe dashboard destination
  if (profile?.status === "approved") {
    const targetPath = getSafeRedirectUrl(next, "/dashboard");
    const response = NextResponse.redirect(new URL(targetPath, request.url));
    const cookieStore = await cookies();
    cookieStore.getAll().forEach((cookie) => {
      response.cookies.set(cookie.name, cookie.value, {
        path: "/",
        sameSite: "lax",
        maxAge: SESSION_MAX_AGE_SECONDS,
      });
    });
    return response;
  }

  // Otherwise route to the access gate (pending / rejected / revoked holding area)
  const gateTarget = next && next.startsWith("/access-gate") ? getSafeRedirectUrl(next, "/access-gate") : "/access-gate";
  const gateResponse = NextResponse.redirect(new URL(gateTarget, request.url));
  const cookieStore = await cookies();
  cookieStore.getAll().forEach((cookie) => {
    gateResponse.cookies.set(cookie.name, cookie.value, {
      path: "/",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  });
  return gateResponse;
}
