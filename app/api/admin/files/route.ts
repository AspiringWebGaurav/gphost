import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminOpRatelimit } from "@/lib/redis/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { user: adminUser } = await requireAdminUser();

    // Rate Limit
    const { success: allowed } = await adminOpRatelimit.limit(adminUser.id);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "RATE_LIMITED", message: "Admin rate limit exceeded." },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10) || 20));
    const searchQuery = searchParams.get("q")?.trim() || "";
    const statusFilter = searchParams.get("status")?.trim() || "";

    const adminClient = createAdminClient();

    // Query files with owner profile join
    // STRICT SECURITY: Never select internal storage keys, upload IDs, ETags, password hashes, or salts
    let query = adminClient
      .from("files")
      .select(
        "id, user_id, filename, sanitized_name, byte_size, mime_type, status, expiry_preset, expires_at, created_at, profiles!inner(email, full_name)",
        { count: "exact" }
      );

    if (searchQuery) {
      // Search in sanitized filename
      query = query.ilike("sanitized_name", `%${searchQuery}%`);
    }

    if (statusFilter && statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    query = query
      .order("created_at", { ascending: false })
      .range(from, to);

    const { data: rawFiles, count, error: filesError } = await query;

    if (filesError) {
      console.error("[Admin Files API] Query error:", filesError);
      return NextResponse.json({ success: false, error: "DATABASE_ERROR" }, { status: 500 });
    }

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    interface RawAdminFileRecord {
      id: string;
      user_id: string;
      filename: string;
      sanitized_name: string;
      byte_size: number;
      mime_type: string;
      status: string;
      expiry_preset: string;
      expires_at: string | null;
      created_at: string;
      profiles?: { email: string; full_name: string | null } | { email: string; full_name: string | null }[];
    }

    // Format safe response (strictly clean of internal storage keys)
    const formattedFiles = (rawFiles as unknown as RawAdminFileRecord[] || []).map((f: RawAdminFileRecord) => {
      const profile = Array.isArray(f.profiles) ? f.profiles[0] : f.profiles;
      return {
        id: f.id,
        user_id: f.user_id,
        filename: f.filename,
        sanitized_name: f.sanitized_name,
        byte_size: f.byte_size,
        mime_type: f.mime_type,
        status: f.status,
        expiry_preset: f.expiry_preset,
        expires_at: f.expires_at,
        created_at: f.created_at,
        owner_email: profile?.email || "unknown",
        owner_name: profile?.full_name || null,
      };
    });

    return NextResponse.json({
      success: true,
      files: formattedFiles,
      totalCount,
      page,
      pageSize,
      totalPages,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ success: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (errorMsg.includes("FORBIDDEN")) {
      return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
    }
    console.error("[Admin Files API] Error:", errorMsg);
    return NextResponse.json({ success: false, error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
