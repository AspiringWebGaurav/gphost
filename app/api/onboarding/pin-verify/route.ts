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
    const msRemaining = Math.max(0, reset - Date.now());
    const secondsRemaining = Math.max(1, Math.ceil(msRemaining / 1000));
    const minutesRemaining = Math.max(1, Math.ceil(msRemaining / 60000));
    return NextResponse.json(
      {
        success: false,
        isTemporaryLockout: true,
        lockoutRemainingSeconds: secondsRemaining,
        lockoutMinutes: minutesRemaining,
        error: `Temporary security cooldown active to prevent brute-force attacks. Access will automatically restore in ${minutesRemaining} minute${minutesRemaining > 1 ? "s" : ""}. This is a temporary cooldown, not a ban.`,
      },
      { status: 429 }
    );
  }

  // 5. Query candidate active PINs from PostgreSQL via privileged client
  const adminClient = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: candidates, error: candidateErr } = await adminClient
    .from("onboarding_pins")
    .select("id, pin_hash, pin_salt, label")
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
  let matchedPin: { id: string; label?: string | null } | null = null;
  for (const candidate of candidates) {
    const isMatch = await verifyPin(pin, candidate.pin_salt, candidate.pin_hash, PIN_PEPPER);
    if (isMatch) {
      matchedPin = candidate;
      break;
    }
  }

  if (!matchedPin) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid or expired onboarding PIN",
        remainingAttempts: remaining,
      },
      { status: 400 }
    );
  }

  // Extract custom quota if embedded in label [quota:bytes]
  let assignedQuotaBytes: number | null = null;
  if (matchedPin.label) {
    const match = matchedPin.label.match(/\[quota:(\d+)\]/);
    if (match) {
      assignedQuotaBytes = parseInt(match[1], 10);
    }
  }

  // 7. Authoritative Atomic PostgreSQL Transaction
  // Consumes PIN with row-level lock, updates profile to approved, and inserts audit log in one commit
  const { error: redeemErr } = await adminClient.rpc("redeem_onboarding_pin", {
    p_pin_id: matchedPin.id,
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

  // 8. If PIN has a custom quota allocation, authoritatively update user's profile
  if (assignedQuotaBytes && assignedQuotaBytes >= 1048576) {
    const { error: quotaUpdateErr } = await adminClient
      .from("profiles")
      .update({ quota_bytes: assignedQuotaBytes })
      .eq("id", user.id);

    if (quotaUpdateErr) {
      console.error("[PIN Verify] Failed to update custom quota on profile:", quotaUpdateErr);
    } else {
      // Audit log the custom quota grant
      await adminClient.from("audit_logs").insert({
        actor_id: user.id,
        action: "PROFILE_QUOTA_ASSIGNED",
        entity_type: "profile",
        entity_id: user.id,
        details: {
          source: "onboarding_pin",
          pin_id: matchedPin.id,
          quota_bytes: assignedQuotaBytes,
        },
      });
    }
  }

  return NextResponse.json({
    success: true,
    message: "Onboarding PIN successfully verified! Access granted.",
    assigned_quota_bytes: assignedQuotaBytes || null,
  });
}
