import { NextRequest, NextResponse, after } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { authenticateRequest } from "@/lib/auth/api-keys";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getR2Client,
  R2_BUCKET_NAME,
  generateR2ObjectKey,
  createPresignedPutUrl,
  headR2Object,
} from "@/lib/storage/r2";
import { sanitizeFilename } from "@/lib/storage/sanitizer";
import {
  validateUploadSecurity,
  verifyContentIntegrity,
  getSecurityHeaders,
} from "@/lib/security/file-guard";
import { purgeShareLinkRedisData } from "@/lib/storage/lifecycle";
import { redis } from "@/lib/redis/client";
import { signStageToken, verifyStageToken } from "@/lib/storage/stage-token";

export const dynamic = "force-dynamic";

const DIRECT_UPLOAD_MAX_BYTES = 4.5 * 1024 * 1024;

interface TargetFileRecord {
  id: string;
  user_id: string;
  filename: string;
  sanitized_name: string;
  byte_size: number;
  mime_type: string;
  r2_key: string;
  r2_etag?: string | null;
  status: string;
  expires_at: string | null;
  sha256?: string | null;
  is_release_locked?: boolean;
}

/**
 * Resolves a target file record by either UUID (fileId) or public slug (e.g. 'gpn-app').
 */
async function resolveTargetFile(
  adminClient: ReturnType<typeof createAdminClient>,
  target: string,
  userId: string
): Promise<{ file: TargetFileRecord; slug: string } | null> {
  const cleanTarget = target.trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanTarget);

  if (isUuid) {
    const { data: file, error: fileErr } = await adminClient
      .from("files")
      .select("*")
      .eq("id", cleanTarget)
      .eq("user_id", userId)
      .single();

    if (fileErr || !file) return null;

    // Fetch primary active share slug if any
    const { data: share } = await adminClient
      .from("share_links")
      .select("slug")
      .eq("file_id", file.id)
      .eq("is_active", true)
      .maybeSingle();

    return { file: file as TargetFileRecord, slug: share?.slug || "" };
  } else {
    // Resolve by share link slug
    const { data: share, error: shareErr } = await adminClient
      .from("share_links")
      .select("id, slug, file_id, file:files(*)")
      .eq("slug", cleanTarget.toLowerCase())
      .single();

    if (shareErr || !share || !share.file) return null;

    const file = Array.isArray(share.file) ? share.file[0] : share.file;
    if (!file || file.user_id !== userId) return null;

    return { file: file as TargetFileRecord, slug: share.slug };
  }
}

/**
 * Archives the current version into file_versions table with schema fallback.
 */
