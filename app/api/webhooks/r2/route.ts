import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { headR2Object } from "@/lib/storage/r2";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/r2
 * Event-Driven Cloudflare R2 Webhook Receiver.
 * Receives Cloudflare R2 Bucket Event Notifications (PutObject, DeleteObject, CompleteMultipartUpload).
 * Authoritatively updates PostgreSQL in real-time so Supabase Realtime WebSocket pushes updates instantly.
 */
export async function POST(req: NextRequest) {
  try {
    // Authoritative webhook secret verification with constant-time comparison
    const secret = process.env.R2_WEBHOOK_SECRET;
    if (!secret) {
      // If secret is not configured, deny access to prevent unauthorized manipulation
      return NextResponse.json(
        { error: "R2 Webhook endpoint is not configured with R2_WEBHOOK_SECRET" },
        { status: 401 }
      );
    }

    const authHeader = req.headers.get("x-r2-webhook-secret") || req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Missing webhook authorization header" }, { status: 401 });
    }

    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    const bufA = Buffer.from(token);
    const bufB = Buffer.from(secret);

    if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
      return NextResponse.json({ error: "Unauthorized webhook caller" }, { status: 401 });
    }

    const payload = await req.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    // Support both Cloudflare Event Notification format and standard S3 event format
    // Cloudflare R2 notifications typically send an array or record of events
    const events: Array<{
      action?: string;
      event?: string;
      object?: { key?: string; size?: number; eTag?: string };
      key?: string;
    }> = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.Records)
      ? payload.Records.map((r: { eventName?: string; s3?: { object?: { key?: string; size?: number; eTag?: string } } }) => ({
          action: r.eventName,
          object: r.s3?.object,
        }))
      : [payload];

    const adminClient = createAdminClient();
    const results = [];

    for (const ev of events) {
      const action = (ev.action || ev.event || "").toLowerCase();
      const objectKey = ev.object?.key || ev.key;

      if (!objectKey) continue;

      // Extract user ID from predictable key format: u/{userId}/...
      const keyParts = objectKey.split("/");
      let userId: string | null = null;
      if (keyParts[0] === "u" && keyParts[1]) {
        userId = keyParts[1];
      }

      if (!userId) {
        // Root or unowned object
        results.push({ key: objectKey, status: "ignored_no_user_id" });
        continue;
      }

      if (action.includes("put") || action.includes("create") || action.includes("upload")) {
        // Object Created / Completed in R2
        const r2Head = await headR2Object(objectKey);
        if (!r2Head) continue;

        const filename = objectKey.split("/").pop() || "uploaded-file.bin";
        const nowIso = new Date().toISOString();

        // Check if file already recorded in DB
        const { data: existing } = await adminClient
          .from("files")
          .select("id, status")
          .eq("r2_key", objectKey)
          .maybeSingle();

        if (existing) {
          if (existing.status !== "ACTIVE") {
            await adminClient
              .from("files")
              .update({
                status: "ACTIVE",
                byte_size: r2Head.contentLength,
                r2_etag: r2Head.eTag,
                updated_at: nowIso,
              })
              .eq("id", existing.id);
          }
        } else {
          // Register new active file from R2 event
          await adminClient.from("files").insert({
            user_id: userId,
            filename,
            sanitized_name: filename,
            byte_size: r2Head.contentLength,
            mime_type: "application/octet-stream",
            r2_key: objectKey,
            r2_etag: r2Head.eTag,
            status: "ACTIVE",
            expiry_preset: "never",
            expires_at: null,
            created_at: nowIso,
            updated_at: nowIso,
          });
        }

        // Recalculate true active storage for user
        const { data: activeFiles } = await adminClient
          .from("files")
          .select("byte_size")
          .eq("user_id", userId)
          .in("status", ["ACTIVE", "EXPIRING"]);

        const totalBytes = (activeFiles || []).reduce((sum, f) => sum + (f.byte_size || 0), 0);

        await adminClient
          .from("profiles")
          .update({
            storage_used_bytes: totalBytes,
            updated_at: nowIso,
          })
          .eq("id", userId);

        results.push({ key: objectKey, action: "registered", bytes: r2Head.contentLength });
      } else if (action.includes("delete") || action.includes("purge")) {
        // Object Deleted from R2
        await adminClient
          .from("files")
          .update({
            status: "PURGED",
            updated_at: new Date().toISOString(),
          })
          .eq("r2_key", objectKey);

        const { data: activeFiles } = await adminClient
          .from("files")
          .select("byte_size")
          .eq("user_id", userId)
          .in("status", ["ACTIVE", "EXPIRING"]);

        const totalBytes = (activeFiles || []).reduce((sum, f) => sum + (f.byte_size || 0), 0);

        await adminClient
          .from("profiles")
          .update({
            storage_used_bytes: totalBytes,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        results.push({ key: objectKey, action: "purged", remainingBytes: totalBytes });
      }
    }

    return NextResponse.json({
      success: true,
      processedEventsCount: results.length,
      results,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "R2 Webhook processing failed";
    console.error("[R2 Webhook Error]:", err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
