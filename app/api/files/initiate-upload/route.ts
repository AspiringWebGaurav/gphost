import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApprovedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadInitiateRatelimit } from "@/lib/redis/ratelimit";
import { sanitizeFilename } from "@/lib/storage/sanitizer";
import {
  generateR2ObjectKey,
  createPresignedPutUrl,
  initiateR2MultipartUpload,
  abortR2MultipartUpload,
} from "@/lib/storage/r2";

import {
  EXPIRY_PRESET_VALUES,
  calculateExpiryDate,
  getLegacyEnumFallback,
} from "@/lib/storage/expiry";

export const dynamic = "force-dynamic";

const MULTIPART_THRESHOLD_BYTES = 100 * 1024 * 1024; // 100 MB
export const MULTIPART_PART_SIZE = 10 * 1024 * 1024; // 10 MB

const initiateUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  byte_size: z.number().int().positive().max(1073741824), // Max 1 GB
  mime_type: z.string().max(128).optional().default("application/octet-stream"),
  expiry_preset: z.enum(EXPIRY_PRESET_VALUES).default("30d"),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Authoritative server-side authentication & approval check
    const { user, profile } = await requireApprovedUser();

    // 2. Ephemeral rate limiting
    const { success: rateLimitOk } = await uploadInitiateRatelimit.limit(user.id);
    if (!rateLimitOk) {
      return NextResponse.json(
        { error: "Too many upload requests. Please wait before starting new uploads." },
        { status: 429 }
      );
    }

    // 3. Request payload validation
    const body = await req.json().catch(() => ({}));
    const parseResult = initiateUploadSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid upload request parameters", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { filename, byte_size, mime_type, expiry_preset } = parseResult.data;

    // 4. Expiry preset authorization: 'never' requires admin or can_create_permanent
    if (expiry_preset === "never" && profile.role !== "admin" && !profile.can_create_permanent) {
      return NextResponse.json(
        { error: "Your account is not permitted to create permanent (never-expiring) files." },
        { status: 403 }
      );
    }

    // 5. Authoritative Quota Reservation in PostgreSQL
    const adminClient = createAdminClient();
    const { data: quotaReserved, error: quotaError } = await adminClient.rpc(
      "reserve_user_quota",
      {
        p_user_id: user.id,
        p_requested_bytes: byte_size,
      }
    );

    if (quotaError) {
      console.error("Quota reservation error:", quotaError);
      return NextResponse.json(
        { error: "Unable to verify quota admission. Please try again." },
        { status: 500 }
      );
    }

    if (!quotaReserved) {
      return NextResponse.json(
        {
          error: "Quota exceeded",
          message: "You do not have enough remaining storage quota for this upload.",
        },
        { status: 413 }
      );
    }

    // 6. Generate server-authoritative sanitized filename & unpredictable R2 object key
    const sanitizedName = sanitizeFilename(filename);
    const r2Key = generateR2ObjectKey(user.id, sanitizedName);

    // 7. Determine single-part vs multipart upload pipeline
    const isMultipart = byte_size >= MULTIPART_THRESHOLD_BYTES;

    if (isMultipart) {
      let r2UploadId: string;
      try {
        r2UploadId = await initiateR2MultipartUpload(r2Key, mime_type);
      } catch (r2Err) {
        console.error("Failed to initiate R2 multipart upload:", r2Err);
        // Release quota reservation on failure
        await adminClient.rpc("release_quota_reservation", {
          p_user_id: user.id,
          p_reserved_bytes: byte_size,
        });
        return NextResponse.json(
          { error: "Failed to initialize storage destination. Please try again." },
          { status: 502 }
        );
      }

      // Pre-calculate exact target expiration timestamp
      const targetExpiresAt = calculateExpiryDate(expiry_preset);

      const insertFileRecord = async (isMultipart: boolean, uploadId?: string) => {
        const payload: Record<string, unknown> = {
          user_id: user.id,
          filename,
          sanitized_name: sanitizedName,
          mime_type,
          byte_size,
          r2_key: r2Key,
          status: "UPLOADING",
          expiry_preset,
          expires_at: targetExpiresAt?.toISOString() || null,
          is_multipart: isMultipart,
        };
        if (isMultipart && uploadId) {
          payload.r2_upload_id = uploadId;
        }

        let res = await adminClient
          .from("files")
          .insert(payload)
          .select("id, sanitized_name, byte_size, mime_type, expiry_preset, status, created_at")
          .single();

        // Graceful DB Enum Fallback: if database hasn't had migration 009 applied yet,
        // fallback to legacy enum value for the column while keeping the exact expires_at timestamp!
        if (res.error && (res.error.code === "22P02" || res.error.message?.includes("enum"))) {
          payload.expiry_preset = getLegacyEnumFallback(expiry_preset);
          res = await adminClient
            .from("files")
            .insert(payload)
            .select("id, sanitized_name, byte_size, mime_type, expiry_preset, status, created_at")
            .single();
        }

        return res;
      };

      // Record in public.files
      const { data: fileRecord, error: insertError } = await insertFileRecord(true, r2UploadId);

      if (insertError || !fileRecord) {
        console.error("Failed to create file record:", insertError);
        // Rollback: abort multipart and release quota
        await abortR2MultipartUpload(r2Key, r2UploadId).catch(() => {});
        await adminClient.rpc("release_quota_reservation", {
          p_user_id: user.id,
          p_reserved_bytes: byte_size,
        });
        return NextResponse.json(
          { error: "Database error initializing file record" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        fileId: fileRecord.id,
        uploadType: "multipart" as const,
        uploadId: r2UploadId,
        partSize: MULTIPART_PART_SIZE,
        filename: sanitizedName,
      });
    } else {
      // Single-part upload
      let presignedUrl: string;
      try {
        presignedUrl = await createPresignedPutUrl(r2Key, mime_type, 900); // 15 mins
      } catch (r2Err) {
        console.error("Failed to generate presigned PUT URL:", r2Err);
        await adminClient.rpc("release_quota_reservation", {
          p_user_id: user.id,
          p_reserved_bytes: byte_size,
        });
        return NextResponse.json(
          { error: "Failed to create secure upload link" },
          { status: 502 }
        );
      }

      const targetExpiresAt = calculateExpiryDate(expiry_preset);
      const payload: Record<string, unknown> = {
        user_id: user.id,
        filename,
        sanitized_name: sanitizedName,
        mime_type,
        byte_size,
        r2_key: r2Key,
        status: "UPLOADING",
        expiry_preset,
        expires_at: targetExpiresAt?.toISOString() || null,
        is_multipart: false,
      };

      let res = await adminClient
        .from("files")
        .insert(payload)
        .select("id, sanitized_name, byte_size, mime_type, expiry_preset, status, created_at")
        .single();

      if (res.error && (res.error.code === "22P02" || res.error.message?.includes("enum"))) {
        payload.expiry_preset = getLegacyEnumFallback(expiry_preset);
        res = await adminClient
          .from("files")
          .insert(payload)
          .select("id, sanitized_name, byte_size, mime_type, expiry_preset, status, created_at")
          .single();
      }

      const fileRecord = res.data;
      const insertError = res.error;

      if (insertError || !fileRecord) {
        console.error("Failed to create file record:", insertError);
        await adminClient.rpc("release_quota_reservation", {
          p_user_id: user.id,
          p_reserved_bytes: byte_size,
        });
        return NextResponse.json(
          { error: "Database error initializing file record" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        fileId: fileRecord.id,
        uploadType: "single" as const,
        presignedUrl,
        filename: sanitizedName,
      });
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (errorMsg.startsWith("ACCESS_DENIED")) {
      return NextResponse.json({ error: "Access denied. Account not approved." }, { status: 403 });
    }
    console.error("Unhandled error in initiate-upload:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
