import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-keys";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/releases/[appId]/history
 * Returns the complete release history, active status, lock status, and checksums for any appId.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ appId: string }> }
) {
  const authRes = await authenticateRequest(req);
  if ("errorResponse" in authRes) {
    return authRes.errorResponse;
  }

  try {
    const { appId: rawAppId } = await context.params;
    const appId = rawAppId?.trim().toLowerCase();
    if (!appId || !/^[a-z0-9.\-_+]+$/.test(appId)) {
      return NextResponse.json({ error: "Invalid or missing 'appId' parameter" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: releases, error } = await adminClient
      .from("app_releases")
      .select(`
        id, version, release_notes, is_active, is_locked, is_published,
        binary_sha256, binary_byte_size, published_at, created_at,
        binary_file:files!app_releases_binary_file_id_fkey (
          id, sanitized_name, filename
        )
      `)
      .eq("app_id", appId)
      .order("published_at", { ascending: false, nullsFirst: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") || (host?.startsWith("localhost") ? "http" : "https");
    const origin = host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_APP_URL || "https://gphost.eu.cc";

    const formatted = (releases || []).map((r: any) => {
      const fileRecord = r.binary_file
        ? Array.isArray(r.binary_file)
          ? r.binary_file[0]
          : r.binary_file
        : null;
      return {
        id: r.id,
        version: r.version,
        notes: r.release_notes,
        is_active: r.is_active,
        is_locked: r.is_locked,
        is_published: r.is_published,
        sha256: r.binary_sha256,
        byte_size: r.binary_byte_size,
        published_at: r.published_at,
        created_at: r.created_at,
        filename: fileRecord?.sanitized_name || fileRecord?.filename || `${appId}-setup-${r.version}.exe`,
        download_url: `${origin}/api/v1/releases/${appId}/download/${r.version}`,
      };
    });

    return NextResponse.json(
      {
        app_id: appId,
        total: formatted.length,
        active_version: formatted.find((r) => r.is_active)?.version || null,
        releases: formatted,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch release history" }, { status: 500 });
  }
}
