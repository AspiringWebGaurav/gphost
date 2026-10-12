import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, markFileApiAccessed } from "@/lib/auth/api-keys";
import { createAdminClient } from "@/lib/supabase/admin";
import { headR2Object, deleteR2Object } from "@/lib/storage/r2";
import { sanitizeFilename } from "@/lib/storage/sanitizer";
import { purgeShareLinkRedisData } from "@/lib/storage/lifecycle";
import { deleteXurlLink } from "@/lib/xurl/client";
import { redis } from "@/lib/redis/client";
import { calculateExpiryDate, EXPIRY_PRESET_VALUES } from "@/lib/storage/expiry";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

const patchSchema = z.object({
  filename: z.string().trim().min(1).max(255).optional(),
  isReleaseLocked: z.boolean().optional(),
  expiryPreset: z.enum(EXPIRY_PRESET_VALUES).optional(),
});

/**
 * GET /api/v1/files/[id]
 * Retrieves full metadata, physical accessibility, and version history.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authRes = await authenticateRequest(req, "files:read");
    if ("errorResponse" in authRes) return authRes.errorResponse;
    const { userId } = authRes.auth;

    const { id: fileId } = await params;
    const parseId = idSchema.safeParse(fileId);
    if (!parseId.success) {
      return NextResponse.json({ error: "Invalid file ID format (must be UUID)" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Query file record with tenant isolation
    const { data: file, error: fileErr } = await adminClient
      .from("files")
      .select("*")
      .eq("id", fileId)
      .eq("user_id", userId)
      .single();

    if (fileErr || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    void markFileApiAccessed(userId, fileId);

    // Query primary share link
    const { data: share } = await adminClient
      .from("share_links")
      .select("id, slug, is_active, max_downloads, download_count, expires_at")
      .eq("file_id", fileId)
      .eq("is_active", true)
      .maybeSingle();

    // Query historical versions
    let versions: Array<{
      id: string;
      version_number: number;
      byte_size: number;
      sha256: string | null;
      replaced_at: string;
    }> = [];

    try {
      const { data: vData } = await adminClient
        .from("file_versions")
        .select("id, version_number, byte_size, sha256, replaced_at")
        .eq("file_id", fileId)
        .order("version_number", { ascending: false });

      if (vData) versions = vData;
    } catch {}

    // Verify physical storage accessibility in Cloudflare R2
    let isPhysicallyAccessible = false;
    let r2Meta = null;
    if (file.status === "ACTIVE") {
      r2Meta = await headR2Object(file.r2_key);
      isPhysicallyAccessible = Boolean(r2Meta);
    }

    const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const forwardedProto = req.headers.get("x-forwarded-proto") || (forwardedHost?.startsWith("localhost") ? "http" : "https");
    const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : (process.env.NEXT_PUBLIC_APP_URL || "https://gphost.eu.cc");

    const slug = share?.slug || null;
    const rawUrl = slug ? `${origin}/raw/${slug}` : `${origin}/raw/${file.id}`;
    const downloadUrl = slug ? `${origin}/f/${slug}` : `${origin}/f/${file.id}`;

    return NextResponse.json({
      success: true,
      file: {
        id: file.id,
        filename: file.filename,
        sanitized_name: file.sanitized_name,
        byte_size: file.byte_size,
        mime_type: file.mime_type,
        status: file.status,
        expiry_preset: file.expiry_preset,
        expires_at: file.expires_at,
        is_permanent: file.expires_at === null,
        sha256: file.sha256 || null,
        is_release_locked: Boolean(file.is_release_locked),
        slug,
        raw_url: rawUrl,
        permanent_raw_url: rawUrl,
        download_url: downloadUrl,
        created_at: file.created_at,
        updated_at: file.updated_at,
        storage_verification: {
          accessible: isPhysicallyAccessible,
          r2_content_length: r2Meta?.contentLength || null,
          r2_etag: r2Meta?.eTag || null,
        },
        version_count: versions.length + 1,
        versions,
      },
    });
  } catch (err: unknown) {
    console.error("[v1 Files ID GET] Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PATCH /api/v1/files/[id]
 * Updates permitted file metadata: filename, isReleaseLocked, expiryPreset.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authRes = await authenticateRequest(req, "files:manage");
    if ("errorResponse" in authRes) return authRes.errorResponse;
    const { userId, profile } = authRes.auth;

    const { id: fileId } = await params;
    const parseId = idSchema.safeParse(fileId);
    if (!parseId.success) {
      return NextResponse.json({ error: "Invalid file ID format" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const parseBody = patchSchema.safeParse(body);
    if (!parseBody.success) {
      return NextResponse.json(
        { error: "Invalid update parameters", details: parseBody.error.flatten() },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Verify ownership
    const { data: file, error: fileErr } = await adminClient
      .from("files")
      .select("*")
      .eq("id", fileId)
      .eq("user_id", userId)
      .single();

    if (fileErr || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (parseBody.data.filename) {
      updatePayload.filename = parseBody.data.filename;
      updatePayload.sanitized_name = sanitizeFilename(parseBody.data.filename);
    }

    if (typeof parseBody.data.isReleaseLocked === "boolean") {
      updatePayload.is_release_locked = parseBody.data.isReleaseLocked;
    }

    if (parseBody.data.expiryPreset) {
      const preset = parseBody.data.expiryPreset;
      if (preset === "never" && profile.role !== "admin" && !profile.can_create_permanent) {
        return NextResponse.json(
          { error: "Unauthorized expiry preset: permanent files require permission" },
          { status: 403 }
        );
      }
      updatePayload.expiry_preset = preset;
      const newExpiry = calculateExpiryDate(preset);
      updatePayload.expires_at = newExpiry ? newExpiry.toISOString() : null;
    }

    let updateRes = await adminClient
      .from("files")
      .update(updatePayload)
      .eq("id", fileId)
      .select("*")
      .single();

    // Schema fallback if is_release_locked column not yet added
    if (updateRes.error && (updateRes.error.code === "42703" || updateRes.error.message?.includes("is_release_locked"))) {
      delete updatePayload.is_release_locked;
      updateRes = await adminClient
        .from("files")
        .update(updatePayload)
        .eq("id", fileId)
        .select("*")
        .single();
    }

    if (updateRes.error) {
      console.error("[v1 Files PATCH] Error:", updateRes.error);
      return NextResponse.json({ error: "Failed to update file record" }, { status: 500 });
    }

    void markFileApiAccessed(userId, fileId);

    return NextResponse.json({
      success: true,
      file: updateRes.data,
    });
  } catch (err: unknown) {
    console.error("[v1 Files ID PATCH] Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/files/[id]
 * Deletes a file safely with release-lock protection, quota reclamation, and cache cleanup.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authRes = await authenticateRequest(req, "files:delete");
    if ("errorResponse" in authRes) return authRes.errorResponse;
    const { userId, profile } = authRes.auth;

    const { id: fileId } = await params;
    const parseId = idSchema.safeParse(fileId);
    if (!parseId.success) {
      return NextResponse.json({ error: "Invalid file ID format" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    let isForce = searchParams.get("force") === "true";
    try {
      if (req.headers.get("content-type")?.includes("application/json")) {
        const body = await req.json();
        if (body?.confirmReleaseDeletion === true) isForce = true;
      }
    } catch {
      // Empty body is valid for DELETE
    }

    const adminClient = createAdminClient();

    // Verify ownership or admin permission
    const { data: file, error: fileErr } = await adminClient
      .from("files")
      .select("*")
      .eq("id", fileId)
      .single();

    if (fileErr || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const isOwner = file.user_id === userId;
    const isAdmin = profile?.role === "admin";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Access denied: not file owner" }, { status: 403 });
    }

    // Idempotent: already purged
    if (file.status === "PURGED") {
      return NextResponse.json({
        success: true,
        status: "PURGED",
        message: "File was already purged from storage.",
      });
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

    // 1. Quota Reclamation
    const { error: reclaimError } = await adminClient.rpc("reclaim_file_storage", {
      p_user_id: file.user_id,
      p_file_id: fileId,
    });

    if (reclaimError) {
      console.warn("reclaim_file_storage error:", reclaimError);
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
      } catch {}
    }

    // 2. Share links & shortlinks cleanup
    try {
      const { data: fileShareLinks } = await adminClient
        .from("share_links")
        .select("id, slug")
        .eq("file_id", fileId)
        .neq("slug", "gpn-app")
        .neq("slug", "gpn-app-sig");

      if (fileShareLinks && fileShareLinks.length > 0) {
        const shareIds = fileShareLinks.map((s) => s.id);

        try {
          const { data: mappings } = await adminClient
            .from("xurl_mappings")
            .select("xurl_id")
            .in("share_link_id", shareIds);

          if (mappings) {
            for (const m of mappings) {
              if (m.xurl_id) void deleteXurlLink(m.xurl_id);
            }
          }

          await adminClient.from("xurl_mappings").delete().in("share_link_id", shareIds);
        } catch {}

        await adminClient.from("share_links").delete().in("id", shareIds);

        for (const s of fileShareLinks) {
          if (s.slug) {
            await purgeShareLinkRedisData(s.slug);
          }
        }
      }

      if (redis) {
        await Promise.allSettled([
          redis.del(`analytics:${fileId}`),
          redis.del(`raw:meta:${fileId}`),
          redis.del(`file_api_accessed:${fileId}`),
          redis.srem(`api_managed_files:${file.user_id}`, fileId),
        ]);
      }
    } catch (linkPurgeErr) {
      console.warn("Share link cleanup warning:", linkPurgeErr);
    }

    // 3. Physical R2 Deletion of active object AND historical version objects
    const r2Deleted = file.r2_key ? await deleteR2Object(file.r2_key) : true;

    let versionsReclaimedBytes = 0;
    try {
      const { data: fileVersions } = await adminClient
        .from("file_versions")
        .select("id, r2_key, byte_size")
        .eq("file_id", fileId);

      if (fileVersions && fileVersions.length > 0) {
        for (const fv of fileVersions) {
          if (fv.r2_key && fv.r2_key !== file.r2_key) {
            await deleteR2Object(fv.r2_key).catch(() => false);
          }
          versionsReclaimedBytes += fv.byte_size || 0;
        }
        await adminClient.from("file_versions").delete().eq("file_id", fileId);
      }
    } catch (verErr) {
      console.warn("Historical versions cleanup warning:", verErr);
    }

    // Clean up any app_releases references if this file was part of an app release
    try {
      await adminClient
        .from("app_releases")
        .delete()
        .or(`binary_file_id.eq.${fileId},signature_file_id.eq.${fileId}`);
    } catch {}

    if (versionsReclaimedBytes > 0) {
      try {
        const { data: profileRecord } = await adminClient
          .from("profiles")
          .select("storage_used_bytes")
          .eq("id", userId)
          .single();

        const currentUsed = profileRecord?.storage_used_bytes || 0;
        await adminClient
          .from("profiles")
          .update({ storage_used_bytes: Math.max(0, currentUsed - versionsReclaimedBytes) })
          .eq("id", userId);
      } catch {}
    }

    // 4. Update status in database
    await adminClient
      .from("files")
      .update({
        status: r2Deleted ? "PURGED" : "DELETE_FAILED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", fileId);

    // 5. Audit Log
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
          forced: isForce,
        },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      status: "PURGED",
      message: "File permanently deleted and storage quota reclaimed.",
    });
  } catch (err: unknown) {
    console.error("[v1 Files ID DELETE] Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
