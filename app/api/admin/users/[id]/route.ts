import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser, requireOwnerUser, ADMIN_EMAIL } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminOpRatelimit } from "@/lib/redis/ratelimit";
import { getClientIp, hashClientIp } from "@/lib/security/ip";
import { setUserMaxFiles } from "@/lib/storage/user-limits";

export const dynamic = "force-dynamic";

const adminUpdateUserSchema = z
  .object({
    quota_bytes: z.number().int().min(-1).optional(),
    max_files: z.number().int().min(1).nullable().optional(),
    role: z.enum(["user", "admin"]).optional(),
    status: z.enum(["pending", "approved", "rejected", "revoked"]).optional(),
    can_create_permanent: z.boolean().optional(),
  })
  .strict();

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetUserId } = await context.params;

    if (!targetUserId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId)) {
      return NextResponse.json(
        { success: false, error: "INVALID_USER_ID", message: "Target user ID must be a valid UUID" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parseResult = adminUpdateUserSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: "INVALID_REQUEST", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { quota_bytes, max_files, role, status, can_create_permanent } = parseResult.data;

    // Determine required authorization: modifying roles strictly requires Owner-Exclusive authority
    let adminUser;
    if (role !== undefined) {
      const auth = await requireOwnerUser();
      adminUser = auth.user;
    } else {
      const auth = await requireAdminUser();
      adminUser = auth.user;
    }

    // Rate Limit
    const { success: allowed } = await adminOpRatelimit.limit(adminUser.id);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "RATE_LIMITED", message: "Admin rate limit exceeded." },
        { status: 429 }
      );
    }

    const adminClient = createAdminClient();
    const clientIp = getClientIp(req.headers);
    const ipHash = hashClientIp(clientIp);

    // Verify target user exists
    const { data: targetUser, error: fetchError } = await adminClient
      .from("profiles")
      .select("*")
      .eq("id", targetUserId)
      .single();

    if (fetchError || !targetUser) {
      return NextResponse.json(
        { success: false, error: "USER_NOT_FOUND", message: "Target user profile not found" },
        { status: 404 }
      );
    }

    // 1. Permanent owner immutability safeguard
    if (targetUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      if ((role !== undefined && role !== "admin") || (status !== undefined && status !== "approved")) {
        return NextResponse.json(
          {
            success: false,
            error: "PERMANENT_OWNER_IMMUTABLE",
            message: "Permanent owner role and status are immutable.",
          },
          { status: 400 }
        );
      }
    }

    // 2. Self-lockout / self-demotion safeguard
    if (adminUser.id === targetUserId) {
      if (status !== undefined && status !== "approved") {
        return NextResponse.json(
          {
            success: false,
            error: "SELF_LOCKOUT_PREVENTED",
            message: "Cannot revoke or reject your own administrative account.",
          },
          { status: 400 }
        );
      }
      if (role !== undefined && role !== "admin") {
        return NextResponse.json(
          {
            success: false,
            error: "SELF_DEMOTION_PREVENTED",
            message: "Cannot demote your own administrative role.",
          },
          { status: 400 }
        );
      }
    }

    // 3. Concurrency-Safe Quota Update via Atomic RPC
    let updatedQuota = targetUser.quota_bytes;
    if (quota_bytes !== undefined) {
      const { error: quotaError } = await adminClient.rpc(
        "admin_update_user_quota",
        {
          p_admin_id: adminUser.id,
          p_target_user_id: targetUserId,
          p_new_quota_bytes: quota_bytes,
          p_ip_hash: ipHash,
        }
      );

      if (quotaError) {
        return NextResponse.json(
          {
            success: false,
            error: "QUOTA_UPDATE_FAILED",
            message: quotaError.message,
          },
          { status: 400 }
        );
      }
      updatedQuota = quota_bytes;
    }

    // 4. Atomic Profile Status / Role / Permanent Link Update via Atomic RPC
    let updatedRole = targetUser.role;
    let updatedStatus = targetUser.status;
    let updatedPermanent = targetUser.can_create_permanent;

    if (role !== undefined || status !== undefined || can_create_permanent !== undefined) {
      const { error: profileError } = await adminClient.rpc(
        "admin_update_user_profile",
        {
          p_admin_id: adminUser.id,
          p_target_user_id: targetUserId,
          p_new_role: role ?? null,
          p_new_status: status ?? null,
          p_can_create_permanent: can_create_permanent ?? null,
          p_ip_hash: ipHash,
        }
      );

      if (profileError) {
        console.warn("[Admin Users API] RPC failed, using direct profile update fallback:", profileError);
        const updateData: {
          role?: "user" | "admin";
          status?: "pending" | "approved" | "rejected" | "revoked";
          can_create_permanent?: boolean;
          updated_at: string;
        } = {
          updated_at: new Date().toISOString(),
        };
        if (role !== undefined) updateData.role = role;
        if (status !== undefined) updateData.status = status;
        if (can_create_permanent !== undefined) updateData.can_create_permanent = can_create_permanent;

        const { error: directErr } = await adminClient
          .from("profiles")
          .update(updateData)
          .eq("id", targetUserId);

        if (directErr) {
          return NextResponse.json(
            {
              success: false,
              error: "PROFILE_UPDATE_FAILED",
              message: directErr.message,
            },
            { status: 400 }
          );
        }
      }

      if (role !== undefined) updatedRole = role;
      if (status !== undefined) updatedStatus = status;
      if (can_create_permanent !== undefined) updatedPermanent = can_create_permanent;

      if (status === "revoked" && targetUser.email) {
        await adminClient
          .from("onboarding_pins")
          .update({ is_active: false })
          .ilike("label", `%${targetUser.email}%`);
      }
    }

    if (max_files !== undefined) {
      await setUserMaxFiles(targetUserId, max_files, adminUser.id);
    }

    return NextResponse.json({
      success: true,
      user: {
        id: targetUserId,
        email: targetUser.email,
        role: updatedRole,
        status: updatedStatus,
        quota_bytes: updatedQuota,
        can_create_permanent: updatedPermanent,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ success: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (errorMsg === "FORBIDDEN_NOT_OWNER") {
      return NextResponse.json(
        {
          success: false,
          error: "FORBIDDEN_OWNER_REQUIRED",
          message: "Owner authority required to modify admin roles.",
        },
        { status: 403 }
      );
    }
    if (errorMsg.includes("FORBIDDEN")) {
      return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
    }
    console.error("[Admin Users API] Error:", errorMsg);
    return NextResponse.json({ success: false, error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
