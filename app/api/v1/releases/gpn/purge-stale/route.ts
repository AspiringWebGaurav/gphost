import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasPermission } from "@/lib/auth/api-keys";
import { isAuthoritativeAdmin } from "@/lib/auth/session";
import { purgeStaleReleaseBinaries } from "@/lib/storage/releases-purge";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // 1. Authoritative Authentication & Authorization
  const authRes = await authenticateRequest(req);
  if ("errorResponse" in authRes) {
    return authRes.errorResponse;
  }
  const { auth } = authRes;

  const isAdmin = isAuthoritativeAdmin(auth.profile?.email) || auth.profile?.role === "admin";
  const hasReleasePerm =
    hasPermission(auth.permissions, "*") ||
    auth.permissions?.includes("releases:publish") ||
    auth.permissions?.includes("files:manage");

  if (!isAdmin && !hasReleasePerm) {
    return NextResponse.json(
      { error: "Forbidden: Release purging requires authoritative admin or release:publish permission" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { targetBinaryFileId } = body;

    const result = await purgeStaleReleaseBinaries({
      userId: auth.userId,
      targetBinaryFileId,
      appId: "gpn",
    });

    return NextResponse.json({
      success: result.success,
      message: result.success
        ? "Stale release binaries successfully purged"
        : "Purge completed with warnings",
      details: result,
    });
  } catch (err: any) {
    console.error("Error executing stale release purge:", err);
    return NextResponse.json(
      { error: "Internal Server Error during purge", details: err.message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
