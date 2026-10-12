import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasPermission } from "@/lib/auth/api-keys";
import { isAuthoritativeAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getR2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { redis } from "@/lib/redis/client";

export const dynamic = "force-dynamic";

const MANIFEST_CACHE_KEY = "gpn:release:latest:manifest";
const APP_ID = "gpn";

export async function POST(req: NextRequest) {
  // 1. Authoritative Authentication & Authorization
  const authRes = await authenticateRequest(req);
  if ("errorResponse" in authRes) {
    return authRes.errorResponse;
  }
  const { auth } = authRes;

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
        .eq("app_id", APP_ID)
        .eq("version", cleanTarget)
        .maybeSingle();
      targetRelease = data;

      if (!targetRelease) {
        return NextResponse.json(
          { error: `Release version v${cleanTarget} not found in release history` },
          { status: 404 }
        );
      }
    } else {
      // Find immediate rollback target (most recent non-active release)
      const { data } = await adminClient
        .from("app_releases")
        .select("*")
        .eq("app_id", APP_ID)
        .eq("is_active", false)
        .eq("is_published", true)
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      targetRelease = data;
      if (!targetRelease) {
        return NextResponse.json(
          { error: "No previous published release available for rollback" },
          { status: 404 }
        );
      }
    }

    if (targetRelease.is_active) {
      return NextResponse.json(
        { error: `Release v${targetRelease.version} is already the active release` },
        { status: 400 }
      );
    }

    // 2. Physical Existence Check: Target binary MUST exist in R2
    try {
      const headRes = await r2Client.send(
        new HeadObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: targetRelease.binary_r2_key,
        })
      );
      if (!headRes.ContentLength || headRes.ContentLength <= 0) {
        return NextResponse.json(
          { error: `Target release binary in R2 is empty or corrupt for v${targetRelease.version}` },
          { status: 422 }
        );
      }
    } catch (headErr: any) {
      return NextResponse.json(
        {
          error: `Target release binary is physically missing from R2 storage for v${targetRelease.version}`,
          details: headErr?.message,
        },
        { status: 404 }
      );
    }

    // 3. Atomically Switch Active Release
    const { error: rpcErr } = await adminClient.rpc("publish_app_release", {
      p_app_id: APP_ID,
      p_release_id: targetRelease.id,
    });

    if (rpcErr) {
      // Fallback if migration 16 procedure is pending
      await adminClient
        .from("app_releases")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("app_id", APP_ID)
        .eq("is_active", true);

      await adminClient
        .from("app_releases")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", targetRelease.id);
    }

    // 4. Update permanent /raw/gpn-app vanity share link
    const { data: existingShare } = await adminClient
      .from("share_links")
      .select("id")
      .eq("slug", "gpn-app")
      .maybeSingle();

    if (existingShare) {
      await adminClient
        .from("share_links")
        .update({
          file_id: targetRelease.binary_file_id,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingShare.id);
    }

    // 5. Resilient Redis Cache Invalidation
    if (redis) {
      try {
        await redis.del(MANIFEST_CACHE_KEY);
      } catch (cacheErr) {
        console.warn("Failed to purge manifest Redis cache during rollback:", cacheErr);
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: `Successfully rolled back active GPN release to v${targetRelease.version}`,
        release: {
          id: targetRelease.id,
          version: targetRelease.version,
          app_id: APP_ID,
          is_active: true,
          sha256: targetRelease.binary_sha256,
          download_url: `/api/v1/releases/gpn/download/${targetRelease.version}`,
          permanent_alias: "/raw/gpn-app",
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[Release Rollback Error]:", err);
    return NextResponse.json({ error: err.message || "Failed to rollback release" }, { status: 500 });
  }
}
