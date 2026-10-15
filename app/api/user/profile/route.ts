import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest } from "@/lib/auth/api-keys";
import { createAdminClient } from "@/lib/supabase/admin";
import { profileUpdateRatelimit } from "@/lib/redis/ratelimit";
import { getClientIp, hashClientIp } from "@/lib/security/ip";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authRes = await authenticateRequest(req);
    if ("errorResponse" in authRes) return authRes.errorResponse;
    const { userId, profile } = authRes.auth;

    return NextResponse.json({
      success: true,
      profile: {
        id: userId,
        email: profile.email,
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
        role: profile.role,
        quota_bytes: profile.quota_bytes,
        storage_used_bytes: profile.storage_used_bytes,
        reserved_bytes: profile.reserved_bytes,
        can_create_permanent: profile.can_create_permanent || profile.role === "admin",
      },
    });
  } catch (err: unknown) {
    console.error("[Profile GET] Error:", err);
    return NextResponse.json({ success: false, error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

const updateProfileSchema = z
  .object({
    full_name: z.string().trim().max(100).nullable().optional(),
    avatar_url: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .optional()
      .refine(
        (val) => {
          if (!val) return true;
          try {
            const parsed = new URL(val);
            return parsed.protocol === "https:";
          } catch {
            return false;
          }
        },
        { message: "avatar_url must be a valid https:// URL or null" }
      ),
  })
  .strict();

export async function PATCH(req: NextRequest) {
  try {
    const authRes = await authenticateRequest(req);
    if ("errorResponse" in authRes) return authRes.errorResponse;
    const { userId, profile } = authRes.auth;

    // Rate Limiting
    const { success: allowed } = await profileUpdateRatelimit.limit(userId);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "RATE_LIMITED", message: "Too many profile updates. Please wait." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parseResult = updateProfileSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_REQUEST",
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { full_name, avatar_url } = parseResult.data;

    // Prepare update payload (only vanity fields)
    const updateData: { full_name?: string | null; avatar_url?: string | null; updated_at: string } = {
      updated_at: new Date().toISOString(),
    };

    if (full_name !== undefined) {
      updateData.full_name = full_name;
    }
    if (avatar_url !== undefined) {
      updateData.avatar_url = avatar_url;
    }

    const adminClient = createAdminClient();
    const { error: updateError } = await adminClient
      .from("profiles")
      .update(updateData)
      .eq("id", userId);

    if (updateError) {
      console.error("[Profile API] Update error:", updateError);
      return NextResponse.json(
        { success: false, error: "DATABASE_ERROR", message: updateError.message },
        { status: 500 }
      );
    }

    // Record audit log
    const clientIp = getClientIp(req.headers);
    const ipHash = hashClientIp(clientIp);

    await adminClient.from("audit_logs").insert({
      actor_id: userId,
      event_type: "USER_PROFILE_UPDATE",
      resource_type: "profile",
      resource_id: userId,
      metadata: {
        old_full_name: profile.full_name,
        new_full_name: full_name !== undefined ? full_name : profile.full_name,
        old_avatar_url: profile.avatar_url,
        new_avatar_url: avatar_url !== undefined ? avatar_url : profile.avatar_url,
      },
      ip_hash: ipHash,
    });

    return NextResponse.json({
      success: true,
      profile: {
        id: userId,
        email: profile.email,
        full_name: full_name !== undefined ? full_name : profile.full_name,
        avatar_url: avatar_url !== undefined ? avatar_url : profile.avatar_url,
      },
    });
  } catch (err: unknown) {
    console.error("[Profile API] Unhandled error:", err);
    return NextResponse.json({ success: false, error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

