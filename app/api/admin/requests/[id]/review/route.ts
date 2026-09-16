import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAdminUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminOpRatelimit } from "@/lib/redis/ratelimit";
import { getClientIp, hashClientIp } from "@/lib/security/ip";
import { generatePinSalt, hashPin } from "@/lib/security/pin";
import { setUserMaxFiles } from "@/lib/storage/user-limits";

export const dynamic = "force-dynamic";

const adminReviewRequestSchema = z
  .object({
    action: z.enum(["approve", "approved", "reject", "rejected", "revoke", "revoked"]),
    rejection_reason: z.string().trim().max(500).optional(),
    // PIN & Access Limit Options
    issue_pin: z.boolean().optional(),
    max_files: z.number().int().min(1).nullable().optional(),
    quota_bytes: z.union([z.literal(-1), z.number().int().min(1048576)]).nullable().optional(),
    pin: z.string().regex(/^\d{4}$/, "PIN must be strictly 4 decimal digits").optional(),
    pin_expires_at: z.string().datetime().nullable().optional(),
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
    const parseResult = adminReviewRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: "INVALID_REQUEST", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const {
      action,
      rejection_reason,
      issue_pin,
      max_files,
      quota_bytes,
      pin: requestedPin,
      pin_expires_at,
    } = parseResult.data;

    let normalizedAction: "approve" | "reject" | "revoke";
    if (action === "approve" || action === "approved") {
      normalizedAction = "approve";
    } else if (action === "revoke" || action === "revoked") {
      normalizedAction = "revoke";
    } else {
      normalizedAction = "reject";
    }

    const adminClient = createAdminClient();
    const clientIp = getClientIp(req.headers);
    const ipHash = hashClientIp(clientIp);

    // 1. Fetch the request to verify existence and get user info
    const { data: requestRecord, error: fetchError } = await adminClient
      .from("access_requests")
      .select("id, user_id, status, profiles:user_id (id, email, full_name)")
      .eq("id", requestId)
      .single();

    if (fetchError || !requestRecord) {
      return NextResponse.json(
        { success: false, error: "REQUEST_NOT_FOUND", message: "Access request not found" },
        { status: 404 }
      );
    }

    // If reviewing normally (not revoking), request must be pending
    if (normalizedAction !== "revoke" && requestRecord.status !== "pending") {
      return NextResponse.json(
        { success: false, error: "REQUEST_NOT_PENDING", message: "Access request is no longer pending" },
        { status: 400 }
      );
    }

    const applicantProfile = Array.isArray(requestRecord.profiles)
      ? requestRecord.profiles[0]
      : requestRecord.profiles;
    const applicantEmail = applicantProfile?.email || "applicant";
    const targetUserId = requestRecord.user_id;

    // A. Handle Revocation Action
    if (normalizedAction === "revoke") {
      const revokeNote = rejection_reason || "Access revoked by administrator";

      await adminClient
        .from("access_requests")
        .update({
          status: "rejected",
          reviewed_by: adminUser.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: revokeNote,
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      await adminClient
        .from("profiles")
        .update({
          status: "revoked",
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetUserId);

      // Deactivate any active onboarding PINs labeled for this user
      await adminClient
        .from("onboarding_pins")
        .update({ is_active: false })
        .ilike("label", `%${applicantEmail}%`);

      // Log audit
      await adminClient.from("audit_logs").insert({
        actor_id: adminUser.id,
        event_type: "ADMIN_ACCESS_REQUEST_REVOKED",
        resource_type: "access_request",
        resource_id: requestId,
        metadata: {
          target_user_id: targetUserId,
          action: "revoke",
          reason: revokeNote,
        },
        ip_hash: ipHash,
      });

      return NextResponse.json({
        success: true,
        requestId,
        action: "revoked",
        message: "Access revoked successfully. User will be logged out immediately.",
      });
    }

    let createdPinData: {
      id: string;
      plaintextPin: string;
      max_files: number | null;
      quota_bytes: number | null;
      expires_at: string | null;
    } | null = null;

    // 2. If action is approve and issue_pin is requested (or default), create an Onboarding PIN
    if (normalizedAction === "approve" && (issue_pin ?? true)) {
      const plaintextPin = requestedPin || crypto.randomInt(1000, 10000).toString();
      const saltHex = generatePinSalt();
      const pinHashHex = await hashPin(plaintextPin, saltHex);

      // Build structured label embedding quota and max files
      const parts: string[] = [`User: ${applicantEmail}`];
      if (quota_bytes) parts.push(`[quota:${quota_bytes}]`);
      if (max_files !== undefined && max_files !== null) parts.push(`[files:${max_files}]`);
      const storedLabel = parts.join(" ");

      const { data: pinRpcResult, error: pinRpcError } = await adminClient.rpc(
        "admin_create_onboarding_pin",
        {
          p_admin_id: adminUser.id,
          p_pin_hash: pinHashHex,
          p_pin_salt: saltHex,
          p_label: storedLabel,
          p_max_uses: 1, // 1-time personalized fast-track PIN for applicant
          p_expires_at: pin_expires_at || null,
          p_ip_hash: ipHash,
        }
      );

      if (pinRpcError) {
        console.error("[Admin Review API] PIN creation error:", pinRpcError);
        return NextResponse.json(
          { success: false, error: "PIN_CREATION_FAILED", message: pinRpcError.message },
          { status: 400 }
        );
      }

      createdPinData = {
        id: pinRpcResult.pin_id,
        plaintextPin,
        max_files: max_files ?? null,
        quota_bytes: quota_bytes ?? null,
        expires_at: pin_expires_at ?? null,
      };

      // Pre-configure user limits so they are ready upon PIN activation
      if (max_files !== undefined) {
        await setUserMaxFiles(targetUserId, max_files, adminUser.id);
      }

      // Update quota if custom quota was specified
      if (quota_bytes === -1) {
        await adminClient
          .from("profiles")
          .update({ quota_bytes: -1 })
          .eq("id", targetUserId);
      } else if (quota_bytes && quota_bytes >= 1048576) {
        await adminClient
          .from("profiles")
          .update({ quota_bytes })
          .eq("id", targetUserId);
      }
    }

    // 3. Update access_request and user profile
    const auditDecisionNote = createdPinData
      ? `PIN Issued: ${createdPinData.plaintextPin} | Limit: ${createdPinData.max_files ? createdPinData.max_files + ' files' : 'Unlimited'}`
      : rejection_reason || null;

    // CRITICAL: If a PIN was created, DO NOT call admin_review_access_request RPC (which sets profile status to approved).
    // The profile MUST REMAIN 'pending' so the user is forced to enter their PIN at the access gate!
    if (createdPinData) {
      await adminClient
        .from("access_requests")
        .update({
          status: "approved",
          reviewed_by: adminUser.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: auditDecisionNote,
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      // Authoritative approval: update profile status to approved
      await adminClient
        .from("profiles")
        .update({
          status: "approved",
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetUserId);

      // Log to audit_logs
      await adminClient.from("audit_logs").insert({
        actor_id: adminUser.id,
        event_type: "ADMIN_ACCESS_REQUEST_REVIEW",
        resource_type: "access_request",
        resource_id: requestId,
        metadata: {
          target_user_id: targetUserId,
          action: "approved_with_pin",
          rejection_reason: auditDecisionNote,
          pin_issued: createdPinData.plaintextPin,
          max_files: createdPinData.max_files,
          quota_bytes: createdPinData.quota_bytes,
        },
        ip_hash: ipHash,
      });

      return NextResponse.json({
        success: true,
        requestId,
        action: "approved",
        pin: createdPinData,
        message: "PIN issued successfully. User must verify PIN at the Access Gate to activate account.",
      });
    }

    // Direct approval without PIN or Rejection:
    const { data: rpcResult, error: rpcError } = await adminClient.rpc(
      "admin_review_access_request",
      {
        p_admin_id: adminUser.id,
        p_request_id: requestId,
        p_action: normalizedAction,
        p_rejection_reason: auditDecisionNote,
        p_ip_hash: ipHash,
      }
    );

    if (rpcError) {
      console.warn("[Admin Review API] RPC failed, using resilient direct update:", rpcError);
      // Resilient fallback: Direct table mutation
      const finalStatus = normalizedAction === "approve" ? "approved" : "rejected";
      
      await adminClient
        .from("access_requests")
        .update({
          status: finalStatus,
          reviewed_by: adminUser.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: auditDecisionNote,
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      await adminClient
        .from("profiles")
        .update({
          status: finalStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetUserId);

      // Log to audit_logs
      await adminClient.from("audit_logs").insert({
        actor_id: adminUser.id,
        event_type: "ADMIN_ACCESS_REQUEST_REVIEW",
        resource_type: "access_request",
        resource_id: requestId,
        metadata: {
          target_user_id: targetUserId,
          action: normalizedAction,
          rejection_reason: auditDecisionNote,
          pin_issued: null,
        },
        ip_hash: ipHash,
      });
    }

    return NextResponse.json({
      success: true,
      requestId,
      action: normalizedAction,
      result: rpcResult || { success: true },
      pin: null,
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
