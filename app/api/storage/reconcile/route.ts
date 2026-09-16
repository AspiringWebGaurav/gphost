import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/session";
import { reconcileUserStorage } from "@/lib/storage/reconcile";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/storage/reconcile
 * Scans Cloudflare R2 bucket physically and syncs PostgreSQL state with reality.
 */
export async function POST() {
  try {
    const { user, profile } = await requireApprovedUser();
    const isAdmin = profile.role === "admin";

    const result = await reconcileUserStorage(user.id, isAdmin);

    return NextResponse.json({
      success: true,
      message: "Storage successfully reconciled with Cloudflare R2",
      data: result,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Reconciliation failed";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (errorMsg.startsWith("ACCESS_DENIED")) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
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
export async function GET() {
  try {
    const { user, profile } = await requireApprovedUser();
    const adminClient = createAdminClient();

    // Query active files count & total byte sum
    const { data: activeFiles } = await adminClient
      .from("files")
      .select("byte_size")
      .eq("user_id", user.id)
      .in("status", ["ACTIVE", "EXPIRING"]);

    const activeFilesCount = activeFiles?.length || 0;
    const computedByteSize = (activeFiles || []).reduce((sum, f) => sum + (f.byte_size || 0), 0);

    // Refresh profile quota state
    const { data: currentProfile } = await adminClient
      .from("profiles")
      .select("quota_bytes, storage_used_bytes, reserved_bytes")
      .eq("id", user.id)
      .single();

    return NextResponse.json({
      success: true,
      userId: user.id,
      storageUsedBytes: currentProfile?.storage_used_bytes ?? profile.storage_used_bytes,
      computedByteSize,
      quotaBytes: currentProfile?.quota_bytes ?? profile.quota_bytes,
      reservedBytes: currentProfile?.reserved_bytes ?? profile.reserved_bytes,
      activeFilesCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Sync check failed";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to fetch storage sync status", details: errorMsg },
      { status: 500 }
    );
  }
}
