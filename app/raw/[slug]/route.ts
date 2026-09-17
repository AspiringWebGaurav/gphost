import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPresignedRawUrl } from "@/lib/storage/r2";
import { getUnlockCookieName, verifyUnlockToken } from "@/lib/security/unlock-token";
import { getClientIp } from "@/lib/security/ip";
import { downloadClaimRatelimit } from "@/lib/redis/ratelimit";
import { logFileEvent } from "@/lib/telemetry/events";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type, Authorization",
  "Access-Control-Expose-Headers": "Content-Length, Content-Type, Content-Range, ETag",
  "Timing-Allow-Origin": "*",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug || typeof slug !== "string" || slug.length > 64) {
      return NextResponse.json({ error: "Invalid resource slug" }, { status: 400, headers: CORS_HEADERS });
    }

    // Rate limiting to prevent abusive hammering
    const clientIp = getClientIp(req.headers);
    const { success: rateLimitOk } = await downloadClaimRatelimit.limit(`raw:${clientIp}`);
    if (!rateLimitOk) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment." },
        { status: 429, headers: CORS_HEADERS }
      );
    }

    const adminClient = createAdminClient();
    const { data: share, error: shareErr } = await adminClient
      .from("share_links")
      .select(`
        id,
        slug,
        is_active,
        expires_at,
        max_downloads,
        download_count,
        is_single_use,
        password_hash,
        file:files (
          id,
          sanitized_name,
          r2_key,
          byte_size,
          mime_type,
          status,
          expires_at
        )
      `)
      .eq("slug", slug)
      .single();

    if (shareErr || !share || !share.file) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404, headers: CORS_HEADERS });
    }

    const file = Array.isArray(share.file) ? share.file[0] : share.file;
    if (!file || !share.is_active || file.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "This asset is no longer available" },
        { status: 410, headers: CORS_HEADERS }
      );
    }

    const now = Date.now();
    if (
      (share.expires_at && new Date(share.expires_at).getTime() <= now) ||
      (file.expires_at && new Date(file.expires_at).getTime() <= now)
    ) {
      return NextResponse.json(
        { error: "This asset link has expired" },
        { status: 410, headers: CORS_HEADERS }
      );
    }

    if (share.max_downloads !== null && share.download_count >= share.max_downloads) {
      return NextResponse.json(
        { error: "This asset has reached its maximum download limit" },
        { status: 410, headers: CORS_HEADERS }
      );
    }

    // Password verification check
    if (share.password_hash) {
      const cookieName = getUnlockCookieName(slug);
      const unlockCookie = req.cookies.get(cookieName)?.value;
      const queryToken = req.nextUrl.searchParams.get("token") || req.nextUrl.searchParams.get("key");

      const tokenToVerify = unlockCookie || queryToken;
      if (!tokenToVerify || !verifyUnlockToken(tokenToVerify, slug, file.id)) {
        return NextResponse.json(
          {
            error: "Password protection enabled. Provide valid unlock token in cookie or ?token= query parameter.",
            code: "PASSWORD_REQUIRED",
          },
          { status: 401, headers: CORS_HEADERS }
        );
      }
    }

    // Non-blocking telemetry
    void logFileEvent({
      fileId: file.id,
      shareLinkId: share.id,
      eventType: "raw_view",
      req,
    });

    // Generate 1-hour presigned direct R2 edge URL with inline disposition and cache control
    const rawUrl = await createPresignedRawUrl(
      file.r2_key,
      file.sanitized_name,
      3600,
      file.mime_type
    );

    // Return 307 Temporary Redirect: 0 bytes of file payload flow through Vercel serverless functions
    return NextResponse.redirect(rawUrl, {
      status: 307,
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    console.error("Error serving raw asset redirect:", err);
    return NextResponse.json(
      { error: "Failed to resolve raw asset" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function HEAD(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  return GET(req, context);
}
