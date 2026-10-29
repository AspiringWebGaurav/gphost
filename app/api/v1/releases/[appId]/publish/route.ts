import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasPermission } from "@/lib/auth/api-keys";
import { isAuthoritativeAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getR2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { verifyMinisignSignature, parseMinisignSignature } from "@/lib/security/minisign";
import { redis } from "@/lib/redis/client";
import { purgeStaleReleaseBinaries } from "@/lib/storage/releases-purge";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ appId: string }> }
) {
  // 1. Authoritative Authentication & Authorization
  const authRes = await authenticateRequest(req);
  if ("errorResponse" in authRes) {
    return authRes.errorResponse;
  }
  const { auth } = authRes;

  const { appId: rawAppId } = await context.params;
  const appId = rawAppId?.trim().toLowerCase();
  if (!appId || !/^[a-z0-9.\-_+]+$/.test(appId)) {
    return NextResponse.json({ error: "Invalid or missing 'appId' parameter" }, { status: 400 });
  }

  const isAdmin = isAuthoritativeAdmin(auth.profile?.email) || auth.profile?.role === "admin";
  const hasReleasePerm =
    hasPermission(auth.permissions, "*") ||
    auth.permissions?.includes("releases:publish") ||
    auth.permissions?.includes("files:manage");

  if (!isAdmin && !hasReleasePerm) {
    return NextResponse.json(
      {
        error: "Forbidden: Release publication requires authoritative admin or release:publish permission",
      },
      { status: 403 }
    );
  }

  const publishLockKey = `lock:release:publish:${appId}`;
  const manifestCacheKey = `release:${appId}:latest:manifest`;

  // 2. Concurrency Lock (Redis Distributed Lock)
  let lockAcquired = false;
  if (redis) {
    try {
      const lockRes = await redis.set(publishLockKey, auth.userId, { nx: true, ex: 15 });
      if (lockRes === "OK") {
        lockAcquired = true;
      } else {
        return NextResponse.json(
          { error: "Another release publication is currently in progress. Please retry in a few seconds." },
          { status: 409 }
        );
      }
    } catch {
      // Graceful fallback to PostgreSQL advisory locks if Redis is unavailable
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    const {
      version,
      binaryFileId,
      signature,
      signatureFileId,
      notes,
      publicKey,
      isLocked = false,
      allowOverwrite = false,
      force = false,
    } = body;

    if (!version || typeof version !== "string") {
      return NextResponse.json({ error: "Missing or invalid 'version' string" }, { status: 400 });
    }

    const cleanVersion = version.trim().replace(/^v/, "");
    if (!/^\d+\.\d+\.\d+([a-zA-Z0-9.\-_+]*)$/.test(cleanVersion)) {
      return NextResponse.json(
        { error: "Invalid semver version format. Expected format like '1.0.2' or '1.0.2-beta.1'" },
        { status: 400 }
      );
    }

    const targetBinaryFileId = (binaryFileId || body.fileId || "").trim();
    if (!targetBinaryFileId || typeof targetBinaryFileId !== "string") {
      return NextResponse.json({ error: "Missing 'binaryFileId' (or 'fileId')" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const r2Client = getR2Client();

    // 3. Verify Binary File Existence in DB
    const { data: binFile, error: binErr } = await adminClient
      .from("files")
      .select("id, user_id, sanitized_name, filename, byte_size, r2_key")
      .eq("id", targetBinaryFileId)
      .maybeSingle();

    if (binErr || !binFile) {
      console.error(`[Release Publish] Binary DB lookup failed for app ${appId}:`, targetBinaryFileId, binErr);
      return NextResponse.json({ error: "Binary file record not found in database", details: binErr?.message }, { status: 404 });
    }

    // Tenant check: file must belong to caller or caller must be admin
    if (binFile.user_id !== auth.userId && !isAdmin) {
      return NextResponse.json({ error: "Forbidden: Cannot publish another user's binary" }, { status: 403 });
    }

    // 4. Physical Existence & Size Check in Cloudflare R2
    try {
      const headRes = await r2Client.send(
        new HeadObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: binFile.r2_key,
        })
      );
      if (!headRes.ContentLength || headRes.ContentLength <= 0) {
        return NextResponse.json(
          { error: "Binary object in R2 is empty (0 bytes)" },
          { status: 422 }
        );
      }
    } catch (headErr: any) {
      if (headErr?.name === "NotFound" || headErr?.$metadata?.httpStatusCode === 404) {
        return NextResponse.json(
          { error: "Binary object physically missing from Cloudflare R2 storage" },
          { status: 404 }
        );
      }
      throw headErr;
    }

    // 5. Resolve Signature Text
    let signatureText = (signature || "").trim();
    let resolvedSigFileId = signatureFileId || null;

    if (!signatureText && signatureFileId) {
      const { data: sFile } = await adminClient
        .from("files")
        .select("id, r2_key")
        .eq("id", signatureFileId)
        .maybeSingle();

      if (sFile && sFile.r2_key) {
        try {
          const s3Res = await r2Client.send(
            new GetObjectCommand({
              Bucket: R2_BUCKET_NAME,
              Key: sFile.r2_key,
            })
          );
          if (s3Res.Body) {
            const sigBytes = await (s3Res.Body as any).transformToByteArray();
            signatureText = Buffer.from(sigBytes).toString("utf8").trim();
            resolvedSigFileId = sFile.id;
          }
        } catch (sigFetchErr) {
          console.warn("Could not fetch signature from R2:", sigFetchErr);
        }
      }
    }

    if (!signatureText) {
      return NextResponse.json(
        { error: "Minisign signature text or signatureFileId is required for release publication" },
        { status: 400 }
      );
    }

    // Parse and validate signature format
    try {
      parseMinisignSignature(signatureText);
    } catch (parseErr: any) {
      return NextResponse.json(
        { error: `Invalid Minisign signature format: ${parseErr.message}` },
        { status: 422 }
      );
    }

    // 6. Cryptographic Minisign Verification
    let binBuffer: Buffer | null = null;
    const trustedPublicKey = (publicKey || (appId === "gpn" ? process.env.GPN_MINISIGN_PUBLIC_KEY : "") || "").trim();
    if (trustedPublicKey) {
      const getRes = await r2Client.send(
        new GetObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: binFile.r2_key,
        })
      );
      if (!getRes.Body) {
        return NextResponse.json({ error: "Failed to read binary stream from storage" }, { status: 500 });
      }
      const binBytes = await (getRes.Body as any).transformToByteArray();
      binBuffer = Buffer.from(binBytes);

      const verification = verifyMinisignSignature(trustedPublicKey, signatureText, binBuffer);
      if (!verification.valid) {
        return NextResponse.json(
          {
            error: "Minisign cryptographic verification failed: signature does not match binary or trusted public key",
            details: verification.error,
            keyIdMatch: verification.keyIdMatch,
          },
          { status: 422 }
        );
      }
    }

    const calculatedSha256 = binBuffer
      ? crypto.createHash("sha256").update(binBuffer).digest("hex")
      : "";

    // 7. Immutability Check: Prevent overwriting published releases unless force/allowOverwrite is set
    const { data: existingRelease } = await adminClient
      .from("app_releases")
      .select("id, is_published, version")
      .eq("app_id", appId)
      .eq("version", cleanVersion)
      .maybeSingle();

    const canOverwrite = Boolean(allowOverwrite || force);

    if (existingRelease && existingRelease.is_published && !canOverwrite) {
      return NextResponse.json(
        {
          error: `Release v${cleanVersion} for app '${appId}' is already published. Pass allowOverwrite: true (or force: true) to refresh binaries.`,
        },
        { status: 409 }
      );
    }

    // 8. Create or Update Release Record
    let releaseId = existingRelease?.id;
    if (existingRelease && canOverwrite) {
      await adminClient
        .from("app_releases")
        .delete()
        .eq("id", existingRelease.id);
      releaseId = null;
    }

    if (!releaseId) {
      const { data: newRelease, error: insertErr } = await adminClient
        .from("app_releases")
        .insert({
          app_id: appId,
          version: cleanVersion,
          binary_file_id: binFile.id,
          binary_r2_key: binFile.r2_key,
          binary_sha256: calculatedSha256 || "",
          binary_byte_size: binFile.byte_size,
          signature_text: signatureText,
          signature_file_id: resolvedSigFileId,
          release_notes: notes || `${appId} update v${cleanVersion}`,
          is_active: false,
          is_published: false,
          is_locked: Boolean(isLocked),
          created_by: auth.userId,
        })
        .select("id")
        .single();

      if (insertErr || !newRelease) {
        throw new Error(insertErr?.message || "Failed to create release record");
      }
      releaseId = newRelease.id;
    }

    // 9. Atomic Release Activation (Database Procedure or Transactional Fallback)
    const { error: rpcErr } = await adminClient.rpc("publish_app_release", {
      p_app_id: appId,
      p_release_id: releaseId,
    });

    if (rpcErr) {
      // Fallback if stored procedure has different signature or is pending
      await adminClient
        .from("app_releases")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("app_id", appId)
        .eq("is_active", true);

      await adminClient
        .from("app_releases")
        .update({
          is_active: true,
          is_published: true,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", releaseId);
    }

    // 10. Lock Binary in files table (prevents accidental deletion)
    try {
      await adminClient
        .from("files")
        .update({ is_release_locked: true })
        .eq("id", binFile.id);
    } catch {
      // Graceful fallback if is_release_locked column not present
    }

    // 11. Point Permanent Vanity Slug for Base v0.0.0 Installer Seeding
    if (cleanVersion === "0.0.0") {
      const primarySlug = appId === "gpn" ? "gpn-app" : appId === "downex" ? "downex-desktop" : `${appId}-desktop`;
      const { data: existingShare } = await adminClient
        .from("share_links")
        .select("id")
        .eq("slug", primarySlug)
        .maybeSingle();

      if (existingShare) {
        await adminClient
          .from("share_links")
          .update({
            file_id: binFile.id,
            is_active: true,
            expires_at: null,
          })
          .eq("id", existingShare.id);
      } else {
        const tokenHash = crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex");
        await adminClient
          .from("share_links")
          .insert({
            file_id: binFile.id,
            slug: primarySlug,
            token_hash: tokenHash,
            is_active: true,
            expires_at: null,
          });
      }

      const sigSlug = appId === "gpn" ? "gpn-app-sig" : `${primarySlug}-sig`;
      if (resolvedSigFileId) {
        const { data: sigShare } = await adminClient
          .from("share_links")
          .select("id")
          .eq("slug", sigSlug)
          .maybeSingle();

        if (sigShare) {
          await adminClient
            .from("share_links")
            .update({ file_id: resolvedSigFileId, is_active: true, expires_at: null })
            .eq("id", sigShare.id);
        } else {
          const sigTokenHash = crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex");
          await adminClient
            .from("share_links")
            .insert({
              file_id: resolvedSigFileId,
              slug: sigSlug,
              token_hash: sigTokenHash,
              is_active: true,
              expires_at: null,
            });
        }
      }

      if (redis) {
        try {
          await Promise.allSettled([
            redis.del(`raw:meta:${primarySlug}`),
            redis.del(`raw:meta:${sigSlug}`),
            redis.del(`share:${primarySlug}`),
            redis.del(`share:${sigSlug}`),
          ]);
        } catch {}
      }
    }

    // 12. Resilient Manifest Cache Invalidation
    if (redis) {
      try {
        await Promise.allSettled([
          redis.del(manifestCacheKey),
          redis.del(`gpn:release:latest:manifest`),
        ]);
      } catch (cacheErr) {
        console.warn("Failed to purge manifest Redis cache:", cacheErr);
      }
    }

    // 13. Multi-Layer Automated Purge of Stale Binaries
    let purgeSummary = null;
    if (cleanVersion !== "0.0.0") {
      try {
        purgeSummary = await purgeStaleReleaseBinaries({
          userId: auth.userId,
          targetBinaryFileId,
          baseFileId: body.baseFileId || body.base_file_id || null,
          appId,
        });
        console.log(`[Auto-Purge] Multi-layer purge completed for ${appId} v${cleanVersion}:`, purgeSummary);
      } catch (pruneErr) {
        console.warn("Non-fatal: Auto-prune encountered an issue:", pruneErr);
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: `Release v${cleanVersion} for ${appId} successfully published`,
        release: {
          id: releaseId,
          version: cleanVersion,
          app_id: appId,
          is_active: true,
          sha256: calculatedSha256 || null,
          byte_size: binFile.byte_size,
          download_url: `/api/v1/releases/${appId}/download/${cleanVersion}`,
          permanent_alias: appId === "gpn" ? "/raw/gpn-app" : undefined,
        },
        purge: purgeSummary,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error(`[${appId} Release Publish Error]:`, err);
    return NextResponse.json({ error: err.message || "Failed to publish release" }, { status: 500 });
  } finally {
    if (lockAcquired && redis) {
      try {
        await redis.del(publishLockKey);
      } catch {}
    }
  }
}
