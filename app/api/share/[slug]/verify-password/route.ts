import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySharePassword } from "@/lib/security/password";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { passwordVerifyRatelimit } from "@/lib/redis/ratelimit";
import { createUnlockToken, getUnlockCookieName } from "@/lib/security/unlock-token";
import { getClientIp } from "@/lib/security/ip";

export const dynamic = "force-dynamic";

const VerifyPasswordSchema = z.object({
  password: z.string().min(1, "Password is required").max(128, "Password too long"),
  turnstileToken: z.string().min(1, "Turnstile verification is required"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug || typeof slug !== "string" || slug.length > 64) {
      return NextResponse.json({ error: "Invalid share slug" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const parsed = VerifyPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { password, turnstileToken } = parsed.data;
    const clientIp = getClientIp(req.headers);

    // 1. Turnstile bot protection & replay defense
    const turnstileResult = await verifyTurnstileToken(turnstileToken, clientIp);
    if (!turnstileResult.success) {
      return NextResponse.json(
        { error: turnstileResult.error || "Bot verification failed" },
        { status: 400 }
      );
    }

    // 2. Ephemeral rate limiting (5 attempts / 15 min per IP and slug)
    const rateLimitKey = `${clientIp}:${slug}`;
    const { success: rateLimitOk, remaining, reset } =
      await passwordVerifyRatelimit.limit(rateLimitKey);

    if (!rateLimitOk) {
      const minutesRemaining = Math.max(1, Math.ceil((reset - Date.now()) / 60000));
      return NextResponse.json(
        {
          error: `Too many failed password attempts. Please try again in ${minutesRemaining} minutes.`,
        },
        { status: 429 }
      );
    }

    // 3. PostgreSQL Authoritative Lookup
    const adminClient = createAdminClient();
    const { data: share, error: shareErr } = await adminClient
      .from("share_links")
      .select(`
        id,
        slug,
        is_active,
        expires_at,
        max_downloads,
        download_count,
        password_hash,
        password_salt,
        file:files (
          id,
          status,
          expires_at
        )
      `)
      .eq("slug", slug)
      .single();

    if (shareErr || !share || !share.file) {
      return NextResponse.json({ error: "Share link not found" }, { status: 404 });
    }

    const file = Array.isArray(share.file) ? share.file[0] : share.file;
    if (!file) {
      return NextResponse.json({ error: "Associated file not found" }, { status: 404 });
    }

    if (!share.is_active || file.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "This share link is no longer active" },
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
        { error: "Download limit reached for this share" },
        { status: 410 }
      );
    }

    if (!share.password_hash || !share.password_salt) {
      return NextResponse.json(
        { error: "This share link does not require a password" },
        { status: 400 }
      );
    }

    // 4. Constant-Time Argon2id Password Verification
    const isMatch = await verifySharePassword(
      password,
      share.password_salt,
      share.password_hash
    );

    if (!isMatch) {
      return NextResponse.json(
        {
          error: "Incorrect password. Access denied.",
          remainingAttempts: remaining,
        },
        { status: 401 }
      );
    }

    // 5. Issue HMAC-signed Unlock Token
    const unlockToken = createUnlockToken(slug, file.id, 15 * 60);
    const cookieName = getUnlockCookieName(slug);

    const response = NextResponse.json({
      success: true,
      message: "Password verified successfully",
    });

    response.cookies.set({
      name: cookieName,
      value: unlockToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 15 * 60, // 15 minutes
    });

    return response;
  } catch (err) {
    console.error("Error verifying share password:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
