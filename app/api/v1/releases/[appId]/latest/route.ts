import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getR2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { redis } from "@/lib/redis/client";

export const dynamic = "force-dynamic";

const CACHE_TTL_SECONDS = 15;

/**
 * GET /api/v1/releases/[appId]/latest
 * Automated release update endpoint for any desktop or mobile app.
 * Fully compliant with Tauri v2 autoupdater specifications.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ appId: string }> }
) {
  try {
    const { appId: rawAppId } = await context.params;
    const appId = rawAppId?.trim().toLowerCase();
    if (!appId || !/^[a-z0-9.\-_+]+$/.test(appId)) {
      return NextResponse.json({ error: "Invalid or missing 'appId' parameter" }, { status: 400 });
    }

    const manifestCacheKey = `release:${appId}:latest:manifest`;
    const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const forwardedProto =
      req.headers.get("x-forwarded-proto") || (forwardedHost?.startsWith("localhost") ? "http" : "https");
    const origin = forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : process.env.NEXT_PUBLIC_APP_URL || "https://gphost.eu.cc";

    // 1. Resilient Redis Cache Check (short 15s TTL)
    if (redis) {
      try {
        let cached = await redis.get<any>(manifestCacheKey);
        if (!cached && appId === "gpn") {
          cached = await redis.get<any>("gpn:release:latest:manifest");
        }
        if (cached && typeof cached === "object" && cached.version) {
          return NextResponse.json(cached, {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
              "Access-Control-Allow-Origin": "*",
              "X-Manifest-Source": "cache",
            },
          });
        }
      } catch (cacheErr) {
        console.warn(`[${appId} Manifest Cache] Redis read failed, falling back to DB:`, cacheErr);
      }
    }

    const adminClient = createAdminClient();

    // 2. Query Atomic Active Release from public.app_releases
    let activeRelease: any = null;
    try {
      const { data, error } = await adminClient
        .from("app_releases")
        .select(`
          id, version, release_notes, signature_text, binary_sha256, binary_byte_size,
          published_at, created_at, binary_r2_key,
          binary_file:files!app_releases_binary_file_id_fkey (
            id, sanitized_name, filename, byte_size
          )
        `)
        .eq("app_id", appId)
        .eq("is_active", true)
        .maybeSingle();

      if (!error && data) {
        activeRelease = data;
      }
    } catch {
      // Schema fallback if table query fails
    }

    // 3. Fallback for GPN legacy share_links if app_releases has no active record
    if (!activeRelease && appId === "gpn") {
      const { data: binShare } = await adminClient
        .from("share_links")
        .select(`
          id, slug, is_active,
          file:files (
            id, sanitized_name, filename, byte_size, updated_at, created_at, r2_key
          )
        `)
        .eq("slug", "gpn-app")
        .eq("is_active", true)
        .maybeSingle();

      const binFile = binShare?.file
        ? Array.isArray(binShare.file)
          ? binShare.file[0]
          : binShare.file
        : null;

      if (!binFile) {
        return NextResponse.json(
          { error: `No active release available for ${appId}` },
          { status: 404 }
        );
      }

      // Read fallback signature from R2 if present
      const { data: sigShare } = await adminClient
        .from("share_links")
        .select("file:files ( r2_key )")
        .eq("slug", "gpn-app-sig")
        .eq("is_active", true)
        .maybeSingle();

      const sigFile = sigShare?.file
        ? Array.isArray(sigShare.file)
          ? sigShare.file[0]
          : sigShare.file
        : null;

      let signature = "";
      if (sigFile?.r2_key) {
        try {
          const r2Client = getR2Client();
          const sigRes = await r2Client.send(
            new GetObjectCommand({
              Bucket: R2_BUCKET_NAME,
              Key: sigFile.r2_key,
            })
          );
          if (sigRes.Body) {
            const bytes = await (sigRes.Body as any).transformToByteArray();
            signature = Buffer.from(bytes).toString("utf-8").trim();
          }
        } catch {}
      }

      const match = (binFile.sanitized_name || binFile.filename || "").match(/(\d+\.\d+\.\d+)/);
      const rawVersion = match ? match[1] : "0.0.0";

      activeRelease = {
        version: rawVersion,
        release_notes: "Initial Release",
        signature_text: signature,
        published_at: binFile.updated_at || binFile.created_at || new Date().toISOString(),
        binary_file: binFile,
      };
    }

    if (!activeRelease) {
      return NextResponse.json(
        { error: `No active release available for ${appId}` },
        { status: 404 }
      );
    }

    // Clean signature string: extract single-line Base64 for Tauri v2 compatibility
    let cleanSignature = (activeRelease.signature_text || "").trim();
    if (cleanSignature.includes("\n")) {
      const lines = cleanSignature
        .split("\n")
        .map((l: string) => l.trim())
        .filter(Boolean);
      cleanSignature = lines[lines.length - 1];
    }

    const versionStr = activeRelease.version.startsWith("v")
      ? activeRelease.version
      : `v${activeRelease.version}`;
    const cleanVersion = activeRelease.version.replace(/^v/, "");

    // 4. Build Tauri v2 Manifest
    const downloadUrl = `${origin}/api/v1/releases/${appId}/download/${cleanVersion}`;

    const manifest = {
      version: versionStr,
      notes: activeRelease.release_notes || `${appId} update ${versionStr}`,
      pub_date: activeRelease.published_at || new Date().toISOString(),
      platforms: {
        "windows-x86_64": {
          signature: cleanSignature,
          url: downloadUrl,
        },
        "linux-x86_64": {
          signature: cleanSignature,
          url: downloadUrl,
        },
        "darwin-x86_64": {
          signature: cleanSignature,
          url: downloadUrl,
        },
        "darwin-aarch64": {
          signature: cleanSignature,
          url: downloadUrl,
        },
      },
    };

    // 5. Cache manifest in Redis with short 15s TTL
    if (redis) {
      try {
        await redis.set(manifestCacheKey, manifest, { ex: CACHE_TTL_SECONDS });
      } catch (cacheErr) {
        console.warn(`[${appId} Manifest Cache] Redis write failed:`, cacheErr);
      }
    }

    return NextResponse.json(manifest, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
        "Access-Control-Allow-Origin": "*",
        "X-Manifest-Source": "database",
      },
    });
  } catch (err: any) {
    console.error("[Release Latest Manifest Error]:", err);
    return NextResponse.json(
      { error: "Internal Server Error fetching release manifest", details: err.message },
      { status: 500 }
    );
  }
}
