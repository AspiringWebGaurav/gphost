import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { requireApprovedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { shareCreateRatelimit } from "@/lib/redis/ratelimit";
import { generatePasswordSalt, hashSharePassword } from "@/lib/security/password";
import { shortenUrl } from "@/lib/xurl/client";
import { reserveXurlMapping, updateXurlMapping } from "@/lib/xurl/mapping";

export const dynamic = "force-dynamic";

const createShareSchema = z.object({
  fileId: z.string().uuid(),
  maxDownloads: z.number().int().positive().nullable().optional(),
  isSingleUse: z.boolean().optional().default(false),
  expiresInPreset: z
    .enum(["1h", "24h", "7d", "30d", "90d", "never", "file_expiry"])
    .optional(),
  expiresIn: z
    .enum(["1h", "24h", "7d", "30d", "90d", "never", "file_expiry"])
    .optional(),
  password: z.string().min(1).max(128).optional(),
  shortenWithXurl: z.boolean().optional().default(false),
  enableXurl: z.boolean().optional(),
});

function calculateShareExpiry(
  preset: string,
  fileExpiresAt: string | null
): Date | null {
  const now = Date.now();
  let candidateExpiry: Date | null = null;

  switch (preset) {
    case "1h":
      candidateExpiry = new Date(now + 60 * 60 * 1000);
      break;
    case "24h":
      candidateExpiry = new Date(now + 24 * 60 * 60 * 1000);
      break;
    case "7d":
      candidateExpiry = new Date(now + 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      candidateExpiry = new Date(now + 30 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      candidateExpiry = new Date(now + 90 * 24 * 60 * 60 * 1000);
      break;
    case "never":
      candidateExpiry = null;
      break;
    case "file_expiry":
    default:
      candidateExpiry = fileExpiresAt ? new Date(fileExpiresAt) : null;
      break;
  }

  // Effective Expiry Invariant: min(file.expires_at, share.expires_at)
  if (fileExpiresAt) {
    const fileExpiryDate = new Date(fileExpiresAt);
    if (!candidateExpiry || candidateExpiry > fileExpiryDate) {
      candidateExpiry = fileExpiryDate;
    }
  }

  return candidateExpiry;
}

function generateSecureSlug(): string {
  // 9 random bytes base64url encoded gives exactly 12 URL-safe characters
  return crypto.randomBytes(9).toString("base64url").slice(0, 12);
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authoritative server authentication & approval check
    const { user } = await requireApprovedUser();

    // 2. Ephemeral rate limiting
    const { success: rateLimitOk } = await shareCreateRatelimit.limit(user.id);
    if (!rateLimitOk) {
      return NextResponse.json(
        { error: "Too many share links created. Please slow down." },
        { status: 429 }
      );
    }

    // 3. Payload validation
    const body = await req.json().catch(() => ({}));
    const parseResult = createShareSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid share creation parameters", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const {
      fileId,
      maxDownloads,
      isSingleUse,
      expiresInPreset,
      expiresIn,
      password,
      shortenWithXurl: rawShorten,
      enableXurl,
    } = parseResult.data;

    const effectivePreset = expiresInPreset || expiresIn || "file_expiry";
    const shortenWithXurl = rawShorten ?? enableXurl ?? false;

    // 4. File ownership & eligibility check in PostgreSQL
    const adminClient = createAdminClient();
    const { data: file, error: fileError } = await adminClient
      .from("files")
      .select("id, user_id, status, expires_at")
      .eq("id", fileId)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (file.user_id !== user.id) {
      return NextResponse.json({ error: "Access denied: not file owner" }, { status: 403 });
    }

    // Only ACTIVE files may have share links created
    if (file.status !== "ACTIVE") {
      return NextResponse.json(
        { error: `Cannot share file with status '${file.status}'. File must be ACTIVE.` },
        { status: 409 }
      );
    }

    // Check if file has already expired
    if (file.expires_at && new Date(file.expires_at).getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "Cannot create share link for an expired file." },
        { status: 400 }
      );
    }

    // 5. Compute effective expiry
    const effectiveExpiry = calculateShareExpiry(effectivePreset, file.expires_at);

    // 6. Generate secure slug and internal verification token hash
    const slug = generateSecureSlug();
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const effectiveMaxDownloads = isSingleUse ? 1 : maxDownloads || null;

    // Optional password hashing
    let passwordHash: string | null = null;
    let passwordSalt: string | null = null;
    if (password) {
      passwordSalt = generatePasswordSalt();
      passwordHash = await hashSharePassword(password, passwordSalt);
    }

    // 7. Insert share link record into public.share_links
    const { data: shareRecord, error: shareError } = await adminClient
      .from("share_links")
      .insert({
        file_id: file.id,
        slug,
        token_hash: tokenHash,
        max_downloads: effectiveMaxDownloads,
        is_single_use: isSingleUse,
        expires_at: effectiveExpiry ? effectiveExpiry.toISOString() : null,
        is_active: true,
        password_hash: passwordHash,
        password_salt: passwordSalt,
      })
      .select("id, slug, max_downloads, is_single_use, expires_at, created_at")
      .single();

    if (shareError || !shareRecord) {
      console.error("Failed to insert share link:", shareError);
      return NextResponse.json({ error: "Database error creating share link" }, { status: 500 });
    }

    // Canonical Base URL: strictly trusted from server environment, never from untrusted Host headers
    const canonicalBaseUrl = (
      process.env.NEXT_PUBLIC_APP_URL || "https://gphost.eu.cc"
    ).replace(/\/+$/, "");
    const shareUrl = `${canonicalBaseUrl}/f/${shareRecord.slug}`;

    // 8. Atomic XURL Shortening (Optional, Non-blocking)
    let xurlPayload: {
      shortUrl?: string;
      status: "pending" | "active" | "failed" | "cooldown";
      error?: string;
    } | undefined = undefined;

    if (shortenWithXurl) {
      try {
        const { isCreator, mapping } = await reserveXurlMapping(shareRecord.id, shareUrl);
        if (isCreator) {
          const shortenRes = await shortenUrl(shareUrl);
          await updateXurlMapping(shareRecord.id, {
            status: shortenRes.status,
            xurlId: shortenRes.xurlId,
            xurlShortUrl: shortenRes.shortUrl,
            lastError: shortenRes.error,
            retryCount: (shortenRes.attempts || 1) - 1,
          });

          xurlPayload = {
            shortUrl: shortenRes.shortUrl,
            status: shortenRes.status,
            error: shortenRes.error,
          };
        } else if (mapping) {
          xurlPayload = {
            shortUrl: mapping.xurl_short_url ?? undefined,
            status: mapping.status,
            error: mapping.last_error ?? undefined,
          };
        }
      } catch (xurlErr) {
        console.error("[XURL] Error during share XURL processing (non-blocking):", xurlErr);
        xurlPayload = {
          status: "failed",
          error: "XURL processing failure",
        };
      }
    }

    // 9. Record audit event
    await adminClient.from("audit_logs").insert({
      actor_id: user.id,
      event_type: "SHARE_LINK_CREATED",
      resource_type: "share_link",
      resource_id: shareRecord.id,
      ip_hash: "server_authoritative",
      metadata: {
        slug: shareRecord.slug,
        is_single_use: isSingleUse,
        expires_at: shareRecord.expires_at,
        is_password_protected: Boolean(passwordHash),
        shorten_with_xurl: Boolean(shortenWithXurl),
        xurl_status: xurlPayload?.status,
      },
    });

    return NextResponse.json({
      success: true,
      shareUrl,
      slug: shareRecord.slug,
      xurl: xurlPayload,
      share: {
        slug: shareRecord.slug,
        shareUrl,
        expires_at: shareRecord.expires_at,
        max_downloads: shareRecord.max_downloads,
        is_single_use: shareRecord.is_single_use,
        is_password_protected: Boolean(passwordHash),
        xurl: xurlPayload,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (errorMsg.startsWith("ACCESS_DENIED")) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    console.error("Unhandled error in share create:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
