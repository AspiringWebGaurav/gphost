import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApprovedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteR2Object } from "@/lib/storage/r2";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authoritative server authentication & approval check
    const { user, profile } = await requireApprovedUser();

    // 2. Resolve route params (Next.js 16 async params)
    const { id: fileId } = await params;
    const parseResult = idSchema.safeParse(fileId);
    if (!parseResult.success) {
      return NextResponse.json({ error: "Invalid file ID format" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // 3. Look up file record
    const { data: file, error: fileError } = await adminClient
      .from("files")
      .select("id, user_id, sanitized_name, r2_key, status, byte_size")
      .eq("id", fileId)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Ownership check: must be owner or admin
    const isOwner = file.user_id === user.id;
    const isAdmin = profile.role === "admin";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Access denied: not file owner" }, { status: 403 });
    }

    // Already purged?
    if (file.status === "PURGED") {
      return NextResponse.json(
        { success: true, status: "PURGED", message: "File already purged" },
        { status: 200 }
      );
    }

    // 4. Atomic PostgreSQL Quota Reclamation & Transition to DELETE_PENDING
    // Reclaims quota immediately on the file owner's profile and prevents double-crediting
    const { error: reclaimError } = await adminClient.rpc(
      "reclaim_file_storage",
      {
        p_user_id: file.user_id,
        p_file_id: fileId,
      }
    );

    if (reclaimError) {
      console.error("Failed to reclaim storage quota for file:", reclaimError);
      return NextResponse.json(
        { error: "Database error updating file deletion state" },
        { status: 500 }
      );
    }

    // 4.5. Nuclear purge of all associated share links and xurl mappings for this file
    try {
      const { data: fileShareLinks } = await adminClient
        .from("share_links")
        .select("id")
        .eq("file_id", fileId);

      if (fileShareLinks && fileShareLinks.length > 0) {
        const shareIds = fileShareLinks.map((s) => s.id);

        // Deactivate first immediately
        await adminClient
          .from("share_links")
          .update({ is_active: false })
          .in("id", shareIds);

        // Delete associated xurl_mappings (explicitly to ensure no foreign key locks)
        await adminClient
          .from("xurl_mappings")
          .delete()
          .in("share_link_id", shareIds);

        // Permanently delete the share_links rows (cascades to file_downloads)
        await adminClient
          .from("share_links")
          .delete()
          .in("id", shareIds);
      }
    } catch (linkPurgeErr) {
      console.error("Error nuclear-purging share links for deleted file:", linkPurgeErr);
    }

    // 5. Authoritative Physical Deletion from Cloudflare R2
    const r2Deleted = await deleteR2Object(file.r2_key);

    if (r2Deleted) {
      // Transition to PURGED
      await adminClient
        .from("files")
        .update({
          status: "PURGED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", fileId);

      // Record Audit Log
      await adminClient.from("audit_logs").insert({
        actor_id: user.id,
        event_type: "FILE_PURGED",
        resource_type: "file",
        resource_id: fileId,
        ip_hash: "server_authoritative",
        metadata: {
          filename: file.sanitized_name,
          byte_size: file.byte_size,
          deleted_by: isAdmin && !isOwner ? "admin" : "owner",
        },
      });

      return NextResponse.json({
        success: true,
        status: "PURGED",
        message: "File permanently deleted and storage reclaimed.",
      });
    } else {
      // Transition to DELETE_FAILED for reconciliation worker
      await adminClient
        .from("files")
        .update({
          status: "DELETE_FAILED",
          last_reconciliation_error: "R2 physical delete failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", fileId);

      return NextResponse.json({
        success: true,
        status: "DELETE_FAILED",
        message: "Storage quota reclaimed; physical cleanup queued for background reconciliation.",
      });
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (errorMsg.startsWith("ACCESS_DENIED")) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    console.error("Unhandled error in DELETE /api/files/[id]:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
