import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { user, profile } = await requireApprovedUser();
    const adminClient = createAdminClient();

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

    // Build PostgREST query strictly bound to the authenticated user (Tenant Isolation)
    let query = adminClient
      .from("files")
      .select(
        "id, filename, sanitized_name, byte_size, mime_type, status, expiry_preset, expires_at, created_at",
        { count: "exact" }
      )
      .eq("user_id", user.id)
      .not("status", "in", '("DELETE_PENDING","DELETE_FAILED","PURGED")');

    // Search filter
    if (searchQuery) {
      query = query.ilike("sanitized_name", `%${searchQuery}%`);
    }

    // Category filter
    if (category === "images") {
      query = query.like("mime_type", "image/%");
    } else if (category === "documents") {
      query = query.in("mime_type", [
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

    const { data: files, count, error: filesError } = await query;

    if (filesError) {
      console.error("[Files API] Query error:", filesError);
      return NextResponse.json({ success: false, error: "Failed to load files" }, { status: 500 });
    }

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    // Refresh profile quota state
    const { data: currentProfile } = await adminClient
      .from("profiles")
      .select("quota_bytes, storage_used_bytes, reserved_bytes")
      .eq("id", user.id)
      .single();

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
