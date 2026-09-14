import { NextResponse } from "next/server";
import { getAuthenticatedUser, getUserProfile } from "@/lib/auth/session";
import { onboardingStatusRatelimit } from "@/lib/redis/ratelimit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "UNAUTHENTICATED" },
        { status: 401 }
      );
    }

    // Rate limiting
    const { success: allowed } = await onboardingStatusRatelimit.limit(user.id);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "RATE_LIMITED", message: "Too many requests. Please wait." },
        { status: 429 }
      );
    }

    const profile = await getUserProfile(user.id);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: "PROFILE_NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      status: profile.status,
      role: profile.role,
      email: profile.email,
      full_name: profile.full_name,
      avatar_url: profile.avatar_url,
      quota_bytes: profile.quota_bytes,
      storage_used_bytes: profile.storage_used_bytes,
      can_create_permanent: profile.can_create_permanent,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    console.error("[Onboarding Status API] Error:", errorMsg);
    return NextResponse.json(
      { success: false, error: "INTERNAL_SERVER_ERROR" },
      { status: 500 }
    );
  }
}
