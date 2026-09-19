import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface LogEventParams {
  fileId: string;
  shareLinkId?: string | null;
  eventType: "download" | "preview" | "raw_view";
  req: NextRequest;
}

/**
 * Asynchronously logs an edge telemetry event (country, city, referrer)
 * without blocking or slowing down the primary response pipeline.
 */
export async function logFileEvent({
  fileId,
  shareLinkId,
  eventType,
  req,
}: LogEventParams): Promise<void> {
  try {
    const country =
      req.headers.get("cf-ipcountry") ||
      req.headers.get("x-vercel-ip-country") ||
      null;
    const city =
      req.headers.get("cf-ipcity") ||
      req.headers.get("x-vercel-ip-city") ||
      null;
    const referrer = req.headers.get("referer") || null;
    const userAgent = req.headers.get("user-agent") || null;

    const adminClient = createAdminClient();
    await adminClient.from("file_events").insert({
      file_id: fileId,
      share_link_id: shareLinkId || null,
      event_type: eventType,
      country_code: country,
      city,
      referrer,
      user_agent: userAgent,
    });
  } catch (err) {
    // Non-blocking telemetry: never throw or break user downloads
    console.error("Telemetry event logging error:", err);
  }
}
