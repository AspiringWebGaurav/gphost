import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp, hashClientIp } from "@/lib/security/ip";
import { hashDeviceFingerprint, isValidDeviceFingerprint } from "@/lib/security/device-fingerprint";
import { redis } from "@/lib/redis/client";
import { getAuthenticatedUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Asynchronously checks whether the current hardware device, IP, or user
 * has already claimed their lifetime download slot for this share link.
 *
 * Called immediately upon page mount so that Incognito / Private browsing windows
 * (which lack localStorage) detect that their physical device has already downloaded,
 * instantly updating the UI to "Already Downloaded" before the user even clicks.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug || typeof slug !== "string" || slug.length > 64) {
      return NextResponse.json({ claimed: false, error: "Invalid slug" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const rawFp =
      (typeof body.deviceFingerprint === "string" ? body.deviceFingerprint : null) ||
      req.headers.get("x-device-fingerprint") ||
      req.nextUrl.searchParams.get("fp");

    const clientIp = getClientIp(req.headers);
    const ipHash = hashClientIp(clientIp);
    const user = await getAuthenticatedUser().catch(() => null);
    const userId = user?.id || null;

    const adminClient = createAdminClient();

    // 1. Resolve share link to verify one_per_member status with schema fallback
    let shareRecord: {
      id: string;
      is_active: boolean;
      one_per_member?: boolean;
      is_single_use: boolean;
      max_downloads: number | null;
      download_count: number;
    } | null = null;

    const { data: primaryShare, error: pErr } = await adminClient
      .from("share_links")
      .select("id, is_active, one_per_member, is_single_use, max_downloads, download_count")
      .eq("slug", slug)
      .maybeSingle();

    if (!pErr && primaryShare) {
      shareRecord = primaryShare;
    } else {
      const { data: fallbackShare } = await adminClient
        .from("share_links")
        .select("id, is_active, is_single_use, max_downloads, download_count")
        .eq("slug", slug)
        .maybeSingle();

      if (fallbackShare) {
        shareRecord = { ...fallbackShare, one_per_member: false };
      }
    }

    if (!shareRecord) {
      return NextResponse.json({ claimed: false }, { status: 404 });
    }

    let isOnePerMember = Boolean(shareRecord.one_per_member);
    try {
      const cached = await redis.get<{ one_per_member?: boolean }>(`share_enhancements:${slug}`);
      if (cached && typeof cached.one_per_member === "boolean") {
        isOnePerMember = cached.one_per_member;
      }
    } catch {}

    // If one_per_member is not active, multiple downloads per person are allowed
    if (!isOnePerMember) {
      return NextResponse.json({ claimed: false, onePerMember: false });
    }

    // 2. Fast Redis lookup for device fingerprint, IP hash, and User ID
    const fpHash = rawFp && isValidDeviceFingerprint(rawFp) ? hashDeviceFingerprint(rawFp) : null;

    let alreadyClaimed = false;
    let claimReason = "";

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

      const results = await Promise.all(checkPromises);
      const [claimedIp, claimedFp, claimedUser] = results;

      if (claimedFp) {
        alreadyClaimed = true;
        claimReason = "HARDWARE_DEVICE_FINGERPRINT";
      } else if (claimedIp) {
        alreadyClaimed = true;
        claimReason = "CLIENT_IP_MATCH";
      } else if (claimedUser) {
        alreadyClaimed = true;
        claimReason = "USER_ACCOUNT_MATCH";
      }
    } catch {}

    // 3. Fallback to PostgreSQL file_downloads table if Redis had a cache miss
    if (!alreadyClaimed) {
      const query = adminClient
        .from("file_downloads")
        .select("id, status")
        .eq("share_link_id", shareRecord.id)
        .in("status", ["CLAIMED", "COMPLETED"]);

      if (userId) {
        query.or(`ip_hash.eq.${ipHash},user_id.eq.${userId}`);
      } else {
        query.eq("ip_hash", ipHash);
      }

      const { data: pastDownload } = await query.limit(1).maybeSingle();

      if (pastDownload) {
        alreadyClaimed = true;
        claimReason = "PERSISTED_DATABASE_RECORD";

        // Re-seed Redis cache for fast subsequent checks across Incognito sessions
        try {
          await Promise.all([
            redis.set(`claimed_slot:${slug}:${ipHash}`, "1", { ex: 86400 * 30 }),
            fpHash ? redis.set(`claimed_slot:${slug}:fp:${fpHash}`, "1", { ex: 86400 * 30 }) : null,
            userId ? redis.set(`claimed_slot:${slug}:user:${userId}`, "1", { ex: 86400 * 30 }) : null,
          ]);
        } catch {}
      }
    }

    return NextResponse.json({
      claimed: alreadyClaimed,
      onePerMember: true,
      reason: claimReason || null,
    });
  } catch (err) {
    console.error("Error in check-claim endpoint:", err);
    return NextResponse.json({ claimed: false, error: "Internal error" }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  return POST(req, context);
}
