import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { authenticateRequest, markFileApiAccessed } from "@/lib/auth/api-keys";
import { createAdminClient } from "@/lib/supabase/admin";
import { headR2Object, deleteR2Object } from "@/lib/storage/r2";
import { RESERVED_SLUGS } from "@/lib/share/constants";
import { purgeShareLinkRedisData } from "@/lib/storage/lifecycle";

import {
  EXPIRY_PRESET_VALUES,
  calculateExpiryDate,
} from "@/lib/storage/expiry";

export const dynamic = "force-dynamic";

const completeUploadSchema = z.object({
  fileId: z.string().uuid(),
  expiryPreset: z.enum(EXPIRY_PRESET_VALUES).optional(),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(48)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  sha256: z.string().trim().max(128).optional(),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Authoritative dual-channel authentication & permission check
    const authRes = await authenticateRequest(req, "files:upload");
    if ("errorResponse" in authRes) {
      return authRes.errorResponse;
    }
    const { userId, profile } = authRes.auth;

    // 2. Validate request payload
    const body = await req.json().catch(() => ({}));
    const parseResult = completeUploadSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid completion parameters", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { fileId, slug: requestedSlug, sha256: clientSha256 } = parseResult.data;

    // 3. PostgreSQL record lookup & tenant isolation validation
    const adminClient = createAdminClient();
    const { data: file, error: fileError } = await adminClient
      .from("files")
      .select("*")
      .eq("id", fileId)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (file.user_id !== userId) {
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
        { error: "Unauthorized expiry preset: account not permitted to create permanent files" },
        { status: 403 }
      );
    }

    const expiresAt = file.expires_at && !parseResult.data.expiryPreset
      ? new Date(file.expires_at)
      : calculateExpiryDate(effectivePreset);

    // 5. Authoritative Quota Commit in PostgreSQL
    const { error: commitQuotaError } = await adminClient.rpc("commit_upload_quota", {
      p_user_id: userId,
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

    // 6. Transition File State to ACTIVE with schema fallback for sha256
    const updatePayload: Record<string, unknown> = {
      status: "ACTIVE",
      byte_size: verifiedSize,
      r2_etag: verifiedEtag,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    if (clientSha256) {
      updatePayload.sha256 = clientSha256.toLowerCase().trim();
    }

    const primaryRes = await adminClient
      .from("files")
      .update(updatePayload)
      .eq("id", fileId)
      .select("id, sanitized_name, byte_size, mime_type, status, expires_at, created_at, sha256")
      .single();

    let updateResData = primaryRes.data as {
      id: string;
      sanitized_name: string;
      byte_size: number;
      mime_type: string;
      status: string;
      expires_at: string | null;
      created_at: string;
      sha256?: string | null;
    } | null;
    let updateResError = primaryRes.error;

    if (updateResError && (updateResError.code === "42703" || updateResError.message?.includes("sha256"))) {
      delete updatePayload.sha256;
      const fallbackRes = await adminClient
        .from("files")
        .update(updatePayload)
        .eq("id", fileId)
        .select("id, sanitized_name, byte_size, mime_type, status, expires_at, created_at")
        .single();
      updateResData = fallbackRes.data;
      updateResError = fallbackRes.error;
    }

    const updatedFile = updateResData;

    if (updateResError || !updatedFile) {
      console.error("Failed to update file status to ACTIVE:", updateResError);
      return NextResponse.json(
        { error: "Failed to mark file as active" },
        { status: 500 }
      );
    }

    // 7. Ensure a Share Link & Slug exists
    const sanitizedSlug = requestedSlug?.toLowerCase().trim();
    let finalSlug: string = "";

    if (sanitizedSlug) {
      if (!RESERVED_SLUGS.has(sanitizedSlug)) {
        try {
          const { data: oldShare } = await adminClient
            .from("share_links")
            .select("id, file_id, file:files(id, user_id, r2_key, byte_size)")
            .eq("slug", sanitizedSlug)
            .maybeSingle();

          if (oldShare && oldShare.file && oldShare.file_id !== fileId) {
            const oldFile = (Array.isArray(oldShare.file) ? oldShare.file[0] : oldShare.file) as any;
            if (oldFile && oldFile.user_id === userId) {
              if (oldFile.r2_key && oldFile.r2_key !== file.r2_key) {
                await deleteR2Object(oldFile.r2_key).catch(() => false);
              }
              const { data: oldVers } = await adminClient
                .from("file_versions")
                .select("id, r2_key")
                .eq("file_id", oldFile.id);
              if (oldVers && oldVers.length > 0) {
                for (const ov of oldVers) {
                  if (ov.r2_key && ov.r2_key !== file.r2_key) {
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
        } catch (slugErr) {
          console.warn("Complete upload slug cleanup warning:", slugErr);
        }

        // Delete any prior link with this slug owned by this file/user
        await adminClient.from("share_links").delete().eq("slug", sanitizedSlug);
        await purgeShareLinkRedisData(sanitizedSlug);

        const tokenHash = crypto.createHash("sha256").update(crypto.randomUUID()).digest("hex");
        const { data: newShare } = await adminClient
          .from("share_links")
          .insert({
            file_id: fileId,
            slug: sanitizedSlug,
            token_hash: tokenHash,
            is_active: true,
            expires_at: expiresAt ? expiresAt.toISOString() : null,
          })
          .select("slug")
          .single();

        finalSlug = newShare?.slug || sanitizedSlug;
      }
    }

    if (!finalSlug) {
      // Check if file already has an active share link
      const { data: existingShare } = await adminClient
        .from("share_links")
        .select("slug")
        .eq("file_id", fileId)
        .eq("is_active", true)
        .maybeSingle();

      if (existingShare?.slug) {
        finalSlug = existingShare.slug;
      } else {
        const randomSlug = crypto.randomBytes(9).toString("base64url").slice(0, 12);
        const tokenHash = crypto.createHash("sha256").update(crypto.randomUUID()).digest("hex");
        await adminClient.from("share_links").insert({
          file_id: fileId,
          slug: randomSlug,
          token_hash: tokenHash,
          is_active: true,
          expires_at: expiresAt ? expiresAt.toISOString() : null,
        });
        finalSlug = randomSlug;
      }
    }

    // Dynamic detected origin
    const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const forwardedProto = req.headers.get("x-forwarded-proto") || (forwardedHost?.startsWith("localhost") ? "http" : "https");
    const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : (process.env.NEXT_PUBLIC_APP_URL || "https://gphost.eu.cc");

    const rawUrl = `${origin}/raw/${finalSlug}`;
    const downloadUrl = `${origin}/f/${finalSlug}`;

    void markFileApiAccessed(userId, fileId);

    // 8. Insert Audit Log
    try {
      after(async () => {
        await adminClient.from("audit_logs").insert({
          actor_id: userId,
          event_type: "FILE_UPLOAD_COMPLETED",
          resource_type: "file",
          resource_id: fileId,
          ip_hash: "server_authoritative",
          metadata: {
            filename: file.sanitized_name,
            byte_size: verifiedSize,
            slug: finalSlug,
            sha256: clientSha256 || null,
          },
        });
      });
    } catch {
      void (async () => {
        try {
          await adminClient.from("audit_logs").insert({
            actor_id: userId,
            event_type: "FILE_UPLOAD_COMPLETED",
            resource_type: "file",
            resource_id: fileId,
            ip_hash: "server_authoritative",
            metadata: {
              filename: file.sanitized_name,
              byte_size: verifiedSize,
              slug: finalSlug,
              sha256: clientSha256 || null,
            },
          });
        } catch {}
      })();
    }

    return NextResponse.json({
      success: true,
      file: updatedFile,
      slug: finalSlug,
      rawUrl,
      downloadUrl,
      permanentRawUrl: rawUrl,
    });
  } catch (err: unknown) {
    console.error("Unhandled error in complete-upload:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
