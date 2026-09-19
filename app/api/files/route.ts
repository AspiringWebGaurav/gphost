import { NextRequest, NextResponse, after } from "next/server";
import { requireApprovedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { scheduleOpportunisticLifecycleSweep } from "@/lib/storage/lifecycle";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { user, profile } = await requireApprovedUser();
    const adminClient = createAdminClient();

    // Trigger non-blocking, debounced background lifecycle sweep (Vercel Hobby / self-healing)
    scheduleOpportunisticLifecycleSweep();

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10) || 20));
    const searchQuery = searchParams.get("q")?.trim() || "";
    const category = searchParams.get("category")?.toLowerCase() || "all";
    const sortBy = ["created_at", "byte_size", "sanitized_name", "expires_at"].includes(
      searchParams.get("sortBy") || ""
    )
      ? (searchParams.get("sortBy") as "created_at" | "byte_size" | "sanitized_name" | "expires_at")
      : "created_at";
    const sortOrder = searchParams.get("sortOrder")?.toLowerCase() === "asc" ? "asc" : "desc";

    // Non-blocking Lazy Reconciliation: Transition past-due files to EXPIRED in background
    const nowIso = new Date().toISOString();
    try {
      after(async () => {
        await adminClient
          .from("files")
          .update({ status: "EXPIRED", updated_at: nowIso })
          .eq("user_id", user.id)
          .in("status", ["ACTIVE", "EXPIRING"])
          .not("expires_at", "is", null)
          .lte("expires_at", nowIso);
      });
    } catch {
      // Ignore if outside after context
    }

    // Build PostgREST query strictly bound to the authenticated user (Tenant Isolation)
    // Build PostgREST query strictly bound to the authenticated user (Tenant Isolation)
    let query = adminClient
      .from("files")
      .select(
        `id, filename, sanitized_name, byte_size, mime_type, status, expiry_preset, expires_at, created_at,
         share_links (
           id,
           slug,
           is_active,
           expires_at
         )`,
        { count: "exact" }
      )
      .eq("user_id", user.id)
      .in("status", ["ACTIVE", "EXPIRING", "EXPIRED"]);

    // Search filter
    if (searchQuery) {
      query = query.ilike("sanitized_name", `%${searchQuery}%`);
    }

    // Category filter
    if (category === "websites") {
      query = query.or("mime_type.eq.text/html,filename.ilike.%.html,filename.ilike.%.htm");
    } else if (category === "images") {
      query = query.like("mime_type", "image/%");
    } else if (category === "documents") {
      query = query.in("mime_type", [
        "text/html",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "text/csv",
        "text/markdown",
      ]);
    } else if (category === "media") {
      query = query.or("mime_type.like.video/%,mime_type.like.audio/%");
    } else if (category === "archives") {
      query = query.in("mime_type", [
        "application/zip",
        "application/x-tar",
        "application/gzip",
        "application/x-7z-compressed",
        "application/vnd.rar",
        "application/x-zip-compressed",
      ]);
    }

    // Sorting & Pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    query = query
      .order(sortBy, { ascending: sortOrder === "asc" })
      .range(from, to);

    const [filesRes, profileRes] = await Promise.all([
      query,
      adminClient
        .from("profiles")
        .select("quota_bytes, storage_used_bytes, reserved_bytes")
        .eq("id", user.id)
        .single(),
    ]);

    if (filesRes.error) {
      console.error("[Files API] Query error:", filesRes.error);
      return NextResponse.json({ success: false, error: "Failed to load files" }, { status: 500 });
    }

    interface DbShareLink {
      id: string;
      slug: string;
      is_active: boolean;
      expires_at: string | null;
    }

    interface DbFileItem {
      id: string;
      filename: string;
      sanitized_name: string;
      byte_size: number;
      mime_type: string;
      status: string;
      expiry_preset?: string;
      expires_at: string | null;
      created_at: string;
      share_links?: DbShareLink | DbShareLink[] | null;
    }

    const files = ((filesRes.data as unknown as DbFileItem[]) || []).map((f) => {
      const rawShareLinks: DbShareLink[] = Array.isArray(f.share_links)
        ? f.share_links
        : f.share_links
        ? [f.share_links]
        : [];
      const activeShare = rawShareLinks.find((s) => s.is_active) || rawShareLinks[0];
      const shareSlug = activeShare?.slug || null;
      const isSite = f.mime_type === "text/html" || Boolean(shareSlug);
      return {
        id: f.id,
        filename: f.filename,
        sanitized_name: f.sanitized_name,
        byte_size: f.byte_size,
        mime_type: f.mime_type,
        status: f.status,
        expiry_preset: f.expiry_preset,
        expires_at: f.expires_at,
        created_at: f.created_at,
        share_slug: shareSlug,
        is_site: isSite,
      };
    });
    const totalCount = filesRes.count || 0;
    const totalPages = Math.ceil(totalCount / pageSize);
    const currentProfile = profileRes.data;

    return NextResponse.json({
      success: true,
      files: files || [],
      totalCount,
      page,
      pageSize,
      totalPages,
      quota: {
        quota_bytes: currentProfile?.quota_bytes ?? profile.quota_bytes,
        storage_used_bytes: currentProfile?.storage_used_bytes ?? profile.storage_used_bytes,
        reserved_bytes: currentProfile?.reserved_bytes ?? profile.reserved_bytes,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }
    if (errorMsg.startsWith("ACCESS_DENIED")) {
      return NextResponse.json({ success: false, error: "Access denied" }, { status: 403 });
    }
    console.error("[Files API] Unhandled error:", err);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
