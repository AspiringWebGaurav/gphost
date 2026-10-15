import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-keys";
import { reconcileUserStorage } from "@/lib/storage/reconcile";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/storage/reconcile
 * Scans Cloudflare R2 bucket physically and syncs PostgreSQL state with reality.
 */
export async function POST(req: NextRequest) {
  try {
    const authRes = await authenticateRequest(req, "files:manage");
    if ("errorResponse" in authRes) return authRes.errorResponse;
    const { userId, profile } = authRes.auth;
    const isAdmin = profile.role === "admin";

    const result = await reconcileUserStorage(userId, isAdmin);

    return NextResponse.json({
      success: true,
      message: "Storage successfully audited and reconciled",
      data: result,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Reconciliation failed";
    console.error("[Storage Reconcile API Error]:", err);
    return NextResponse.json(
      { error: "Failed to reconcile storage with R2", details: errorMsg },
      { status: 500 }
    );
  }
}

/**
 * GET /api/storage/reconcile
 * Returns current authoritative storage metrics for authenticated user.
 */
export async function GET(req: NextRequest) {
  try {
    const authRes = await authenticateRequest(req, "storage:read");
    if ("errorResponse" in authRes) return authRes.errorResponse;
    const { userId, profile } = authRes.auth;
    const adminClient = createAdminClient();

    // Query active files count & total byte sum
    const { data: activeFiles } = await adminClient
      .from("files")
      .select("byte_size")
      .eq("user_id", userId)
      .in("status", ["ACTIVE", "EXPIRING"]);

    const activeFilesCount = activeFiles?.length || 0;
    const computedByteSize = (activeFiles || []).reduce((sum, f) => sum + (f.byte_size || 0), 0);

    // Refresh profile quota state & self-heal if drifted
    const { data: currentProfile } = await adminClient
      .from("profiles")
      .select("quota_bytes, storage_used_bytes, reserved_bytes")
      .eq("id", userId)
      .single();

    let storageUsed = currentProfile?.storage_used_bytes ?? profile.storage_used_bytes;
    if (storageUsed !== computedByteSize) {
      storageUsed = computedByteSize;
      await adminClient
        .from("profiles")
        .update({
          storage_used_bytes: computedByteSize,
          reserved_bytes: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
    }

    return NextResponse.json({
      success: true,
      userId,
      storageUsedBytes: storageUsed,
      computedByteSize,
      quotaBytes: currentProfile?.quota_bytes ?? profile.quota_bytes,
      reservedBytes: currentProfile?.reserved_bytes ?? profile.reserved_bytes,
      activeFilesCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Sync check failed";
    return NextResponse.json(
      { error: "Failed to fetch storage sync status", details: errorMsg },
      { status: 500 }
    );
  }
}

