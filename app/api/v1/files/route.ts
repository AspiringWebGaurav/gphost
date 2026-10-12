import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-keys";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserMaxFiles } from "@/lib/storage/user-limits";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // 1. Authoritative Authentication & Permission Guard
    const authRes = await authenticateRequest(req, "files:read");
    if ("errorResponse" in authRes) {
      return authRes.errorResponse;
    }
    const { userId, profile } = authRes.auth;
    const adminClient = createAdminClient();

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10) || 20));
    const searchQuery = searchParams.get("q")?.trim() || "";
    const category = searchParams.get("category")?.toLowerCase() || "all";
    const sortBy = ["created_at", "updated_at", "byte_size", "sanitized_name"].includes(
      searchParams.get("sortBy") || ""
    )
      ? (searchParams.get("sortBy") as "created_at" | "updated_at" | "byte_size" | "sanitized_name")
      : "created_at";
    const sortOrder = searchParams.get("sortOrder")?.toLowerCase() === "asc" ? "asc" : "desc";

    // Dynamic detected origin
    const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const forwardedProto = req.headers.get("x-forwarded-proto") || (forwardedHost?.startsWith("localhost") ? "http" : "https");
    const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : (process.env.NEXT_PUBLIC_APP_URL || "https://gphost.eu.cc");

    // Build PostgREST query strictly bound to authenticated user
    let query = adminClient
      .from("files")
      .select(
        `id, filename, sanitized_name, byte_size, mime_type, status, expiry_preset, expires_at, created_at, updated_at,
         sha256, is_release_locked,
         share_links (
           id,
           slug,
           is_active,
           expires_at
         )`,
        { count: "exact" }
      )
      .eq("user_id", userId)
      .in("status", ["ACTIVE", "EXPIRING", "EXPIRED"]);

    // Search filter
    if (searchQuery) {
      query = query.or(`sanitized_name.ilike.%${searchQuery}%,filename.ilike.%${searchQuery}%`);
    }

    // Category filter
    if (category === "binaries" || category === "releases") {
      query = query.or("mime_type.ilike.%executable%,mime_type.ilike.%msi%,filename.ilike.%.exe,filename.ilike.%.msi,filename.ilike.%.sig,filename.ilike.%.dmg,filename.ilike.%.appimage");
    } else if (category === "archives") {
      query = query.or("mime_type.ilike.%zip%,mime_type.ilike.%tar%,mime_type.ilike.%gzip%,filename.ilike.%.zip,filename.ilike.%.7z,filename.ilike.%.tar.gz");
    }

    // Sorting & Pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    query = query.order(sortBy, { ascending: sortOrder === "asc" }).range(from, to);

    const primaryRes = await query;
    let data = primaryRes.data as Array<Record<string, any>> | null;
    let count = primaryRes.count;
    let queryError = primaryRes.error;

    // Schema fallback if sha256 or is_release_locked column not yet applied in DB
    if (queryError && (queryError.code === "42703" || queryError.message?.includes("sha256") || queryError.message?.includes("is_release_locked"))) {
      let fallbackQuery = adminClient
        .from("files")
        .select(
          `id, filename, sanitized_name, byte_size, mime_type, status, expiry_preset, expires_at, created_at, updated_at,
           share_links (
             id,
             slug,
             is_active,
             expires_at
           )`,
          { count: "exact" }
        )
        .eq("user_id", userId)
        .in("status", ["ACTIVE", "EXPIRING", "EXPIRED"]);

      if (searchQuery) {
        fallbackQuery = fallbackQuery.or(`sanitized_name.ilike.%${searchQuery}%,filename.ilike.%${searchQuery}%`);
      }
      const fallbackRes = await fallbackQuery.order(sortBy, { ascending: sortOrder === "asc" }).range(from, to);
      data = fallbackRes.data as Array<Record<string, any>> | null;
      count = fallbackRes.count;
      queryError = fallbackRes.error;
    }

    if (queryError) {
      console.error("[v1 Files API] Query error:", queryError);
      return NextResponse.json({ error: "Failed to retrieve files" }, { status: 500 });
    }

    interface DbShareLink {
      id: string;
      slug: string;
      is_active: boolean;
      expires_at: string | null;
    }

    interface DbFileRecord {
      id: string;
      filename: string;
      sanitized_name: string;
      byte_size: number;
      mime_type: string;
      status: string;
      expiry_preset: string;
      expires_at: string | null;
      created_at: string;
      updated_at: string;
      sha256?: string | null;
      is_release_locked?: boolean;
      share_links?: DbShareLink | DbShareLink[] | null;
    }

    const rawFiles = (data || []) as unknown as DbFileRecord[];

    const files = rawFiles.map((f) => {
      const shareList: DbShareLink[] = Array.isArray(f.share_links)
        ? f.share_links
        : f.share_links
        ? [f.share_links]
        : [];
      const activeShare = shareList.find((s) => s.is_active) || shareList[0];
      const slug = activeShare?.slug || null;

      const rawUrl = slug ? `${origin}/raw/${slug}` : `${origin}/raw/${f.id}`;
      const downloadUrl = slug ? `${origin}/f/${slug}` : `${origin}/f/${f.id}`;

      return {
        id: f.id,
        filename: f.filename,
        sanitized_name: f.sanitized_name,
        byte_size: f.byte_size,
        mime_type: f.mime_type,
        status: f.status,
        expiry_preset: f.expiry_preset,
        expires_at: f.expires_at,
        is_permanent: f.expires_at === null,
        sha256: f.sha256 || null,
        is_release_locked: Boolean(f.is_release_locked),
        slug,
        raw_url: rawUrl,
        permanent_raw_url: rawUrl,
        download_url: downloadUrl,
        created_at: f.created_at,
        updated_at: f.updated_at,
      };
    });

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / pageSize);
    const maxFiles = await getUserMaxFiles(userId);

    const remainingBytes =
      profile.quota_bytes === -1 ? -1 : Math.max(0, profile.quota_bytes - profile.storage_used_bytes);

    return NextResponse.json({
      success: true,
      files,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
      },
      storage: {
        quota_bytes: profile.quota_bytes,
        storage_used_bytes: profile.storage_used_bytes,
        reserved_bytes: profile.reserved_bytes,
        remaining_bytes: remainingBytes,
        active_files_count: totalCount,
        max_files: maxFiles,
        can_create_permanent: profile.role === "admin" || profile.can_create_permanent,
      },
    });
  } catch (err: unknown) {
    console.error("[v1 Files API] Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
