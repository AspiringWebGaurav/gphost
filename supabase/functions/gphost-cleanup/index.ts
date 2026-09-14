import { createClient } from "@supabase/supabase-js";
import {
  S3Client,
  DeleteObjectCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { timingSafeEqual } from "node:crypto";

function verifyCronAuth(authHeader: string | null, expectedSecret: string): boolean {
  if (!authHeader || !authHeader.startsWith("Bearer ") || !expectedSecret) {
    return false;
  }
  const token = authHeader.slice(7).trim();
  const tokenBytes = new TextEncoder().encode(token);
  const secretBytes = new TextEncoder().encode(expectedSecret);

  if (tokenBytes.byteLength !== secretBytes.byteLength) {
    return false;
  }

  try {
    return timingSafeEqual(tokenBytes, secretBytes);
  } catch {
    let mismatch = 0;
    for (let i = 0; i < tokenBytes.byteLength; i++) {
      mismatch |= tokenBytes[i] ^ secretBytes[i];
    }
    return mismatch === 0;
  }
}

function getSupabaseSecretKey(): string {
  const secretKeysJson = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!secretKeysJson) {
    throw new Error("SUPABASE_SECRET_KEYS environment variable is missing.");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(secretKeysJson);
  } catch (err) {
    throw new Error(`Failed to parse SUPABASE_SECRET_KEYS JSON: ${(err as Error).message}`);
  }

  const key = parsed["default"] ?? parsed["service_role"];
  if (typeof key !== "string" || key.trim() === "") {
    throw new Error("SUPABASE_SECRET_KEYS does not contain a valid 'default' or 'service_role' key.");
  }

  return key;
}

interface ClaimedCandidate {
  file_id: string;
  claim_token: string;
  r2_key: string;
  r2_upload_id: string | null;
  status: string;
  byte_size: number;
  user_id: string;
}

