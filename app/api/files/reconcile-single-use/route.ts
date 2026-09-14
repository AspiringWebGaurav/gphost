import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteR2Object } from "@/lib/storage/r2";

export const dynamic = "force-dynamic";

const ReconcileSchema = z.object({
  fileId: z.string().uuid("Invalid file ID format").optional(),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Authorize: Either internal service/cron secret OR authenticated approved user/admin
    const authHeader = req.headers.get("authorization");
    const cronSecretHeader = req.headers.get("x-cron-secret");
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const cronSecret = process.env.CRON_SECRET;

    const isServiceAuth =
      (serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`) ||
      (cronSecret && cronSecretHeader === cronSecret);

    let sessionUser: { id: string } | null = null;
    let isAdmin = false;

    if (!isServiceAuth) {
      sessionUser = await getAuthenticatedUser();
      if (!sessionUser) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }

      const adminClient = createAdminClient();
      const { data: profile } = await adminClient
        .from("profiles")
        .select("role, status")
        .eq("id", sessionUser.id)
        .single();

      if (!profile || profile.status !== "approved") {
        return NextResponse.json({ error: "Approved account required" }, { status: 403 });
      }

      isAdmin = profile.role === "admin";
    }

    // 2. Parse payload
    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      // Body may be empty for batch sweep
    }

    const parseResult = ReconcileSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { fileId } = parseResult.data;
    const adminClient = createAdminClient();

    // Reconcile a single file
    if (fileId) {
      const { data: file, error: fileErr } = await adminClient
        .from("files")
        .select("id, user_id, sanitized_name, r2_key, status, byte_size")
        .eq("id", fileId)
        .single();

      if (fileErr || !file) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }

      // Check ownership unless service or admin
      if (!isServiceAuth && !isAdmin && file.user_id !== sessionUser?.id) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }

      if (file.status === "PURGED") {
        return NextResponse.json({
          success: true,
          status: "PURGED",
          message: "File is already purged",
        });
      }

      // Authoritative PostgreSQL RPC: checks that NO active lease exists (lease_expires_at > NOW())
      // Sets status to DELETE_PENDING and reclaims quota
      const { error: rpcErr } = await adminClient.rpc("reconcile_single_use_file", {
        p_file_id: fileId,
      });

      if (rpcErr) {
        if (rpcErr.message.includes("DOWNLOAD_LEASE_ACTIVE")) {
          return NextResponse.json(
            {
              error: "Active 90-second download lease is currently in progress. Deletion prevented.",
              code: "DOWNLOAD_LEASE_ACTIVE",
            },
            { status: 409 }
          );
        }

        if (rpcErr.message.includes("NOT_SINGLE_USE_FILE")) {
          return NextResponse.json(
            {
              error: "This file is not configured for delete-after-first-download single-use lifecycle.",
              code: "NOT_SINGLE_USE_FILE",
            },
            { status: 400 }
          );
        }

        console.error("reconcile_single_use_file RPC error:", rpcErr);
        return NextResponse.json(
          { error: `Reconciliation failed: ${rpcErr.message}` },
          { status: 500 }
        );
      }

      // Physical R2 object deletion
      const r2Deleted = await deleteR2Object(file.r2_key);

      if (r2Deleted) {
        await adminClient
          .from("files")
          .update({
            status: "PURGED",
            updated_at: new Date().toISOString(),
          })
          .eq("id", fileId);

        await adminClient.from("audit_logs").insert({
          actor_id: file.user_id,
          event_type: "FILE_PURGED",
          resource_type: "file",
          resource_id: fileId,
          ip_hash: "server_authoritative",
          metadata: {
            filename: file.sanitized_name,
            byte_size: file.byte_size,
            reason: "single_use_lease_expired",
          },
        });

        return NextResponse.json({
          success: true,
          status: "PURGED",
          message: "Single-use file purged and storage reclaimed successfully.",
        });
      } else {
        await adminClient
          .from("files")
          .update({
            status: "DELETE_FAILED",
            last_reconciliation_error: "R2 physical delete failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", fileId);

        return NextResponse.json({
          success: true,
          status: "DELETE_FAILED",
          message: "Storage quota reclaimed; physical R2 cleanup queued for retry.",
        });
      }
    }

    // Batch sweep: find single-use files eligible for reconciliation
    const { data: candidateFiles, error: sweepErr } = await adminClient
      .from("files")
      .select("id, user_id, sanitized_name, r2_key, status, byte_size")
      .eq("status", "ACTIVE")
      .limit(50);

    if (sweepErr || !candidateFiles) {
      return NextResponse.json({ error: "Failed to query files" }, { status: 500 });
    }

    const results = [];
    for (const f of candidateFiles) {
      const { data: shareLink } = await adminClient
        .from("share_links")
        .select("id, is_single_use")
        .eq("file_id", f.id)
        .eq("is_single_use", true)
        .maybeSingle();

      if (!shareLink) continue;

      const { error: rpcErr } = await adminClient.rpc("reconcile_single_use_file", {
        p_file_id: f.id,
      });

      if (rpcErr) {
        continue; // Active lease or other skip
      }

      const deleted = await deleteR2Object(f.r2_key);
      if (deleted) {
        await adminClient
          .from("files")
          .update({ status: "PURGED", updated_at: new Date().toISOString() })
          .eq("id", f.id);
        results.push({ fileId: f.id, status: "PURGED" });
      } else {
        await adminClient
          .from("files")
          .update({
            status: "DELETE_FAILED",
            last_reconciliation_error: "R2 physical delete failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", f.id);
        results.push({ fileId: f.id, status: "DELETE_FAILED" });
      }
    }

    return NextResponse.json({
      success: true,
      reconciled_count: results.length,
      results,
    });
  } catch (err) {
    console.error("Unexpected error in reconcile-single-use:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
