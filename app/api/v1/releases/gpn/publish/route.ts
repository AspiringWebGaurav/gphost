import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasPermission } from "@/lib/auth/api-keys";
import { isAuthoritativeAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getR2Client, R2_BUCKET_NAME, deleteR2Object } from "@/lib/storage/r2";
import { HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { verifyMinisignSignature, parseMinisignSignature } from "@/lib/security/minisign";
import { redis } from "@/lib/redis/client";

export const dynamic = "force-dynamic";

const MANIFEST_CACHE_KEY = "gpn:release:latest:manifest";
const PUBLISH_LOCK_KEY = "lock:release:publish:gpn";
const APP_ID = "gpn";

export async function POST(req: NextRequest) {
  // 1. Authoritative Authentication & Authorization
  const authRes = await authenticateRequest(req);
  if ("errorResponse" in authRes) {
    return authRes.errorResponse;
  }
  const { auth } = authRes;

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

  // 2. Concurrency Lock (Redis Distributed Lock)
  let lockAcquired = false;
  if (redis) {
    try {
      const lockRes = await redis.set(PUBLISH_LOCK_KEY, auth.userId, { nx: true, ex: 15 });
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
      console.error("[GPN Publish] Binary DB lookup failed:", targetBinaryFileId, binErr);
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
    const trustedPublicKey = (publicKey || process.env.GPN_MINISIGN_PUBLIC_KEY || "").trim();
    if (trustedPublicKey) {
      // Download binary bytes from R2 to authoritatively verify Ed25519 signature
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
      .eq("app_id", APP_ID)
      .eq("version", cleanVersion)
      .maybeSingle();

    const canOverwrite = Boolean(allowOverwrite || force);

    if (existingRelease && existingRelease.is_published && !canOverwrite) {
      return NextResponse.json(
        {
          error: `Release v${cleanVersion} is already published. Pass allowOverwrite: true (or force: true) to refresh binaries for this version.`,
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
          app_id: APP_ID,
          version: cleanVersion,
          binary_file_id: binFile.id,
          binary_r2_key: binFile.r2_key,
          binary_sha256: calculatedSha256 || "",
          binary_byte_size: binFile.byte_size,
          signature_text: signatureText,
          signature_file_id: resolvedSigFileId,
          release_notes: notes || `GPN update v${cleanVersion}`,
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
      p_app_id: APP_ID,
      p_release_id: releaseId,
    });

    if (rpcErr) {
      // Fallback if migration 16 stored procedure is pending
      await adminClient
        .from("app_releases")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("app_id", APP_ID)
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
      // Graceful fallback if is_release_locked column not yet migrated
    }

    // 11. Point Permanent Vanity Slug 'gpn-app' ONLY for Base v0.0.0 Installer Seeding
    // OTA updates (v0.0.1+) must never touch or re-point the isolated base installer!
    if (cleanVersion === "0.0.0") {
      const { data: existingShare } = await adminClient
        .from("share_links")
        .select("id")
        .eq("slug", "gpn-app")
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
            slug: "gpn-app",
            token_hash: tokenHash,
            is_active: true,
            expires_at: null,
          });
      }
    }

    // Also update signature vanity 'gpn-app-sig' if signature file is present
    if (resolvedSigFileId) {
      const { data: sigShare } = await adminClient
        .from("share_links")
        .select("id")
        .eq("slug", "gpn-app-sig")
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
            slug: "gpn-app-sig",
            token_hash: sigTokenHash,
            is_active: true,
            expires_at: null,
          });
      }
    }

    if (redis) {
      try {
        await Promise.allSettled([
          redis.del("raw:meta:gpn-app"),
          redis.del("raw:meta:gpn-app-sig"),
          redis.del("share:gpn-app"),
          redis.del("share:gpn-app-sig"),
        ]);
      } catch {}
    }

    // 12. Resilient Manifest Cache Invalidation
    if (redis) {
      try {
        await redis.del(MANIFEST_CACHE_KEY);
      } catch (cacheErr) {
        console.warn("Failed to purge manifest Redis cache:", cacheErr);
      }
    }

    // 13. Strict 2-File Rule: Enforce Isolated Base 0.0.0 + Single Active OTA Update
    // Whenever an OTA release is published, any previous superseded OTA binary is purged immediately.
    // The Base v0.0.0 installer is 100% isolated and never deleted or touched.
    if (cleanVersion !== "0.0.0") {
      try {
        const { data: allGpnReleases } = await adminClient
          .from("app_releases")
          .select("id, version, binary_file_id, binary_r2_key")
          .eq("app_id", APP_ID);

        const obsoleteReleases = (allGpnReleases || []).filter(
          (r) => r.version !== "0.0.0" && r.binary_file_id !== targetBinaryFileId
        );

        for (const obs of obsoleteReleases) {
          if (obs.binary_r2_key) {
            try {
              await deleteR2Object(obs.binary_r2_key);
            } catch {}
          }
          if (obs.binary_file_id) {
            await adminClient
              .from("share_links")
              .delete()
              .eq("file_id", obs.binary_file_id)
              .neq("slug", "gpn-app");
            await adminClient
              .from("files")
              .delete()
              .eq("id", obs.binary_file_id);
          }
          await adminClient
            .from("app_releases")
            .delete()
            .eq("id", obs.id);
        }

        // Recalculate and update profile storage usage
        const { data: userFiles } = await adminClient
          .from("files")
          .select("byte_size")
          .eq("user_id", auth.userId);
        const newTotal = (userFiles || []).reduce((acc, f) => acc + (f.byte_size || 0), 0);
        await adminClient
          .from("profiles")
          .update({ storage_used_bytes: newTotal, updated_at: new Date().toISOString() })
          .eq("id", auth.userId);
      } catch (pruneErr) {
        console.warn("Non-fatal: Strict 2-file auto-prune encountered an issue:", pruneErr);
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: `GPN release v${cleanVersion} successfully published`,
        release: {
          id: releaseId,
          version: cleanVersion,
          app_id: APP_ID,
          is_active: true,
          sha256: calculatedSha256 || null,
          byte_size: binFile.byte_size,
          download_url: `/api/v1/releases/gpn/download/${cleanVersion}`,
          permanent_alias: "/raw/gpn-app",
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[Release Publish Error]:", err);
    return NextResponse.json({ error: err.message || "Failed to publish release" }, { status: 500 });
  } finally {
    if (lockAcquired && redis) {
      try {
        await redis.del(PUBLISH_LOCK_KEY);
      } catch {}
    }
  }
}
