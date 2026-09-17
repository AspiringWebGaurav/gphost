import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { requestRatelimit } from "@/lib/redis/ratelimit";
import { getClientIp } from "@/lib/security/ip";

const AccessRequestSchema = z.object({
  reason: z
    .string()
    .min(10, "Please provide a brief reason of at least 10 characters")
    .max(1000, "Reason must not exceed 1000 characters"),
  turnstileToken: z.string().min(1, "Turnstile verification is required"),
});

export async function POST(request: NextRequest) {
  // 1. Authoritative Session Check
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  }

  // 2. Request Body Validation
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = AccessRequestSchema.safeParse(body);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues[0]?.message || "Invalid input";
    return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
  }

  const { reason, turnstileToken } = parsed.data;
  const clientIp = getClientIp(request.headers);

  // 3. Turnstile Bot Protection & Replay Defense
  const turnstileResult = await verifyTurnstileToken(turnstileToken, clientIp);
  if (!turnstileResult.success) {
    return NextResponse.json(
      { success: false, error: turnstileResult.error || "Turnstile verification failed" },
      { status: 400 }
    );
  }

  // 4. Rate Limiting (5 requests per hour)
  const { success: rateLimitOk } = await requestRatelimit.limit(`${user.id}:${clientIp}`);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, error: "Too many access request submissions. Please try again later." },
      { status: 429 }
    );
  }

  const adminClient = createAdminClient();

  // 5. Friendly Pre-Check: verify no active pending request exists
  const { data: existingPending } = await adminClient
    .from("access_requests")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .limit(1);

  if (existingPending && existingPending.length > 0) {
    return NextResponse.json(
      { success: false, error: "An access request is already pending review by Gaurav Patil." },
      { status: 409 }
    );
  }

  // 6. Database Concurrency Authority
  // Guaranteed by partial unique index idx_access_requests_unique_pending
  const { data: newRequest, error: insertErr } = await adminClient
    .from("access_requests")
    .insert({
      user_id: user.id,
      reason: reason.trim(),
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr) {
    // Catch unique constraint violation race condition
    if (insertErr.code === "23505" || insertErr.message.includes("idx_access_requests_unique_pending")) {
      return NextResponse.json(
        { success: false, error: "An access request is already pending review." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to submit access request. Please try again." },
      { status: 500 }
    );
  }

  // 7. Audit Log Event
  await adminClient.from("audit_logs").insert({
    actor_id: user.id,
    event_type: "ACCESS_REQUEST_SUBMITTED",
    resource_type: "access_request",
    resource_id: newRequest?.id || user.id,
    ip_hash: clientIp,
    metadata: {
      timestamp: new Date().toISOString(),
      reasonLength: reason.trim().length,
    },
  });

  return NextResponse.json({
    success: true,
    message: "Your access request has been submitted successfully.",
  });
}
