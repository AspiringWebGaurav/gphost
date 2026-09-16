import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedUser, getUserProfile } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Session Status Heartbeat Route:
 * Provides a lightweight client-facing check of the current user's profile status.
 * Used by IdleSessionMonitor and Dashboard layout to detect admin revocation immediately.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({
        success: true,
        authenticated: false,
        status: "unauthenticated",
        isApproved: false,
        isRevoked: false,
      });
    }

    const profile = await getUserProfile(user.id);
    if (!profile) {
      return NextResponse.json({
        success: false,
        authenticated: true,
        status: "profile_not_found",
        isApproved: false,
        isRevoked: true,
      });
    }

    const isRevoked = profile.status === "revoked";
    const isApproved = profile.status === "approved";

    const response = NextResponse.json({
      success: true,
      authenticated: true,
      status: profile.status,
      role: profile.role,
      isApproved,
      isRevoked,
    });

    // If revoked, clear cookies immediately to enforce instant logout
    if (isRevoked) {
      response.cookies.delete("gphost_last_active");
      request.cookies.getAll().forEach((cookie) => {
        if (cookie.name.startsWith("sb-")) {
          response.cookies.delete(cookie.name);
        }
      });
    }

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
