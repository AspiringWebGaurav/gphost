import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest } from "@/lib/auth/api-keys";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteR2Object } from "@/lib/storage/r2";
import { redis } from "@/lib/redis/client";
import { deleteXurlLink } from "@/lib/xurl/client";
import { purgeShareLinkRedisData } from "@/lib/storage/lifecycle";

export const dynamic = "force-dynamic";

export { GET, PATCH } from "@/app/api/v1/files/[id]/route";

const idSchema = z.string().uuid();

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authoritative server authentication & approval check (API key or session)
    const authRes = await authenticateRequest(req, "files:delete");
    if ("errorResponse" in authRes) return authRes.errorResponse;
    const { userId, profile } = authRes.auth;

    // 2. Resolve route params
    const { id: fileId } = await params;
    const parseResult = idSchema.safeParse(fileId);
    if (!parseResult.success) {
      return NextResponse.json({ error: "Invalid file ID format" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const isForce = searchParams.get("force") === "true" || body.confirmReleaseDeletion === true;

    const adminClient = createAdminClient();

    // 3. Look up file record
    const { data: file, error: fileError } = await adminClient
      .from("files")
      .select("id, user_id, sanitized_name, r2_key, status, byte_size, is_release_locked")
      .eq("id", fileId)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Ownership check: must be owner or admin
    const isOwner = file.user_id === userId;
    const isAdmin = profile.role === "admin";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Access denied: not file owner" }, { status: 403 });
    }

    // Already purged? Idempotent
    if (file.status === "PURGED") {
      return NextResponse.json(
        { success: true, status: "PURGED", message: "File already purged" },
        { status: 200 }
      );
    }

    // Accidental Deletion Protection for Active Production Releases
    if (file.is_release_locked && !isForce) {
      return NextResponse.json(
        {
          error: "File is release-locked to prevent accidental deletion.",
          code: "RELEASE_LOCKED",
          hint: "To permanently delete this release binary, pass '?force=true' or 'confirmReleaseDeletion: true'.",
        },
        { status: 409 }
      );
    }

    // 4. Atomic PostgreSQL Quota Reclamation
    const { error: reclaimError } = await adminClient.rpc(
      "reclaim_file_storage",
      {
        p_user_id: file.user_id,
        p_file_id: fileId,
      }
    );

    if (reclaimError) {
      console.warn("reclaim_file_storage warning:", reclaimError);
    }

    // 4.5. Purge associated share links, xurl mappings, and Redis caches
    try {
      const { data: fileShareLinks } = await adminClient
        .from("share_links")
        .select("id, slug")
        .eq("file_id", fileId);

      if (fileShareLinks && fileShareLinks.length > 0) {
        const shareIds = fileShareLinks.map((s) => s.id);

        await adminClient
          .from("share_links")
          .update({ is_active: false })
          .in("id", shareIds);

        const { data: mappings } = await adminClient
          .from("xurl_mappings")
          .select("xurl_id")
          .in("share_link_id", shareIds);

        if (mappings && mappings.length > 0) {
          for (const m of mappings) {
            if (m.xurl_id) void deleteXurlLink(m.xurl_id);
          }
        }

        await adminClient
          .from("xurl_mappings")
          .delete()
          .in("share_link_id", shareIds);

        await adminClient
          .from("share_links")
          .delete()
          .in("id", shareIds);
      }

      const delPromises: Promise<unknown>[] = [redis?.del(`analytics:${fileId}`)];
      if (fileShareLinks) {
        for (const s of fileShareLinks) {
          if (s.slug) {
            delPromises.push(purgeShareLinkRedisData(s.slug));
          }
        }
      }
      await Promise.all(delPromises);
    } catch (linkPurgeErr) {
      console.warn("Error purging share links for deleted file:", linkPurgeErr);
    }

    // 5. Authoritative Physical Deletion from Cloudflare R2
    const r2Deleted = await deleteR2Object(file.r2_key);

    await adminClient
      .from("files")
      .update({
        status: r2Deleted ? "PURGED" : "DELETE_FAILED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", fileId);

    // Record Audit Log
    try {
      await adminClient.from("audit_logs").insert({
        actor_id: userId,
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
    } catch {}

    return NextResponse.json({
      success: true,
      status: "PURGED",
      message: "File permanently deleted and storage reclaimed.",
    });
  } catch (err: unknown) {
    console.error("Unhandled error in DELETE /api/files/[id]:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
