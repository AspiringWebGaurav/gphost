import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicShareRatelimit } from "@/lib/redis/ratelimit";
import { formatPublicShareMetadata } from "@/lib/storage/share";
import { getAuthenticatedUser, getUserProfile } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    if (!slug || typeof slug !== "string" || slug.length > 64) {
      return NextResponse.json({ error: "Invalid share slug" }, { status: 400 });
    }

    // 1. Ephemeral IP rate limiting
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const { success: rateLimitOk } = await publicShareRatelimit.limit(ip);
    if (!rateLimitOk) {
      return NextResponse.json(
        { error: "Too many share inquiries. Please wait a moment." },
        { status: 429 }
      );
    }

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
    return NextResponse.json(formatPublicShareMetadata(file, share));
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
