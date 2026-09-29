import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { shortenUrl, deleteXurlLink } from "@/lib/xurl/client";
import { reserveXurlMapping, updateXurlMapping } from "@/lib/xurl/mapping";

export const dynamic = "force-dynamic";

/**
 * Generates or retries XURL shortlink generation for an existing share link.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { user, profile } = await requireApprovedUser();
    const { slug } = await context.params;

    if (!slug) {
      return NextResponse.json({ error: "Missing slug parameter" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // 1. Fetch share link
    const { data: share, error: shareError } = await adminClient
      .from("share_links")
      .select("id, slug, expires_at, is_active, file:files(id, user_id)")
      .eq("slug", slug)
      .single();

    if (shareError || !share) {
      return NextResponse.json({ error: "Share link not found" }, { status: 404 });
    }

    // 2. Authorization guard: owner or admin only
    const file = Array.isArray(share.file) ? share.file[0] : share.file;
    const isOwner = file && file.user_id === user.id;
    const isAdmin = profile.role === "admin";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Forbidden: Not share link owner" }, { status: 403 });
    }

    if (!share.is_active) {
      return NextResponse.json({ error: "Cannot create shortlink for deactivated link" }, { status: 400 });
    }

    // 3. Compute target URL
    const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const proto = req.headers.get("x-forwarded-proto") || (forwardedHost.startsWith("localhost") || forwardedHost.startsWith("127.0.0.1") ? "http" : "https");
    const activeOrigin = (forwardedHost ? `${proto}://${forwardedHost}` : (process.env.NEXT_PUBLIC_APP_URL || "https://gphost.eu.cc")).replace(/\/+$/, "");
    const isLocal =
      activeOrigin.includes("localhost") ||
      activeOrigin.includes("127.0.0.1") ||
      activeOrigin.includes("::1") ||
      activeOrigin.includes("192.168.");
    const defaultXurlBase = isLocal ? "https://gphost.eu.cc" : activeOrigin;
    const xurlBase = (process.env.XURL_TARGET_BASE_URL || defaultXurlBase).replace(/\/+$/, "");
    const targetUrl = `${xurlBase}/f/${share.slug}`;

    // 4. Reserve mapping
    await reserveXurlMapping(share.id, targetUrl);

    // 5. Execute shortening
    const shortenRes = await shortenUrl(targetUrl, {
      customSlug: slug,
      expiresAt: share.expires_at,
    });

    await updateXurlMapping(share.id, {
      status: shortenRes.status,
      xurlId: shortenRes.xurlId,
      xurlShortUrl: shortenRes.shortUrl,
      lastError: shortenRes.error,
      retryCount: (shortenRes.attempts || 1) - 1,
    });

    if (shortenRes.status === "active") {
      return NextResponse.json({
        success: true,
        shortUrl: shortenRes.shortUrl,
        xurlId: shortenRes.xurlId,
        status: "active",
      });
    }

    return NextResponse.json(
      {
        success: false,
        status: shortenRes.status,
        error: shortenRes.error || "Failed to generate XURL shortlink",
      },
      { status: 502 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

/**
 * Deletes XURL shortlink for this share link from both XURL and database.
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { user, profile } = await requireApprovedUser();
    const { slug } = await context.params;

    const adminClient = createAdminClient();
    const { data: share } = await adminClient
      .from("share_links")
      .select("id, file:files(user_id)")
      .eq("slug", slug)
      .single();

    if (!share) {
      return NextResponse.json({ error: "Share link not found" }, { status: 404 });
    }

    const file = Array.isArray(share.file) ? share.file[0] : share.file;
    const isOwner = file && file.user_id === user.id;
    const isAdmin = profile.role === "admin";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: mapping } = await adminClient
      .from("xurl_mappings")
      .select("xurl_id")
      .eq("share_link_id", share.id)
      .maybeSingle();

    if (mapping?.xurl_id) {
      await deleteXurlLink(mapping.xurl_id);
    }

    await adminClient.from("xurl_mappings").delete().eq("share_link_id", share.id);

    return NextResponse.json({ success: true, message: "XURL shortlink deleted" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
