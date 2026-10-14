import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, markFileApiAccessed } from "@/lib/auth/api-keys";
import { createAdminClient } from "@/lib/supabase/admin";
import { getR2Client, R2_BUCKET_NAME, headR2Object } from "@/lib/storage/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

/**
 * GET /api/v1/files/[id]/download
 * Enables the API key owner to stream/download their file directly via API
 * without requiring public share links or browser sessions.
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

    // Verify ownership and active status
    const { data: file, error: fileErr } = await adminClient
      .from("files")
      .select("id, user_id, filename, sanitized_name, byte_size, mime_type, r2_key, status, sha256")
      .eq("id", fileId)
      .eq("user_id", userId)
      .single();

    if (fileErr || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (file.status === "PURGED") {
      return NextResponse.json({ error: "File has been purged from physical storage" }, { status: 410 });
    }

    // Mark file as API-accessed
    void markFileApiAccessed(userId, file.id);

    // Verify physical accessibility in Cloudflare R2
    const r2Meta = await headR2Object(file.r2_key);
    if (!r2Meta) {
      return NextResponse.json({ error: "File object not found in physical storage" }, { status: 404 });
    }

    const asciiName = (file.sanitized_name || file.filename || "download.bin")
      .replace(/["\\]/g, "_")
      .replace(/[^\x20-\x7E]/g, "_");

    // Offload direct download bandwidth to Cloudflare R2 (Zero Vercel Fast Origin Transfer)
    const shouldStream = req.nextUrl.searchParams.get("stream") === "true";
    if (!shouldStream) {
      const { createPresignedGetUrl } = await import("@/lib/storage/r2");
      const presignedUrl = await createPresignedGetUrl(file.r2_key, asciiName, 300, file.mime_type);
      return NextResponse.redirect(presignedUrl, {
        status: 307,
        headers: {
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const rangeHeader = req.headers.get("range");
    const r2Client = getR2Client();

    const getCmd = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: file.r2_key,
      ...(rangeHeader ? { Range: rangeHeader } : {}),
    });

    const s3Res = await r2Client.send(getCmd);
    if (!s3Res.Body) {
      return NextResponse.json({ error: "Storage stream unavailable" }, { status: 502 });
    }

    const headers = new Headers();
    const utf8Name = encodeURIComponent(file.sanitized_name || file.filename || "download.bin");

    headers.set("Content-Type", file.mime_type || "application/octet-stream");
    headers.set("Content-Disposition", `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");

    if (file.sha256) {
      headers.set("x-content-sha256", file.sha256);
    }
    if (s3Res.ContentRange) {
      headers.set("Content-Range", s3Res.ContentRange);
    }
    if (s3Res.ContentLength !== undefined) {
      headers.set("Content-Length", String(s3Res.ContentLength));
    }
    if (s3Res.ETag) {
      headers.set("ETag", s3Res.ETag.replace(/^"|"$/g, ""));
    }

    const bodyStream =
      typeof (s3Res.Body as any).transformToWebStream === "function"
        ? (s3Res.Body as any).transformToWebStream()
        : (s3Res.Body as unknown as ReadableStream);

    return new NextResponse(bodyStream, {
      status: s3Res.ContentRange ? 206 : 200,
      headers,
    });
  } catch (err: unknown) {
    console.error("[v1 Files Download GET] Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
