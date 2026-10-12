import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getR2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/releases/gpn/download/[version]
 * Serves an immutable, version-specific GPN binary download.
 * Ensures clients downloading an update never experience a shifting artifact mid-stream.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ version: string }> }
) {
  try {
    const { version } = await context.params;
    if (!version) {
      return NextResponse.json({ error: "Version parameter missing" }, { status: 400 });
    }

    const cleanVersion = version.trim().replace(/^v/, "");
    const adminClient = createAdminClient();

    // 1. Look up release record
    let binaryR2Key = "";
    let binaryByteSize = 0;
    let fileName = `gpn-setup-${cleanVersion}.exe`;

    const { data: release } = await adminClient
      .from("app_releases")
      .select(`
        id, version, binary_r2_key, binary_byte_size,
        binary_file:files!app_releases_binary_file_id_fkey (
          id, sanitized_name, filename, byte_size, r2_key
        )
      `)
      .eq("app_id", "gpn")
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
        { error: `Release binary for version v${cleanVersion} not found` },
        { status: 404 }
      );
    }

    const r2Client = getR2Client();

    // 2. Fetch object from R2
    const getRes = await r2Client.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: binaryR2Key,
      })
    );

    if (!getRes.Body) {
      return NextResponse.json({ error: "Storage object empty" }, { status: 404 });
    }

    const stream = (getRes.Body as any).transformToWebStream();
    const asciiFilename = fileName.replace(/["\\]/g, "_").replace(/[^\x20-\x7E]/g, "_");
    const encodedFilename = encodeURIComponent(fileName);

    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.microsoft.portable-executable",
        "Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`,
        ...(getRes.ContentLength ? { "Content-Length": String(getRes.ContentLength) } : {}),
        ...(getRes.ETag ? { ETag: getRes.ETag } : {}),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err: unknown) {
    console.error("[GPN Version Download Error]:", err);
    return NextResponse.json({ error: "Failed to download release binary" }, { status: 500 });
  }
}
