import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getR2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { redis } from "@/lib/redis/client";

export const dynamic = "force-dynamic";

const MANIFEST_CACHE_KEY = "gpn:release:latest:manifest";
const CACHE_TTL_SECONDS = 15; // Short 15s TTL prevents indefinite stale state on Redis desync

/**
 * GET /api/v1/releases/gpn/latest
 * Automated release update endpoint for Gaurav Personal Notes (GPN).
 * Fully compliant with Tauri v2 autoupdater specifications.
 * 
 * Guarantees:
 * 1. Reads atomically published active release from public.app_releases
 * 2. Emits immutable, version-specific download URLs for updater reliability
 * 3. Cache invalidation is resilient: Redis failures fall back directly to DB
 * 4. Cache-Control headers strictly prevent edge/proxy caching
 */
export async function GET(req: NextRequest) {
  try {
    const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const forwardedProto =
      req.headers.get("x-forwarded-proto") || (forwardedHost?.startsWith("localhost") ? "http" : "https");
    const origin = forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : process.env.NEXT_PUBLIC_APP_URL || "https://gphost.eu.cc";

    // 1. Resilient Redis Cache Check (short 15s TTL)
    if (redis) {
      try {
        const cached = await redis.get<any>(MANIFEST_CACHE_KEY);
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
        // Non-fatal: Transparently fall back to authoritative DB read
        console.warn("[GPN Manifest Cache] Redis read failed, falling back to DB:", cacheErr);
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
            id, sanitized_name, filename, byte_size, sha256
          )
        `)
        .eq("app_id", "gpn")
        .eq("is_active", true)
        .maybeSingle();

      if (!error && data) {
        activeRelease = data;
      }
    } catch {
      // Schema fallback if table query fails
    }

    // 3. Fallback to Legacy share_links if app_releases has no active record
    if (!activeRelease) {
      const { data: binShare } = await adminClient
        .from("share_links")
        .select(`
          id, slug, is_active,
          file:files (
            id, sanitized_name, filename, byte_size, sha256, updated_at, created_at, r2_key
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
          { error: "No active GPN binary release available" },
          {
            status: 404,
            headers: {
              "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
            },
          }
        );
      }

      // Legacy signature lookup
      const { data: sigShare } = await adminClient
        .from("share_links")
        .select(`
          id, slug, is_active,
          file:files (id, sanitized_name, r2_key)
        `)
        .eq("slug", "gpn-app-sig")
        .eq("is_active", true)
        .maybeSingle();

      const sigFile = sigShare?.file
        ? Array.isArray(sigShare.file)
          ? sigShare.file[0]
          : sigShare.file
        : null;
      let signatureString = "";

      if (sigFile && (sigFile as any).r2_key) {
        try {
          const r2Client = getR2Client();
          const s3Res = await r2Client.send(
            new GetObjectCommand({
              Bucket: R2_BUCKET_NAME,
              Key: (sigFile as any).r2_key,
            })
          );
          if (s3Res.Body) {
            const sigBytes = await (s3Res.Body as any).transformToByteArray();
            signatureString = Buffer.from(sigBytes).toString("utf8").trim();
          }
        } catch (sigErr) {
          console.warn("Could not retrieve signature text:", sigErr);
        }
      }

      const rawName = (binFile as any).sanitized_name || (binFile as any).filename || "";
      const versionMatch = rawName.match(/(\d+\.\d+\.\d+)/);
      const version = versionMatch ? versionMatch[1] : "1.0.0";

      const legacyImmutableUrl = `${origin}/api/v1/releases/gpn/download/${version}`;
      const permanentDownloadUrl = `${origin}/raw/gpn-app`;

      const legacyManifest = {
        version,
        notes: `Gaurav Personal Notes update v${version}`,
        pub_date: (binFile as any).updated_at || (binFile as any).created_at || new Date().toISOString(),
        platforms: {
          "windows-x86_64": {
            signature: signatureString,
            url: legacyImmutableUrl,
          },
        },
        file: {
          name: rawName,
          size: (binFile as any).byte_size,
          sha256: (binFile as any).sha256 || null,
          url: legacyImmutableUrl,
          permanent_alias: permanentDownloadUrl,
        },
      };

      return NextResponse.json(legacyManifest, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
          "Access-Control-Allow-Origin": "*",
          "X-Manifest-Source": "legacy-fallback",
        },
      });
    }

    // 4. Construct Manifest from Atomic app_releases Record
    const version = activeRelease.version;
    const rawFile = activeRelease.binary_file
      ? Array.isArray(activeRelease.binary_file)
        ? activeRelease.binary_file[0]
        : activeRelease.binary_file
      : null;

    const fileName = rawFile?.sanitized_name || rawFile?.filename || `gpn-setup-${version}.exe`;
    const immutableDownloadUrl = `${origin}/api/v1/releases/gpn/download/${version}`;
    const permanentVanityUrl = `${origin}/raw/gpn-app`;

    const manifest = {
      version,
      notes: activeRelease.release_notes || `Gaurav Personal Notes update v${version}`,
      pub_date: activeRelease.published_at || activeRelease.created_at || new Date().toISOString(),
      platforms: {
        "windows-x86_64": {
          signature: activeRelease.signature_text || "",
          url: immutableDownloadUrl, // Immutable version-specific download URL (Requirement 8)
        },
      },
      file: {
        name: fileName,
        size: activeRelease.binary_byte_size,
        sha256: activeRelease.binary_sha256,
        url: immutableDownloadUrl,
        permanent_alias: permanentVanityUrl,
      },
    };

    // 5. Cache in Redis with short 15s TTL
    if (redis) {
      try {
        await redis.set(MANIFEST_CACHE_KEY, manifest, { ex: CACHE_TTL_SECONDS });
      } catch (cacheSetErr) {
        console.warn("[GPN Manifest Cache] Redis write failed:", cacheSetErr);
      }
    }

    return NextResponse.json(manifest, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
        "Access-Control-Allow-Origin": "*",
        "X-Manifest-Source": "authoritative-db",
      },
    });
  } catch (err: unknown) {
    console.error("[GPN Latest Release] Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
