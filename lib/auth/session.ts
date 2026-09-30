import { cache } from "react";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isSupabaseSessionCookie,
  extractAccessTokenFromCookies,
  decodeJwtPayload,
} from "@/lib/supabase/cookie-utils";
import "@/lib/supabase/suppress-auth-warnings";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: "user" | "admin";
  status: "pending" | "approved" | "rejected" | "revoked";
  quota_bytes: number;
  storage_used_bytes: number;
  reserved_bytes: number;
  can_create_permanent: boolean;
  created_at: string;
  updated_at: string;
}

export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "gauravpatil5737@gmail.com").trim().toLowerCase();

/**
 * Retrieves the currently authenticated Supabase Auth user.
 * Supports dual-channel authentication:
 * 1. Bearer JWT authorization header (immune to cookie expiry, chunking, or private browser blocking).
 * 2. Persistent Supabase Auth session cookies.
 * Memoized per-request via React cache() to prevent redundant auth calls.
 */
export const getAuthenticatedUser = cache(async () => {
  // 1. Authoritative Bearer token validation (Immune to cookie desync / background timeout)
  try {
    const headerStore = await headers();
    const authHeader = headerStore.get("authorization") || headerStore.get("x-supabase-auth");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      const token = authHeader.substring(7).trim();
      // Ensure we only validate Supabase Auth JWTs, not developer API keys (gp_live_...)
      if (token && !token.startsWith("gp_live_")) {
        const adminClient = createAdminClient();
        const { data: { user }, error } = await adminClient.auth.getUser(token);
        if (!error && user) {
          return user;
        }
      }
    }
  } catch {
    // If headers() is unavailable in current execution context, proceed to cookies
  }

  // 2. Cookie-based authentication fallback
  try {
    const cookieStore = await cookies();
    const hasAuthCookie = cookieStore
      .getAll()
      .some((c) => isSupabaseSessionCookie(c));

    if (!hasAuthCookie) {
      return null;
    }

    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (!error && user) {
      return user;
    }

    // 3. Concurrent Multi-Tab / Multi-Device Resilience:
    // If standard getUser() failed (e.g. refresh_token_already_used because another concurrent tab rotated tokens),
    // extract the access_token JWT from the cookie and validate it authoritatively via adminClient.
    // This allows active concurrent sessions to execute requests cleanly as long as the JWT is unexpired.
    const accessToken = extractAccessTokenFromCookies(cookieStore);
    if (accessToken) {
      const payload = decodeJwtPayload(accessToken);
      const isUnexpired = Boolean(
        payload?.exp && typeof payload.exp === "number" && payload.exp * 1000 > Date.now()
      );
      if (isUnexpired) {
        const adminClient = createAdminClient();
        const { data: { user: adminUser }, error: adminErr } = await adminClient.auth.getUser(accessToken);
        if (!adminErr && adminUser) {
          return adminUser;
        }
      }
    }

    return null;
  } catch {
    // If refresh token is expired, invalid, or purged, gracefully treat as unauthenticated
    return null;
  }
});

/**
 * Authoritatively fetches the user's profile from PostgreSQL.
 * Memoized per-request via React cache() to prevent redundant profile lookups across layout and page.
 */
export const getUserProfile = cache(async (userId: string): Promise<UserProfile | null> => {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  const profile = data as UserProfile;
  const userEmail = (profile.email || "").toLowerCase();

  // Root Ban: Decommissioned 9262 account is denied profile access and purged
  if (userEmail === "gauravpatil9262@gmail.com") {
    adminClient
      .from("profiles")
      .delete()
      .eq("id", userId)
      .then(() => {});
    return null;
  }

  const isAuthoritativeAdmin = Boolean(ADMIN_EMAIL && userEmail === ADMIN_EMAIL);

  // Root Security Enforcement: ONLY ADMIN_EMAIL (gauravpatil5737@gmail.com) can EVER have admin role
  if (!isAuthoritativeAdmin && (profile.role === "admin" || profile.can_create_permanent || profile.quota_bytes === -1)) {
    profile.role = "user";
    profile.can_create_permanent = false;
    profile.quota_bytes = 5368709120;

    // Self-healing database correction
    adminClient
      .from("profiles")
      .update({
        role: "user",
        can_create_permanent: false,
        quota_bytes: 5368709120,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .then(() => {});
  }

  return profile;
});

/**
 * Authoritative Server Guard: Requires that the user is authenticated and approved.
 * Memoized per-request via React cache() to prevent redundant profile lookups across layout and page.
 */
export const requireApprovedUser = cache(async (): Promise<{ user: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>; profile: UserProfile }> => {
  const user = await getAuthenticatedUser();
  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }

  const profile = await getUserProfile(user.id);
  if (!profile) {
    throw new Error("PROFILE_NOT_FOUND");
  }

  if (profile.status !== "approved") {
    throw new Error(`ACCESS_DENIED_${profile.status.toUpperCase()}`);
  }

  return { user, profile };
});

/**
 * Authoritative Server Guard: Requires that the user is authenticated, approved, has admin role,
 * AND strictly matches the sole authoritative admin email.
 * Memoized per-request via React cache().
 */
export const requireAdminUser = cache(async (): Promise<{ user: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>; profile: UserProfile }> => {
  const { user, profile } = await requireApprovedUser();

  const userEmail = (user.email || "").toLowerCase();
  if (profile.role !== "admin" || userEmail !== ADMIN_EMAIL) {
    throw new Error("FORBIDDEN_NOT_ADMIN");
  }

  return { user, profile };
});

/**
 * Authoritative Server Guard: Requires that the user is authenticated, approved, has admin role,
 * and matches the authoritative permanent owner email (ADMIN_EMAIL).
 * Memoized per-request via React cache().
 */
export const requireOwnerUser = cache(async (): Promise<{ user: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>; profile: UserProfile }> => {
  const { user, profile } = await requireAdminUser();

  if (user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    throw new Error("FORBIDDEN_NOT_OWNER");
  }

  return { user, profile };
});

/**
 * Memoized per-request check for user's active onboarding PIN.
 */
export const checkUserActivePin = cache(async (userEmail: string): Promise<boolean> => {
  if (!userEmail) return false;
  try {
    const adminClient = createAdminClient();
    const nowIso = new Date().toISOString();
    const { data } = await adminClient
      .from("onboarding_pins")
      .select("id")
      .eq("is_active", true)
      .ilike("label", `%User: ${userEmail}%`)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .limit(1)
      .maybeSingle();

    return Boolean(data);
  } catch {
    return false;
  }
});

