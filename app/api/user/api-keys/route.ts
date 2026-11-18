import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  createApiKey,
  revokeApiKey,
  rotateApiKey,
  revokeAllApiKeys,
  listUserApiKeys,
  API_PERMISSIONS,
} from "@/lib/auth/api-keys";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authRes = await authenticateRequest(req);
    if ("errorResponse" in authRes) return authRes.errorResponse;
    const { userId } = authRes.auth;

    const keys = await listUserApiKeys(userId);

    return NextResponse.json({
      keys,
      availablePermissions: API_PERMISSIONS,
    });
  } catch (err: unknown) {
    console.error("[API Keys GET] Error:", err);
    return NextResponse.json({ error: "Failed to load API keys" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authRes = await authenticateRequest(req);
    if ("errorResponse" in authRes) return authRes.errorResponse;
    const { userId } = authRes.auth;

    const body = await req.json().catch(() => ({}));

    // Action 1: Rotate Key
    if (body.action === "rotate" && body.keyId) {
      const { keyItem, rawKey } = await rotateApiKey(userId, body.keyId);
      return NextResponse.json({
        success: true,
        rotated: true,
        key: keyItem,
        rawKey,
      });
    }

    // Action 2: Standard Key Generation with Optional Scoped Permissions
    const name = typeof body.name === "string" ? body.name.trim() : "CLI Key";
    const requestedPermissions: string[] = Array.isArray(body.permissions) && body.permissions.length > 0
      ? body.permissions
      : ["*"];

    const { keyItem, rawKey } = await createApiKey(userId, name, requestedPermissions);

    return NextResponse.json({
      success: true,
      key: keyItem,
      rawKey,
    });
  } catch (err: unknown) {
    console.error("[API Keys POST] Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to process API key" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authRes = await authenticateRequest(req);
    if ("errorResponse" in authRes) return authRes.errorResponse;
    const { userId } = authRes.auth;

    const body = await req.json().catch(() => ({}));

    // Emergency Revoke All
    if (body.all === true) {
      const { success, count } = await revokeAllApiKeys(userId);
      return NextResponse.json({ success, count, revokedAll: true });
    }

    // Single Key Revocation
    const keyId = body.keyId;
    if (!keyId || typeof keyId !== "string") {
      return NextResponse.json({ error: "Invalid API key ID" }, { status: 400 });
    }

    const success = await revokeApiKey(userId, keyId);
    if (!success) {
      return NextResponse.json({ error: "Failed to revoke API key" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("[API Keys DELETE] Error:", err);
    return NextResponse.json({ error: "Failed to revoke API key" }, { status: 500 });
  }
}

