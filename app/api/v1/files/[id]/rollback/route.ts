import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { authenticateRequest, markFileApiAccessed } from "@/lib/auth/api-keys";
import { createAdminClient } from "@/lib/supabase/admin";
import { purgeShareLinkRedisData } from "@/lib/storage/lifecycle";
import { redis } from "@/lib/redis/client";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authRes = await authenticateRequest(req, "files:manage");
    if ("errorResponse" in authRes) return authRes.errorResponse;
    const { userId } = authRes.auth;

    const { id: fileId } = await params;
    const parseId = idSchema.safeParse(fileId);
    if (!parseId.success) {
      return NextResponse.json({ error: "Invalid file ID format" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const targetVersionNumber = body.versionNumber ? parseInt(String(body.versionNumber), 10) : null;

    const adminClient = createAdminClient();

    // 1. Fetch current file
    const { data: file, error: fileErr } = await adminClient
      .from("files")
      .select("*")
      .eq("id", fileId)
      .eq("user_id", userId)
      .single();

    if (fileErr || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // 2. Fetch target archived version from file_versions
    let versionQuery = adminClient
      .from("file_versions")
      .select("*")
      .eq("file_id", fileId);

    if (targetVersionNumber) {
      versionQuery = versionQuery.eq("version_number", targetVersionNumber);
    } else {
      // Default to the most recent previous version
      versionQuery = versionQuery.order("version_number", { ascending: false }).limit(1);
    }

    const { data: versions, error: vErr } = await versionQuery;
    const targetVersion = versions && versions.length > 0 ? versions[0] : null;

    if (vErr || !targetVersion) {
      return NextResponse.json(
        {
          error: "Requested rollback version not found in version history",
          details: targetVersionNumber ? `Version ${targetVersionNumber} does not exist.` : "No previous versions available.",
        },
        { status: 404 }
      );
    }

    // 3. Archive current state before switching back
    const { count } = await adminClient
      .from("file_versions")
      .select("id", { count: "exact", head: true })
      .eq("file_id", fileId);

    const nextVersionNumber = (count ?? 0) + 1;

    await adminClient.from("file_versions").insert({
      file_id: file.id,
      version_number: nextVersionNumber,
      r2_key: file.r2_key,
      r2_etag: file.r2_etag || null,
      byte_size: file.byte_size,
      sha256: file.sha256 || null,
      created_by: userId,
      replaced_at: new Date().toISOString(),
      metadata: {
        note: `Archived during rollback to version ${targetVersion.version_number}`,
        filename: file.sanitized_name,
      },
    });

    // 4. Atomic pointer switch to target version
    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      r2_key: targetVersion.r2_key,
      byte_size: targetVersion.byte_size,
      r2_etag: targetVersion.r2_etag,
      updated_at: nowIso,
    };

    if (targetVersion.sha256) {
      updatePayload.sha256 = targetVersion.sha256;
    }

    let updateRes = await adminClient
      .from("files")
      .update(updatePayload)
      .eq("id", fileId)
      .select("*")
      .single();

    if (updateRes.error && (updateRes.error.code === "42703" || updateRes.error.message?.includes("sha256"))) {
      delete updatePayload.sha256;
      updateRes = await adminClient
        .from("files")
        .update(updatePayload)
        .eq("id", fileId)
        .select("*")
        .single();
    }

    if (updateRes.error) {
      console.error("[Rollback Error]:", updateRes.error);
      return NextResponse.json({ error: "Failed to update file to rollback version" }, { status: 500 });
    }

    // Adjust quota delta
    const sizeDelta = targetVersion.byte_size - file.byte_size;
    if (sizeDelta !== 0) {
      const { data: profileRecord } = await adminClient
        .from("profiles")
        .select("storage_used_bytes")
        .eq("id", userId)
        .single();

      const currentUsed = profileRecord?.storage_used_bytes || 0;
      await adminClient
        .from("profiles")
        .update({ storage_used_bytes: Math.max(0, currentUsed + sizeDelta) })
        .eq("id", userId);
    }

    // Invalidate Redis caches
    const { data: share } = await adminClient
      .from("share_links")
      .select("slug")
      .eq("file_id", fileId)
      .eq("is_active", true)
      .maybeSingle();

    const slug = share?.slug || "";
    if (slug) {
      await purgeShareLinkRedisData(slug);
    }
    try {
      await Promise.all([
        redis?.del(`raw:meta:${slug}`),
        redis?.del(`share:pub:${slug}`),
        redis?.del(`share:meta:${slug}`),
        redis?.del(`raw:meta:${fileId}`),
      ]);
    } catch {}

    void markFileApiAccessed(userId, fileId);

    // Audit log
    try {
      after(async () => {
        await adminClient.from("audit_logs").insert({
          actor_id: userId,
          event_type: "FILE_ROLLBACK",
          resource_type: "file",
          resource_id: fileId,
          ip_hash: "server_authoritative",
          metadata: {
            rolled_back_to_version: targetVersion.version_number,
            slug,
            byte_size: targetVersion.byte_size,
            sha256: targetVersion.sha256,
          },
        });
      });
    } catch {}

    const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const forwardedProto = req.headers.get("x-forwarded-proto") || (forwardedHost?.startsWith("localhost") ? "http" : "https");
    const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : (process.env.NEXT_PUBLIC_APP_URL || "https://gphost.eu.cc");

    const rawUrl = slug ? `${origin}/raw/${slug}` : `${origin}/raw/${fileId}`;
    const downloadUrl = slug ? `${origin}/f/${slug}` : `${origin}/f/${fileId}`;

    return NextResponse.json({
      success: true,
      fileId,
      slug,
      restoredVersionNumber: targetVersion.version_number,
      byteSize: targetVersion.byte_size,
      sha256: targetVersion.sha256,
      permanentRawUrl: rawUrl,
      rawUrl,
      downloadUrl,
      rolledBackAt: nowIso,
    });
  } catch (err: unknown) {
    console.error("[Rollback Exception]:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}