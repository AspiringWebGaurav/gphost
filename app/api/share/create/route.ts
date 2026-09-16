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

const RESERVED_SLUGS = new Set([
  "api",
  "f",
  "admin",
  "login",
  "auth",
  "download",
  "share",
  "settings",
  "terms",
  "privacy",
  "dashboard",
  "files",
  "upload",
  "access-gate",
  "help",
  "docs",
  "about",
]);

import {
  EXPIRY_PRESET_VALUES,
} from "@/lib/storage/expiry";

const SHARE_EXPIRY_PRESETS = [...EXPIRY_PRESET_VALUES, "file_expiry"] as const;

const createShareSchema = z.object({
  fileId: z.string().uuid(),
  maxDownloads: z.number().int().positive().nullable().optional(),
  isSingleUse: z.boolean().optional().default(false),
  expiresInPreset: z.enum(SHARE_EXPIRY_PRESETS).optional(),
  expiresIn: z.enum(SHARE_EXPIRY_PRESETS).optional(),
  password: z.string().min(1).max(128).optional(),
  customSlug: z
    .string()
    .trim()
    .min(3, "Custom slug must be at least 3 characters")
    .max(48, "Custom slug cannot exceed 48 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Slug can only contain alphanumeric characters, underscores, and hyphens")
    .optional()
    .nullable(),
  shortenWithXurl: z.boolean().optional().default(false),
  enableXurl: z.boolean().optional(),
});

function calculateShareExpiry(
  _preset: string,
  fileExpiresAt: string | null
): Date | null {
  // Share links & XURL links strictly inherit the lifecycle established when the file was created
  return fileExpiresAt ? new Date(fileExpiresAt) : null;
}

function generateSecureSlug(): string {
  // 9 random bytes base64url encoded gives exactly 12 URL-safe characters
  return crypto.randomBytes(9).toString("base64url").slice(0, 12);
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authoritative server authentication & approval check
    const { user, profile } = await requireApprovedUser();

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
      customSlug,
      shortenWithXurl: rawShorten,
      enableXurl,
    } = parseResult.data;

    const effectivePreset = expiresInPreset || expiresIn || "file_expiry";
    const shortenWithXurl = rawShorten ?? enableXurl ?? false;

    // Detect if user has a paid/premium plan
    const isPremiumUser =
      profile.role === "admin" ||
      profile.can_create_permanent ||
      profile.quota_bytes === -1 ||
      profile.quota_bytes > 5368709120;

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

    // 6. Handle Custom Slug or generate secure random slug
    let slug: string;
    const sanitizedCustomSlug = customSlug?.trim().toLowerCase();

    if (sanitizedCustomSlug) {
      if (!isPremiumUser) {
        return NextResponse.json(
          {
            error:
              "Custom slugs are an exclusive Premium Plan feature. Please upgrade your plan to unlock custom slugs.",
          },
          { status: 403 }
        );
      }

      if (RESERVED_SLUGS.has(sanitizedCustomSlug)) {
        return NextResponse.json(
          {
            error: `The custom slug '${sanitizedCustomSlug}' is reserved by the system. Please pick another.`,
          },
          { status: 400 }
        );
      }

      // Check if custom slug already exists in share_links table
      const { data: existingShare } = await adminClient
        .from("share_links")
        .select("id")
        .eq("slug", sanitizedCustomSlug)
        .maybeSingle();

      if (existingShare) {
        return NextResponse.json(
          {
            error: `The custom slug '${sanitizedCustomSlug}' is already taken. Please choose a different one.`,
          },
          { status: 409 }
        );
      }

      slug = sanitizedCustomSlug;
    } else {
      slug = generateSecureSlug();
    }

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

    // Dynamic Request Base URL:
    // When running on localhost (or any preview/custom domain), dynamically detect the origin from request headers or nextUrl.
    const forwardedProto = req.headers.get("x-forwarded-proto");
    const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");

    let detectedOrigin = "";
    if (forwardedHost) {
      const isLocalHost =
        forwardedHost.includes("localhost") ||
        forwardedHost.includes("127.0.0.1") ||
        forwardedHost.includes("::1") ||
        forwardedHost.includes("192.168.");
      const proto = forwardedProto || (isLocalHost ? "http" : "https");
      detectedOrigin = `${proto}://${forwardedHost}`;
    } else {
      detectedOrigin = req.nextUrl.origin;
    }

    const activeOrigin = (
      detectedOrigin || process.env.NEXT_PUBLIC_APP_URL || "https://gphost.eu.cc"
    ).replace(/\/+$/, "");

    // Dynamic direct share URL: matches the active user's environment (local in dev, domain in production)
    const shareUrl = `${activeOrigin}/f/${shareRecord.slug}`;

    // Target URL passed to XURL shortener:
    // When in localhost / private network, generate XURL with the official domain https://gphost.eu.cc.
    // In production / custom domain, generate with the active origin.
    const isLocal =
      activeOrigin.includes("localhost") ||
      activeOrigin.includes("127.0.0.1") ||
      activeOrigin.includes("::1") ||
      activeOrigin.includes("192.168.");

    const defaultXurlBase = isLocal ? "https://gphost.eu.cc" : activeOrigin;
    const xurlBaseUrl = (
      process.env.XURL_TARGET_BASE_URL || defaultXurlBase
    ).replace(/\/+$/, "");
    const xurlTargetUrl = `${xurlBaseUrl}/f/${shareRecord.slug}`;

    // 8. Atomic XURL Shortening (Optional, Non-blocking) with customSlug and expiration sync
    let xurlPayload: {
      shortUrl?: string;
      status: "pending" | "active" | "failed" | "cooldown";
      error?: string;
    } | undefined = undefined;

    if (shortenWithXurl) {
      console.log(
        `[XURL] Requesting short link for target: ${xurlTargetUrl} (customSlug: ${sanitizedCustomSlug || "none"})`
      );
      try {
        const { isCreator, mapping } = await reserveXurlMapping(shareRecord.id, xurlTargetUrl);
        if (isCreator) {
          const shortenRes = await shortenUrl(xurlTargetUrl, {
            customSlug: sanitizedCustomSlug || undefined,
            expiresAt: effectiveExpiry ? effectiveExpiry.toISOString() : null,
          });
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

          if (shortenRes.status === "active") {
            console.log(`[XURL] Successfully created short link: ${shortenRes.shortUrl}`);
          } else {
            console.warn(
              `[XURL] Short link creation not active (${shortenRes.status}): ${shortenRes.error}`
            );
          }
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
        is_custom_slug: Boolean(sanitizedCustomSlug),
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
      isCustomSlug: Boolean(sanitizedCustomSlug),
      isPremium: isPremiumUser,
      xurl: xurlPayload,
      share: {
        slug: shareRecord.slug,
        shareUrl,
        expires_at: shareRecord.expires_at,
        max_downloads: shareRecord.max_downloads,
        is_single_use: shareRecord.is_single_use,
        is_password_protected: Boolean(passwordHash),
        is_custom_slug: Boolean(sanitizedCustomSlug),
        is_premium: isPremiumUser,
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
