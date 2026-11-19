import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { authenticateRequest } from "@/lib/auth/api-keys";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/storage/signature
 * Smart Conditional Storage Tracker with ETag and 304 Not Modified.
 * Self-healing: authoritatively verifies active file storage and fixes any profile drift.
 */
export async function GET(req: NextRequest) {
  try {
    const authRes = await authenticateRequest(req, "storage:read");
    if ("errorResponse" in authRes) return authRes.errorResponse;
    const { userId, profile } = authRes.auth;
    const adminClient = createAdminClient();

    // Query active files to compute true active storage bytes
    const { data: activeFiles } = await adminClient
      .from("files")
      .select("byte_size")
      .eq("user_id", userId)
      .in("status", ["ACTIVE", "EXPIRING"]);

    const activeFilesList = activeFiles || [];
    const trueStorageUsedBytes = activeFilesList.reduce(
      (sum, f) => sum + (f.byte_size || 0),
      0
    );
    const activeFilesCount = activeFilesList.length;

    // Fetch current profile metrics to verify synchronization
    const { data: dbProfile } = await adminClient
      .from("profiles")
      .select("storage_used_bytes, quota_bytes, reserved_bytes")
      .eq("id", userId)
      .single();

    const quotaBytes = dbProfile?.quota_bytes ?? profile.quota_bytes ?? -1;
    const reservedBytes = dbProfile?.reserved_bytes ?? 0;
    const dbStorageUsed = dbProfile?.storage_used_bytes ?? 0;

    // Self-heal profile if storage_used_bytes drifted or was out of sync
    if (dbStorageUsed !== trueStorageUsedBytes || reservedBytes !== 0) {
      await adminClient
        .from("profiles")
        .update({
          storage_used_bytes: trueStorageUsedBytes,
          reserved_bytes: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
    }

    // Compute smart checksum ETag
    const signatureRaw = `${userId}:${trueStorageUsedBytes}:${quotaBytes}:${activeFilesCount}`;
    const etag = `"${crypto.createHash("md5").update(signatureRaw).digest("hex")}"`;

    // Check If-None-Match header
    const clientEtag = req.headers.get("if-none-match");
    if (clientEtag && clientEtag === etag) {
      // 304 Not Modified: 0 payload, 0 state change needed
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
        },
      });
    }

    return NextResponse.json(
      {
        storageUsedBytes: trueStorageUsedBytes,
        quotaBytes,
        reservedBytes: 0,
        activeFilesCount,
        isUnlimited: quotaBytes === -1,
      },
      {
        status: 200,
        headers: {
          ETag: etag,
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
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
