import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();

/**
 * Retrieves the currently authenticated Supabase Auth user from request cookies.
 * Memoized per-request via React cache() to prevent redundant auth calls.
 */
export const getAuthenticatedUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
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

  return data as UserProfile;
});

/**
 * Authoritative Server Guard: Requires that the user is authenticated and approved.
 * Throws or returns an error if not authorized.
 */
export async function requireApprovedUser(): Promise<{ user: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>; profile: UserProfile }> {
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
}

/**
 * Authoritative Server Guard: Requires that the user is authenticated, approved, and has admin role.
 */
export async function requireAdminUser(): Promise<{ user: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>; profile: UserProfile }> {
  const { user, profile } = await requireApprovedUser();

  if (profile.role !== "admin") {
    throw new Error("FORBIDDEN_NOT_ADMIN");
  }

  return { user, profile };
}

/**
 * Authoritative Server Guard: Requires that the user is authenticated, approved, has admin role,
 * and matches the authoritative permanent owner email (ADMIN_EMAIL).
 */
export async function requireOwnerUser(): Promise<{ user: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>; profile: UserProfile }> {
  const { user, profile } = await requireAdminUser();

  if (user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    throw new Error("FORBIDDEN_NOT_OWNER");
  }

  return { user, profile };
}

