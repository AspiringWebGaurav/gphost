import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasPermission } from "@/lib/auth/api-keys";
import { isAuthoritativeAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getR2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { redis } from "@/lib/redis/client";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ appId: string }> }
) {
  // 1. Authoritative Authentication & Authorization
  const authRes = await authenticateRequest(req);
  if ("errorResponse" in authRes) {
    return authRes.errorResponse;
  }
  const { auth } = authRes;

  const { appId: rawAppId } = await context.params;
  const appId = rawAppId?.trim().toLowerCase();
  if (!appId || !/^[a-z0-9.\-_+]+$/.test(appId)) {
    return NextResponse.json({ error: "Invalid or missing 'appId' parameter" }, { status: 400 });
  }

  const isAdmin = isAuthoritativeAdmin(auth.profile?.email) || auth.profile?.role === "admin";
  const hasReleasePerm =
    hasPermission(auth.permissions, "*") ||
    auth.permissions?.includes("releases:publish") ||
    auth.permissions?.includes("files:manage");

  if (!isAdmin && !hasReleasePerm) {
    return NextResponse.json(
      { error: "Forbidden: Release rollback requires authoritative admin or release:publish permission" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { targetVersion } = body;

    const adminClient = createAdminClient();
    const r2Client = getR2Client();

    let targetRelease: any = null;

    if (targetVersion && typeof targetVersion === "string") {
      const cleanTarget = targetVersion.trim().replace(/^v/, "");
      const { data } = await adminClient
        .from("app_releases")
        .select("*")
        .eq("app_id", appId)
        .eq("version", cleanTarget)
        .maybeSingle();
      targetRelease = data;

      if (!targetRelease) {
        return NextResponse.json(
          { error: `Release version v${cleanTarget} not found in release history for ${appId}` },
          { status: 404 }
        );
      }
    } else {
      // Find previous release (second most recently published)
      const { data: previousReleases } = await adminClient
        .from("app_releases")
        .select("*")
        .eq("app_id", appId)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(2);

      if (!previousReleases || previousReleases.length < 2) {
        return NextResponse.json(
          { error: `No previous release found to roll back to for ${appId}` },
          { status: 404 }
        );
      }

      targetRelease = previousReleases[1];
    }

    // 2. Physical Object Verification in Cloudflare R2
    try {
      const headRes = await r2Client.send(
        new HeadObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: targetRelease.binary_r2_key,
        })
      );
      if (!headRes.ContentLength || headRes.ContentLength <= 0) {
        return NextResponse.json(
          { error: `Target release binary for v${targetRelease.version} is 0 bytes in storage` },
          { status: 422 }
        );
      }
    } catch (headErr: any) {
      return NextResponse.json(
        {
          error: `Target release binary for v${targetRelease.version} physically missing from Cloudflare R2: ${headErr.message}`,
        },
        { status: 404 }
      );
    }

    // 3. Atomically switch active release pointer in app_releases
    const { error: rpcErr } = await adminClient.rpc("publish_app_release", {
      p_app_id: appId,
      p_release_id: targetRelease.id,
    });

    if (rpcErr) {
      await adminClient
        .from("app_releases")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("app_id", appId)
        .eq("is_active", true);

      await adminClient
        .from("app_releases")
        .update({
          is_active: true,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetRelease.id);
    }

    // 4. Update permanent /raw/gpn-app vanity share link if appId is gpn and 0.0.0
    if (appId === "gpn" && targetRelease.version === "0.0.0") {
      await adminClient
        .from("share_links")
        .update({
          file_id: targetRelease.binary_file_id,
          is_active: true,
          expires_at: null,
        })
        .eq("slug", "gpn-app");

      if (targetRelease.signature_file_id) {
        await adminClient
          .from("share_links")
          .update({
            file_id: targetRelease.signature_file_id,
            is_active: true,
            expires_at: null,
          })
          .eq("slug", "gpn-app-sig");
      }
    }

    // 5. Invalidate Redis Caches
    if (redis) {
      try {
        await Promise.allSettled([
          redis.del(`release:${appId}:latest:manifest`),
          redis.del("gpn:release:latest:manifest"),
          redis.del("raw:meta:gpn-app"),
          redis.del("raw:meta:gpn-app-sig"),
          redis.del("share:gpn-app"),
          redis.del("share:gpn-app-sig"),
        ]);
      } catch {}
    }

    return NextResponse.json(
      {
        success: true,
        message: `Successfully rolled back active release for ${appId} to v${targetRelease.version}`,
        release: {
          id: targetRelease.id,
          app_id: appId,
          version: targetRelease.version,
          sha256: targetRelease.binary_sha256,
          byte_size: targetRelease.binary_byte_size,
          download_url: `/api/v1/releases/${appId}/download/${targetRelease.version}`,
          permanent_alias: appId === "gpn" ? "/raw/gpn-app" : undefined,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[Release Rollback Error]:", err);
    return NextResponse.json({ error: err.message || "Failed to rollback release" }, { status: 500 });
  }
}
