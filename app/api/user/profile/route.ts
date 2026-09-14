import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApprovedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { profileUpdateRatelimit } from "@/lib/redis/ratelimit";
import { getClientIp, hashClientIp } from "@/lib/security/ip";

export const dynamic = "force-dynamic";

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
    const { user, profile } = await requireApprovedUser();

    // Rate Limiting
    const { success: allowed } = await profileUpdateRatelimit.limit(user.id);
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
      .eq("id", user.id);

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
      actor_id: user.id,
      event_type: "USER_PROFILE_UPDATE",
      resource_type: "profile",
      resource_id: user.id,
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
        id: user.id,
        email: profile.email,
        full_name: full_name !== undefined ? full_name : profile.full_name,
        avatar_url: avatar_url !== undefined ? avatar_url : profile.avatar_url,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ success: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (errorMsg.startsWith("ACCESS_DENIED")) {
      return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
    }
    console.error("[Profile API] Unhandled error:", err);
    return NextResponse.json({ success: false, error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
