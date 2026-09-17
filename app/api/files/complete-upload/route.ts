import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { requireApprovedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { headR2Object } from "@/lib/storage/r2";

import {
  EXPIRY_PRESET_VALUES,
  calculateExpiryDate,
} from "@/lib/storage/expiry";

export const dynamic = "force-dynamic";

const completeUploadSchema = z.object({
  fileId: z.string().uuid(),
  expiryPreset: z.enum(EXPIRY_PRESET_VALUES).optional(),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Authoritative authentication & approval check
    const { user, profile } = await requireApprovedUser();

    // 2. Validate request payload
    const body = await req.json().catch(() => ({}));
    const parseResult = completeUploadSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid completion parameters", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { fileId } = parseResult.data;

    // 3. PostgreSQL record lookup & IDOR validation
    const adminClient = createAdminClient();
    const { data: file, error: fileError } = await adminClient
      .from("files")
      .select("*")
      .eq("id", fileId)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (file.user_id !== user.id) {
      return NextResponse.json({ error: "Access denied: not file owner" }, { status: 403 });
    }

    // State machine check: only UPLOADING files can be completed
    if (file.status !== "UPLOADING") {
      return NextResponse.json(
        {
          error: `Cannot complete upload. Current file status is '${file.status}'.`,
          status: file.status,
        },
        { status: 409 }
      );
    }

    // 4. Server-Side Verification: HeadObject against Cloudflare R2
    // Never trust client's claimed size or completion state!
    const r2Head = await headR2Object(file.r2_key);
    if (!r2Head) {
      return NextResponse.json(
        {
          error: "Verification failed: file object not found in physical storage.",
          details: "Upload was not completed to the destination bucket.",
        },
        { status: 400 }
      );
    }

    const verifiedSize = r2Head.contentLength;
    const verifiedEtag = r2Head.eTag;

    // Validate size boundaries
    if (verifiedSize <= 0 || verifiedSize > 1073741824) {
      return NextResponse.json(
        { error: `Verified file size (${verifiedSize} bytes) violates system limits.` },
        { status: 400 }
      );
    }

    // Compute authoritative expiration timestamp
    const effectivePreset = parseResult.data.expiryPreset || file.expiry_preset;
    if (effectivePreset === "never" && profile.role !== "admin" && !profile.can_create_permanent) {
      return NextResponse.json(
        { error: "Unauthorized expiry preset" },
        { status: 403 }
      );
    }
    // If expires_at was already accurately pre-calculated at initiation and matches preset, preserve it, otherwise recalculate
    const expiresAt = file.expires_at && !parseResult.data.expiryPreset
      ? new Date(file.expires_at)
      : calculateExpiryDate(effectivePreset);

    // 5. Authoritative Quota Commit in PostgreSQL
    // Converts reserved_bytes to storage_used_bytes based on verified R2 object size
    const { error: commitQuotaError } = await adminClient.rpc("commit_upload_quota", {
      p_user_id: user.id,
      p_reserved_bytes: file.byte_size,
      p_actual_bytes: verifiedSize,
    });

    if (commitQuotaError) {
      console.error("Failed to commit quota during complete-upload:", commitQuotaError);
      return NextResponse.json(
        { error: "Database error committing quota reservation." },
        { status: 500 }
      );
    }

    // 6. Transition File State to ACTIVE
    const { data: updatedFile, error: updateError } = await adminClient
      .from("files")
      .update({
        status: "ACTIVE",
        byte_size: verifiedSize,
        r2_etag: verifiedEtag,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fileId)
      .select("id, sanitized_name, byte_size, mime_type, status, expires_at, created_at")
      .single();

    if (updateError || !updatedFile) {
      console.error("Failed to update file status to ACTIVE:", updateError);
      return NextResponse.json(
        { error: "Failed to mark file as active" },
        { status: 500 }
      );
    }

    // 7. Insert Audit Log (Non-blocking via after())
    try {
      after(async () => {
        await adminClient.from("audit_logs").insert({
          actor_id: user.id,
          event_type: "FILE_UPLOAD_COMPLETED",
          resource_type: "file",
          resource_id: fileId,
          ip_hash: "server_authoritative",
          metadata: {
            filename: file.sanitized_name,
            byte_size: verifiedSize,
            is_multipart: file.is_multipart,
            expiry_preset: file.expiry_preset,
          },
        });
      });
    } catch {
      // Fallback non-blocking async execution
      void (async () => {
        try {
          await adminClient.from("audit_logs").insert({
            actor_id: user.id,
            event_type: "FILE_UPLOAD_COMPLETED",
            resource_type: "file",
            resource_id: fileId,
            ip_hash: "server_authoritative",
            metadata: {
              filename: file.sanitized_name,
              byte_size: verifiedSize,
              is_multipart: file.is_multipart,
              expiry_preset: file.expiry_preset,
            },
          });
        } catch {}
      })();
    }

    return NextResponse.json({
      success: true,
      file: updatedFile,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (errorMsg.startsWith("ACCESS_DENIED")) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    console.error("Unhandled error in complete-upload:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
