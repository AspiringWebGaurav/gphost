import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicShareRatelimit } from "@/lib/redis/ratelimit";
import { formatPublicShareMetadata, PublicShareMetadata } from "@/lib/storage/share";
import { getAuthenticatedUser, getUserProfile } from "@/lib/auth/session";
import { scheduleOpportunisticLifecycleSweep } from "@/lib/storage/lifecycle";
import { getClientIp } from "@/lib/security/ip";
import { redis } from "@/lib/redis/client";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // Trigger non-blocking, debounced background lifecycle sweep
    scheduleOpportunisticLifecycleSweep();

    if (!slug || typeof slug !== "string" || slug.length > 64) {
      return NextResponse.json({ error: "Invalid share slug" }, { status: 400 });
    }

    // 1. Ephemeral IP rate limiting
    const ip = getClientIp(req.headers);
    const { success: rateLimitOk } = await publicShareRatelimit.limit(ip);
    if (!rateLimitOk) {
      return NextResponse.json(
        { error: "Too many share inquiries. Please wait a moment." },
        { status: 429 }
      );
    }

    // 1b. Fast Redis Cache lookup (30s TTL)
    try {
      const cached = await redis.get<PublicShareMetadata>(`share:pub:${slug}`);
      if (cached) {
        return NextResponse.json(cached);
      }
    } catch {}

    // 2. Authoritative PostgreSQL lookup
    const adminClient = createAdminClient();
    const { data: share, error: shareError } = await adminClient
      .from("share_links")
      .select(`
        id,
        slug,
        is_active,
        is_single_use,
        expires_at,
        max_downloads,
        download_count,
        password_hash,
        file:files (
          id,
          sanitized_name,
          byte_size,
          mime_type,
          status,
          expires_at,
          is_password_protected
        )
      `)
      .eq("slug", slug)
      .single();

    if (shareError || !share || !share.file) {
      return NextResponse.json({ error: "Share link not found" }, { status: 404 });
    }

    // Explicit type extraction for joined file
    // Supabase can return joined relation as an object or single item
    const file = Array.isArray(share.file) ? share.file[0] : share.file;
    if (!file) {
      return NextResponse.json({ error: "Associated file not found" }, { status: 404 });
    }

    // 3. Status checks
    if (!share.is_active) {
      return NextResponse.json({ error: "This share link has been deactivated" }, { status: 410 });
    }

    if (file.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "This file is no longer available for download" },
        { status: 410 }
      );
    }

    // 4. Expiration check
    const now = Date.now();
    if (share.expires_at && new Date(share.expires_at).getTime() <= now) {
      return NextResponse.json({ error: "This share link has expired" }, { status: 410 });
    }

    if (file.expires_at && new Date(file.expires_at).getTime() <= now) {
      return NextResponse.json({ error: "This file has expired" }, { status: 410 });
    }

    // 5. Download count exhaustion check
    if (share.max_downloads !== null && share.download_count >= share.max_downloads) {
      return NextResponse.json(
        { error: "This share link has reached its maximum download limit" },
        { status: 410 }
      );
    }

    // 6. Strict Public Allow-List Metadata Return
    // Zero internal IDs, R2 keys, user emails, ETags, token hashes, or salts!
    const publicMeta = formatPublicShareMetadata(file, share);
    try {
      await redis.set(`share:pub:${slug}`, publicMeta, { ex: 30 });
    } catch {}
    return NextResponse.json(publicMeta);
  } catch (err) {
    console.error("Error reading public share metadata:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * NUCLEAR DELETION: Permanently delete/revoke a share link.
 * Only the file owner or an admin is authorized.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug } = await params;
    if (!slug || typeof slug !== "string") {
      return NextResponse.json({ error: "Invalid share slug" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // 1. Fetch share link with associated file owner
    const { data: share, error: shareError } = await adminClient
      .from("share_links")
      .select(`
        id,
        slug,
        is_active,
        file:files (
          id,
          user_id
        )
      `)
      .eq("slug", slug)
      .single();

    if (shareError || !share) {
      return NextResponse.json({ error: "Share link not found" }, { status: 404 });
    }

    const file = Array.isArray(share.file) ? share.file[0] : share.file;

    // Check authorization: must be file owner or admin
    const profile = await getUserProfile(user.id);
    const isAdmin = profile?.role === "admin";
    const isOwner = file && file.user_id === user.id;

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: You do not own this share link" },
        { status: 403 }
      );
    }

    // 2. Nuclear execution:
    // First, deactivate the link immediately
    await adminClient
      .from("share_links")
      .update({ is_active: false })
      .eq("id", share.id);

    // Delete associated xurl_mappings (explicitly to ensure no foreign key locks)
    await adminClient
      .from("xurl_mappings")
      .delete()
      .eq("share_link_id", share.id);

    // Permanently delete the share_links row (cascades to file_downloads)
    const { error: deleteError } = await adminClient
      .from("share_links")
      .delete()
      .eq("id", share.id);

    // Purge all ephemeral Redis keys associated with this slug
    try {
      await Promise.all([
        redis.del(`share:slug:${slug}`),
        redis.del(`share:pub:${slug}`),
        redis.del(`raw:meta:${slug}`),
        redis.del(`share_enhancements:${slug}`),
      ]);
    } catch {}

    if (deleteError) {
      console.error("Error permanently deleting share link:", deleteError);
      // Link is deactivated at minimum, so it will no longer be active
      return NextResponse.json(
        { success: true, message: "Share link deactivated" },
        { status: 200 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Share link permanently deleted",
    });
  } catch (err) {
    console.error("Error in nuclear share link deletion:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

const RESERVED_SLUGS = new Set([
  "api",
  "f",
  "admin",
  "login",
  "auth",
  "download",
  "share",
  "settings",
  "terms",
  "privacy",
  "dashboard",
  "files",
  "upload",
  "access-gate",
  "help",
  "docs",
  "about",
  "site",
  "raw",
]);

/**
 * EDIT CUSTOM SLUG: Update the slug of an existing share link with domain attachment.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug } = await params;
    const body = await req.json();
    const newSlug = body.newSlug?.trim().toLowerCase();

    if (!newSlug || !/^[a-z0-9_-]{3,48}$/.test(newSlug)) {
      return NextResponse.json(
        {
          error:
            "Invalid slug. Must be 3-48 characters, containing only letters, numbers, hyphens, and underscores.",
        },
        { status: 400 }
      );
    }

    if (RESERVED_SLUGS.has(newSlug)) {
      return NextResponse.json(
        { error: `The custom slug '${newSlug}' is reserved by the system.` },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // 1. Fetch share link with associated file
    const { data: share, error: shareError } = await adminClient
      .from("share_links")
      .select(`
        id,
        slug,
        is_active,
        file:files (
          id,
          user_id
        )
      `)
      .eq("slug", slug)
      .single();

    if (shareError || !share) {
      return NextResponse.json({ error: "Share link not found" }, { status: 404 });
    }

    const file = Array.isArray(share.file) ? share.file[0] : share.file;
    const profile = await getUserProfile(user.id);
    const isAdmin = profile?.role === "admin";
    const isOwner = file && file.user_id === user.id;

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: You do not own this share link" },
        { status: 403 }
      );
    }

    // 2. Check if newSlug is already taken
    if (newSlug !== slug) {
      const { data: existing } = await adminClient
        .from("share_links")
        .select("id")
        .eq("slug", newSlug)
        .maybeSingle();

      if (existing) {
        return NextResponse.json(
          { error: `The custom slug '${newSlug}' is already taken. Please choose another.` },
          { status: 409 }
        );
      }

      // Update the slug
      const { error: updateError } = await adminClient
        .from("share_links")
        .update({ slug: newSlug })
        .eq("id", share.id);

      if (updateError) {
        return NextResponse.json(
          { error: "Failed to update custom slug" },
          { status: 500 }
        );
      }

      // Purge old cache
      try {
        await Promise.all([
          redis.del(`share:slug:${slug}`),
          redis.del(`share:pub:${slug}`),
          redis.del(`raw:meta:${slug}`),
          redis.del(`share_enhancements:${slug}`),
        ]);
      } catch {}
    }

    return NextResponse.json({
      success: true,
      newSlug,
      shareUrl: `/f/${newSlug}`,
      rawUrl: `/raw/${newSlug}`,
    });
  } catch (err) {
    console.error("Error updating custom slug:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
