import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApprovedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  EXPIRY_PRESET_VALUES,
  calculateExpiryDate,
  getLegacyEnumFallback,
} from "@/lib/storage/expiry";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const extendSchema = z.object({
  preset: z.enum(EXPIRY_PRESET_VALUES),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, profile } = await requireApprovedUser();
    const { id: fileId } = await params;

    const parseId = idSchema.safeParse(fileId);
    if (!parseId.success) {
      return NextResponse.json({ error: "Invalid file ID format" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const parseBody = extendSchema.safeParse(body);
    if (!parseBody.success) {
      return NextResponse.json(
        { error: "Invalid expiration preset", details: parseBody.error.flatten() },
        { status: 400 }
      );
    }

    const { preset } = parseBody.data;

    // Check permanent permission if requested
    const isPremium =
      profile.role === "admin" ||
      profile.can_create_permanent ||
      profile.quota_bytes === -1 ||
      profile.quota_bytes > 5368709120;

    if (preset === "never" && !isPremium) {
      return NextResponse.json(
        { error: "Permanent retention requires a Premium plan." },
        { status: 403 }
      );
    }

    const adminClient = createAdminClient();

    // Look up file record
    const { data: file, error: fileErr } = await adminClient
      .from("files")
      .select("id, user_id, sanitized_name, status, expires_at, byte_size")
      .eq("id", fileId)
      .single();

    if (fileErr || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const isOwner = file.user_id === user.id;
    const isAdmin = profile.role === "admin";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Access denied: not file owner" }, { status: 403 });
    }

    if (file.status === "PURGED" || file.status === "DELETE_PENDING") {
      return NextResponse.json(
        { error: "Cannot extend an already purged or deleting file." },
        { status: 400 }
      );
    }

    const newExpiresAt = calculateExpiryDate(preset);
    const nowIso = new Date().toISOString();

    const { data: updatedFile, error: updateErr } = await adminClient
      .from("files")
      .update({
        expires_at: newExpiresAt ? newExpiresAt.toISOString() : null,
        expiry_preset: getLegacyEnumFallback(preset),
        status: "ACTIVE",
        updated_at: nowIso,
      })
      .eq("id", fileId)
      .select("id, sanitized_name, status, expires_at, byte_size, mime_type, created_at")
      .single();

    if (updateErr || !updatedFile) {
      console.error("Failed to update file expiration:", updateErr);
      return NextResponse.json(
        { error: "Database error extending file expiry" },
        { status: 500 }
      );
    }

    // Record Audit Log
    await adminClient.from("audit_logs").insert({
      actor_id: user.id,
      event_type: "FILE_EXPIRY_EXTENDED",
      resource_type: "file",
      resource_id: fileId,
      ip_hash: "server_authoritative",
      metadata: {
        filename: file.sanitized_name,
        previous_status: file.status,
        new_status: "ACTIVE",
        preset,
        new_expires_at: newExpiresAt ? newExpiresAt.toISOString() : "never",
      },
    });

    return NextResponse.json({
      success: true,
      message: "File expiration extended and status restored to ACTIVE.",
      file: updatedFile,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (errorMsg.startsWith("ACCESS_DENIED")) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    console.error("Unhandled error in PATCH /api/files/[id]/extend:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
