import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminOpRatelimit } from "@/lib/redis/ratelimit";
import { getClientIp, hashClientIp } from "@/lib/security/ip";

import { deleteR2Object } from "@/lib/storage/r2";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user: adminUser } = await requireAdminUser();
    const { id: fileId } = await context.params;

    if (!fileId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileId)) {
      return NextResponse.json(
        { success: false, error: "INVALID_FILE_ID", message: "File ID must be a valid UUID" },
        { status: 400 }
      );
    }

    // Rate Limit
    const { success: allowed } = await adminOpRatelimit.limit(adminUser.id);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "RATE_LIMITED", message: "Admin rate limit exceeded." },
        { status: 429 }
      );
    }

    const clientIp = getClientIp(req.headers);
    const ipHash = hashClientIp(clientIp);
    const adminClient = createAdminClient();

    // Look up file record first to obtain r2_key
    const { data: file, error: fileError } = await adminClient
      .from("files")
      .select("id, user_id, sanitized_name, r2_key, status, byte_size")
      .eq("id", fileId)
      .single();

    if (fileError || !file) {
      return NextResponse.json(
        { success: false, error: "FILE_NOT_FOUND", message: "File not found" },
        { status: 404 }
      );
    }

    // Call atomic stored procedure for quota reclamation & status transition
    const { data: rpcResult, error: rpcError } = await adminClient.rpc(
      "admin_force_delete_file",
      {
        p_admin_id: adminUser.id,
        p_file_id: fileId,
        p_ip_hash: ipHash,
      }
    );

    if (rpcError) {
      const msg = rpcError.message || "";
      if (msg.includes("FILE_NOT_FOUND")) {
        return NextResponse.json(
          { success: false, error: "FILE_NOT_FOUND", message: "File not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { success: false, error: "FORCE_DELETE_FAILED", message: msg },
        { status: 400 }
      );
    }

    // Physical deletion from Cloudflare R2 if not already PURGED
    if (file.status === "PURGED") {
      return NextResponse.json({
        success: true,
        file_id: fileId,
        status: "PURGED",
        message: "File was already purged.",
        result: rpcResult,
      });
    }

    const r2Deleted = await deleteR2Object(file.r2_key);

    if (r2Deleted) {
      await adminClient
        .from("files")
        .update({
          status: "PURGED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", fileId);

      return NextResponse.json({
        success: true,
        file_id: fileId,
        status: "PURGED",
        message: "File permanently deleted and storage reclaimed.",
        result: rpcResult,
      });
    } else {
      await adminClient
        .from("files")
        .update({
          status: "DELETE_FAILED",
          last_reconciliation_error: "R2 physical delete failed during admin force delete",
          updated_at: new Date().toISOString(),
        })
        .eq("id", fileId);

      return NextResponse.json({
        success: true,
        file_id: fileId,
        status: "DELETE_FAILED",
        message: "Storage quota reclaimed; physical cleanup queued for background reconciliation.",
        result: rpcResult,
      });
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ success: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (errorMsg.includes("FORBIDDEN")) {
      return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
    }
    console.error("[Admin Files Delete API] Error:", errorMsg);
    return NextResponse.json({ success: false, error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
