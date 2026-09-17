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
    console.error("Auth callback exchange error:", exchangeError.message);
    const loginUrl = new URL("/login", request.url);
    const isPkce =
      exchangeError.message.toLowerCase().includes("code verifier") ||
      exchangeError.message.toLowerCase().includes("pkce");
    loginUrl.searchParams.set(
      "error",
      isPkce
        ? "Session expired during sign-in. Please click Continue with Google to try again."
        : exchangeError.message
    );
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

  // If profile does not exist yet (e.g. fresh database or purged environment), bootstrap it dynamically
  if (!profile && user.email) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const adminClient = createAdminClient();
    const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const isOwner = Boolean(adminEmail && user.email.toLowerCase() === adminEmail);
    await adminClient.from("profiles").upsert({
      id: user.id,
      email: user.email,
      full_name:
        (user.user_metadata?.full_name as string) ||
        (user.user_metadata?.name as string) ||
        user.email.split("@")[0],
      avatar_url: googleAvatar,
      role: isOwner ? "admin" : "user",
      status: isOwner ? "approved" : "pending",
      quota_bytes: isOwner ? -1 : 5368709120,
      can_create_permanent: isOwner,
    });
    profile = await getUserProfile(user.id);
  }

  if (profile && googleAvatar && profile.avatar_url !== googleAvatar) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const adminClient = createAdminClient();
    await adminClient
      .from("profiles")
      .update({ avatar_url: googleAvatar, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    profile = await getUserProfile(user.id);
  }



  // Authoritatively check if user has an active, unredeemed Onboarding PIN issued specifically for them
  let hasActiveIssuedPin = false;
  if (user.email) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const adminClient = createAdminClient();
    const nowIso = new Date().toISOString();
    const { data: activePin } = await adminClient
      .from("onboarding_pins")
      .select("id")
      .eq("is_active", true)
      .ilike("label", `%User: ${user.email}%`)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .limit(1)
      .maybeSingle();

    if (activePin) {
      hasActiveIssuedPin = true;
    }
  }

  // If approved AND no pending unredeemed PIN, route to safe dashboard destination
  if (profile?.status === "approved" && !hasActiveIssuedPin) {
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
    // Initialize activity timestamp for idle session tracking
    response.cookies.set("gphost_last_active", Date.now().toString(), {
      path: "/",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_SECONDS,
      httpOnly: false,
    });
    return response;
  }

  // Otherwise route to the access gate (pending / PIN verification / holding area)
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
  gateResponse.cookies.set("gphost_last_active", Date.now().toString(), {
    path: "/",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    httpOnly: false,
  });
  return gateResponse;
}
