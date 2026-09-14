import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPin, PIN_PEPPER } from "@/lib/security/pin";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { pinRatelimit } from "@/lib/redis/ratelimit";

const PinVerifySchema = z.object({
  pin: z.string().length(4, "PIN must be strictly 4 digits").regex(/^\d{4}$/, "PIN must be digits only"),
  turnstileToken: z.string().min(1, "Turnstile verification is required"),
});

export async function POST(request: NextRequest) {
  // 1. Authoritative Session Check
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  }

  // 2. Body Validation
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PinVerifySchema.safeParse(body);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues[0]?.message || "Invalid input";
    return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
  }

  const { pin, turnstileToken } = parsed.data;
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

  // 3. Turnstile Bot Protection & Replay Defense
  const turnstileResult = await verifyTurnstileToken(turnstileToken, clientIp);
  if (!turnstileResult.success) {
    return NextResponse.json({ success: false, error: turnstileResult.error || "Turnstile verification failed" }, { status: 400 });
  }

  // 4. Upstash Redis Brute-Force Rate Limiting (5 attempts / 15 min per user & IP)
  const limiterKey = `${user.id}:${clientIp}`;
  const { success: withinRateLimit, remaining, reset } = await pinRatelimit.limit(limiterKey);

  if (!withinRateLimit) {
    const minutesRemaining = Math.max(1, Math.ceil((reset - Date.now()) / 60000));
    return NextResponse.json(
      {
        success: false,
        error: `Too many invalid attempts. Brute-force lockout active. Try again in ${minutesRemaining} minutes.`,
      },
      { status: 429 }
    );
  }

  // 5. Query candidate active PINs from PostgreSQL via privileged client
  const adminClient = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: candidates, error: candidateErr } = await adminClient
    .from("onboarding_pins")
    .select("id, pin_hash, pin_salt")
    .eq("is_active", true)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

  if (candidateErr || !candidates || candidates.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid or expired onboarding PIN",
        remainingAttempts: remaining,
      },
      { status: 400 }
    );
  }

  // 6. Argon2id constant-time verification against candidates
  let matchedPinId: string | null = null;
  for (const candidate of candidates) {
    const isMatch = await verifyPin(pin, candidate.pin_salt, candidate.pin_hash, PIN_PEPPER);
    if (isMatch) {
      matchedPinId = candidate.id;
      break;
    }
  }

  if (!matchedPinId) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid or expired onboarding PIN",
        remainingAttempts: remaining,
      },
      { status: 400 }
    );
  }

  // 7. Authoritative Atomic PostgreSQL Transaction
  // Consumes PIN with row-level lock, updates profile to approved, and inserts audit log in one commit
  const { error: redeemErr } = await adminClient.rpc("redeem_onboarding_pin", {
    p_pin_id: matchedPinId,
    p_user_id: user.id,
  });

  if (redeemErr) {
    return NextResponse.json(
      {
        success: false,
        error: `Redemption failed: ${redeemErr.message}`,
        remainingAttempts: remaining,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Onboarding PIN successfully verified! Access granted.",
  });
}