async function archiveCurrentVersion(
  adminClient: ReturnType<typeof createAdminClient>,
  file: TargetFileRecord,
  actorId: string
): Promise<number> {
  try {
    const { count } = await adminClient
      .from("file_versions")
      .select("id", { count: "exact", head: true })
      .eq("file_id", file.id);

    const versionNumber = (count ?? 0) + 1;

    await adminClient.from("file_versions").insert({
      file_id: file.id,
      version_number: versionNumber,
      r2_key: file.r2_key,
      r2_etag: file.r2_etag || null,
      byte_size: file.byte_size,
      sha256: file.sha256 || null,
      created_by: actorId,
      replaced_at: new Date().toISOString(),
      metadata: {
        filename: file.sanitized_name,
        mime_type: file.mime_type,
      },
    });

    return versionNumber;
  } catch (err) {
    console.warn("Could not archive version (table may not exist yet):", err);
    return 1;
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authoritative Authentication & Permission Guard
    const authRes = await authenticateRequest(req, "files:replace");
    if ("errorResponse" in authRes) {
      return authRes.errorResponse;
    }
    const { userId, profile } = authRes.auth;
    const adminClient = createAdminClient();

    const contentType = req.headers.get("content-type") || "";

    // Dynamic detected origin
    const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const forwardedProto = req.headers.get("x-forwarded-proto") || (forwardedHost?.startsWith("localhost") ? "http" : "https");
    const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : (process.env.NEXT_PUBLIC_APP_URL || "https://gphost.eu.cc");

    // =========================================================================
    // MODE A: Direct Multipart Replacement (Files <= 4.5 MB)
    // =========================================================================
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData().catch(() => null);
      if (!formData) {
        return NextResponse.json({ error: "Invalid form data" }, { status: 400, headers: getSecurityHeaders() });
      }

      const target = (formData.get("target") || formData.get("fileId") || formData.get("slug")) as string | null;
      if (!target) {
        return NextResponse.json(
          { error: "Missing required 'target' parameter (file ID or custom slug, e.g. 'gpn-app')" },
          { status: 400, headers: getSecurityHeaders() }
        );
      }

      const resolved = await resolveTargetFile(adminClient, target, userId);
      if (!resolved) {
        return NextResponse.json(
          { error: "Target file not found or you do not have permission to modify it" },
          { status: 404, headers: getSecurityHeaders() }
        );
      }

      const { file: existingFile, slug: existingSlug } = resolved;

      const newFile = formData.get("file") as File | null;
      if (!newFile || typeof newFile.arrayBuffer !== "function") {
        return NextResponse.json(
          { error: "Missing replacement 'file' parameter" },
          { status: 400, headers: getSecurityHeaders() }
        );
      }

      if (newFile.size > DIRECT_UPLOAD_MAX_BYTES) {
        return NextResponse.json(
          {
            error: "File exceeds direct upload payload limit of 4.5MB.",
            hint: "For files larger than 4.5MB, POST a JSON payload: {\"target\": \"...\", \"filename\": \"...\", \"byteSize\": ...} to receive a staged presigned upload URL.",
          },
          { status: 413, headers: getSecurityHeaders() }
        );
      }

      const buffer = Buffer.from(await newFile.arrayBuffer());

      // Validate security: permits software releases (.exe, .msi, .zip, .sig) for authenticated owner API keys
      const securityCheck = validateUploadSecurity(newFile.name || existingFile.filename, buffer, newFile.type, {
        allowBinaries: true,
      });

      if (!securityCheck.safe) {
        return NextResponse.json(
          { error: "Security Violation: File Upload Rejected", reason: securityCheck.reason },
          { status: 400, headers: getSecurityHeaders() }
        );
      }

      // Verify checksum
      const clientProvidedHash =
        req.headers.get("x-content-sha256") ||
        req.headers.get("x-sha256") ||
        (formData.get("sha256") as string | null);

      const integrity = verifyContentIntegrity(buffer, clientProvidedHash);
      if (integrity.mismatch) {
        return NextResponse.json(
          {
            error: "Integrity Verification Failed: Potential Tampering Detected",
            expectedSha256: clientProvidedHash,
            receivedSha256: integrity.sha256,
          },
          { status: 400, headers: getSecurityHeaders(integrity.sha256) }
        );
      }

      // Check quota delta
      const sizeDelta = newFile.size - existingFile.byte_size;
      if (sizeDelta > 0) {
        const { data: quotaReserved, error: quotaErr } = await adminClient.rpc("reserve_user_quota", {
          p_user_id: userId,
          p_requested_bytes: sizeDelta,
        });

        if (quotaErr || !quotaReserved) {
          return NextResponse.json(
            { error: "Storage quota exceeded for the replacement binary size difference." },
            { status: 400, headers: getSecurityHeaders() }
          );
        }
      }

      const sanitizedName = sanitizeFilename(newFile.name || existingFile.sanitized_name);
      const stagedR2Key = generateR2ObjectKey(userId, sanitizedName);
      const mimeType = securityCheck.normalizedMime;

      // 1. Staged upload to Cloudflare R2
      const r2Client = getR2Client();
      await r2Client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: stagedR2Key,
          Body: buffer,
          ContentType: mimeType,
          Metadata: {
            sha256: integrity.sha256,
            "uploader-id": userId,
            "replaced-from": existingFile.id,
          },
        })
      );

      // 2. Archive previous version in file_versions table for rollback
      const archivedVersion = await archiveCurrentVersion(adminClient, existingFile, userId);

      // 3. Atomic Pointer Switch in PostgreSQL
      const nowIso = new Date().toISOString();
      const updatePayload: Record<string, unknown> = {
        r2_key: stagedR2Key,
        byte_size: newFile.size,
        mime_type: mimeType,
        sanitized_name: sanitizedName,
        filename: newFile.name || existingFile.filename,
        r2_etag: `"${integrity.sha256.slice(0, 32)}"`,
        sha256: integrity.sha256,
        updated_at: nowIso,
      };

      let updateRes = await adminClient
        .from("files")
        .update(updatePayload)
        .eq("id", existingFile.id)
        .select("*")
        .single();

      if (updateRes.error && (updateRes.error.code === "42703" || updateRes.error.message?.includes("sha256"))) {
        delete updatePayload.sha256;
        updateRes = await adminClient
          .from("files")
          .update(updatePayload)
          .eq("id", existingFile.id)
          .select("*")
          .single();
      }

      if (updateRes.error) {
        console.error("Failed to execute atomic pointer switch:", updateRes.error);
        return NextResponse.json({ error: "Failed to update file database record" }, { status: 500 });
      }

      // Commit quota delta
      if (sizeDelta !== 0) {
        const { data: profileRecord } = await adminClient
          .from("profiles")
          .select("storage_used_bytes")
          .eq("id", userId)
          .single();

        const currentUsed = profileRecord?.storage_used_bytes || 0;
        await adminClient
          .from("profiles")
          .update({ storage_used_bytes: Math.max(0, currentUsed + sizeDelta) })
          .eq("id", userId);
      }

      // 4. Invalidate Edge & Redis Caches immediately
      if (existingSlug) {
        await purgeShareLinkRedisData(existingSlug);
      }
      try {
        await Promise.all([
          redis?.del(`raw:meta:${existingSlug}`),
          redis?.del(`share:pub:${existingSlug}`),
          redis?.del(`share:meta:${existingSlug}`),
          redis?.del(`raw:meta:${existingFile.id}`),
        ]);
      } catch {}

      // 5. Non-blocking audit log
      try {
        after(async () => {
          await adminClient.from("audit_logs").insert({
            actor_id: userId,
            event_type: "FILE_REPLACED",
            resource_type: "file",
            resource_id: existingFile.id,
            ip_hash: "server_authoritative",
            metadata: {
              slug: existingSlug,
              previous_version: archivedVersion,
              new_byte_size: newFile.size,
              old_byte_size: existingFile.byte_size,
              sha256: integrity.sha256,
            },
          });
        });
      } catch {}

      const rawUrl = existingSlug ? `${origin}/raw/${existingSlug}` : `${origin}/raw/${existingFile.id}`;
      const downloadUrl = existingSlug ? `${origin}/f/${existingSlug}` : `${origin}/f/${existingFile.id}`;

      return NextResponse.json(
        {
          success: true,
          mode: "direct",
          fileId: existingFile.id,
          slug: existingSlug,
          filename: sanitizedName,
          byteSize: newFile.size,
          mimeType,
          sha256: integrity.sha256,
          version: archivedVersion + 1,
          previousVersion: archivedVersion,
          permanentRawUrl: rawUrl,
          rawUrl,
          downloadUrl,
          replacedAt: nowIso,
        },
        {
          status: 200,
          headers: getSecurityHeaders(integrity.sha256),
        }
      );
    }

    // =========================================================================
    // MODE B: Presigned Staged Replacement Negotiation or Finalize (Files > 4.5 MB)
    // =========================================================================
    const body = await req.json().catch(() => ({}));

    // Mode B Step 2: Finalize Staged Replacement
    if (body.action === "complete" || body.stageToken) {
      const stageToken = body.stageToken;
      if (!stageToken || typeof stageToken !== "string") {
        return NextResponse.json({ error: "Missing required 'stageToken'" }, { status: 400 });
      }

      const stagedPayload = verifyStageToken(stageToken);
      if (!stagedPayload) {
        return NextResponse.json(
          { error: "Invalid or expired stage token. Please restart replacement negotiation." },
          { status: 400 }
        );
      }

      if (stagedPayload.userId !== userId) {
        return NextResponse.json({ error: "Access denied: stage token owner mismatch" }, { status: 403 });
      }

      // Verify staged object physically exists in Cloudflare R2
      const r2Head = await headR2Object(stagedPayload.stagedR2Key);
      if (!r2Head) {
        return NextResponse.json(
          {
            error: "Staged binary was not found in physical storage. Ensure the file was uploaded to Cloudflare R2 before finalizing.",
          },
          { status: 400 }
        );
      }

      const verifiedSize = r2Head.contentLength;
      const verifiedEtag = r2Head.eTag;

      // Lookup target file
      const { data: existingFile } = await adminClient
        .from("files")
        .select("*")
        .eq("id", stagedPayload.fileId)
        .eq("user_id", userId)
        .single();

      if (!existingFile) {
        return NextResponse.json({ error: "Target file not found" }, { status: 404 });
      }

      // Archive previous version
      const archivedVersion = await archiveCurrentVersion(adminClient, existingFile as TargetFileRecord, userId);

      // Atomic pointer switch
      const nowIso = new Date().toISOString();
      const updatePayload: Record<string, unknown> = {
        r2_key: stagedPayload.stagedR2Key,
        byte_size: verifiedSize,
        mime_type: stagedPayload.mimeType,
        sanitized_name: stagedPayload.filename,
        r2_etag: verifiedEtag,
        updated_at: nowIso,
      };

      if (stagedPayload.sha256) {
        updatePayload.sha256 = stagedPayload.sha256;
      }

      let updateRes = await adminClient
        .from("files")
        .update(updatePayload)
        .eq("id", existingFile.id)
        .select("*")
        .single();

      if (updateRes.error && (updateRes.error.code === "42703" || updateRes.error.message?.includes("sha256"))) {
        delete updatePayload.sha256;
        updateRes = await adminClient
          .from("files")
          .update(updatePayload)
          .eq("id", existingFile.id)
          .select("*")
          .single();
      }

      if (updateRes.error) {
        console.error("Failed to finalize staged pointer switch:", updateRes.error);
        return NextResponse.json({ error: "Failed to update file database record" }, { status: 500 });
      }

      // Adjust quota
      const sizeDelta = verifiedSize - existingFile.byte_size;
      if (sizeDelta !== 0) {
        const { data: profileRecord } = await adminClient
          .from("profiles")
          .select("storage_used_bytes")
          .eq("id", userId)
          .single();

        const currentUsed = profileRecord?.storage_used_bytes || 0;
        await adminClient
          .from("profiles")
          .update({ storage_used_bytes: Math.max(0, currentUsed + sizeDelta) })
          .eq("id", userId);
      }

      // Invalidate Edge & Redis Caches immediately
      if (stagedPayload.slug) {
        await purgeShareLinkRedisData(stagedPayload.slug);
      }
      try {
        await Promise.all([
          redis?.del(`raw:meta:${stagedPayload.slug}`),
          redis?.del(`share:pub:${stagedPayload.slug}`),
          redis?.del(`share:meta:${stagedPayload.slug}`),
          redis?.del(`raw:meta:${stagedPayload.fileId}`),
        ]);
      } catch {}

      // Non-blocking audit log
      try {
        after(async () => {
          await adminClient.from("audit_logs").insert({
            actor_id: userId,
            event_type: "FILE_REPLACED",
            resource_type: "file",
            resource_id: existingFile.id,
            ip_hash: "server_authoritative",
            metadata: {
              slug: stagedPayload.slug,
              mode: "presigned_staged",
              previous_version: archivedVersion,
              new_byte_size: verifiedSize,
              old_byte_size: existingFile.byte_size,
              sha256: stagedPayload.sha256 || null,
            },
          });
        });
      } catch {}

      const rawUrl = stagedPayload.slug ? `${origin}/raw/${stagedPayload.slug}` : `${origin}/raw/${existingFile.id}`;
      const downloadUrl = stagedPayload.slug ? `${origin}/f/${stagedPayload.slug}` : `${origin}/f/${existingFile.id}`;

      return NextResponse.json({
        success: true,
        mode: "staged_completed",
        fileId: existingFile.id,
        slug: stagedPayload.slug,
        filename: stagedPayload.filename,
        byteSize: verifiedSize,
        mimeType: stagedPayload.mimeType,
        sha256: stagedPayload.sha256 || undefined,
        version: archivedVersion + 1,
        previousVersion: archivedVersion,
        permanentRawUrl: rawUrl,
        rawUrl,
        downloadUrl,
        replacedAt: nowIso,
      });
    }

    // Mode B Step 1: Initialize Staged Replacement Negotiation
    const target = body.target || body.fileId || body.slug;
    if (!target) {
      return NextResponse.json(
        {
          error: "Missing required 'target' parameter (file ID or custom slug, e.g. 'gpn-app')",
          expected: {
            target: "gpn-app",
            filename: "gpn-setup-1.0.2.exe",
            byteSize: 52428800,
            sha256: "optional_sha256_here",
          },
        },
        { status: 400, headers: getSecurityHeaders() }
      );
    }

    const resolved = await resolveTargetFile(adminClient, target, userId);
    if (!resolved) {
      return NextResponse.json(
        { error: "Target file not found or you do not have permission to modify it" },
        { status: 404, headers: getSecurityHeaders() }
      );
    }

    const { file: existingFile, slug: existingSlug } = resolved;
    const rawFilename = body.filename || existingFile.filename;
    const byteSize = parseInt(String(body.byteSize || body.size), 10);

    if (!byteSize || isNaN(byteSize) || byteSize <= 0) {
      return NextResponse.json(
        { error: "Invalid 'byteSize' parameter: must be a positive integer" },
        { status: 400, headers: getSecurityHeaders() }
      );
    }

    // Validate security: permits software releases (.exe, .msi, .zip, .sig)
    const securityCheck = validateUploadSecurity(rawFilename, undefined, body.mimeType, {
      allowBinaries: true,
    });
    if (!securityCheck.safe) {
      return NextResponse.json(
        { error: "Security Violation: Replacement Rejected", reason: securityCheck.reason },
        { status: 400, headers: getSecurityHeaders() }
      );
    }

    const filename = sanitizeFilename(rawFilename);
    const mimeType = securityCheck.normalizedMime;

    // Check quota delta
    const sizeDelta = byteSize - existingFile.byte_size;
    if (sizeDelta > 0) {
      const { data: quotaReserved, error: quotaErr } = await adminClient.rpc("reserve_user_quota", {
        p_user_id: userId,
        p_requested_bytes: sizeDelta,
      });

      if (quotaErr || !quotaReserved) {
        return NextResponse.json(
          { error: "Storage quota exceeded for the replacement binary size difference." },
          { status: 400, headers: getSecurityHeaders() }
        );
      }
    }

    // Generate isolated staged R2 key
    const stagedR2Key = generateR2ObjectKey(userId, filename);
    const presignedPutUrl = await createPresignedPutUrl(stagedR2Key, mimeType, 900);

    const stageToken = signStageToken({
      fileId: existingFile.id,
      slug: existingSlug,
      stagedR2Key,
      filename,
      mimeType,
      byteSize,
      sha256: body.sha256 ? String(body.sha256).toLowerCase().trim() : undefined,
      userId,
      timestamp: Date.now(),
    });

    const curlExample = `curl -X PUT -T "${filename}" -H "Content-Type: ${mimeType}" "${presignedPutUrl}"`;
    const completeUrl = `${origin}/api/v1/replace`;

    return NextResponse.json({
      success: true,
      mode: "presigned_staged",
      target: existingSlug || existingFile.id,
      fileId: existingFile.id,
      slug: existingSlug,
      stageToken,
      uploadUrl: presignedPutUrl,
      curlExample,
      completeUrl,
      instructions: [
        `1. Stream new binary directly to Cloudflare R2: ${curlExample}`,
        `2. Finalize replacement: curl -X POST "${completeUrl}" -H "Authorization: Bearer <API_KEY>" -H "Content-Type: application/json" -d '{"action": "complete", "stageToken": "${stageToken}"}'`,
      ],
    });
  } catch (err: unknown) {
    console.error("File replacement error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500, headers: getSecurityHeaders() });
  }
}
