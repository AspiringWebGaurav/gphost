import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-keys";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserMaxFiles } from "@/lib/storage/user-limits";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authRes = await authenticateRequest(req, "storage:read");
    if ("errorResponse" in authRes) return authRes.errorResponse;
    const { userId, profile } = authRes.auth;

    const adminClient = createAdminClient();

    const [filesCountRes, maxFiles] = await Promise.all([
      adminClient
        .from("files")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "ACTIVE"),
      getUserMaxFiles(userId),
    ]);

    const activeFilesCount = filesCountRes.count ?? 0;
    const isUnlimited = profile.quota_bytes === -1;
    const remainingBytes = isUnlimited ? -1 : Math.max(0, profile.quota_bytes - profile.storage_used_bytes);

    return NextResponse.json({
      success: true,
      storage: {
        quota_bytes: profile.quota_bytes,
        storage_used_bytes: profile.storage_used_bytes,
        reserved_bytes: profile.reserved_bytes,
        remaining_bytes: remainingBytes,
        is_unlimited: isUnlimited,
        percentage_used: isUnlimited
          ? 0
          : Math.min(100, Math.round((profile.storage_used_bytes / profile.quota_bytes) * 100)),
        active_files_count: activeFilesCount,
        max_files: maxFiles,
        can_create_permanent: true,
        is_premium: true,
        tier: "owner_premium",
      },
    });
  } catch (err: unknown) {
    console.error("[v1 Storage GET] Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
