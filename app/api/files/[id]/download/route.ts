import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApprovedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPresignedGetUrl } from "@/lib/storage/r2";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, profile } = await requireApprovedUser();
    const { id: fileId } = await params;

    const parseId = idSchema.safeParse(fileId);
    if (!parseId.success) {
      return NextResponse.json({ error: "Invalid file ID format" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: file, error: fileErr } = await adminClient
      .from("files")
      .select("id, user_id, sanitized_name, r2_key, status, byte_size, mime_type")
      .eq("id", fileId)
      .single();

    if (fileErr || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const isOwner = file.user_id === user.id;
    const isAdmin = profile.role === "admin";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Access denied: not file owner" }, { status: 403 });
    }

    if (file.status === "PURGED") {
      return NextResponse.json(
        { error: "File has been permanently purged from storage." },
        { status: 410 }
      );
    }

    // Generate short-lived presigned download URL directly from Cloudflare R2 (50-second TTL)
    const downloadUrl = await createPresignedGetUrl(
      file.r2_key,
      file.sanitized_name,
      50,
      file.mime_type
    );

    const shouldRedirect = req.nextUrl.searchParams.get("redirect") === "true";
    if (shouldRedirect) {
      return NextResponse.redirect(downloadUrl, { status: 302 });
    }

    return NextResponse.json({
      success: true,
      downloadUrl,
      filename: file.sanitized_name,
      byte_size: file.byte_size,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (errorMsg.startsWith("ACCESS_DENIED")) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    console.error("Unhandled error in GET /api/files/[id]/download:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
