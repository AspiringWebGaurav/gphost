import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getR2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/releases/[appId]/download/[version]
 * Serves an immutable, version-specific binary download for any app.
 * Ensures clients downloading an update never experience a shifting artifact mid-stream.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ appId: string; version: string }> }
) {
  try {
    const { appId: rawAppId, version: rawVersion } = await context.params;
    const appId = rawAppId?.trim().toLowerCase();
    if (!appId || !/^[a-z0-9.\-_+]+$/.test(appId)) {
      return NextResponse.json({ error: "Invalid or missing 'appId' parameter" }, { status: 400 });
    }

    if (!rawVersion) {
      return NextResponse.json({ error: "Version parameter missing" }, { status: 400 });
    }

    const cleanVersion = rawVersion.trim().replace(/^v/, "");
    const adminClient = createAdminClient();

    // 1. Look up release record
    let binaryR2Key = "";
    let binaryByteSize = 0;
    let fileName = `${appId}-setup-${cleanVersion}.exe`;

    const { data: release } = await adminClient
      .from("app_releases")
      .select(`
        id, version, binary_r2_key, binary_byte_size,
        binary_file:files!app_releases_binary_file_id_fkey (
          id, sanitized_name, filename, byte_size, r2_key
        )
      `)
      .eq("app_id", appId)
      .eq("version", cleanVersion)
      .maybeSingle();

    if (release) {
      binaryR2Key = release.binary_r2_key;
      binaryByteSize = release.binary_byte_size;
      const fileRecord = release.binary_file
        ? Array.isArray(release.binary_file)
          ? release.binary_file[0]
          : release.binary_file
        : null;
      if (fileRecord?.sanitized_name || fileRecord?.filename) {
        fileName = fileRecord.sanitized_name || fileRecord.filename;
      }
    } else {
      // Fallback: Check if file with matching version exists in files
      const { data: fallbackFile } = await adminClient
        .from("files")
        .select("id, sanitized_name, filename, byte_size, r2_key")
        .ilike("sanitized_name", `%${cleanVersion}%`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fallbackFile) {
        binaryR2Key = fallbackFile.r2_key;
        binaryByteSize = fallbackFile.byte_size;
        fileName = fallbackFile.sanitized_name || fallbackFile.filename;
      }
    }

    if (!binaryR2Key) {
      return NextResponse.json(
        { error: `Release binary for ${appId} version v${cleanVersion} not found` },
        { status: 404 }
      );
    }

    // 2. Offload download bandwidth to Cloudflare R2 Edge (Zero Vercel Fast Origin Transfer)
    const shouldStream = req.nextUrl.searchParams.get("stream") === "true";
    if (!shouldStream) {
      const { createPresignedGetUrl } = await import("@/lib/storage/r2");
      const presignedUrl = await createPresignedGetUrl(binaryR2Key, fileName, 3600);
      return NextResponse.redirect(presignedUrl, {
        status: 307,
        headers: {
          "Cache-Control": "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const r2Client = getR2Client();

    // Fallback: Direct serverless streaming only when explicitly requested via ?stream=true
    const getRes = await r2Client.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: binaryR2Key,
      })
    );

    if (!getRes.Body) {
      return NextResponse.json({ error: "Storage object stream missing" }, { status: 502 });
    }

    const stream = getRes.Body.transformToWebStream();
    const headers = new Headers();
    headers.set("Content-Type", getRes.ContentType || "application/octet-stream");
    headers.set("Content-Disposition", `attachment; filename="${fileName}"`);
    if (binaryByteSize > 0) {
      headers.set("Content-Length", String(binaryByteSize));
    } else if (getRes.ContentLength) {
      headers.set("Content-Length", String(getRes.ContentLength));
    }

    headers.set("Cache-Control", "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400");
    headers.set("Access-Control-Allow-Origin", "*");

    return new NextResponse(stream as any, {
      status: 200,
      headers,
    });
  } catch (err: any) {
    console.error("[Release Version Download Error]:", err);
    return NextResponse.json(
      { error: "Failed to stream release binary", details: err.message },
      { status: 500 }
    );
  }
}
