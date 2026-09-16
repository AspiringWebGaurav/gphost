import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireApprovedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/storage/signature
 * Smart Conditional Storage Tracker with ETag and 304 Not Modified.
 * Extremely lightweight (<15ms response): returns 304 if no change has occurred.
 */
export async function GET(req: NextRequest) {
  try {
    const { user, profile } = await requireApprovedUser();
    const adminClient = createAdminClient();

    // Query user profile storage and files summary
    const { data: currentProfile } = await adminClient
      .from("profiles")
      .select("storage_used_bytes, quota_bytes, reserved_bytes, updated_at")
      .eq("id", user.id)
      .single();

    const storageUsedBytes = currentProfile?.storage_used_bytes ?? profile.storage_used_bytes;
    const quotaBytes = currentProfile?.quota_bytes ?? profile.quota_bytes;
    const reservedBytes = currentProfile?.reserved_bytes ?? profile.reserved_bytes;
    const updatedAt = currentProfile?.updated_at ?? new Date().toISOString();

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
