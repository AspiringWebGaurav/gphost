import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createApiKey,
  revokeApiKey,
  rotateApiKey,
  revokeAllApiKeys,
  ApiKeyItem,
} from "@/lib/auth/api-keys";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { user } = await requireApprovedUser();
    const adminClient = createAdminClient();

    const { data: keys, error } = await adminClient
      .from("user_api_keys")
      .select("id, name, key_prefix, created_at, last_used_at, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Failed to fetch API keys" }, { status: 500 });
    }

    return NextResponse.json({ keys: (keys as ApiKeyItem[]) || [] });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (errorMsg.startsWith("ACCESS_DENIED")) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json({ error: "Failed to load API keys" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireApprovedUser();
    const body = await req.json().catch(() => ({}));

    // Action 1: Rotate Key
    if (body.action === "rotate" && body.keyId) {
      const { keyItem, rawKey } = await rotateApiKey(user.id, body.keyId);
      return NextResponse.json({
        success: true,
        rotated: true,
        key: keyItem,
        rawKey,
      });
    }

    // Action 2: Standard Key Generation
    const name = typeof body.name === "string" ? body.name.trim() : "CLI Key";
    const { keyItem, rawKey } = await createApiKey(user.id, name);

    return NextResponse.json({
      success: true,
      key: keyItem,
      rawKey,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (errorMsg.startsWith("ACCESS_DENIED")) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to process API key" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user } = await requireApprovedUser();
    const body = await req.json().catch(() => ({}));

    // Emergency Revoke All
    if (body.all === true) {
      const { success, count } = await revokeAllApiKeys(user.id);
      return NextResponse.json({ success, count, revokedAll: true });
    }

    // Single Key Revocation
    const keyId = body.keyId;
    if (!keyId || typeof keyId !== "string") {
      return NextResponse.json({ error: "Invalid API key ID" }, { status: 400 });
    }

    const success = await revokeApiKey(user.id, keyId);
    if (!success) {
      return NextResponse.json({ error: "Failed to revoke API key" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (errorMsg.startsWith("ACCESS_DENIED")) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json({ error: "Failed to revoke API key" }, { status: 500 });
  }
}
