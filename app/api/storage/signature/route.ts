import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireApprovedUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/storage/signature
 * Smart Conditional Storage Tracker with ETag and 304 Not Modified.
 * Extremely lightweight (<15ms response): returns 304 if no change has occurred.
 */
export async function GET(req: NextRequest) {
  try {
    const { user, profile } = await requireApprovedUser();
    // Use profile already memoized from requireApprovedUser() for zero extra DB query overhead
    const storageUsedBytes = profile.storage_used_bytes;
    const quotaBytes = profile.quota_bytes;
    const reservedBytes = profile.reserved_bytes;
    const updatedAt = profile.updated_at || new Date().toISOString();

    // Compute smart checksum ETag
    const signatureRaw = `${user.id}:${storageUsedBytes}:${quotaBytes}:${reservedBytes}:${updatedAt}`;
    const etag = `"${crypto.createHash("md5").update(signatureRaw).digest("hex")}"`;

    // Check If-None-Match header
    const clientEtag = req.headers.get("if-none-match");
    if (clientEtag && clientEtag === etag) {
      // 304 Not Modified: 0 payload, 0 state change needed
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "private, no-cache",
        },
      });
    }

    return NextResponse.json(
      {
        storageUsedBytes,
        quotaBytes,
        reservedBytes,
        updatedAt,
      },
      {
        status: 200,
        headers: {
          ETag: etag,
          "Cache-Control": "private, no-cache",
        },
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Signature error";
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
