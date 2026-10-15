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
    let isForce = searchParams.get("force") === "true";
    try {
      if (req.headers.get("content-type")?.includes("application/json")) {
        const body = await req.json();
        if (body?.confirmReleaseDeletion === true) {
          isForce = true;
        }
      }
    } catch {
      // Empty body is valid for DELETE
    }

    const adminClient = createAdminClient();

    // 3. Look up file record with schema resilience (select * never fails on missing columns)
    const { data: file, error: fileError } = await adminClient
      .from("files")
      .select("*")
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

    // Absolute Isolation Guard: Base v0.0.0 Installer cannot be deleted under any circumstances
    const { data: baseShare } = await adminClient
      .from("share_links")
      .select("id")
      .eq("file_id", fileId)
      .eq("slug", "gpn-app")
      .maybeSingle();

    if (baseShare) {
      return NextResponse.json(
        {
          error: "Forbidden: Base v0.0.0 installer is permanently isolated for website downloads and cannot be deleted.",
          code: "BASE_INSTALLER_PROTECTED",
        },
        { status: 403 }
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
      // Graceful fallback: manually adjust storage_used_bytes if RPC fails
      try {
        const { data: prof } = await adminClient
          .from("profiles")
          .select("storage_used_bytes")
          .eq("id", file.user_id)
          .single();
        if (prof && file.byte_size) {
          await adminClient
            .from("profiles")
            .update({
              storage_used_bytes: Math.max(0, (prof.storage_used_bytes || 0) - file.byte_size),
              updated_at: new Date().toISOString(),
            })
            .eq("id", file.user_id);
        }
      } catch (quotaErr) {
        console.warn("Manual quota adjustment error:", quotaErr);
      }
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

        try {
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
        } catch {}

        await adminClient
          .from("share_links")
          .delete()
          .in("id", shareIds);
      }

      // Redis cleanup: analytics, raw metadata, api tracking, and share links
      if (redis) {
        const delPromises: Promise<unknown>[] = [
          redis.del(`analytics:${fileId}`),
          redis.del(`raw:meta:${fileId}`),
          redis.del(`file_api_accessed:${fileId}`),
          redis.srem(`api_managed_files:${file.user_id}`, fileId),
        ];
        if (fileShareLinks) {
          for (const s of fileShareLinks) {
            if (s.slug) {
              delPromises.push(purgeShareLinkRedisData(s.slug));
            }
          }
        }
        await Promise.allSettled(delPromises);
      }
    } catch (linkPurgeErr) {
      console.warn("Error purging share links for deleted file:", linkPurgeErr);
    }

    // 4.6. Purge historical versions if file_versions table exists
    try {
      const { data: fileVersions } = await adminClient
        .from("file_versions")
        .select("id, r2_key")
        .eq("file_id", fileId);

      if (fileVersions && fileVersions.length > 0) {
        for (const fv of fileVersions) {
          if (fv.r2_key && fv.r2_key !== file.r2_key) {
            await deleteR2Object(fv.r2_key).catch(() => false);
          }
        }
        await adminClient.from("file_versions").delete().eq("file_id", fileId);
      }
    } catch {}

    // 4.7. Clean up any app_releases references if this file was part of an app release
    try {
      await adminClient
        .from("app_releases")
        .delete()
        .or(`binary_file_id.eq.${fileId},signature_file_id.eq.${fileId}`);
    } catch {}

    // 5. Authoritative Physical Deletion from Cloudflare R2
    const r2Deleted = file.r2_key ? await deleteR2Object(file.r2_key) : true;

    await adminClient
      .from("files")
      .update({
        status: r2Deleted ? "PURGED" : "DELETE_FAILED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", fileId);

    // 5.1. Authoritatively sync profile storage_used_bytes to actual remaining active files
    try {
      const { data: remainingFiles } = await adminClient
        .from("files")
        .select("byte_size")
        .eq("user_id", file.user_id)
        .in("status", ["ACTIVE", "EXPIRING"]);
      const updatedStorageBytes = (remainingFiles || []).reduce((sum, f) => sum + (f.byte_size || 0), 0);
      await adminClient
        .from("profiles")
        .update({
          storage_used_bytes: updatedStorageBytes,
          reserved_bytes: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", file.user_id);
    } catch (syncErr) {
      console.warn("Storage profile sync warning after deletion:", syncErr);
    }

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
