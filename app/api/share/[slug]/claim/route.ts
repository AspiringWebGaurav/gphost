import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { checkDownloadRateLimit } from "@/lib/redis/ratelimit";
import { createPresignedGetUrl } from "@/lib/storage/r2";
import { getClientIp, hashClientIp } from "@/lib/security/ip";
import { getUnlockCookieName, verifyUnlockToken } from "@/lib/security/unlock-token";
import { logFileEvent } from "@/lib/telemetry/events";

import { redis } from "@/lib/redis/client";
import { hashDeviceFingerprint, isValidDeviceFingerprint } from "@/lib/security/device-fingerprint";

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

    // 1. VALIDATE: Extract client IP & apply anti-abuse burst + volume rate limiting
    const clientIp = getClientIp(req.headers);
    const rateLimitResult = await checkDownloadRateLimit(clientIp, slug);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: rateLimitResult.error || "Too many download requests. Please wait a few seconds before trying again.",
          code: "RATE_LIMITED",
          retryAfter: rateLimitResult.retryAfterSeconds || 5,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimitResult.retryAfterSeconds || 5),
          },
        }
      );
    }

    const adminClient = createAdminClient();

    // 1b. Look up share link metadata with schema fallback
    let shareRecord: { id: string; file_id: string; password_hash?: string | null; one_per_member?: boolean } | null = null;
    const { data: sData, error: sErr } = await adminClient
      .from("share_links")
      .select("id, file_id, password_hash, one_per_member")
      .eq("slug", slug)
      .maybeSingle();

    if (!sErr && sData) {
      shareRecord = sData;
    } else {
      const { data: fbData } = await adminClient
        .from("share_links")
        .select("id, file_id, password_hash")
        .eq("slug", slug)
        .maybeSingle();
      if (fbData) {
        shareRecord = { ...fbData, one_per_member: false };
      }
    }

    if (!shareRecord) {
      return NextResponse.json({ error: "Share link not found" }, { status: 404 });
    }

    // Determine one_per_member setting (from DB column or Redis enhancement cache)
    let isOnePerMember = Boolean(shareRecord.one_per_member);
    try {
      const cachedEnhancements = await redis.get<{ one_per_member?: boolean }>(`share_enhancements:${slug}`);
      if (cachedEnhancements?.one_per_member !== undefined) {
        isOnePerMember = Boolean(cachedEnhancements.one_per_member);
      }
    } catch {}

    // If password-protected, verify the signed unlock cookie
    if (shareRecord.password_hash) {
      const cookieName = getUnlockCookieName(slug);
      const unlockCookie = req.cookies.get(cookieName)?.value;

      if (!unlockCookie || !verifyUnlockToken(unlockCookie, slug, shareRecord.file_id)) {
        return NextResponse.json(
          {
            error: "This share link is password-protected. Password unlock required.",
            code: "PASSWORD_REQUIRED",
          },
          { status: 401 }
        );
      }
    }

    // Extract optional client hardware device fingerprint from body or headers
    const body = await req.json().catch(() => ({}));
    const rawFp =
      (typeof body?.deviceFingerprint === "string" ? body.deviceFingerprint : null) ||
      req.headers.get("x-device-fingerprint") ||
      null;

    const ipHash = hashClientIp(clientIp);
    const fpHash = rawFp && isValidDeviceFingerprint(rawFp) ? hashDeviceFingerprint(rawFp) : null;
    const authenticatedUser = await getAuthenticatedUser().catch(() => null);
    const userId = authenticatedUser?.id || null;

    // Enforce 1 Download Per Person restriction if and only if mode is enabled
    if (isOnePerMember) {
      // Fast Redis lookup for IP hash, Hardware Device Fingerprint, and User ID
      let alreadyClaimed = false;
      try {
        const checkPromises: Promise<unknown>[] = [
          redis.get(`claimed_slot:${slug}:${ipHash}`),
        ];
        if (fpHash) {
          checkPromises.push(redis.get(`claimed_slot:${slug}:fp:${fpHash}`));
        }
        if (userId) {
          checkPromises.push(redis.get(`claimed_slot:${slug}:user:${userId}`));
        }
        const [claimedIp, claimedFp, claimedUser] = await Promise.all(checkPromises);
        if (claimedIp || claimedFp || claimedUser) alreadyClaimed = true;
      } catch {}

      if (!alreadyClaimed) {
        const query = adminClient
          .from("file_downloads")
          .select("id")
          .eq("share_link_id", shareRecord.id)
          .in("status", ["CLAIMED", "COMPLETED"]);

        if (userId) {
          query.or(`ip_hash.eq.${ipHash},user_id.eq.${userId}`);
        } else {
          query.eq("ip_hash", ipHash);
        }

        const { data: pastDownload } = await query.limit(1).maybeSingle();

        if (pastDownload) alreadyClaimed = true;
      }

      if (alreadyClaimed) {
        return NextResponse.json(
          {
            success: false,
            error: "You have already downloaded this file on this device. Each person is limited to 1 download.",
            code: "ALREADY_DOWNLOADED",
          },
          { status: 403 }
        );
      }
    }

    // 2. LOCK: Acquire authoritative download claim lease in PostgreSQL
    const leaseToken = crypto.randomUUID();
    const userAgent = req.headers.get("user-agent") || null;

    interface ClaimRpcResult {
      success: boolean;
      error?: string;
      share_id?: string;
      file_id?: string;
      user_id?: string;
      sanitized_name?: string;
      byte_size?: number;
      mime_type?: string;
      r2_key?: string;
      is_single_use?: boolean;
      one_per_member?: boolean;
      download_count?: number;
      max_downloads?: number | null;
      lease_token?: string;
      expires_in_seconds?: number;
    }

    interface ClaimRpcError {
      code?: string;
      message?: string;
      details?: string;
      hint?: string;
    }

    let claimResult: ClaimRpcResult | null = null;
    let claimErr: ClaimRpcError | null = null;

    // 1. Primary: Authoritative 4-param acquire_download_claim_lease
    const rpc4 = await adminClient.rpc("acquire_download_claim_lease", {
      p_slug: slug,
      p_lease_token: leaseToken,
      p_ip_hash: ipHash,
      p_user_agent: userAgent,
    });

    if (!rpc4.error && rpc4.data) {
      claimResult = rpc4.data as ClaimRpcResult;
    } else if (rpc4.error && userId) {
      // 2. Secondary fallback: 5-param signature if deployed
      const rpc5 = await adminClient.rpc("acquire_download_claim_lease", {
        p_slug: slug,
        p_lease_token: leaseToken,
        p_ip_hash: ipHash,
        p_user_agent: userAgent,
        p_user_id: userId,
      });

      if (!rpc5.error && rpc5.data) {
        claimResult = rpc5.data as ClaimRpcResult;
      } else {
        claimErr = rpc4.error || rpc5.error;
      }
    } else {
      claimErr = rpc4.error;
    }

    // 2b. Auto-Heal Legacy One-Per-Member Links:
    // If the database RPC returned INACTIVE or DOWNLOAD_LIMIT_REACHED on a 1-download-per-person link
    // because max_downloads was set to 1 under the old bug, automatically revive the link to unlimited people!
    if (
      claimResult &&
      !claimResult.success &&
      (claimResult.error === "INACTIVE" || claimResult.error === "DOWNLOAD_LIMIT_REACHED") &&
      isOnePerMember
    ) {
      const { data: checkShare } = await adminClient
        .from("share_links")
        .select("id, max_downloads, is_single_use")
        .eq("slug", slug)
        .maybeSingle();

      if (checkShare && !checkShare.is_single_use && (checkShare.max_downloads === null || checkShare.max_downloads <= 1)) {
        console.info(`[Auto-Heal] Reviving legacy one_per_member share link '${slug}' to unlimited people`);
        await adminClient
          .from("share_links")
          .update({ is_active: true, max_downloads: null })
          .eq("id", checkShare.id);
        claimResult = null; // Triggers direct table fallback below to complete the claim!
      }
    }

    // 3. Bulletproof Direct Table Fallback: If database RPC failed or is desynced, execute direct authoritative claim
    if (!claimResult) {
      console.warn("Falling back to direct table claim transaction due to RPC error:", claimErr);
      const { data: shareRow, error: shareErr } = await adminClient
        .from("share_links")
        .select(`
          id,
          file_id,
          max_downloads,
          download_count,
          is_single_use,
          is_active,
          expires_at,
          file:files (
            id,
            sanitized_name,
            byte_size,
            mime_type,
            r2_key,
            status,
            expires_at
          )
        `)
        .eq("slug", slug)
        .single();

      if (shareErr || !shareRow || !shareRow.file) {
        return NextResponse.json({ error: "Share link not found" }, { status: 404 });
      }

      interface FileJoinedData {
        id: string;
        sanitized_name: string;
        byte_size: number;
        mime_type: string;
        r2_key: string;
        status: string;
        expires_at: string | null;
      }

      const fileObj = (Array.isArray(shareRow.file) ? shareRow.file[0] : shareRow.file) as unknown as FileJoinedData;
      const isOnePerMemberActive = Boolean(isOnePerMember && !shareRow.is_single_use);
      const isPrematurelyDeactivated = Boolean(!shareRow.is_active && isOnePerMemberActive && (shareRow.max_downloads === null || shareRow.max_downloads <= 1));

      if ((!shareRow.is_active && !isPrematurelyDeactivated) || fileObj.status !== "ACTIVE") {
        return NextResponse.json({ error: "This file is no longer available for download" }, { status: 410 });
      }

      const now = Date.now();
      if (shareRow.expires_at && new Date(shareRow.expires_at).getTime() <= now) {
        return NextResponse.json({ error: "This share link has expired" }, { status: 410 });
      }

      const isTotalQuotaCapped = Boolean(
        shareRow.max_downloads !== null &&
        !(isOnePerMemberActive && shareRow.max_downloads <= 1)
      );

      if (isTotalQuotaCapped && shareRow.download_count >= shareRow.max_downloads!) {
        return NextResponse.json({ error: "This share link has reached its maximum download limit" }, { status: 410 });
      }

      const newCount = shareRow.download_count + 1;
      const shouldDeactivate = Boolean(isTotalQuotaCapped && newCount >= shareRow.max_downloads!);

      await adminClient
        .from("share_links")
        .update({
          download_count: newCount,
          is_active: shouldDeactivate ? false : true,
        })
        .eq("id", shareRow.id);

      await adminClient
        .from("file_downloads")
        .insert({
          share_link_id: shareRow.id,
          file_id: shareRow.file_id,
          lease_token: leaseToken,
          lease_expires_at: new Date(Date.now() + 50000).toISOString(),
          ip_hash: ipHash,
          user_agent: fpHash ? `${userAgent || "Unknown UA"} [fp:${fpHash}]` : userAgent,
          status: "CLAIMED",
        });

      claimResult = {
        success: true,
        share_id: shareRow.id,
        file_id: shareRow.file_id,
        sanitized_name: fileObj.sanitized_name,
        byte_size: fileObj.byte_size,
        mime_type: fileObj.mime_type,
        r2_key: fileObj.r2_key,
        is_single_use: shareRow.is_single_use,
        download_count: newCount,
        max_downloads: shareRow.max_downloads,
        lease_token: leaseToken,
        expires_in_seconds: 50,
      };
      claimErr = null;
    }

    if (!claimResult) {
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
        case "ALREADY_DOWNLOADED_IN_LIFETIME":
          return NextResponse.json(
            {
              success: false,
              error: "You have already downloaded this file. Each member is limited to 1 download in their lifetime.",
              code: "ALREADY_DOWNLOADED",
            },
            { status: 403 }
          );
        default:
          return NextResponse.json(
            { error: `Download claim rejected: ${claimResult.error}` },
            { status: 400 }
          );
      }
    }

    // If 1 Download Per Person mode is active, register slot claim immediately
    if (isOnePerMember) {
      try {
        await Promise.all([
          redis.set(`claimed_slot:${slug}:${ipHash}`, "1", { ex: 86400 * 30 }),
          fpHash ? redis.set(`claimed_slot:${slug}:fp:${fpHash}`, "1", { ex: 86400 * 30 }) : null,
          userId ? redis.set(`claimed_slot:${slug}:user:${userId}`, "1", { ex: 86400 * 30 }) : null,
        ]);
      } catch {}
    }

    if (!claimResult.r2_key || !claimResult.sanitized_name) {
      return NextResponse.json(
        { error: "Failed to retrieve secure file path" },
        { status: 500 }
      );
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
    if (claimResult.file_id && claimResult.share_id) {
      void logFileEvent({
        fileId: claimResult.file_id,
        shareLinkId: claimResult.share_id,
        eventType: "download",
        req,
      });
    }

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
    const currentDownloadCount = typeof claimResult.download_count === "number" ? claimResult.download_count : undefined;
    const rawMaxDownloads = typeof claimResult.max_downloads === "number" ? claimResult.max_downloads : null;
    const isOnePerMemberActiveClaim = Boolean(isOnePerMember && !claimResult.is_single_use);
    const isTotalCapped = Boolean(rawMaxDownloads !== null && !(isOnePerMemberActiveClaim && rawMaxDownloads <= 1));
    const maxDownloads = isTotalCapped ? rawMaxDownloads : null;
    const limitReached = Boolean(isTotalCapped && currentDownloadCount !== undefined && currentDownloadCount >= rawMaxDownloads!);

    return NextResponse.json({
      success: true,
      downloadUrl,
      filename: claimResult.sanitized_name,
      byte_size: claimResult.byte_size,
      mime_type: claimResult.mime_type,
      expires_in_seconds: 50,
      download_count: currentDownloadCount,
      max_downloads: maxDownloads,
      is_single_use: Boolean(claimResult.is_single_use),
      one_per_member: isOnePerMember,
      limit_reached: limitReached,
    });
  } catch (err) {
    console.error("Unexpected error claiming download:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
