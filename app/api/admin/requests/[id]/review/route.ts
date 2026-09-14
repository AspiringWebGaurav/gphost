import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminOpRatelimit } from "@/lib/redis/ratelimit";
import { getClientIp, hashClientIp } from "@/lib/security/ip";

export const dynamic = "force-dynamic";

const reviewRequestSchema = z
  .object({
    action: z.enum(["approve", "reject"]),
    rejection_reason: z.string().trim().max(500).optional(),
  })
  .strict();

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user: adminUser } = await requireAdminUser();
    const { id: requestId } = await context.params;

    if (!requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
      return NextResponse.json(
        { success: false, error: "INVALID_REQUEST_ID", message: "Request ID must be a valid UUID" },
        { status: 400 }
      );
    }

    // Rate Limit
    const { success: allowed } = await adminOpRatelimit.limit(adminUser.id);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "RATE_LIMITED", message: "Admin rate limit exceeded." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parseResult = reviewRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: "INVALID_REQUEST", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { action, rejection_reason } = parseResult.data;
    const adminClient = createAdminClient();
    const clientIp = getClientIp(req.headers);
    const ipHash = hashClientIp(clientIp);

    // Call atomic stored procedure
    const { data: rpcResult, error: rpcError } = await adminClient.rpc(
      "admin_review_access_request",
      {
        p_admin_id: adminUser.id,
        p_request_id: requestId,
        p_action: action,
        p_rejection_reason: rejection_reason || null,
        p_ip_hash: ipHash,
      }
    );

    if (rpcError) {
      const msg = rpcError.message || "";
      if (msg.includes("REQUEST_NOT_FOUND")) {
        return NextResponse.json(
          { success: false, error: "REQUEST_NOT_FOUND", message: "Access request not found" },
          { status: 404 }
        );
      }
      if (msg.includes("REQUEST_NOT_PENDING")) {
        return NextResponse.json(
          { success: false, error: "REQUEST_NOT_PENDING", message: "Access request is no longer pending" },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { success: false, error: "REVIEW_FAILED", message: msg },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      requestId,
      action,
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
    console.error("[Admin Review API] Error:", errorMsg);
    return NextResponse.json({ success: false, error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
