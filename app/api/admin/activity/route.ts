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
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10) || 25));
    const eventType = searchParams.get("eventType")?.trim() || "";
    const actorId = searchParams.get("actorId")?.trim() || "";

    const adminClient = createAdminClient();

    let query = adminClient
      .from("audit_logs")
      .select("id, actor_id, event_type, resource_type, resource_id, metadata, ip_hash, created_at, profiles(email, full_name)", { count: "exact" });

    if (eventType && eventType !== "all") {
      query = query.eq("event_type", eventType);
    }

    if (actorId) {
      query = query.eq("actor_id", actorId);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    query = query
      .order("created_at", { ascending: false })
      .range(from, to);

    const { data: rawLogs, count, error: logsError } = await query;

    if (logsError) {
      console.error("[Admin Activity API] Error:", logsError);
      return NextResponse.json({ success: false, error: "DATABASE_ERROR" }, { status: 500 });
    }

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / pageSize);
    interface RawAuditLogRecord {
      id: string;
      actor_id: string | null;
      event_type: string;
      resource_type: string;
      resource_id: string | null;
      metadata: unknown;
      ip_hash: string | null;
      created_at: string;
      profiles?: { email: string; full_name: string | null } | { email: string; full_name: string | null }[];
    }

    const formattedLogs = (rawLogs as unknown as RawAuditLogRecord[] || []).map((l: RawAuditLogRecord) => {
      const profile = Array.isArray(l.profiles) ? l.profiles[0] : l.profiles;
      return {
        id: l.id,
        actor_id: l.actor_id,
        actor_email: profile?.email || "system",
        actor_name: profile?.full_name || null,
        event_type: l.event_type,
        resource_type: l.resource_type,
        resource_id: l.resource_id,
        metadata: l.metadata,
        ip_hash: l.ip_hash,
        created_at: l.created_at,
      };
    });

    return NextResponse.json({
      success: true,
      logs: formattedLogs,
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
    console.error("[Admin Activity API] Error:", errorMsg);
    return NextResponse.json({ success: false, error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
