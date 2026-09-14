import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApprovedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { completeR2MultipartUpload } from "@/lib/storage/r2";

export const dynamic = "force-dynamic";

const completeMultipartSchema = z.object({
  fileId: z.string().uuid(),
  uploadId: z.string().min(1),
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1).max(10000),
        eTag: z.string().min(1),
      })
    )
    .min(1),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Authoritative server check
    const { user } = await requireApprovedUser();

    // 2. Validate payload
    const body = await req.json().catch(() => ({}));
    const parseResult = completeMultipartSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid multipart completion parameters", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { fileId, uploadId, parts } = parseResult.data;

    // 3. PostgreSQL record validation & IDOR check
    const adminClient = createAdminClient();
    const { data: file, error: fileError } = await adminClient
      .from("files")
      .select("id, user_id, status, is_multipart, r2_key, r2_upload_id")
      .eq("id", fileId)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (file.user_id !== user.id) {
      return NextResponse.json({ error: "Access denied: not file owner" }, { status: 403 });
    }

    if (file.status !== "UPLOADING") {
      return NextResponse.json(
        { error: `Cannot complete multipart upload for file with status '${file.status}'` },
        { status: 409 }
      );
    }

    if (!file.is_multipart || file.r2_upload_id !== uploadId) {
      return NextResponse.json(
        { error: "Invalid multipart upload session credentials" },
        { status: 400 }
      );
    }

    // 4. Finalize assembled multipart upload in R2
    try {
      const eTag = await completeR2MultipartUpload(
        file.r2_key,
        uploadId,
        parts.map((p) => ({
          PartNumber: p.partNumber,
          ETag: p.eTag,
        }))
      );

      return NextResponse.json({
        success: true,
        eTag,
      });
    } catch (r2Err) {
      console.error("Failed to complete R2 multipart upload:", r2Err);
      return NextResponse.json(
        { error: "Failed to assemble multipart upload on storage provider" },
        { status: 502 }
      );
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (errorMsg.startsWith("ACCESS_DENIED")) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    console.error("Unhandled error in multipart complete:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
