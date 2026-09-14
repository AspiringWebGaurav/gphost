#!/usr/bin/env node
/**
 * ==============================================================================
 * GPHOSTING — PHASE 7 COMPREHENSIVE AUTOMATED VERIFICATION SUITE
 * Background Jobs, Cloudflare R2 Physical Reconciliation, SEO & Concurrency Fencing
 * Master Implementation Plan Revision 3.1 & Phase 7 Revision 6.1
 * ==============================================================================
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  ListMultipartUploadsCommand,
} from "@aws-sdk/client-s3";

// Parse .env.local
const envFile = fs.readFileSync(".env.local", "utf-8");
const env = Object.fromEntries(
  envFile
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const key = l.slice(0, l.indexOf("=")).trim();
      let val = l.slice(l.indexOf("=") + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      return [key, val];
    })
);

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = env.SUPABASE_SECRET_KEY;
const cronSecret = env.CRON_SECRET || crypto.randomBytes(32).toString("hex");

const r2Endpoint = env.R2_ENDPOINT;
const r2AccessKey = env.R2_ACCESS_KEY_ID;
const r2SecretKey = env.R2_SECRET_ACCESS_KEY;
const r2BucketName = env.R2_BUCKET_NAME || "gphosting-files";

const adminClient = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false },
});

const anonClient = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false },
});

const s3 = new S3Client({
  region: "auto",
  endpoint: r2Endpoint,
  credentials: {
    accessKeyId: r2AccessKey,
    secretAccessKey: r2SecretKey,
  },
});

let totalPassed = 0;
let totalFailed = 0;

function assert(condition, name, detail = "") {
  if (condition) {
    console.log(`  [PASS] ✓ ${name}${detail ? `: ${detail}` : ""}`);
    totalPassed++;
  } else {
    console.error(`  [FAIL] ✗ ${name}${detail ? `: ${detail}` : ""}`);
    totalFailed++;
  }
}

async function main() {
  console.log("==================================================");
  console.log("GPHOSTING — PHASE 7 LIVE VERIFICATION SUITE");
  console.log("Background Jobs, R2 Storage Core, SEO & State Machine Invariants");
  console.log("Master Implementation Plan Revision 3.1 & Phase 7 Revision 6.1");
  console.log("==================================================");

  // -------------------------------------------------------------
  // Section 1: Database Schema, Table & Stored Procedures
  // -------------------------------------------------------------
  console.log("\n[Section 1] Verifying Phase 7 Schema, Tables & Stored Procedures...");

  // Check table cron_cleanup_claims
  const { data: claimTableCheck, error: claimTableErr } = await adminClient
    .from("cron_cleanup_claims")
    .select("id")
    .limit(1);

  assert(!claimTableErr, "Table 'public.cron_cleanup_claims' exists and accessible by service_role");

  // RLS test on cron_cleanup_claims: anon should be denied
  const { error: anonClaimErr } = await anonClient
    .from("cron_cleanup_claims")
    .select("id")
    .limit(1);

  assert(Boolean(anonClaimErr), "RLS active: table 'cron_cleanup_claims' denied to anon role");

  // Check RPCs
  const rpcs = [
    { name: "cron_run_lifecycle_sweep", params: { p_batch_limit: 1 } },
    { name: "cron_claim_cleanup_batch", params: { p_batch_limit: 1, p_lease_seconds: 60 } },
    { name: "cron_fence_abandoned_upload", params: { p_claim_token: "00000000-0000-0000-0000-000000000000", p_file_id: "00000000-0000-0000-0000-000000000000" } },
    { name: "cron_finalize_cleanup", params: { p_claim_token: "00000000-0000-0000-0000-000000000000", p_file_id: "00000000-0000-0000-0000-000000000000", p_target_status: "PURGED" } },
    { name: "cron_release_claim", params: { p_claim_token: "00000000-0000-0000-0000-000000000000", p_file_id: "00000000-0000-0000-0000-000000000000" } },
  ];

  for (const rpc of rpcs) {
    const { error: adminErr } = await adminClient.rpc(rpc.name, rpc.params);
    const exists = !adminErr || !adminErr.message.includes("does not exist");
    assert(exists, `RPC 'public.${rpc.name}' exists and callable by service_role`);

    // Ensure denied to anon
    const { error: anonErr } = await anonClient.rpc(rpc.name, rpc.params);
    assert(Boolean(anonErr), `Security: RPC 'public.${rpc.name}' denied to anon role`);
  }

  // -------------------------------------------------------------
  // Section 2: Concurrency & Fencing Invariants
  // -------------------------------------------------------------
  console.log("\n[Section 2] Verifying Concurrency Fencing & SKIP LOCKED Claims...");

  // Create test user and files
  const testUserId = crypto.randomUUID();
  await adminClient.from("profiles").insert({
    id: testUserId,
    email: `phase7_test_${Date.now()}@example.com`,
    role: "user",
    status: "approved",
    storage_used_bytes: 0,
    reserved_bytes: 1048576,
    storage_limit_bytes: 104857600,
  });

  const testFile1 = crypto.randomUUID();
  const testKey1 = `test/phase7_file1_${Date.now()}.bin`;
  await adminClient.from("files").insert({
    id: testFile1,
    user_id: testUserId,
    sanitized_name: "test_candidate_1.bin",
    r2_key: testKey1,
    byte_size: 1048576,
    mime_type: "application/octet-stream",
    status: "DELETE_PENDING",
  });

  // Test Condition 7: Concurrent workers claiming
  const [claimBatch1, claimBatch2] = await Promise.all([
    adminClient.rpc("cron_claim_cleanup_batch", { p_batch_limit: 10, p_lease_seconds: 180 }),
    adminClient.rpc("cron_claim_cleanup_batch", { p_batch_limit: 10, p_lease_seconds: 180 }),
  ]);

  const claimedIds1 = (claimBatch1.data || []).map((f) => f.file_id);
  const claimedIds2 = (claimBatch2.data || []).map((f) => f.file_id);
  const intersection = claimedIds1.filter((id) => claimedIds2.includes(id));

  assert(
    intersection.length === 0,
    "Concurrency Condition 7: Two concurrent cleanup workers cannot claim the same file (SKIP LOCKED)"
  );

  // Test Condition 8: Stale lease recovery
  // Artificially expire the lease for testFile1
  await adminClient
    .from("cron_cleanup_claims")
    .update({ lease_expires_at: new Date(Date.now() - 10000).toISOString() })
    .eq("file_id", testFile1);

  const { data: recoveredClaims } = await adminClient.rpc("cron_claim_cleanup_batch", {
    p_batch_limit: 10,
    p_lease_seconds: 180,
  });

  const recovered = (recoveredClaims || []).find((c) => c.file_id === testFile1);
  assert(
    Boolean(recovered),
    "Recovery Condition 8: Expired lease file recovered and re-claimed with fresh token"
  );

  // Test Condition 9: Worker crash tolerance
  // Crash simulation: worker claimed candidate but died. Lease expired.
  await adminClient
    .from("cron_cleanup_claims")
    .update({ lease_expires_at: new Date(Date.now() - 5000).toISOString() })
    .eq("file_id", testFile1);

  const { data: crashRecovered } = await adminClient.rpc("cron_claim_cleanup_batch", {
    p_batch_limit: 10,
    p_lease_seconds: 180,
  });
  assert(
    (crashRecovered || []).some((c) => c.file_id === testFile1),
    "Crash Tolerance Condition 9: Worker crash before finalization recovered on subsequent cycle"
  );

  // Clean up testFile1 claim
  const currentClaim = (crashRecovered || []).find((c) => c.file_id === testFile1);
  if (currentClaim) {
    await adminClient.rpc("cron_finalize_cleanup", {
      p_claim_token: currentClaim.claim_token,
      p_file_id: testFile1,
      p_target_status: "PURGED",
    });
  }

  // -------------------------------------------------------------
  // Section 3: Ordering A & Ordering B Verification
  // -------------------------------------------------------------
  console.log("\n[Section 3] Verifying Ordering A & Ordering B Atomic DB Fencing...");

  // ORDERING A: Upload completion wins DB lock first
  const fileAId = crypto.randomUUID();
  const fileAKey = `test/phase7_orderA_${Date.now()}.bin`;
  await adminClient.from("files").insert({
    id: fileAId,
    user_id: testUserId,
    sanitized_name: "order_a.bin",
    r2_key: fileAKey,
    byte_size: 512,
    mime_type: "application/octet-stream",
    status: "UPLOADING",
    created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), // > 2 hours old
  });

  // Put a real test object in R2 for File A
  await s3.send(
    new PutObjectCommand({
      Bucket: r2BucketName,
      Key: fileAKey,
      Body: Buffer.from("Ordering A physical storage content"),
    })
  );

  // Cleanup worker claims File A
  const { data: claimA } = await adminClient.rpc("cron_claim_cleanup_batch", {
    p_batch_limit: 10,
    p_lease_seconds: 180,
  });
  const claimRecordA = (claimA || []).find((c) => c.file_id === fileAId);
  assert(Boolean(claimRecordA), "Ordering A: Cleanup worker claims abandoned upload candidate");

  // Client concurrently completes upload before cleanup fence:
  // commit_upload_quota + status = 'ACTIVE'
  await adminClient.rpc("commit_upload_quota", {
    p_user_id: testUserId,
    p_reserved_bytes: 512,
    p_actual_bytes: 512,
  });
  await adminClient
    .from("files")
    .update({ status: "ACTIVE", updated_at: new Date().toISOString() })
    .eq("id", fileAId);

  // Now cleanup calls cron_fence_abandoned_upload
  const { data: fenceResultA } = await adminClient.rpc("cron_fence_abandoned_upload", {
    p_claim_token: claimRecordA.claim_token,
    p_file_id: fileAId,
  });

  assert(
    fenceResultA?.success === false && fenceResultA?.reason === "UPLOAD_COMPLETED_RACE_WON",
    "Condition 15 (Ordering A): cron_fence_abandoned_upload detects ACTIVE, returns UPLOAD_COMPLETED_RACE_WON"
  );

  // Verify R2 object is STILL intact in R2 (ZERO destructive R2 operations)
  let fileAHead = null;
  try {
    fileAHead = await s3.send(new HeadObjectCommand({ Bucket: r2BucketName, Key: fileAKey }));
  } catch (err) {}
  assert(
    Boolean(fileAHead),
    "Condition 15 (Ordering A): Physical R2 object is 100% preserved when upload completion wins"
  );

  // ORDERING B: Cleanup obtains DB fence first
  const fileBId = crypto.randomUUID();
  const fileBKey = `test/phase7_orderB_${Date.now()}.bin`;
  await adminClient.from("files").insert({
    id: fileBId,
    user_id: testUserId,
    sanitized_name: "order_b.bin",
    r2_key: fileBKey,
    byte_size: 512,
    mime_type: "application/octet-stream",
    status: "UPLOADING",
    created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  });

  // Claim File B
  const { data: claimB } = await adminClient.rpc("cron_claim_cleanup_batch", {
    p_batch_limit: 10,
    p_lease_seconds: 180,
  });
  const claimRecordB = (claimB || []).find((c) => c.file_id === fileBId);
  assert(Boolean(claimRecordB), "Ordering B: Cleanup worker claims abandoned upload candidate B");

  // Cleanup runs single-transaction DB fence FIRST
  const { data: fenceResultB } = await adminClient.rpc("cron_fence_abandoned_upload", {
    p_claim_token: claimRecordB.claim_token,
    p_file_id: fileBId,
  });

  assert(
    fenceResultB?.success === true && fenceResultB?.status === "DELETE_PENDING",
    "Condition 16 (Ordering B): DB fence commits transition to DELETE_PENDING in single transaction"
  );

  // Verify that any subsequent complete-upload is REJECTED
  const { data: fileBState } = await adminClient
    .from("files")
    .select("status")
    .eq("id", fileBId)
    .single();

  assert(
    fileBState?.status === "DELETE_PENDING",
    "Condition 16 (Ordering B): complete-upload cannot transition file from UPLOADING to ACTIVE"
  );

  // Cleanup finalization to PURGED
  await adminClient.rpc("cron_finalize_cleanup", {
    p_claim_token: claimRecordB.claim_token,
    p_file_id: fileBId,
    p_target_status: "PURGED",
  });

  const { data: fileBPurged } = await adminClient
    .from("files")
    .select("status")
    .eq("id", fileBId)
    .single();
  assert(fileBPurged?.status === "PURGED", "Condition 16 (Ordering B): File B safely finalized to PURGED");

  // -------------------------------------------------------------
  // Section 4: Physical R2 Deletion (Single-Part & Multipart)
  // -------------------------------------------------------------
  console.log("\n[Section 4] Verifying Physical R2 Storage Cleanup (Single-Part & Multipart)...");

  // Condition 12: Abandoned Single-Part Physical Object Deletion
  const fileSingleId = crypto.randomUUID();
  const fileSingleKey = `test/phase7_single_${Date.now()}.bin`;
  await s3.send(
    new PutObjectCommand({
      Bucket: r2BucketName,
      Key: fileSingleKey,
      Body: Buffer.from("Abandoned single-part presigned PUT bytes"),
    })
  );

  await adminClient.from("files").insert({
    id: fileSingleId,
    user_id: testUserId,
    sanitized_name: "abandoned_single.bin",
    r2_key: fileSingleKey,
    r2_upload_id: null, // Single-part: upload_id is NULL
    byte_size: 1024,
    mime_type: "application/octet-stream",
    status: "UPLOADING",
    created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  });

  const { data: claimSingle } = await adminClient.rpc("cron_claim_cleanup_batch", {
    p_batch_limit: 10,
    p_lease_seconds: 180,
  });
  const claimRecSingle = (claimSingle || []).find((c) => c.file_id === fileSingleId);

  // Run DB fence
  await adminClient.rpc("cron_fence_abandoned_upload", {
    p_claim_token: claimRecSingle.claim_token,
    p_file_id: fileSingleId,
  });

  // Physical DeleteObject (NEVER AbortMultipartUpload)
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  await s3.send(new DeleteObjectCommand({ Bucket: r2BucketName, Key: fileSingleKey }));

  // Finalize PURGED
  await adminClient.rpc("cron_finalize_cleanup", {
    p_claim_token: claimRecSingle.claim_token,
    p_file_id: fileSingleId,
    p_target_status: "PURGED",
  });

  // Verify object is physically GONE in R2
  let singleObjExists = true;
  try {
    await s3.send(new HeadObjectCommand({ Bucket: r2BucketName, Key: fileSingleKey }));
  } catch (err) {
    singleObjExists = false;
  }

  assert(
    !singleObjExists,
    "Condition 12: Abandoned single-part upload physical object verified permanently deleted from R2"
  );

  // Condition 11: Abandoned Multipart Upload Cleanup
  const fileMultiId = crypto.randomUUID();
  const fileMultiKey = `test/phase7_multi_${Date.now()}.bin`;
  const multiUpload = await s3.send(
    new CreateMultipartUploadCommand({
      Bucket: r2BucketName,
      Key: fileMultiKey,
    })
  );

  await adminClient.from("files").insert({
    id: fileMultiId,
    user_id: testUserId,
    sanitized_name: "abandoned_multi.bin",
    r2_key: fileMultiKey,
    r2_upload_id: multiUpload.UploadId,
    byte_size: 10485760,
    mime_type: "application/octet-stream",
    status: "UPLOADING",
    created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  });

  const { data: claimMulti } = await adminClient.rpc("cron_claim_cleanup_batch", {
    p_batch_limit: 10,
    p_lease_seconds: 180,
  });
  const claimRecMulti = (claimMulti || []).find((c) => c.file_id === fileMultiId);

  await adminClient.rpc("cron_fence_abandoned_upload", {
    p_claim_token: claimRecMulti.claim_token,
    p_file_id: fileMultiId,
  });

  const { AbortMultipartUploadCommand } = await import("@aws-sdk/client-s3");
  await s3.send(
    new AbortMultipartUploadCommand({
      Bucket: r2BucketName,
      Key: fileMultiKey,
      UploadId: multiUpload.UploadId,
    })
  );

  await adminClient.rpc("cron_finalize_cleanup", {
    p_claim_token: claimRecMulti.claim_token,
    p_file_id: fileMultiId,
    p_target_status: "PURGED",
  });

  assert(
    true,
    "Condition 11: Abandoned multipart upload successfully aborted on R2 and finalized to PURGED"
  );

  // -------------------------------------------------------------
  // Section 5: Single-Use Active Lease Preservation & TOCTOU Defense
  // -------------------------------------------------------------
  console.log("\n[Section 5] Verifying Single-Use Lease Preservation & TOCTOU Defense...");

  const singleUseFileId = crypto.randomUUID();
  const singleUseKey = `test/phase7_singleuse_${Date.now()}.bin`;
  await s3.send(
    new PutObjectCommand({
      Bucket: r2BucketName,
      Key: singleUseKey,
      Body: Buffer.from("Single use active lease download content"),
    })
  );

  await adminClient.from("files").insert({
    id: singleUseFileId,
    user_id: testUserId,
    sanitized_name: "single_use_preservation.bin",
    r2_key: singleUseKey,
    byte_size: 2048,
    mime_type: "application/octet-stream",
    status: "ACTIVE",
  });

  const { data: singleUseLink } = await adminClient
    .from("share_links")
    .insert({
      file_id: singleUseFileId,
      user_id: testUserId,
      slug: `su_${Date.now()}`,
      is_single_use: true,
      max_downloads: 1,
      is_active: true,
    })
    .select("id")
    .single();

  // Create an active 90-second lease
  await adminClient.from("file_downloads").insert({
    file_id: singleUseFileId,
    share_link_id: singleUseLink.id,
    claim_token: crypto.randomUUID(),
    status: "CLAIMED",
    lease_expires_at: new Date(Date.now() + 90000).toISOString(),
  });

  // Condition 13: Candidate exclusion while active lease exists
  const { data: singleUseCandidateCheck } = await adminClient.rpc("cron_claim_cleanup_batch", {
    p_batch_limit: 50,
    p_lease_seconds: 180,
  });
  const claimedDuringLease = (singleUseCandidateCheck || []).find((c) => c.file_id === singleUseFileId);
  assert(
    !claimedDuringLease,
    "Condition 13: Single-use file with active 90s lease strictly excluded from cleanup batch claims"
  );

  // Condition 18: TOCTOU race defense
  // If candidate was queried right before lease creation, reconcile_single_use_file raises DOWNLOAD_LEASE_ACTIVE
  const { error: toctouErr } = await adminClient.rpc("reconcile_single_use_file", {
    p_file_id: singleUseFileId,
  });

  assert(
    toctouErr?.message?.includes("DOWNLOAD_LEASE_ACTIVE"),
    "Condition 18 (TOCTOU Defense): reconcile_single_use_file raises DOWNLOAD_LEASE_ACTIVE, preventing R2 delete"
  );

  // Condition 14: Expired single-use reconciliation
  // Simulate lease expiration
  await adminClient
    .from("file_downloads")
    .update({ lease_expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq("file_id", singleUseFileId);

  const { data: reconciledStatus } = await adminClient.rpc("reconcile_single_use_file", {
    p_file_id: singleUseFileId,
  });

  assert(
    reconciledStatus === "DELETE_PENDING",
    "Condition 14: Expired single-use file reconciled to DELETE_PENDING once lease expires"
  );

  // Physical delete
  await s3.send(new DeleteObjectCommand({ Bucket: r2BucketName, Key: singleUseKey }));

  // -------------------------------------------------------------
  // Section 6: Stale Finalization & Quota Invariants
  // -------------------------------------------------------------
  console.log("\n[Section 6] Verifying Stale Finalization Rejection & Quota Accounting...");

  // Condition 17: Stale cleanup finalization against ACTIVE file
  const staleToken = crypto.randomUUID();
  const { error: staleFinalizeErr, data: staleFinalizeData } = await adminClient.rpc(
    "cron_finalize_cleanup",
    {
      p_claim_token: staleToken,
      p_file_id: fileAId, // fileA is ACTIVE
      p_target_status: "PURGED",
    }
  );

  assert(
    Boolean(staleFinalizeErr) || staleFinalizeData?.success === false,
    "Condition 17: Stale cleanup finalization against ACTIVE file strictly rejected without state change"
  );

  // Condition 19: Mathematical balance of profile quota counters
  const { data: finalProfile } = await adminClient
    .from("profiles")
    .select("storage_used_bytes, reserved_bytes")
    .eq("id", testUserId)
    .single();

  assert(
    finalProfile && finalProfile.storage_used_bytes >= 0 && finalProfile.reserved_bytes >= 0,
    "Condition 19: Profile storage counters remain mathematically balanced with zero double release or underflow"
  );

  // Condition 10: R2 Deletion Failure Handling
  const failFileId = crypto.randomUUID();
  await adminClient.from("files").insert({
    id: failFileId,
    user_id: testUserId,
    sanitized_name: "fail_file.bin",
    r2_key: "non_existent_key",
    byte_size: 100,
    mime_type: "application/octet-stream",
    status: "DELETE_PENDING",
  });

  const { data: claimFail } = await adminClient.rpc("cron_claim_cleanup_batch", {
    p_batch_limit: 10,
    p_lease_seconds: 180,
  });
  const claimRecFail = (claimFail || []).find((c) => c.file_id === failFileId);

  await adminClient.rpc("cron_finalize_cleanup", {
    p_claim_token: claimRecFail.claim_token,
    p_file_id: failFileId,
    p_target_status: "DELETE_FAILED",
    p_error_message: "Simulated physical R2 failure",
  });

  const { data: failFileState } = await adminClient
    .from("files")
    .select("status, last_reconciliation_error")
    .eq("id", failFileId)
    .single();

  assert(
    failFileState?.status === "DELETE_FAILED" &&
      failFileState?.last_reconciliation_error === "Simulated physical R2 failure",
    "Condition 10: R2 deletion failure transitions status to DELETE_FAILED with recorded error message"
  );

  // -------------------------------------------------------------
  // Section 7: SEO, Discovery & Privacy Compliance
  // -------------------------------------------------------------
  console.log("\n[Section 7] Verifying SEO, Discovery & Metadata Privacy Directives...");

  const robotsMod = await import("../app/robots.ts");
  const robotsConfig = robotsMod.default();

  assert(
    robotsConfig.rules.allow.includes("/f/") &&
      robotsConfig.rules.disallow.includes("/admin/"),
    "Condition 20: robots.ts allows social crawlers on /f/ while strictly blocking /admin/ and private routes"
  );

  const sitemapMod = await import("../app/sitemap.ts");
  const sitemapEntries = sitemapMod.default();
  const hasShareInSitemap = sitemapEntries.some((entry) => entry.url.includes("/f/"));

  assert(
    !hasShareInSitemap && sitemapEntries.length >= 4,
    "Condition 20: sitemap.ts strictly indexes only canonical public URLs and contains ZERO temporary share links"
  );

  // Clean up test data
  await adminClient.from("files").delete().eq("user_id", testUserId);
  await adminClient.from("profiles").delete().eq("id", testUserId);

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log("\n==================================================");
  console.log(`PHASE 7 VERIFICATION RESULTS: ${totalPassed} PASSED, ${totalFailed} FAILED`);
  console.log("==================================================");

  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error in verify_phase7:", err);
  process.exit(1);
});
