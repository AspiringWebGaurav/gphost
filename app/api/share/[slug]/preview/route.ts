import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPresignedPreviewUrl } from "@/lib/storage/r2";
import { getPreviewType } from "@/lib/storage/share";
import { getUnlockCookieName, verifyUnlockToken } from "@/lib/security/unlock-token";
import { getClientIp } from "@/lib/security/ip";
import { downloadClaimRatelimit } from "@/lib/redis/ratelimit";
import { logFileEvent } from "@/lib/telemetry/events";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug || typeof slug !== "string" || slug.length > 64) {
      return NextResponse.json({ error: "Invalid share slug" }, { status: 400 });
    }

    // Rate limit preview requests to prevent scraping flood
    const clientIp = getClientIp(req.headers);
    const { success: rateLimitOk } = await downloadClaimRatelimit.limit(`prev:${clientIp}`);
    if (!rateLimitOk) {
      return NextResponse.json(
        { error: "Too many preview requests. Please wait a moment." },
        { status: 429 }
      );
    }

interface PreviewFileRecord {
  id: string;
  sanitized_name: string;
  r2_key: string;
  byte_size: number;
  mime_type: string;
  status: string;
  expires_at: string | null;
}

interface SharePreviewRecord {
  id: string;
  slug: string;
  is_active: boolean;
  expires_at: string | null;
  max_downloads: number | null;
  download_count: number;
  burn_after_preview?: boolean | null;
  first_previewed_at?: string | null;
  preview_count?: number | null;
  password_hash?: string | null;
  file: PreviewFileRecord | PreviewFileRecord[] | null;
}

    const adminClient = createAdminClient();
    let shareRecord: SharePreviewRecord | null = null;

    const { data: shareWithBurn, error: shareErr } = await adminClient
      .from("share_links")
      .select(`
        id,
        slug,
        is_active,
        expires_at,
        max_downloads,
        download_count,
        burn_after_preview,
        first_previewed_at,
        preview_count,
        password_hash,
        file:files (
          id,
          sanitized_name,
          r2_key,
          byte_size,
          mime_type,
          status,
          expires_at
        )
      `)
      .eq("slug", slug)
      .single();

    if (shareErr && (shareErr.code === "PGRST204" || shareErr.message?.includes("burn_after_preview"))) {
      // Fallback query if migration is pending in Supabase SQL editor
      const { data: fallbackShare, error: fallbackErr } = await adminClient
        .from("share_links")
        .select(`
          id,
          slug,
          is_active,
          expires_at,
          max_downloads,
          download_count,
          password_hash,
          file:files (
            id,
            sanitized_name,
            r2_key,
            byte_size,
            mime_type,
            status,
            expires_at
          )
        `)
        .eq("slug", slug)
        .single();

      if (fallbackErr || !fallbackShare) {
        return NextResponse.json({ error: "Share link not found" }, { status: 404 });
      }
      shareRecord = {
        ...fallbackShare,
        burn_after_preview: false,
        first_previewed_at: null,
        preview_count: 0,
      };
    } else if (shareErr || !shareWithBurn) {
      return NextResponse.json({ error: "Share link not found" }, { status: 404 });
    } else {
      shareRecord = shareWithBurn;
    }

    const share = shareRecord;

    if (!share || !share.file) {
      return NextResponse.json({ error: "Share link not found" }, { status: 404 });
    }

    const file = Array.isArray(share.file) ? share.file[0] : share.file;
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (!share.is_active || file.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "This file is no longer available" },
        { status: 410 }
      );
    }

    const now = Date.now();
    if (
      (share.expires_at && new Date(share.expires_at).getTime() <= now) ||
      (file.expires_at && new Date(file.expires_at).getTime() <= now)
    ) {
      return NextResponse.json({ error: "This share link has expired" }, { status: 410 });
    }

    if (share.max_downloads !== null && share.download_count >= share.max_downloads) {
      return NextResponse.json(
        { error: "This share link has reached its maximum download limit" },
        { status: 410 }
      );
    }

    // If password-protected, verify the signed unlock cookie
    if (share.password_hash) {
      const cookieName = getUnlockCookieName(slug);
      const unlockCookie = req.cookies.get(cookieName)?.value;

      if (!unlockCookie || !verifyUnlockToken(unlockCookie, slug, file.id)) {
        return NextResponse.json(
          {
            error: "This share link is password-protected. Password unlock required.",
            code: "PASSWORD_REQUIRED",
          },
          { status: 401 }
        );
      }
    }

    const previewType = getPreviewType(file.mime_type, file.sanitized_name);
    if (!previewType) {
      return NextResponse.json(
        { error: "File format is not previewable in browser" },
        { status: 415 }
      );
    }

    let effectiveExpiry = share.expires_at;

    // Handle Burn-on-Preview lifecycle:
    // When previewed for the first time, arm a 60-second self-destruct lease
    if (share.burn_after_preview) {
      if (!share.first_previewed_at) {
        const burnExpiry = new Date(Date.now() + 60000).toISOString();
        effectiveExpiry = burnExpiry;

        await adminClient
          .from("share_links")
          .update({
            first_previewed_at: new Date().toISOString(),
            preview_count: (share.preview_count || 0) + 1,
            expires_at: burnExpiry,
          })
          .eq("id", share.id);

        // Also arm underlying file expiration for R2 sweeper
        await adminClient
          .from("files")
          .update({ expires_at: burnExpiry })
          .eq("id", file.id);
      }
    }

    // Non-blocking telemetry
    void logFileEvent({
      fileId: file.id,
      shareLinkId: share.id,
      eventType: "preview",
      req,
    });

    const previewUrl = await createPresignedPreviewUrl(
      file.r2_key,
      file.sanitized_name,
      600, // 10 minutes
      file.mime_type
    );

    return NextResponse.json({
      success: true,
      previewUrl,
      downloadUrl: previewUrl,
      previewType,
      mime_type: file.mime_type,
      filename: file.sanitized_name,
      byte_size: file.byte_size,
      burn_after_preview: Boolean(share.burn_after_preview),
      burnAfterPreview: Boolean(share.burn_after_preview),
      first_previewed_at: share.first_previewed_at || (share.burn_after_preview ? new Date().toISOString() : null),
      firstPreviewedAt: share.first_previewed_at || (share.burn_after_preview ? new Date().toISOString() : null),
      expires_at: effectiveExpiry,
    });
  } catch (err) {
    console.error("Error generating preview URL:", err);
    return NextResponse.json({ error: "Failed to generate preview" }, { status: 500 });
  }
}