Deno.serve(async (req: Request) => {
  const startTime = Date.now();

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    console.error("CRON_SECRET is not configured in Edge Function environment.");
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!verifyCronAuth(authHeader, cronSecret)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  let secretKey: string;
  try {
    secretKey = getSupabaseSecretKey();
  } catch (err: unknown) {
    console.error("Database configuration error:", err);
    return new Response(JSON.stringify({ error: "Database configuration missing" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!supabaseUrl) {
    console.error("Missing SUPABASE_URL");
    return new Response(JSON.stringify({ error: "Database configuration missing" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const r2AccessKey = Deno.env.get("R2_ACCESS_KEY_ID");
  const r2SecretKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const r2BucketName = Deno.env.get("R2_BUCKET_NAME") || "gphosting-files";
  const r2Endpoint =
    Deno.env.get("R2_ENDPOINT") ||
    (Deno.env.get("R2_ACCOUNT_ID")
      ? `https://${Deno.env.get("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`
      : undefined);

  if (!r2AccessKey || !r2SecretKey || !r2Endpoint) {
    console.error("Missing R2 storage credentials (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT)");
    return new Response(JSON.stringify({ error: "R2 configuration missing" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const s3Client = new S3Client({
    region: "auto",
    endpoint: r2Endpoint,
    credentials: {
      accessKeyId: r2AccessKey,
      secretAccessKey: r2SecretKey,
    },
  });

  const supabase = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false },
  });

  let batchLimit = 50;
  let leaseSeconds = 180;
  try {
    const body = await req.json();
    if (body && typeof body.batch_limit === "number") {
      batchLimit = Math.min(Math.max(body.batch_limit, 1), 50);
    }
    if (body && typeof body.lease_seconds === "number") {
      leaseSeconds = Math.min(Math.max(body.lease_seconds, 30), 600);
    }
  } catch {
    // Use defaults
  }

  // Claim batch
  const { data: claims, error: claimError } = await supabase.rpc(
    "cron_claim_cleanup_batch",
    {
      p_batch_limit: batchLimit,
      p_lease_seconds: leaseSeconds,
    }
  );

  if (claimError) {
    console.error("cron_claim_cleanup_batch error:", claimError);
    return new Response(
      JSON.stringify({
        success: false,
        error: claimError.message,
        execution_time_ms: Date.now() - startTime,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const candidates: ClaimedCandidate[] = Array.isArray(claims) ? claims : [];
  let processedCount = 0;
  let purgedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const candidate of candidates) {
    processedCount++;

    try {
      if (candidate.status === "UPLOADING") {
        // Single-transaction atomic DB fence
        const { data: fenceResult, error: fenceError } = await supabase.rpc(
          "cron_fence_abandoned_upload",
          {
            p_claim_token: candidate.claim_token,
            p_file_id: candidate.file_id,
          }
        );

        if (fenceError || !fenceResult?.success) {
          // Ordering A: Upload completion won the lock; file is now ACTIVE.
          // ZERO destructive R2 operations performed!
          skippedCount++;
          continue;
        }

        // Ordering B: Cleanup won the DB fence! File is now DELETE_PENDING.
        // Complete-upload is permanently barred from transitioning to ACTIVE.
        // Only AFTER the DB fence commits may physical R2 cleanup execute.
        let r2Success = false;
        let r2ErrorMessage = "";

        if (candidate.r2_upload_id) {
          // Abandoned multipart upload -> AbortMultipartUpload
          try {
            await s3Client.send(
              new AbortMultipartUploadCommand({
                Bucket: r2BucketName,
                Key: candidate.r2_key,
                UploadId: candidate.r2_upload_id,
              })
            );
            r2Success = true;
          } catch (abortErr: any) {
            // 404 NoSuchUpload is treated as success (already aborted/completed)
            if (
              abortErr.name === "NoSuchUpload" ||
              abortErr.$metadata?.httpStatusCode === 404 ||
              abortErr.message?.includes("NoSuchUpload")
            ) {
              r2Success = true;
            } else {
              r2ErrorMessage = abortErr.message || "Failed to abort multipart upload";
            }
          }
        } else {
          // Abandoned single-part upload -> DeleteObject
          // Physical object may exist from presigned PUT even when r2_upload_id IS NULL.
          try {
            await s3Client.send(
              new DeleteObjectCommand({
                Bucket: r2BucketName,
                Key: candidate.r2_key,
              })
            );
            r2Success = true;
          } catch (deleteErr: any) {
            r2ErrorMessage = deleteErr.message || "Failed to delete single-part object";
          }
        }

        if (r2Success) {
          await supabase.rpc("cron_finalize_cleanup", {
            p_claim_token: candidate.claim_token,
            p_file_id: candidate.file_id,
            p_target_status: "PURGED",
          });
          purgedCount++;
        } else {
          await supabase.rpc("cron_finalize_cleanup", {
            p_claim_token: candidate.claim_token,
            p_file_id: candidate.file_id,
            p_target_status: "DELETE_FAILED",
            p_error_message: r2ErrorMessage,
          });
          failedCount++;
        }
      } else if (candidate.status === "ACTIVE") {
        // Single-use file reconciliation & TOCTOU defense
        const { data: reconcileStatus, error: reconcileError } =
          await supabase.rpc("reconcile_single_use_file", {
            p_file_id: candidate.file_id,
          });

        if (
          reconcileError?.message?.includes("DOWNLOAD_LEASE_ACTIVE") ||
          reconcileStatus === "ACTIVE"
        ) {
          // Active 90s lease exists or appeared between query and execution!
          // DO NOT delete from R2. Preserve object for downloader.
          await supabase.rpc("cron_release_claim", {
            p_claim_token: candidate.claim_token,
            p_file_id: candidate.file_id,
          });
          skippedCount++;
          continue;
        }

        if (reconcileError) {
          console.error(`reconcile_single_use_file error on ${candidate.file_id}:`, reconcileError);
          await supabase.rpc("cron_release_claim", {
            p_claim_token: candidate.claim_token,
            p_file_id: candidate.file_id,
          });
          failedCount++;
          continue;
        }

        // Reconciled to DELETE_PENDING -> Delete physical object from R2
        let r2Success = false;
        let r2ErrorMessage = "";
        try {
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: r2BucketName,
              Key: candidate.r2_key,
            })
          );
          r2Success = true;
        } catch (delErr: any) {
          r2ErrorMessage = delErr.message || "Failed to delete R2 object";
        }

        if (r2Success) {
          await supabase.rpc("cron_finalize_cleanup", {
            p_claim_token: candidate.claim_token,
            p_file_id: candidate.file_id,
            p_target_status: "PURGED",
          });
          purgedCount++;
        } else {
          await supabase.rpc("cron_finalize_cleanup", {
            p_claim_token: candidate.claim_token,
            p_file_id: candidate.file_id,
            p_target_status: "DELETE_FAILED",
            p_error_message: r2ErrorMessage,
          });
          failedCount++;
        }
      } else if (
        candidate.status === "DELETE_PENDING" ||
        candidate.status === "DELETE_FAILED"
      ) {
        // Standard deletion pipeline candidate
        let r2Success = false;
        let r2ErrorMessage = "";
        try {
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: r2BucketName,
              Key: candidate.r2_key,
            })
          );
          r2Success = true;
        } catch (delErr: any) {
          r2ErrorMessage = delErr.message || "Failed to delete R2 object";
        }

        if (r2Success) {
          await supabase.rpc("cron_finalize_cleanup", {
            p_claim_token: candidate.claim_token,
            p_file_id: candidate.file_id,
            p_target_status: "PURGED",
          });
          purgedCount++;
        } else {
          await supabase.rpc("cron_finalize_cleanup", {
            p_claim_token: candidate.claim_token,
            p_file_id: candidate.file_id,
            p_target_status: "DELETE_FAILED",
            p_error_message: r2ErrorMessage,
          });
          failedCount++;
        }
      }
    } catch (candidateErr: any) {
      console.error(`Error processing candidate ${candidate.file_id}:`, candidateErr);
      failedCount++;
    }
  }

  const executionTimeMs = Date.now() - startTime;

  return new Response(
    JSON.stringify({
      success: true,
      processed_count: processedCount,
      purged_count: purgedCount,
      skipped_count: skippedCount,
      failed_count: failedCount,
      execution_time_ms: executionTimeMs,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
});
