import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { RESERVED_SLUGS } from "@/lib/share/constants";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const rawSlug = searchParams.get("slug");

    if (!rawSlug || !rawSlug.trim()) {
      return NextResponse.json({ available: false, error: "Slug cannot be empty" }, { status: 400 });
    }

    const slug = rawSlug.trim().toLowerCase();

    if (slug.length < 3) {
      return NextResponse.json({ available: false, error: "Slug must be at least 3 characters" }, { status: 400 });
    }

    if (slug.length > 48) {
      return NextResponse.json({ available: false, error: "Slug cannot exceed 48 characters" }, { status: 400 });
    }

    if (!/^[a-z0-9_-]+$/.test(slug)) {
      return NextResponse.json(
        { available: false, error: "Slug can only contain letters, numbers, hyphens, and underscores" },
        { status: 400 }
      );
    }

    if (RESERVED_SLUGS.has(slug)) {
      return NextResponse.json({
        available: false,
        isReserved: true,
        error: `The custom slug '${slug}' is reserved by the system`,
      });
    }

    const adminClient = createAdminClient();
    const { data: existingShare, error } = await adminClient
      .from("share_links")
      .select("id, is_active, expires_at")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      console.error("[check-slug] DB lookup error:", error);
    }

    if (existingShare) {
      const isExpired =
        !existingShare.is_active ||
        (existingShare.expires_at && new Date(existingShare.expires_at).getTime() <= Date.now());

      if (isExpired) {
        // Zero Stale Data: Opportunistically purge the expired/stale row on-the-fly to free the slug immediately
        await adminClient.from("share_links").delete().eq("id", existingShare.id);
      } else {
        return NextResponse.json({
          available: false,
          isTaken: true,
          error: `The custom slug '${slug}' is already taken`,
        });
      }
    }

    return NextResponse.json({
      available: true,
      slug,
      message: "Slug is available",
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ available: false, error: errorMsg }, { status: 500 });
  }
}
