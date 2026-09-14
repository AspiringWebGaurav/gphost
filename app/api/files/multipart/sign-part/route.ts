import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApprovedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { multipartSignRatelimit } from "@/lib/redis/ratelimit";
import { createPresignedPartUrl } from "@/lib/storage/r2";

export const dynamic = "force-dynamic";

const signPartSchema = z.object({
  fileId: z.string().uuid(),
  uploadId: z.string().min(1),
  partNumber: z.number().int().min(1).max(10000),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Authoritative authentication & approval check
    const { user } = await requireApprovedUser();

    // 2. Ephemeral rate limiting
    const { success: rateLimitOk } = await multipartSignRatelimit.limit(user.id);
    if (!rateLimitOk) {
      return NextResponse.json(
        { error: "Too many part-signing requests. Please throttle your upload." },
        { status: 429 }
      );
    }

    // 3. Schema validation
    const body = await req.json().catch(() => ({}));
    const parseResult = signPartSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid part signing parameters", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { fileId, uploadId, partNumber } = parseResult.data;

    // 4. Authoritative file ownership and state verification in PostgreSQL
    const adminClient = createAdminClient();
    const { data: file, error: fileError } = await adminClient
      .from("files")
      .select("id, user_id, status, is_multipart, r2_key, r2_upload_id")
      .eq("id", fileId)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // IDOR protection: only owner can sign parts
    if (file.user_id !== user.id) {
      return NextResponse.json({ error: "Access denied: not file owner" }, { status: 403 });
    }

    // State machine check: must be actively UPLOADING
    if (file.status !== "UPLOADING") {
      return NextResponse.json(
        { error: `Cannot sign parts for file with status '${file.status}'` },
        { status: 409 }
      );
    }

    if (!file.is_multipart || file.r2_upload_id !== uploadId) {
      return NextResponse.json(
        { error: "Invalid multipart upload session credentials" },
        { status: 400 }
      );
    }

    // 5. Generate presigned URL for the specific part
    const presignedUrl = await createPresignedPartUrl(
      file.r2_key,
      uploadId,
      partNumber,
      900 // 15 mins
    );

    return NextResponse.json({
      presignedUrl,
      partNumber,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (errorMsg.startsWith("ACCESS_DENIED")) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    console.error("Unhandled error in multipart sign-part:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
