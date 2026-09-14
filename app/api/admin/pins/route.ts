import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAdminUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminOpRatelimit } from "@/lib/redis/ratelimit";
import { generatePinSalt, hashPin } from "@/lib/security/pin";
import { getClientIp, hashClientIp } from "@/lib/security/ip";

export const dynamic = "force-dynamic";

const createPinSchema = z
  .object({
    pin: z.string().regex(/^\d{4}$/, "PIN must be strictly 4 decimal digits").optional(),
    label: z.string().trim().min(1, "Label is required").max(100),
    max_uses: z.number().int().min(1).nullable().optional(),
    expires_at: z.string().datetime().nullable().optional(),
  })
  .strict();

export async function GET() {
  try {
    const { user: adminUser } = await requireAdminUser();

    // Rate Limit
    const { success: allowed } = await adminOpRatelimit.limit(adminUser.id);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "RATE_LIMITED", message: "Admin rate limit exceeded." },
        { status: 429 }
      );
    }

    const adminClient = createAdminClient();
    const { data: pins, error: listError } = await adminClient
      .from("onboarding_pins")
      .select("id, label, pin_salt, is_active, max_uses, times_used, expires_at, created_at")
      .order("created_at", { ascending: false });

    if (listError) {
      console.error("[Admin PINs API] List error:", listError);
      return NextResponse.json({ success: false, error: "DATABASE_ERROR" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      pins: pins || [],
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ success: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (errorMsg.includes("FORBIDDEN")) {
      return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
    }
    return NextResponse.json({ success: false, error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user: adminUser } = await requireAdminUser();

    // Rate Limit
    const { success: allowed } = await adminOpRatelimit.limit(adminUser.id);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "RATE_LIMITED", message: "Admin rate limit exceeded." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parseResult = createPinSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: "INVALID_REQUEST", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { pin: requestedPin, label, max_uses, expires_at } = parseResult.data;

    // Generate cryptographically secure 4-digit PIN if omitted
    const plaintextPin = requestedPin || crypto.randomInt(1000, 10000).toString();

    // Hash PIN with 16-byte random salt and server pepper
    const saltHex = generatePinSalt();
    const pinHashHex = await hashPin(plaintextPin, saltHex);

    const clientIp = getClientIp(req.headers);
    const ipHash = hashClientIp(clientIp);
    const adminClient = createAdminClient();

    // Call atomic stored procedure
    const { data: rpcResult, error: rpcError } = await adminClient.rpc(
      "admin_create_onboarding_pin",
      {
        p_admin_id: adminUser.id,
        p_pin_hash: pinHashHex,
        p_pin_salt: saltHex,
        p_label: label,
        p_max_uses: max_uses || null,
        p_expires_at: expires_at || null,
        p_ip_hash: ipHash,
      }
    );

    if (rpcError) {
      console.error("[Admin PINs API] Create error:", rpcError);
      return NextResponse.json(
        { success: false, error: "PIN_CREATION_FAILED", message: rpcError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      pin: {
        id: rpcResult.pin_id,
        plaintextPin, // Returned once to authorized admin; never persisted
        label,
        max_uses: max_uses || null,
        expires_at: expires_at || null,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ success: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (errorMsg.includes("FORBIDDEN")) {
      return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
    }
    console.error("[Admin PINs API] Error:", errorMsg);
    return NextResponse.json({ success: false, error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user: adminUser } = await requireAdminUser();

    // Rate Limit
    const { success: allowed } = await adminOpRatelimit.limit(adminUser.id);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "RATE_LIMITED", message: "Admin rate limit exceeded." },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const pinId = searchParams.get("pinId");

    if (!pinId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pinId)) {
      return NextResponse.json(
        { success: false, error: "INVALID_PIN_ID", message: "pinId parameter must be a valid UUID" },
        { status: 400 }
      );
    }

    const clientIp = getClientIp(req.headers);
    const ipHash = hashClientIp(clientIp);
    const adminClient = createAdminClient();

    // Call atomic stored procedure
    const { data: rpcResult, error: rpcError } = await adminClient.rpc(
      "admin_revoke_onboarding_pin",
      {
        p_admin_id: adminUser.id,
        p_pin_id: pinId,
        p_ip_hash: ipHash,
      }
    );

    if (rpcError) {
      return NextResponse.json(
        { success: false, error: "REVOCATION_FAILED", message: rpcError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      pinId,
      result: rpcResult,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ success: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (errorMsg.includes("FORBIDDEN")) {
      return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
    }
    console.error("[Admin PINs API] Error:", errorMsg);
    return NextResponse.json({ success: false, error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
