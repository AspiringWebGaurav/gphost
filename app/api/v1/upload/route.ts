import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { validateApiKey, hasPermission, markFileApiAccessed } from "@/lib/auth/api-keys";
import { createAdminClient } from "@/lib/supabase/admin";
import { getR2Client, R2_BUCKET_NAME, generateR2ObjectKey, createPresignedPutUrl, deleteR2Object } from "@/lib/storage/r2";
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
import { RESERVED_SLUGS } from "@/lib/share/constants";
import { purgeShareLinkRedisData } from "@/lib/storage/lifecycle";

export const dynamic = "force-dynamic";

// Hard ceiling for direct serverless payload on Vercel Hobby
const DIRECT_UPLOAD_MAX_BYTES = 4.5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    // 1. Authoritative API Key Extraction & Verification
    const authHeader = req.headers.get("authorization") || req.headers.get("x-api-key") || "";
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

    const { userId, profile, permissions } = auth;

    // Verify permission: files:upload
    if (!hasPermission(permissions, "files:upload")) {
      return NextResponse.json(
        {
          error: "Forbidden: API key lacks 'files:upload' permission",
          grantedPermissions: permissions,
        },
        { status: 403, headers: getSecurityHeaders() }
      );
    }

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

    // Dynamic detected origin
    const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const forwardedProto = req.headers.get("x-forwarded-proto") || (forwardedHost?.startsWith("localhost") ? "http" : "https");
    const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : (process.env.NEXT_PUBLIC_APP_URL || "https://gphost.eu.cc");

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
            error: "File exceeds direct upload payload limit of 4.5MB.",
            hint: "For files larger than 4.5MB, POST a JSON payload: {\"filename\": \"...\", \"byteSize\": ...} to receive a direct Cloudflare R2 presigned upload URL.",
          },
          { status: 413, headers: getSecurityHeaders() }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());

      // 3. Security Guard: Authenticated owner API keys allow application release binaries (.exe, .msi, .zip, .sig)
      const securityCheck = validateUploadSecurity(file.name || "cli-upload.bin", buffer, file.type, {
        allowBinaries: true,
      });
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
        req.headers.get("digest") ||
        (formData.get("sha256") as string | null);

      const integrity = verifyContentIntegrity(buffer, clientProvidedHash);
      if (integrity.mismatch) {
        return NextResponse.json(
          {
            error: "Integrity Verification Failed: Potential Tampering Detected",
            message: "The SHA-256 hash of the uploaded payload does not match the provided checksum header.",
            expectedSha256: clientProvidedHash,
            receivedSha256: integrity.sha256,
          },
          { status: 400, headers: getSecurityHeaders(integrity.sha256) }
        );
      }

      const rawExpiryPreset = (formData.get("expiryPreset") || formData.get("expiry")) as string | null;
      const isPermanentReq = formData.get("isPermanent") === "true" || rawExpiryPreset === "never";
      const canCreatePermanent = profile.role === "admin" || profile.can_create_permanent;

      let expiryPreset: typeof EXPIRY_PRESET_VALUES[number] = "30d";
      if (isPermanentReq && canCreatePermanent) {
        expiryPreset = "never";
      } else if (rawExpiryPreset && EXPIRY_PRESET_VALUES.includes(rawExpiryPreset as typeof EXPIRY_PRESET_VALUES[number])) {
        expiryPreset = rawExpiryPreset as typeof EXPIRY_PRESET_VALUES[number];
      }

      // Desired vanity custom slug if requested (e.g. gpn-app)
      const customSlugInput = ((formData.get("slug") || formData.get("customSlug")) as string | null)?.trim().toLowerCase();
      let targetSlug = customSlugInput || "";

      if (targetSlug) {
        if (!/^[a-z0-9_-]{3,48}$/.test(targetSlug)) {
          return NextResponse.json(
            { error: "Invalid slug format. Must be 3-48 alphanumeric characters, dashes, or underscores." },
            { status: 400, headers: getSecurityHeaders() }
          );
        }
        if (RESERVED_SLUGS.has(targetSlug)) {
          return NextResponse.json(
            { error: `Slug '${targetSlug}' is reserved by the system.` },
            { status: 400, headers: getSecurityHeaders() }
          );
        }

        // Check if slug is already taken
        const { data: existingShare } = await adminClient
          .from("share_links")
          .select("id, file:files(user_id, status)")
          .eq("slug", targetSlug)
          .maybeSingle();

        if (existingShare) {
          const fileObj = Array.isArray(existingShare.file) ? existingShare.file[0] : existingShare.file;
          if (fileObj && fileObj.user_id !== userId && fileObj.status === "ACTIVE") {
            return NextResponse.json(
              { error: `Slug '${targetSlug}' is already taken by another account.` },
              { status: 409, headers: getSecurityHeaders() }
            );
          }
        }
      }

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

      // Insert file record with schema fallback for sha256
      const insertRecord = async () => {
        const payload: Record<string, unknown> = {
          user_id: userId,
          filename: file.name || sanitizedName,
          sanitized_name: sanitizedName,
          r2_key: r2Key,
          byte_size: file.size,
          mime_type: mimeType,
          status: "ACTIVE",
          expiry_preset: expiryPreset,
          expires_at: expiresAt ? expiresAt.toISOString() : null,
          sha256: integrity.sha256,
        };

        let res = await adminClient
          .from("files")
          .insert(payload)
          .select("id, sanitized_name, byte_size, mime_type, expires_at, created_at")
          .single();

        if (res.error && (res.error.code === "42703" || res.error.message?.includes("sha256"))) {
          delete payload.sha256;
          res = await adminClient
            .from("files")
            .insert(payload)
            .select("id, sanitized_name, byte_size, mime_type, expires_at, created_at")
            .single();
        }

        return res;
      };

      const { data: fileRecord, error: fileInsertErr } = await insertRecord();

      if (fileInsertErr || !fileRecord) {
        return NextResponse.json({ error: "Failed to create file record" }, { status: 500, headers: getSecurityHeaders() });
      }

      // Commit quota
      await adminClient.rpc("commit_upload_quota", {
        p_user_id: userId,
        p_reserved_bytes: file.size,
        p_actual_bytes: file.size,
      });

      // Share Link & Slug Assignment
      const slug = targetSlug || crypto.randomBytes(9).toString("base64url").slice(0, 12);
      const tokenHash = crypto.createHash("sha256").update(crypto.randomUUID()).digest("hex");

      // Clean up previous file & share link if replacing slug (e.g. gpn-app releases)
      if (targetSlug) {
        try {
          const { data: oldShare } = await adminClient
            .from("share_links")
            .select("id, file_id, file:files(id, user_id, r2_key, byte_size)")
            .eq("slug", targetSlug)
            .maybeSingle();

          if (oldShare && oldShare.file) {
            const oldFile = (Array.isArray(oldShare.file) ? oldShare.file[0] : oldShare.file) as any;
            if (oldFile && oldFile.user_id === userId) {
              if (oldFile.r2_key && oldFile.r2_key !== r2Key) {
                await deleteR2Object(oldFile.r2_key).catch(() => false);
              }
              const { data: oldVers } = await adminClient
                .from("file_versions")
                .select("id, r2_key")
                .eq("file_id", oldFile.id);
              if (oldVers && oldVers.length > 0) {
                for (const ov of oldVers) {
                  if (ov.r2_key && ov.r2_key !== r2Key) {
                    await deleteR2Object(ov.r2_key).catch(() => false);
                  }
                }
                await adminClient.from("file_versions").delete().eq("file_id", oldFile.id);
              }
              if (oldFile.byte_size) {
                const { data: prof } = await adminClient
                  .from("profiles")
                  .select("storage_used_bytes")
                  .eq("id", userId)
                  .single();
                if (prof) {
                  await adminClient
                    .from("profiles")
                    .update({ storage_used_bytes: Math.max(0, (prof.storage_used_bytes || 0) - oldFile.byte_size) })
                    .eq("id", userId);
                }
              }
              await adminClient.from("files").delete().eq("id", oldFile.id);
            }
          }
        } catch (slugCleanupErr) {
          console.warn("Slug cleanup warning:", slugCleanupErr);
        }

        await adminClient.from("share_links").delete().eq("slug", targetSlug);
        await purgeShareLinkRedisData(targetSlug);
      }

      void markFileApiAccessed(userId, fileRecord.id);

      await adminClient.from("share_links").insert({
        file_id: fileRecord.id,
        slug,
        token_hash: tokenHash,
        is_active: true,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
      });

      const rawUrl = `${origin}/raw/${slug}`;
      const downloadUrl = `${origin}/f/${slug}`;

      return NextResponse.json(
        {
          success: true,
          fileId: fileRecord.id,
          filename: fileRecord.sanitized_name,
          byteSize: fileRecord.byte_size,
          mimeType: fileRecord.mime_type,
          sha256: integrity.sha256,
          integrityStatus: "verified_authentic",
          slug,
          downloadUrl,
          rawUrl,
          permanentRawUrl: rawUrl,
          isPermanent: expiryPreset === "never",
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
    const rawFilename = body.filename || "release-file.bin";

    // Validate security before generating presigned URL
    const securityCheck = validateUploadSecurity(rawFilename, undefined, body.mimeType, {
      allowBinaries: true,
    });
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
    const isPermanentReq = body.isPermanent === true || rawExpiryPreset === "never";
    const canCreatePermanent = profile.role === "admin" || profile.can_create_permanent;

    let expiryPreset: typeof EXPIRY_PRESET_VALUES[number] = "30d";
    if (isPermanentReq && canCreatePermanent) {
      expiryPreset = "never";
    } else if (rawExpiryPreset && EXPIRY_PRESET_VALUES.includes(rawExpiryPreset)) {
      expiryPreset = rawExpiryPreset;
    }

    if (!byteSize || isNaN(byteSize) || byteSize <= 0) {
      return NextResponse.json(
        {
          error: "Invalid request payload",
          expected: {
            filename: "gpn-setup.exe",
            byteSize: 10485760,
            mimeType: "application/vnd.microsoft.portable-executable",
            expiryPreset: "never",
            slug: "gpn-app",
          },
        },
        { status: 400, headers: getSecurityHeaders() }
      );
    }

    // Target slug validation if provided
    const targetSlug = (body.slug || body.customSlug || "")?.trim().toLowerCase();
    if (targetSlug) {
      if (!/^[a-z0-9_-]{3,48}$/.test(targetSlug)) {
        return NextResponse.json(
          { error: "Invalid slug format. Must be 3-48 alphanumeric characters, dashes, or underscores." },
          { status: 400, headers: getSecurityHeaders() }
        );
      }
      if (RESERVED_SLUGS.has(targetSlug)) {
        return NextResponse.json(
          { error: `Slug '${targetSlug}' is reserved by the system.` },
          { status: 400, headers: getSecurityHeaders() }
        );
      }
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
    const insertUploadingRecord = async () => {
      const payload: Record<string, unknown> = {
        user_id: userId,
        filename: filename,
        sanitized_name: filename,
        r2_key: r2Key,
        byte_size: byteSize,
        mime_type: mimeType,
        status: "UPLOADING",
        expiry_preset: expiryPreset,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
      };

      if (body.sha256) {
        payload.sha256 = String(body.sha256).trim().toLowerCase();
      }

      let res = await adminClient
        .from("files")
        .insert(payload)
        .select("id")
        .single();

      if (res.error && (res.error.code === "42703" || res.error.message?.includes("sha256"))) {
        delete payload.sha256;
        res = await adminClient
          .from("files")
          .insert(payload)
          .select("id")
          .single();
      }

      return res;
    };

    const { data: fileRecord, error: fileInsertErr } = await insertUploadingRecord();

    if (fileInsertErr || !fileRecord) {
      return NextResponse.json({ error: "Failed to initialize upload record" }, { status: 500, headers: getSecurityHeaders() });
    }

    void markFileApiAccessed(userId, fileRecord.id);

    const curlExample = `curl -X PUT -T "${filename}" -H "Content-Type: ${mimeType}" "${presignedPutUrl}"`;
    const completeUrl = `${origin}/api/v1/complete-upload`;

    return NextResponse.json(
      {
        success: true,
        mode: "presigned",
        fileId: fileRecord.id,
        uploadUrl: presignedPutUrl,
        presignedPutUrl,
        curlExample,
        targetSlug: targetSlug || undefined,
        completeUrl,
        instructions: [
          `1. Stream file directly to Cloudflare R2: ${curlExample}`,
          `2. Complete the upload: curl -X POST "${completeUrl}" -H "Authorization: Bearer ${token.slice(0, 14)}..." -H "Content-Type: application/json" -d '{"fileId": "${fileRecord.id}"${targetSlug ? `, "slug": "${targetSlug}"` : ""}}'`,
        ],
      },
      {
        status: 200,
        headers: getSecurityHeaders(),
      }
    );
  } catch (err: unknown) {
    console.error("API upload error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500, headers: getSecurityHeaders() });
  }
}
