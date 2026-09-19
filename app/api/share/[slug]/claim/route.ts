import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadClaimRatelimit } from "@/lib/redis/ratelimit";
import { createPresignedGetUrl } from "@/lib/storage/r2";
import { getClientIp, hashClientIp } from "@/lib/security/ip";
import { getUnlockCookieName, verifyUnlockToken } from "@/lib/security/unlock-token";
import { logFileEvent } from "@/lib/telemetry/events";

import { redis } from "@/lib/redis/client";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug || typeof slug !== "string" || slug.length > 64) {
      return NextResponse.json({ error: "Invalid share slug" }, { status: 400 });
    }

    // 1. VALIDATE: Extract client IP & apply ephemeral rate limiting
    const clientIp = getClientIp(req.headers);
    const { success: rateLimitOk } = await downloadClaimRatelimit.limit(clientIp);
    if (!rateLimitOk) {
      return NextResponse.json(
        { error: "Too many download requests. Please wait a moment before trying again." },
        { status: 429 }
      );
    }

    const adminClient = createAdminClient();

    // 1b. Fast Redis cache check for password protection to avoid blocking DB select
    let shareMeta: { file_id: string; has_password: boolean } | null = null;
    try {
      const cached = await redis.get<{ file_id: string; has_password: boolean }>(`share:slug:${slug}`);
      if (cached) shareMeta = cached;
    } catch {}

    if (!shareMeta) {
      const { data, error: shareMetaErr } = await adminClient
        .from("share_links")
        .select("file_id, password_hash")
        .eq("slug", slug)
        .maybeSingle();

      if (shareMetaErr || !data) {
        return NextResponse.json({ error: "Share link not found" }, { status: 404 });
      }

      shareMeta = {
        file_id: data.file_id,
        has_password: Boolean(data.password_hash),
      };

      try {
        await redis.set(`share:slug:${slug}`, shareMeta, { ex: 60 });
      } catch {}
    }

    // If password-protected, verify the signed unlock cookie
    if (shareMeta.has_password) {
      const cookieName = getUnlockCookieName(slug);
      const unlockCookie = req.cookies.get(cookieName)?.value;

      if (!unlockCookie || !verifyUnlockToken(unlockCookie, slug, shareMeta.file_id)) {
        return NextResponse.json(
          {
            error: "This share link is password-protected. Password unlock required.",
            code: "PASSWORD_REQUIRED",
          },
          { status: 401 }
        );
      }
    }

    // 2. LOCK: Acquire authoritative 50-second download claim lease in PostgreSQL
    const leaseToken = crypto.randomUUID();
    const ipHash = hashClientIp(clientIp);
    const userAgent = req.headers.get("user-agent") || null;

    const { data: claimResult, error: claimErr } = await adminClient.rpc(
      "acquire_download_claim_lease",
      {
        p_slug: slug,
        p_lease_token: leaseToken,
        p_ip_hash: ipHash,
        p_user_agent: userAgent,
      }
    );

    if (claimErr || !claimResult) {
      console.error("acquire_download_claim_lease RPC error:", claimErr);
      return NextResponse.json({ error: "Failed to claim download slot" }, { status: 500 });
    }

    if (!claimResult.success) {
      switch (claimResult.error) {
        case "NOT_FOUND":
          return NextResponse.json({ error: "Share link not found" }, { status: 404 });
        case "INACTIVE":
          return NextResponse.json(
            { error: "This share link has been deactivated" },
            { status: 410 }
          );
        case "FILE_NOT_ACTIVE":
          return NextResponse.json(
            { error: "This file is no longer available for download" },
            { status: 410 }
          );
        case "EXPIRED":
          return NextResponse.json(
            { error: "This share link has expired" },
            { status: 410 }
          );
        case "DOWNLOAD_LIMIT_REACHED":
          return NextResponse.json(
            { error: "This share link has reached its maximum download limit" },
            { status: 410 }
          );
        default:
          return NextResponse.json(
            { error: `Download claim rejected: ${claimResult.error}` },
            { status: 400 }
          );
      }
    }

    // 3. PRESIGN: Generate 50-second presigned GET URL in-memory
    let downloadUrl: string;
    try {
      downloadUrl = await createPresignedGetUrl(
        claimResult.r2_key,
        claimResult.sanitized_name,
        50,
        claimResult.mime_type
      );
    } catch (presignErr) {
      console.error("Presigned URL generation failed, rolling back claim:", presignErr);
      // Atomic compensation rollback: zero download quota consumed
      await adminClient.rpc("rollback_download_claim", {
        p_share_id: claimResult.share_id,
        p_lease_token: leaseToken,
      });

      return NextResponse.json(
        { error: "Failed to generate secure download link" },
        { status: 500 }
      );
    }

    // Non-blocking edge telemetry (Cloudflare country, city, referrer)
    void logFileEvent({
      fileId: claimResult.file_id,
      shareLinkId: claimResult.share_id,
      eventType: "download",
      req,
    });

    // Invalidate cached metadata so subsequent raw/share requests reflect updated download count or single-use state immediately
    try {
      await Promise.all([
        redis.del(`raw:meta:${slug}`),
        redis.del(`share:pub:${slug}`),
      ]);
    } catch {}

    // 4. RETURN: Deliver presigned URL and public metadata only
    // Note: DOWNLOAD_CLAIMED audit logging occurred atomically inside acquire_download_claim_lease RPC!
    // Zero internal IDs, R2 keys, or server secrets leaked!
    return NextResponse.json({
      success: true,
      downloadUrl,
      filename: claimResult.sanitized_name,
      byte_size: claimResult.byte_size,
      mime_type: claimResult.mime_type,
      expires_in_seconds: 50,
    });
  } catch (err) {
    console.error("Unexpected error claiming download:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
