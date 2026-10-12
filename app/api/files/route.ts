import { NextRequest, NextResponse, after } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-keys";
import { createAdminClient } from "@/lib/supabase/admin";
import { scheduleOpportunisticLifecycleSweep } from "@/lib/storage/lifecycle";
import { redis } from "@/lib/redis/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authRes = await authenticateRequest(req, "files:read");
    if ("errorResponse" in authRes) return authRes.errorResponse;
    const { userId: user_id, profile } = authRes.auth;
    const user = { id: user_id, email: profile.email };
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

    // Non-blocking Lazy Reconciliation: Transition past-due files to EXPIRED in background (throttled to once per 5m per user)
    const nowIso = new Date().toISOString();
    try {
      after(async () => {
        try {
          const acquired = await redis.set(`reconcile:user:${user.id}`, "1", { nx: true, ex: 300 });
          if (!acquired) return;
        } catch {}

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

    // PostgREST query helper strictly bound to the authenticated user (Tenant Isolation)
    const selectWithRelease = `id, filename, sanitized_name, byte_size, mime_type, status, expiry_preset, expires_at, created_at, sha256, is_release_locked,
         share_links (
           id,
           slug,
           is_active,
           expires_at,
           xurl_mappings (
             xurl_short_url,
             status
           )
         )`;

    const selectStandard = `id, filename, sanitized_name, byte_size, mime_type, status, expiry_preset, expires_at, created_at,
         share_links (
           id,
           slug,
           is_active,
           expires_at,
           xurl_mappings (
             xurl_short_url,
             status
           )
         )`;

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const buildQuery = (selectFields: string) => {
      let q = adminClient
        .from("files")
        .select(selectFields, { count: "exact" })
        .eq("user_id", user.id)
        .in("status", ["ACTIVE", "EXPIRING", "EXPIRED"]);

      // Search filter
      if (searchQuery) {
        q = q.ilike("sanitized_name", `%${searchQuery}%`);
      }

      // Category filter
      if (category === "gpn") {
        q = q.or("sanitized_name.ilike.%gpn%,filename.ilike.%gpn%");
      } else if (category === "api") {
        q = q.or("sanitized_name.ilike.%gpn%,filename.ilike.%gpn%,filename.ilike.%.exe,filename.ilike.%.sig,filename.ilike.%.msi,filename.ilike.%.zip");
      } else if (category === "websites") {
        q = q.or("mime_type.eq.text/html,filename.ilike.%.html,filename.ilike.%.htm");
      } else if (category === "images") {
        q = q.like("mime_type", "image/%");
      } else if (category === "documents") {
        q = q.in("mime_type", [
          "text/html",
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "text/plain",
          "text/csv",
          "text/markdown",
        ]);
      } else if (category === "media") {
        q = q.or("mime_type.like.video/%,mime_type.like.audio/%");
      } else if (category === "archives") {
        q = q.in("mime_type", [
          "application/zip",
          "application/x-tar",
          "application/gzip",
          "application/x-7z-compressed",
          "application/vnd.rar",
          "application/x-zip-compressed",
        ]);
      }

      return q.order(sortBy, { ascending: sortOrder === "asc" }).range(from, to);
    };

    // Check for cached user share stats in Redis (30-second TTL)
    let activeLinksCount = 0;
    let totalDownloads = 0;
    const shareStatsCacheKey = `user:share_stats:${user.id}`;
    let hasCachedStats = false;

    try {
      const cachedStats = await redis.get<{ activeLinks: number; totalDownloads: number }>(shareStatsCacheKey);
      if (cachedStats && typeof cachedStats.activeLinks === "number") {
        activeLinksCount = cachedStats.activeLinks;
        totalDownloads = cachedStats.totalDownloads;
        hasCachedStats = true;
      }
    } catch {}

    let [filesRes, shareLinksRes] = await Promise.all([
      buildQuery(selectWithRelease),
      hasCachedStats
        ? Promise.resolve({ data: null, error: null })
        : adminClient
            .from("share_links")
            .select(
              `id, download_count, max_downloads, expires_at, is_active,
               files!inner(id, user_id, status, expires_at)`
            )
            .eq("files.user_id", user.id)
            .eq("files.status", "ACTIVE")
            .eq("is_active", true),
    ]);

    // Resilient schema fallback: if sha256 or is_release_locked is not yet migrated, fall back seamlessly
    if (filesRes.error && (filesRes.error.code === "42703" || filesRes.error.message?.includes("column"))) {
      filesRes = await buildQuery(selectStandard);
    }

    if (filesRes.error) {
      console.error("[Files API] Query error:", filesRes.error);
      return NextResponse.json({ success: false, error: "Failed to load files" }, { status: 500 });
    }

    if (!hasCachedStats && shareLinksRes.data) {
      interface DbShareLinkStatsRow {
        id: string;
        download_count: number;
        max_downloads: number | null;
        expires_at: string | null;
        is_active: boolean;
        files:
          | { id: string; user_id: string; status: string; expires_at: string | null }
          | { id: string; user_id: string; status: string; expires_at: string | null }[];
      }

      const allUserLinks = (shareLinksRes.data as unknown as DbShareLinkStatsRow[] | null) || [];
      const nowMs = Date.now();
      const activeShareLinks = allUserLinks.filter((l) => {
        const file = Array.isArray(l.files) ? l.files[0] : l.files;
        if (!file || file.status !== "ACTIVE") return false;
        if (file.expires_at && new Date(file.expires_at).getTime() <= nowMs) return false;
        if (l.expires_at && new Date(l.expires_at).getTime() <= nowMs) return false;
        if (l.max_downloads !== null && l.download_count >= l.max_downloads) return false;
        return true;
      });

      activeLinksCount = activeShareLinks.length;
      totalDownloads = allUserLinks.reduce(
        (sum, l) => sum + (Number(l.download_count) || 0),
        0
      );

      // Cache stats in Redis for 30 seconds
      try {
        await redis.set(shareStatsCacheKey, { activeLinks: activeLinksCount, totalDownloads }, { ex: 30 });
      } catch {}
    }

    interface DbShareLink {
      id: string;
      slug: string;
      is_active: boolean;
      expires_at: string | null;
      xurl_mappings?:
        | { xurl_short_url: string; status: string }
        | { xurl_short_url: string; status: string }[];
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
      sha256?: string | null;
      is_release_locked?: boolean;
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
      const xurl = Array.isArray(activeShare?.xurl_mappings)
        ? activeShare.xurl_mappings[0]
        : activeShare?.xurl_mappings;
      const xurlShortUrl = xurl?.status === "active" ? xurl.xurl_short_url : null;
      const xurlStatus = xurl?.status || null;
      const isSite =
        f.mime_type === "text/html" ||
        f.sanitized_name?.toLowerCase().endsWith(".html") ||
        f.sanitized_name?.toLowerCase().endsWith(".htm");

      const isGpn =
        f.sanitized_name?.toLowerCase().includes("gpn") ||
        f.filename?.toLowerCase().includes("gpn") ||
        shareSlug === "gpn-app" ||
        shareSlug === "gpn-app-sig";
      const isApiUpload = Boolean(
        f.sha256 ||
        f.is_release_locked ||
        isGpn
      );
      const folder = isGpn ? "gpn" : (isApiUpload ? "api" : null);

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
        xurl_short_url: xurlShortUrl,
        xurl_status: xurlStatus,
        is_api_upload: isApiUpload,
        folder,
        sha256: f.sha256 || null,
        is_release_locked: Boolean(f.is_release_locked),
      };
    });
    const totalCount = filesRes.count || 0;
    const totalPages = Math.ceil(totalCount / pageSize);
    return NextResponse.json(
      {
        success: true,
        files: files || [],
        totalCount,
        page,
        pageSize,
        totalPages,
        stats: {
          totalFiles: totalCount,
          activeLinks: activeLinksCount,
          totalDownloads,
        },
        quota: {
          quota_bytes: profile.quota_bytes,
          storage_used_bytes: profile.storage_used_bytes,
          reserved_bytes: profile.reserved_bytes,
        },
      },
      {
        headers: {
          "Cache-Control": "private, max-age=5, stale-while-revalidate=30",
        },
      }
    );
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
