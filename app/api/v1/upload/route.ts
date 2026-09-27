import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { validateApiKey } from "@/lib/auth/api-keys";
import { createAdminClient } from "@/lib/supabase/admin";
import { getR2Client, R2_BUCKET_NAME, generateR2ObjectKey, createPresignedPutUrl } from "@/lib/storage/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { sanitizeFilename } from "@/lib/storage/sanitizer";
import { getUserMaxFiles } from "@/lib/storage/user-limits";
import { calculateExpiryDate, EXPIRY_PRESET_VALUES } from "@/lib/storage/expiry";
import { cliUploadRatelimit } from "@/lib/redis/ratelimit";
import {
  validateUploadSecurity,
  verifyContentIntegrity,
  getSecurityHeaders,
} from "@/lib/security/file-guard";

export const dynamic = "force-dynamic";

// Hard ceiling for direct serverless payload on Vercel Hobby
const DIRECT_UPLOAD_MAX_BYTES = 4.5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    // 1. Authoritative API Key Extraction & Verification
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return NextResponse.json(
        {
          error: "Unauthorized: Missing API key",
          hint: "Pass your API key as: Authorization: Bearer gp_live_...",
        },
        { status: 401, headers: getSecurityHeaders() }
      );
    }

    const auth = await validateApiKey(token);
    if (!auth) {
      return NextResponse.json(
        {
          error: "Unauthorized: Invalid or revoked API key",
          hint: "Ensure your API key is active in Dashboard -> Settings -> API Keys.",
        },
        { status: 401, headers: getSecurityHeaders() }
      );
    }

    const { userId } = auth;

    // 2. Anti-DDoS & Flood Protection: Rate Limit per API Key / User
    const { success: rateLimitOk } = await cliUploadRatelimit.limit(`cli:${userId}`);
    if (!rateLimitOk) {
      return NextResponse.json(
        {
          error: "Too Many Requests",
          message: "CLI upload rate limit reached (maximum 60 uploads per minute). Please slow down.",
          retryAfter: 60,
        },
        {
          status: 429,
          headers: {
            "Retry-After": "60",
            ...getSecurityHeaders(),
          },
        }
      );
    }

    const adminClient = createAdminClient();

    // Check active file count quota
    const maxFiles = await getUserMaxFiles(userId);
    if (maxFiles !== null && maxFiles > 0) {
      const { count, error: countErr } = await adminClient
        .from("files")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "ACTIVE");

      if (!countErr && (count ?? 0) >= maxFiles) {
        return NextResponse.json(
          {
            error: "File upload quota exceeded",
            message: `Your account limit is ${maxFiles} active file${maxFiles === 1 ? "" : "s"}.`,
          },
          { status: 403, headers: getSecurityHeaders() }
        );
      }
    }

    const contentType = req.headers.get("content-type") || "";

    // DYNAMIC DETECTED ORIGIN
    const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const origin = forwardedHost ? `https://${forwardedHost}` : (process.env.NEXT_PUBLIC_APP_URL || "https://gphost.eu.cc");

    // =========================================================================
    // MODE A: Direct Multipart Form Upload (Files <= 4.5 MB)
    // =========================================================================
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData().catch(() => null);
      if (!formData) {
        return NextResponse.json({ error: "Invalid form data" }, { status: 400, headers: getSecurityHeaders() });
      }

      const file = formData.get("file") as File | null;
      if (!file || typeof file.arrayBuffer !== "function") {
        return NextResponse.json(
          { error: "Missing 'file' parameter in multipart form data" },
          { status: 400, headers: getSecurityHeaders() }
        );
      }

      if (file.size > DIRECT_UPLOAD_MAX_BYTES) {
        return NextResponse.json(
          {
            error: "File exceeds direct CLI limit of 4.5MB.",
            hint: "For files larger than 4.5MB, POST a JSON payload: {\"filename\": \"...\", \"byteSize\": ...} to receive a direct Cloudflare R2 presigned upload URL.",
          },
          { status: 413, headers: getSecurityHeaders() }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());

      // 3. Rigorous File Security Guard: Prevent malware, webshells, double-extension tricks, and XSS
      const securityCheck = validateUploadSecurity(file.name || "cli-upload.bin", buffer, file.type);
      if (!securityCheck.safe) {
        return NextResponse.json(
          {
            error: "Security Violation: File Upload Rejected",
            reason: securityCheck.reason,
          },
          { status: 400, headers: getSecurityHeaders() }
        );
      }

      // 4. Cryptographic Anti-Tamper Checksum Verification
      const clientProvidedHash =
        req.headers.get("x-content-sha256") ||
        req.headers.get("x-sha256") ||
        req.headers.get("digest");

      const integrity = verifyContentIntegrity(buffer, clientProvidedHash);
      if (integrity.mismatch) {
        return NextResponse.json(
          {
            error: "Integrity Verification Failed: Potential Tampering Detected",
            message: "The SHA-256 hash of the uploaded payload does not match the provided X-Content-SHA256 header. The file may have been altered, intercepted, or corrupted in transit.",
            expectedSha256: clientProvidedHash,
            receivedSha256: integrity.sha256,
          },
          { status: 400, headers: getSecurityHeaders(integrity.sha256) }
        );
      }

      const rawExpiryPreset = (formData.get("expiryPreset") || formData.get("expiry")) as string | null;
      const expiryPreset = (rawExpiryPreset && EXPIRY_PRESET_VALUES.includes(rawExpiryPreset as typeof EXPIRY_PRESET_VALUES[number]))
        ? (rawExpiryPreset as typeof EXPIRY_PRESET_VALUES[number])
        : "30d";

      // Reserve user quota
      const { data: quotaReserved, error: quotaErr } = await adminClient.rpc("reserve_user_quota", {
        p_user_id: userId,
        p_requested_bytes: file.size,
      });

      if (quotaErr || !quotaReserved) {
        return NextResponse.json(
          { error: "Storage quota exceeded or reservation failed." },
          { status: 400, headers: getSecurityHeaders() }
        );
      }

      const sanitizedName = sanitizeFilename(file.name || "cli-upload.bin");
      const r2Key = generateR2ObjectKey(userId, sanitizedName);
      const mimeType = securityCheck.normalizedMime;

      // Stream directly to Cloudflare R2
      const r2Client = getR2Client();
      await r2Client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: r2Key,
          Body: buffer,
          ContentType: mimeType,
          Metadata: {
            "sha256": integrity.sha256,
            "uploader-id": userId,
          },
        })
      );

      const expiresAt = calculateExpiryDate(expiryPreset);

      // Insert file record
      const { data: fileRecord, error: fileInsertErr } = await adminClient
        .from("files")
        .insert({
          user_id: userId,
          filename: file.name || sanitizedName,
          sanitized_name: sanitizedName,
          r2_key: r2Key,
          byte_size: file.size,
          mime_type: mimeType,
          status: "ACTIVE",
          expiry_preset: expiryPreset,
          expires_at: expiresAt ? expiresAt.toISOString() : null,
        })
        .select("id, sanitized_name, byte_size, mime_type, expires_at, created_at")
        .single();

      if (fileInsertErr || !fileRecord) {
        return NextResponse.json({ error: "Failed to create file record" }, { status: 500, headers: getSecurityHeaders() });
      }

      // Commit quota
      await adminClient.rpc("commit_upload_quota", {
        p_user_id: userId,
        p_reserved_bytes: file.size,
        p_actual_bytes: file.size,
      });

      // Automatically generate public share link & direct raw CDN link
      const slug = crypto.randomBytes(9).toString("base64url").slice(0, 12);
      const tokenHash = crypto.createHash("sha256").update(crypto.randomUUID()).digest("hex");

      await adminClient.from("share_links").insert({
        file_id: fileRecord.id,
        slug,
        token_hash: tokenHash,
        is_active: true,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
      });

      return NextResponse.json(
        {
          success: true,
          fileId: fileRecord.id,
          filename: fileRecord.sanitized_name,
          byteSize: fileRecord.byte_size,
          mimeType: fileRecord.mime_type,
          sha256: integrity.sha256,
          integrityStatus: "verified_authentic",
          downloadUrl: `${origin}/f/${slug}`,
          rawUrl: `${origin}/raw/${slug}`,
          expiresAt: fileRecord.expires_at,
        },
        {
          status: 201,
          headers: getSecurityHeaders(integrity.sha256),
        }
      );
    }

    // =========================================================================
    // MODE B: Direct-to-R2 Presigned Upload Negotiation (Files > 4.5 MB)
    // =========================================================================
    const body = await req.json().catch(() => ({}));
    const rawFilename = body.filename || "file.bin";

    // Validate security before generating presigned URL
    const securityCheck = validateUploadSecurity(rawFilename, undefined, body.mimeType);
    if (!securityCheck.safe) {
      return NextResponse.json(
        {
          error: "Security Violation: Upload Blocked",
          reason: securityCheck.reason,
        },
        { status: 400, headers: getSecurityHeaders() }
      );
    }

    const filename = sanitizeFilename(rawFilename);
    const byteSize = parseInt(String(body.byteSize || body.size), 10);
    const mimeType = securityCheck.normalizedMime;
    const rawExpiryPreset = body.expiryPreset || body.expiry;
    const expiryPreset = (rawExpiryPreset && EXPIRY_PRESET_VALUES.includes(rawExpiryPreset))
      ? rawExpiryPreset
      : "30d";

    if (!byteSize || isNaN(byteSize) || byteSize <= 0) {
      return NextResponse.json(
        {
          error: "Invalid request payload",
          expected: {
            filename: "example.zip",
            byteSize: 10485760,
            mimeType: "application/zip",
            expiryPreset: "30d",
          },
        },
        { status: 400, headers: getSecurityHeaders() }
      );
    }

    // Reserve user quota
    const { data: quotaReserved, error: quotaErr } = await adminClient.rpc("reserve_user_quota", {
      p_user_id: userId,
      p_requested_bytes: byteSize,
    });

    if (quotaErr || !quotaReserved) {
      return NextResponse.json(
        { error: "Insufficient storage quota or reservation failed." },
        { status: 400, headers: getSecurityHeaders() }
      );
    }

    const r2Key = generateR2ObjectKey(userId, filename);
    const presignedPutUrl = await createPresignedPutUrl(r2Key, mimeType, 900);
    const expiresAt = calculateExpiryDate(expiryPreset);

    // Create file record in UPLOADING state
    const { data: fileRecord, error: fileInsertErr } = await adminClient
      .from("files")
      .insert({
        user_id: userId,
        filename: filename,
        sanitized_name: filename,
        r2_key: r2Key,
        byte_size: byteSize,
        mime_type: mimeType,
        status: "UPLOADING",
        expiry_preset: expiryPreset,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
      })
      .select("id")
      .single();

    if (fileInsertErr || !fileRecord) {
      return NextResponse.json({ error: "Failed to initialize upload record" }, { status: 500, headers: getSecurityHeaders() });
    }

    const curlExample = `curl -X PUT -T "${filename}" -H "Content-Type: ${mimeType}" "${presignedPutUrl}"`;

    return NextResponse.json(
      {
        success: true,
        mode: "presigned",
        fileId: fileRecord.id,
        uploadUrl: presignedPutUrl,
        presignedPutUrl,
        curlExample,
        completeUrl: `${origin}/api/files/complete-upload`,
        instructions: [
          `1. Stream file directly to Cloudflare R2: ${curlExample}`,
          `2. Complete the upload: curl -X POST "${origin}/api/files/complete-upload" -H "Content-Type: application/json" -d '{"fileId": "${fileRecord.id}"}'`,
        ],
      },
      {
        status: 200,
        headers: getSecurityHeaders(),
      }
    );
  } catch (err: unknown) {
    console.error("CLI upload error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500, headers: getSecurityHeaders() });
  }
}
