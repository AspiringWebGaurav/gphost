import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApprovedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis/client";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

export interface FileAnalyticsSummary {
  totalEvents: number;
  totalViews: number;
  totalDownloads: number;
  rawViews: number;
  previewViews: number;
}

export interface FileAnalyticsResponse {
  success: boolean;
  summary: FileAnalyticsSummary;
  countries: { country: string; count: number }[];
  referrers: { referrer: string; count: number }[];
  recentEvents: {
    id: string;
    eventType: string;
    countryCode: string | null;
    city: string | null;
    referrer: string | null;
    createdAt: string;
  }[];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, profile } = await requireApprovedUser();
    const { id: fileId } = await params;

    const parseId = idSchema.safeParse(fileId);
    if (!parseId.success) {
      return NextResponse.json({ error: "Invalid file ID format" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Verify ownership
    const { data: file, error: fileErr } = await adminClient
      .from("files")
      .select("id, user_id, sanitized_name")
      .eq("id", fileId)
      .single();

    if (fileErr || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const isOwner = file.user_id === user.id;
    const isAdmin = profile.role === "admin";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Access denied: not file owner" }, { status: 403 });
    }

    // Check Redis cache first (60s TTL) to prevent database load
    const cacheKey = `analytics:${fileId}`;
    try {
      const cached = await redis.get<FileAnalyticsResponse>(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    } catch {
      // Graceful fallback if Redis is unavailable
    }

    // Fetch recent events for this file (limit to latest 500 for lean serverless memory)
    const { data: events, error: eventsErr } = await adminClient
      .from("file_events")
      .select("id, event_type, country_code, city, referrer, created_at")
      .eq("file_id", fileId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (eventsErr) {
      console.error("Failed to query file events:", eventsErr);
      return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
    }

    const rawList = events || [];
    let rawViews = 0;
    let previewViews = 0;
    let totalDownloads = 0;

    const countryMap = new Map<string, number>();
    const referrerMap = new Map<string, number>();

    for (const ev of rawList) {
      if (ev.event_type === "download") {
        totalDownloads++;
      } else if (ev.event_type === "raw_view") {
        rawViews++;
      } else if (ev.event_type === "preview") {
        previewViews++;
      }

      const c = ev.country_code || "Unknown";
      countryMap.set(c, (countryMap.get(c) || 0) + 1);

      if (ev.referrer) {
        try {
          const domain = new URL(ev.referrer).hostname;
          referrerMap.set(domain, (referrerMap.get(domain) || 0) + 1);
        } catch {
          referrerMap.set(ev.referrer.slice(0, 40), (referrerMap.get(ev.referrer.slice(0, 40)) || 0) + 1);
        }
      } else {
        referrerMap.set("Direct / None", (referrerMap.get("Direct / None") || 0) + 1);
      }
    }

    const sortedCountries = Array.from(countryMap.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const sortedReferrers = Array.from(referrerMap.entries())
      .map(([referrer, count]) => ({ referrer, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const recentEvents = rawList.slice(0, 20).map((ev) => ({
      id: ev.id,
      eventType: ev.event_type,
      countryCode: ev.country_code,
      city: ev.city,
      referrer: ev.referrer,
      createdAt: ev.created_at,
    }));

    const responsePayload: FileAnalyticsResponse = {
      success: true,
      summary: {
        totalEvents: rawList.length,
        totalViews: rawViews + previewViews,
        totalDownloads,
        rawViews,
        previewViews,
      },
      countries: sortedCountries,
      referrers: sortedReferrers,
      recentEvents,
    };

    // Store in cache for 60s
    try {
      await redis.set(cacheKey, responsePayload, { ex: 60 });
    } catch {
      // Non-blocking cache error
    }

    return NextResponse.json(responsePayload);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (errorMsg.startsWith("ACCESS_DENIED")) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    console.error("Unhandled error in GET /api/files/[id]/analytics:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
