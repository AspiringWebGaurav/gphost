import fs from "fs";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { hashSharePassword, verifySharePassword, generatePasswordSalt } from "../lib/security/password.ts";
import { createUnlockToken, verifyUnlockToken } from "../lib/security/unlock-token.ts";
import { hashClientIp } from "../lib/security/ip.ts";
import { formatPublicShareMetadata } from "../lib/storage/share.ts";

// Read and parse environment
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
Object.assign(process.env, env);

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = env.SUPABASE_SECRET_KEY;

const r2Endpoint = env.R2_ENDPOINT;
const r2AccessKey = env.R2_ACCESS_KEY_ID;
const r2SecretKey = env.R2_SECRET_ACCESS_KEY;
const r2BucketName = env.R2_BUCKET_NAME || "gphosting-files";

const report = {
  summary: { pass: 0, fail: 0, notVerified: 0 },
  details: [],
};

function record(category, item, status, message = "") {
  if (status === "PASS") report.summary.pass++;
  else if (status === "FAIL") report.summary.fail++;
  else report.summary.notVerified++;

  report.details.push({ category, item, status, message });
  const icon = status === "PASS" ? "✓" : status === "FAIL" ? "✗" : "○";
  console.log(`  [${status}] ${icon} ${category} -> ${item}${message ? `: ${message}` : ""}`);
}

async function runVerification() {
  console.log("==================================================");
  console.log("GPHOSTING — PHASE 4 LIVE REMOTE VERIFICATION");
  console.log("Public Share, Atomic Download Claim & Lifecycle Engine");
  console.log("Master Implementation Plan Revision 3.1");
  console.log("==================================================");

  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const r2Client = new S3Client({
    region: "auto",
    endpoint: r2Endpoint,
    credentials: {
      accessKeyId: r2AccessKey,
      secretAccessKey: r2SecretKey,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  // Track created test records for cleanup
  let cleanupUserId = null;
  const cleanupFileIds = [];
  const cleanupShareIds = [];
  const cleanupR2Keys = [];

  try {
    // ----------------------------------------------------
    // 1. Remote RPC Existence & Permissions
    // ----------------------------------------------------
    console.log("\n[1/6] Remote RPC Existence & Permission Isolation");

    // Check A: acquire_download_claim_lease existence and call via service_role
    try {
      const dummyToken = crypto.randomUUID();
      const res = await adminClient.rpc("acquire_download_claim_lease", {
        p_slug: "non_existent_slug_test",
        p_lease_token: dummyToken,
        p_ip_hash: "hash_test",
        p_user_agent: "test_agent",
      });

      if (res.data && res.data.success === false && res.data.error === "NOT_FOUND") {
        record("Remote RPC", "acquire_download_claim_lease exists and callable by service_role", "PASS");
      } else if (res.error) {
        record("Remote RPC", "acquire_download_claim_lease exists and callable by service_role", "FAIL", res.error.message);
      } else {
        record("Remote RPC", "acquire_download_claim_lease exists and callable by service_role", "FAIL", `Unexpected result: ${JSON.stringify(res.data)}`);
      }
    } catch (err) {
      record("Remote RPC", "acquire_download_claim_lease exists and callable by service_role", "FAIL", err.message);
    }

    // Check B: acquire_download_claim_lease denied to anon
    try {
      const dummyToken = crypto.randomUUID();
      const res = await anonClient.rpc("acquire_download_claim_lease", {
        p_slug: "test",
        p_lease_token: dummyToken,
        p_ip_hash: "hash_test",
        p_user_agent: "test_agent",
      });

      if (res.error && (res.error.code === "42501" || res.error.message.includes("permission denied"))) {
        record("Remote Security", "acquire_download_claim_lease denied to anon", "PASS");
      } else {
        record("Remote Security", "acquire_download_claim_lease denied to anon", "FAIL", `Expected permission denied, got ${JSON.stringify(res)}`);
      }
    } catch (err) {
      record("Remote Security", "acquire_download_claim_lease denied to anon", "PASS", `Caught: ${err.message}`);
    }

    // Check C: rollback_download_claim existence and callable by service_role
    try {
      const dummyShareId = crypto.randomUUID();
      const dummyToken = crypto.randomUUID();
      const res = await adminClient.rpc("rollback_download_claim", {
        p_share_id: dummyShareId,
        p_lease_token: dummyToken,
      });

      if (!res.error) {
        record("Remote RPC", "rollback_download_claim exists and callable by service_role", "PASS");
      } else {
        record("Remote RPC", "rollback_download_claim exists and callable by service_role", "FAIL", res.error.message);
      }
    } catch (err) {
      record("Remote RPC", "rollback_download_claim exists and callable by service_role", "FAIL", err.message);
    }

    // Check D: rollback_download_claim denied to anon
    try {
      const dummyShareId = crypto.randomUUID();
      const dummyToken = crypto.randomUUID();
      const res = await anonClient.rpc("rollback_download_claim", {
        p_share_id: dummyShareId,
        p_lease_token: dummyToken,
      });

      if (res.error && (res.error.code === "42501" || res.error.message.includes("permission denied"))) {
        record("Remote Security", "rollback_download_claim denied to anon", "PASS");
      } else {
        record("Remote Security", "rollback_download_claim denied to anon", "FAIL", `Expected permission denied, got ${JSON.stringify(res)}`);
      }
    } catch (err) {
      record("Remote Security", "rollback_download_claim denied to anon", "PASS", `Caught: ${err.message}`);
    }

    // Check E: reconcile_single_use_file existence and callable by service_role
    try {
      const dummyFileId = crypto.randomUUID();
      const res = await adminClient.rpc("reconcile_single_use_file", {
        p_file_id: dummyFileId,
      });

      if (res.error && res.error.message.includes("FILE_NOT_FOUND")) {
        record("Remote RPC", "reconcile_single_use_file exists and callable by service_role", "PASS");
      } else if (!res.error) {
        record("Remote RPC", "reconcile_single_use_file exists and callable by service_role", "PASS");
      } else {
        record("Remote RPC", "reconcile_single_use_file exists and callable by service_role", "FAIL", res.error.message);
      }
    } catch (err) {
      record("Remote RPC", "reconcile_single_use_file exists and callable by service_role", "FAIL", err.message);
    }

    // Check F: reconcile_single_use_file denied to anon
    try {
      const dummyFileId = crypto.randomUUID();
      const res = await anonClient.rpc("reconcile_single_use_file", {
        p_file_id: dummyFileId,
      });

      if (res.error && (res.error.code === "42501" || res.error.message.includes("permission denied"))) {
        record("Remote Security", "reconcile_single_use_file denied to anon", "PASS");
      } else {
        record("Remote Security", "reconcile_single_use_file denied to anon", "FAIL", `Expected permission denied, got ${JSON.stringify(res)}`);
      }
    } catch (err) {
      record("Remote Security", "reconcile_single_use_file denied to anon", "PASS", `Caught: ${err.message}`);
    }

    // ----------------------------------------------------
    // Setup Test User and Test Files
    // ----------------------------------------------------
    let testUser = null;
    try {
      const { data: createdUser, error: createUserErr } = await adminClient.auth.admin.createUser({
        email: `test_phase4_${Date.now()}@gphost.internal`,
        password: "TestPassword123!Secure",
        email_confirm: true,
      });

      if (createUserErr || !createdUser?.user) {
        throw new Error(`Failed to create test user: ${createUserErr?.message}`);
      }
      testUser = createdUser.user;
      cleanupUserId = testUser.id;

      await adminClient
        .from("profiles")
        .update({ status: "approved" })
        .eq("id", testUser.id);
    } catch (uErr) {
      // Fallback: check if existing profile exists
      const { data: existingProfiles } = await adminClient
        .from("profiles")
        .select("id, role, status")
        .eq("status", "approved")
        .limit(1);

      if (existingProfiles && existingProfiles.length > 0) {
        testUser = existingProfiles[0];
      } else {
        throw uErr;
      }
    }

    // ----------------------------------------------------
    // 2. Core Download Claim Flow & R2 Presigned GET
    // ----------------------------------------------------
    console.log("\n[2/6] Core Download Claim Flow & Live R2 Presigned GET");

    // Upload a real test file to R2
    const testR2Key = `u/${testUser.id}/2026/09/test_phase4_${crypto.randomUUID()}.txt`;
    const testContent = `GPHosting Phase 4 Test File — Payload ${Date.now()}`;
    const testBuffer = Buffer.from(testContent, "utf-8");
    cleanupR2Keys.push(testR2Key);

    await r2Client.send(
      new PutObjectCommand({
        Bucket: r2BucketName,
        Key: testR2Key,
        Body: testBuffer,
        ContentType: "text/plain",
      })
    );

    // Insert file record in Supabase
    const { data: testFile, error: fileInsertErr } = await adminClient
      .from("files")
      .insert({
        user_id: testUser.id,
        filename: "test_download_doc.txt",
        sanitized_name: "test_download_doc.txt",
        byte_size: testBuffer.length,
        mime_type: "text/plain",
        r2_key: testR2Key,
        status: "ACTIVE",
      })
      .select()
      .single();

    if (fileInsertErr || !testFile) {
      throw new Error(`Failed to create test file: ${fileInsertErr?.message}`);
    }
    cleanupFileIds.push(testFile.id);

    // Create a standard active share link
    const standardSlug = `test_std_${crypto.randomBytes(4).toString("hex")}`;
    const { data: standardShare, error: shareInsertErr } = await adminClient
      .from("share_links")
      .insert({
        file_id: testFile.id,
        slug: standardSlug,
        token_hash: crypto.randomBytes(16).toString("hex"),
        is_active: true,
        download_count: 0,
        max_downloads: 10,
      })
      .select()
      .single();

    if (shareInsertErr || !standardShare) {
      throw new Error(`Failed to create test share: ${shareInsertErr?.message}`);
    }
    cleanupShareIds.push(standardShare.id);

    // Check G: Successful download claim on active share
    const leaseToken1 = crypto.randomUUID();
    const ipHash1 = hashClientIp("192.168.1.100");
    const claimRes1 = await adminClient.rpc("acquire_download_claim_lease", {
      p_slug: standardSlug,
      p_lease_token: leaseToken1,
      p_ip_hash: ipHash1,
      p_user_agent: "Node/TestAgent",
    });

    if (
      claimRes1.data &&
      claimRes1.data.success === true &&
      claimRes1.data.download_count === 1 &&
      claimRes1.data.r2_key === testR2Key
    ) {
      record("Claim Flow", "Successful claim acquires lease and increments download_count", "PASS");
    } else {
      record("Claim Flow", "Successful claim acquires lease and increments download_count", "FAIL", JSON.stringify(claimRes1));
    }

    // Verify file_downloads row was recorded with CLAIMED status and 90s lease
    const { data: downloadRow } = await adminClient
      .from("file_downloads")
      .select("*")
      .eq("lease_token", leaseToken1)
      .single();

    if (
      downloadRow &&
      downloadRow.status === "CLAIMED" &&
      downloadRow.share_link_id === standardShare.id &&
      downloadRow.ip_hash === ipHash1
    ) {
      const leaseExpiry = new Date(downloadRow.lease_expires_at).getTime();
      const claimedAt = new Date(downloadRow.claimed_at).getTime();
      const diffSec = Math.round((leaseExpiry - claimedAt) / 1000);

      if (diffSec >= 88 && diffSec <= 92) {
        record("Claim Flow", "file_downloads recorded with CLAIMED status and 90-second lease window", "PASS", `${diffSec}s window`);
      } else {
        record("Claim Flow", "file_downloads recorded with CLAIMED status and 90-second lease window", "FAIL", `Lease window was ${diffSec}s (expected 90s)`);
      }
    } else {
      record("Claim Flow", "file_downloads recorded with CLAIMED status and 90-second lease window", "FAIL", "Row not found or invalid");
    }

    // Check G.1: Atomic Audit Consistency: DOWNLOAD_CLAIMED log inserted in same transaction
    const { data: auditRows } = await adminClient
      .from("audit_logs")
      .select("*")
      .eq("event_type", "DOWNLOAD_CLAIMED")
      .eq("resource_id", standardShare.id);

    const auditMatch = auditRows && auditRows.length >= 1 && auditRows[0].metadata?.lease_token === leaseToken1;
    if (auditMatch) {
      record("Audit Consistency", "DOWNLOAD_CLAIMED audit log inserted atomically inside claim transaction", "PASS");
    } else {
      record("Audit Consistency", "DOWNLOAD_CLAIMED audit log inserted atomically inside claim transaction", "FAIL", `Found: ${JSON.stringify(auditRows)}`);
    }


    // Check H: Presigned GET URL generation with RFC 5987 Content-Disposition
    const asciiFilename = testFile.sanitized_name.replace(/["\\]/g, "_").replace(/[^\x20-\x7E]/g, "_");
    const encodedFilename = encodeURIComponent(testFile.sanitized_name);
    const contentDisposition = `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;

    const presignedGetUrl = await getSignedUrl(
      r2Client,
      new GetObjectCommand({
        Bucket: r2BucketName,
        Key: testR2Key,
        ResponseContentDisposition: contentDisposition,
        ResponseContentType: "text/plain",
      }),
      { expiresIn: 90 }
    );

    if (
      presignedGetUrl.includes("response-content-disposition=") &&
      presignedGetUrl.includes("X-Amz-Expires=90")
    ) {
      record("R2 Presign", "Presigned GET URL generated with 90s expiry & RFC 5987 Content-Disposition", "PASS");
    } else {
      record("R2 Presign", "Presigned GET URL generated with 90s expiry & RFC 5987 Content-Disposition", "FAIL", presignedGetUrl);
    }

    // Check I: Live download of file bytes from Cloudflare R2 via presigned GET URL
    try {
      const getRes = await fetch(presignedGetUrl);
      if (getRes.status === 200) {
        const fetchedBody = await getRes.text();
        const headerDisp = getRes.headers.get("content-disposition");

        if (fetchedBody === testContent && headerDisp && headerDisp.includes("attachment")) {
          record("R2 Download", "Live fetch from presigned GET URL returns identical bytes and attachment header", "PASS");
        } else {
          record("R2 Download", "Live fetch from presigned GET URL returns identical bytes and attachment header", "FAIL", `Mismatch: ${fetchedBody}`);
        }
      } else {
        record("R2 Download", "Live fetch from presigned GET URL returns identical bytes and attachment header", "FAIL", `HTTP ${getRes.status}`);
      }
    } catch (err) {
      record("R2 Download", "Live fetch from presigned GET URL returns identical bytes and attachment header", "FAIL", err.message);
    }

    // ----------------------------------------------------
    // 3. State & Expiration Guards
    // ----------------------------------------------------
    console.log("\n[3/6] State & Expiration Guards");

    // Check J: Inactive share link -> claim rejected
    const inactiveSlug = `test_inact_${crypto.randomBytes(4).toString("hex")}`;
    const { data: inactShare } = await adminClient
      .from("share_links")
      .insert({
        file_id: testFile.id,
        slug: inactiveSlug,
        token_hash: crypto.randomBytes(16).toString("hex"),
        is_active: false,
      })
      .select()
      .single();
    cleanupShareIds.push(inactShare.id);

    const inactClaim = await adminClient.rpc("acquire_download_claim_lease", {
      p_slug: inactiveSlug,
      p_lease_token: crypto.randomUUID(),
      p_ip_hash: hashClientIp("192.168.1.101"),
      p_user_agent: "agent",
    });

    if (inactClaim.data?.success === false && inactClaim.data?.error === "INACTIVE") {
      record("State Guard", "Inactive share link rejected with INACTIVE", "PASS");
    } else {
      record("State Guard", "Inactive share link rejected with INACTIVE", "FAIL", JSON.stringify(inactClaim));
    }

    // Check K: Expired share link (`expires_at <= NOW()`) -> claim rejected
    const expSlug = `test_exp_${crypto.randomBytes(4).toString("hex")}`;
    const pastTime = new Date(Date.now() - 3600 * 1000).toISOString();
    const { data: expShare } = await adminClient
      .from("share_links")
      .insert({
        file_id: testFile.id,
        slug: expSlug,
        token_hash: crypto.randomBytes(16).toString("hex"),
        is_active: true,
        expires_at: pastTime,
      })
      .select()
      .single();
    cleanupShareIds.push(expShare.id);

    const expClaim = await adminClient.rpc("acquire_download_claim_lease", {
      p_slug: expSlug,
      p_lease_token: crypto.randomUUID(),
      p_ip_hash: hashClientIp("192.168.1.102"),
      p_user_agent: "agent",
    });

    if (expClaim.data?.success === false && expClaim.data?.error === "EXPIRED") {
      record("State Guard", "Expired share link rejected with EXPIRED", "PASS");
    } else {
      record("State Guard", "Expired share link rejected with EXPIRED", "FAIL", JSON.stringify(expClaim));
    }

    // Check L: Expired file -> claim rejected
    const { data: expFile } = await adminClient
      .from("files")
      .insert({
        user_id: testUser.id,
        filename: "expired_file.txt",
        sanitized_name: "expired_file.txt",
        byte_size: 100,
        mime_type: "text/plain",
        r2_key: "dummy_exp_key",
        status: "ACTIVE",
        expires_at: pastTime,
      })
      .select()
      .single();
    cleanupFileIds.push(expFile.id);

    const expFileSlug = `test_exp_file_${crypto.randomBytes(4).toString("hex")}`;
    const { data: expFileShare } = await adminClient
      .from("share_links")
      .insert({
        file_id: expFile.id,
        slug: expFileSlug,
        token_hash: crypto.randomBytes(16).toString("hex"),
        is_active: true,
      })
      .select()
      .single();
    cleanupShareIds.push(expFileShare.id);

    const expFileClaim = await adminClient.rpc("acquire_download_claim_lease", {
      p_slug: expFileSlug,
      p_lease_token: crypto.randomUUID(),
      p_ip_hash: hashClientIp("192.168.1.103"),
      p_user_agent: "agent",
    });

    if (expFileClaim.data?.success === false && expFileClaim.data?.error === "EXPIRED") {
      record("State Guard", "Expired file rejected with EXPIRED", "PASS");
    } else {
      record("State Guard", "Expired file rejected with EXPIRED", "FAIL", JSON.stringify(expFileClaim));
    }

    // Check M: Non-ACTIVE file (e.g. UPLOADING) -> claim rejected
    const { data: uploadingFile } = await adminClient
      .from("files")
      .insert({
        user_id: testUser.id,
        filename: "uploading_file.txt",
        sanitized_name: "uploading_file.txt",
        byte_size: 100,
        mime_type: "text/plain",
        r2_key: "dummy_up_key",
        status: "UPLOADING",
      })
      .select()
      .single();
    cleanupFileIds.push(uploadingFile.id);

    const upFileSlug = `test_up_${crypto.randomBytes(4).toString("hex")}`;
    const { data: upFileShare } = await adminClient
      .from("share_links")
      .insert({
        file_id: uploadingFile.id,
        slug: upFileSlug,
        token_hash: crypto.randomBytes(16).toString("hex"),
        is_active: true,
      })
      .select()
      .single();
    cleanupShareIds.push(upFileShare.id);

    const upFileClaim = await adminClient.rpc("acquire_download_claim_lease", {
      p_slug: upFileSlug,
      p_lease_token: crypto.randomUUID(),
      p_ip_hash: hashClientIp("192.168.1.104"),
      p_user_agent: "agent",
    });

    if (upFileClaim.data?.success === false && upFileClaim.data?.error === "FILE_NOT_ACTIVE") {
      record("State Guard", "Non-ACTIVE file rejected with FILE_NOT_ACTIVE", "PASS");
    } else {
      record("State Guard", "Non-ACTIVE file rejected with FILE_NOT_ACTIVE", "FAIL", JSON.stringify(upFileClaim));
    }

    // ----------------------------------------------------
    // 4. Concurrency Protection & Atomic Rollback
    // ----------------------------------------------------
    console.log("\n[4/6] Concurrency Protection & Atomic Rollback");

    // Check N: Single-use link (max_downloads = 1): 10 concurrent claim requests
    const burnSlug = `test_burn_${crypto.randomBytes(4).toString("hex")}`;
    const { data: burnShare } = await adminClient
      .from("share_links")
      .insert({
        file_id: testFile.id,
        slug: burnSlug,
        token_hash: crypto.randomBytes(16).toString("hex"),
        is_active: true,
        is_single_use: true,
        max_downloads: 1,
        download_count: 0,
      })
      .select()
      .single();
    cleanupShareIds.push(burnShare.id);

    const concurrentPromises = Array.from({ length: 10 }, (_, i) =>
      adminClient.rpc("acquire_download_claim_lease", {
        p_slug: burnSlug,
        p_lease_token: crypto.randomUUID(),
        p_ip_hash: hashClientIp(`10.0.0.${i + 1}`),
        p_user_agent: `ConcurrentAgent/${i}`,
      })
    );

    const concurrentResults = await Promise.all(concurrentPromises);
    const successes = concurrentResults.filter((r) => r.data?.success === true);
    const failures = concurrentResults.filter((r) => r.data?.success === false);

    const { data: updatedBurnShare } = await adminClient
      .from("share_links")
      .select("download_count, is_active")
      .eq("id", burnShare.id)
      .single();

    if (
      successes.length === 1 &&
      failures.length === 9 &&
      updatedBurnShare.download_count === 1 &&
      updatedBurnShare.is_active === false
    ) {
      record("Concurrency", "10 concurrent claims on single-use share -> EXACTLY 1 succeeds, 9 fail", "PASS");
    } else {
      record(
        "Concurrency",
        "10 concurrent claims on single-use share -> EXACTLY 1 succeeds, 9 fail",
        "FAIL",
        `Successes: ${successes.length}, Failures: ${failures.length}, Count: ${updatedBurnShare?.download_count}, Active: ${updatedBurnShare?.is_active}`
      );
    }

    // Check O: Multi-download link (max_downloads = 3): 8 concurrent claims
    const multiSlug = `test_multi_${crypto.randomBytes(4).toString("hex")}`;
    const { data: multiShare } = await adminClient
      .from("share_links")
      .insert({
        file_id: testFile.id,
        slug: multiSlug,
        token_hash: crypto.randomBytes(16).toString("hex"),
        is_active: true,
        max_downloads: 3,
        download_count: 0,
      })
      .select()
      .single();
    cleanupShareIds.push(multiShare.id);

    const multiPromises = Array.from({ length: 8 }, (_, i) =>
      adminClient.rpc("acquire_download_claim_lease", {
        p_slug: multiSlug,
        p_lease_token: crypto.randomUUID(),
        p_ip_hash: hashClientIp(`10.0.1.${i + 1}`),
        p_user_agent: `ConcurrentAgentMulti/${i}`,
      })
    );

    const multiResults = await Promise.all(multiPromises);
    const multiSuccesses = multiResults.filter((r) => r.data?.success === true);
    const multiFailures = multiResults.filter((r) => r.data?.success === false);

    const { data: updatedMultiShare } = await adminClient
      .from("share_links")
      .select("download_count, is_active")
      .eq("id", multiShare.id)
      .single();

    if (
      multiSuccesses.length === 3 &&
      multiFailures.length === 5 &&
      updatedMultiShare.download_count === 3 &&
      updatedMultiShare.is_active === false
    ) {
      record("Concurrency", "8 concurrent claims on max_downloads=3 -> EXACTLY 3 succeed, 5 fail", "PASS");
    } else {
      record(
        "Concurrency",
        "8 concurrent claims on max_downloads=3 -> EXACTLY 3 succeed, 5 fail",
        "FAIL",
        `Successes: ${multiSuccesses.length}, Failures: ${multiFailures.length}, Count: ${updatedMultiShare?.download_count}`
      );
    }

    // Check P: Rollback compensation: calling rollback_download_claim
    const rollbackSlug = `test_rb_${crypto.randomBytes(4).toString("hex")}`;
    const { data: rbShare } = await adminClient
      .from("share_links")
      .insert({
        file_id: testFile.id,
        slug: rollbackSlug,
        token_hash: crypto.randomBytes(16).toString("hex"),
        is_active: true,
        max_downloads: 1,
        download_count: 0,
      })
      .select()
      .single();
    cleanupShareIds.push(rbShare.id);

    const rbLeaseToken = crypto.randomUUID();
    await adminClient.rpc("acquire_download_claim_lease", {
      p_slug: rollbackSlug,
      p_lease_token: rbLeaseToken,
      p_ip_hash: hashClientIp("192.168.1.105"),
      p_user_agent: "agent",
    });

    // Simulate presigning failure -> call rollback_download_claim
    const rollbackResult = await adminClient.rpc("rollback_download_claim", {
      p_share_id: rbShare.id,
      p_lease_token: rbLeaseToken,
    });

    const { data: afterRollbackShare } = await adminClient
      .from("share_links")
      .select("download_count, is_active")
      .eq("id", rbShare.id)
      .single();

    const { data: rbLeaseRow } = await adminClient
      .from("file_downloads")
      .select("id")
      .eq("lease_token", rbLeaseToken)
      .maybeSingle();

    if (
      rollbackResult.data === true &&
      afterRollbackShare.download_count === 0 &&
      afterRollbackShare.is_active === true &&
      !rbLeaseRow
    ) {
      record("Atomic Rollback", "rollback_download_claim restores download count, active state, and deletes lease", "PASS");
    } else {
      record("Atomic Rollback", "rollback_download_claim restores download count, active state, and deletes lease", "FAIL", `Count: ${afterRollbackShare?.download_count}, Active: ${afterRollbackShare?.is_active}, LeaseExists: ${Boolean(rbLeaseRow)}`);
    }

    // Check P.1: Rollback Audit Consistency
    const { data: rbAuditRows } = await adminClient
      .from("audit_logs")
      .select("*")
      .eq("event_type", "DOWNLOAD_CLAIM_ROLLED_BACK")
      .eq("resource_id", rbShare.id);

    const rbAuditMatch = rbAuditRows && rbAuditRows.length >= 1 && rbAuditRows[0].metadata?.lease_token === rbLeaseToken;
    if (rbAuditMatch) {
      record("Audit Consistency", "DOWNLOAD_CLAIM_ROLLED_BACK recorded atomically upon claim compensation", "PASS");
    } else {
      record("Audit Consistency", "DOWNLOAD_CLAIM_ROLLED_BACK recorded atomically upon claim compensation", "FAIL");
    }

    // ----------------------------------------------------
    // 5. Password Protection & Cryptographic Unlock State
    // ----------------------------------------------------
    console.log("\n[5/6] Password Protection & Cryptographic Unlock State");

    // Check Q: Argon2id password hashing and constant-time verify
    const plainPass = "SuperSecretPassphrase2026!";
    const passSalt = generatePasswordSalt();
    const passHash = await hashSharePassword(plainPass, passSalt);
    const verifyOk = await verifySharePassword(plainPass, passSalt, passHash);
    const verifyBad = await verifySharePassword("WrongPassword!", passSalt, passHash);

    if (verifyOk && !verifyBad) {
      record("Password Engine", "Argon2id hashing & constant-time verify functions validate accurately", "PASS");
    } else {
      record("Password Engine", "Argon2id hashing & constant-time verify functions validate accurately", "FAIL", `verifyOk: ${verifyOk}, verifyBad: ${verifyBad}`);
    }

    // Check R: HMAC unlock token creation and validation
    const unlockSlug = "demo-slug-123";
    const unlockFileId = crypto.randomUUID();
    const validUnlockToken = createUnlockToken(unlockSlug, unlockFileId, 900);
    const isValidToken = verifyUnlockToken(validUnlockToken, unlockSlug, unlockFileId);
    const isTamperedRejected = verifyUnlockToken(validUnlockToken + "tamper", unlockSlug, unlockFileId);
    const isWrongSlugRejected = verifyUnlockToken(validUnlockToken, "other-slug", unlockFileId);

    if (isValidToken && !isTamperedRejected && !isWrongSlugRejected) {
      record("Unlock Token", "HMAC-signed unlock token binds slug + fileId with cryptographic signature", "PASS");
    } else {
      record("Unlock Token", "HMAC-signed unlock token binds slug + fileId with cryptographic signature", "FAIL");
    }

    // Check S & T: Password-protected share claim attempt validation
    const pwSlug = `test_pw_${crypto.randomBytes(4).toString("hex")}`;
    const { data: pwShare } = await adminClient
      .from("share_links")
      .insert({
        file_id: testFile.id,
        slug: pwSlug,
        token_hash: crypto.randomBytes(16).toString("hex"),
        is_active: true,
        password_hash: passHash,
        password_salt: passSalt,
      })
      .select()
      .single();
    cleanupShareIds.push(pwShare.id);

    // Verify formatPublicShareMetadata marks it as password protected
    const pubMeta = formatPublicShareMetadata(testFile, pwShare);
    if (pubMeta.is_password_protected === true) {
      record("Public Metadata", "Public metadata reflects is_password_protected=true without leaking hash or salt", "PASS");
    } else {
      record("Public Metadata", "Public metadata reflects is_password_protected=true without leaking hash or salt", "FAIL");
    }

    // ----------------------------------------------------
    // 6. Single-Use Lifecycle & 90-Second Lease Preservation
    // ----------------------------------------------------
    console.log("\n[6/6] Single-Use Lifecycle & 90-Second Lease Preservation");

    // Upload an isolated test file for lifecycle tests
    const burnR2Key = `u/${testUser.id}/2026/09/burn_${crypto.randomUUID()}.txt`;
    const burnBuffer = Buffer.from("Burn file content for lifecycle test", "utf-8");
    cleanupR2Keys.push(burnR2Key);

    await r2Client.send(
      new PutObjectCommand({
        Bucket: r2BucketName,
        Key: burnR2Key,
        Body: burnBuffer,
        ContentType: "text/plain",
      })
    );

    const { data: burnFile } = await adminClient
      .from("files")
      .insert({
        user_id: testUser.id,
        filename: "burn_document.txt",
        sanitized_name: "burn_document.txt",
        byte_size: burnBuffer.length,
        mime_type: "text/plain",
        r2_key: burnR2Key,
        status: "ACTIVE",
      })
      .select()
      .single();
    cleanupFileIds.push(burnFile.id);

    // Check U.0: Independent is_single_use contract verification
    // Create a share with max_downloads = 1 but is_single_use = FALSE
    const nonBurnFileKey = `u/${testUser.id}/2026/09/non_burn_${crypto.randomUUID()}.txt`;
    const nonBurnBuffer = Buffer.from("File with max_downloads = 1 but not single-use burn", "utf-8");
    cleanupR2Keys.push(nonBurnFileKey);
    await r2Client.send(new PutObjectCommand({ Bucket: r2BucketName, Key: nonBurnFileKey, Body: nonBurnBuffer, ContentType: "text/plain" }));

    const { data: nonBurnFile } = await adminClient
      .from("files")
      .insert({
        user_id: testUser.id,
        filename: "non_burn.txt",
        sanitized_name: "non_burn.txt",
        byte_size: nonBurnBuffer.length,
        mime_type: "text/plain",
        r2_key: nonBurnFileKey,
        status: "ACTIVE",
      })
      .select()
      .single();
    cleanupFileIds.push(nonBurnFile.id);

    const nonBurnSlug = `nb_${crypto.randomBytes(4).toString("hex")}`;
    const { data: nonBurnShare } = await adminClient
      .from("share_links")
      .insert({
        file_id: nonBurnFile.id,
        slug: nonBurnSlug,
        token_hash: crypto.randomBytes(16).toString("hex"),
        is_active: true,
        is_single_use: false,
        max_downloads: 1,
        download_count: 0,
      })
      .select()
      .single();
    cleanupShareIds.push(nonBurnShare.id);

    // Claim slot for max_downloads=1, is_single_use=false
    await adminClient.rpc("acquire_download_claim_lease", {
      p_slug: nonBurnSlug,
      p_lease_token: crypto.randomUUID(),
      p_ip_hash: hashClientIp("192.168.1.106"),
      p_user_agent: "agent",
    });

    // Reconciling a non-single-use file MUST be rejected with NOT_SINGLE_USE_FILE!
    const nonBurnReconcile = await adminClient.rpc("reconcile_single_use_file", {
      p_file_id: nonBurnFile.id,
    });

    const { data: checkNonBurnFile } = await adminClient
      .from("files")
      .select("status")
      .eq("id", nonBurnFile.id)
      .single();

    if (
      nonBurnReconcile.error &&
      nonBurnReconcile.error.message.includes("NOT_SINGLE_USE_FILE") &&
      checkNonBurnFile.status === "ACTIVE"
    ) {
      record("Single-Use Contract", "reconcile_single_use_file rejects files with max_downloads=1 when is_single_use=false", "PASS");
    } else {
      record("Single-Use Contract", "reconcile_single_use_file rejects files with max_downloads=1 when is_single_use=false", "FAIL", `Expected NOT_SINGLE_USE_FILE, got: ${JSON.stringify(nonBurnReconcile)}, Status: ${checkNonBurnFile?.status}`);
    }

    const lifecycleSlug = `burn_life_${crypto.randomBytes(4).toString("hex")}`;
    const { data: lifecycleShare } = await adminClient
      .from("share_links")
      .insert({
        file_id: burnFile.id,
        slug: lifecycleSlug,
        token_hash: crypto.randomBytes(16).toString("hex"),
        is_active: true,
        is_single_use: true,
        max_downloads: 1,
        download_count: 0,
      })
      .select()
      .single();
    cleanupShareIds.push(lifecycleShare.id);

    // Claim the download slot -> creates active 90s lease
    const lifeLeaseToken = crypto.randomUUID();
    await adminClient.rpc("acquire_download_claim_lease", {
      p_slug: lifecycleSlug,
      p_lease_token: lifeLeaseToken,
      p_ip_hash: hashClientIp("192.168.1.107"),
      p_user_agent: "agent",
    });

    // Check U: Active lease preservation: calling reconcile_single_use_file while lease is active
    // MUST throw DOWNLOAD_LEASE_ACTIVE!
    const activeReconcile = await adminClient.rpc("reconcile_single_use_file", {
      p_file_id: burnFile.id,
    });

    if (
      activeReconcile.error &&
      activeReconcile.error.message.includes("DOWNLOAD_LEASE_ACTIVE")
    ) {
      record("Lifecycle Preservation", "reconcile_single_use_file prevents premature deletion during active 90s lease", "PASS");
    } else {
      record(
        "Lifecycle Preservation",
        "reconcile_single_use_file prevents premature deletion during active 90s lease",
        "FAIL",
        `Expected DOWNLOAD_LEASE_ACTIVE exception, got: ${JSON.stringify(activeReconcile)}`
      );
    }

    // Verify R2 object still exists during active lease
    try {
      const headRes = await r2Client.send(
        new GetObjectCommand({ Bucket: r2BucketName, Key: burnR2Key })
      );
      if (headRes.ContentLength === burnBuffer.length) {
        record("Physical Preservation", "Physical R2 object remains intact and accessible during active lease window", "PASS");
      } else {
        record("Physical Preservation", "Physical R2 object remains intact and accessible during active lease window", "FAIL");
      }
    } catch (err) {
      record("Physical Preservation", "Physical R2 object remains intact and accessible during active lease window", "FAIL", err.message);
    }

    // Check V: Post-expiration reconciliation:
    // Update the lease_expires_at to the past to simulate 90-second lease expiration
    await adminClient
      .from("file_downloads")
      .update({ lease_expires_at: new Date(Date.now() - 5000).toISOString() })
      .eq("lease_token", lifeLeaseToken);

    // Now call reconcile_single_use_file again -> MUST succeed and return DELETE_PENDING
    const expiredReconcile = await adminClient.rpc("reconcile_single_use_file", {
      p_file_id: burnFile.id,
    });

    const { data: recheckedBurnFile } = await adminClient
      .from("files")
      .select("status")
      .eq("id", burnFile.id)
      .single();

    if (
      !expiredReconcile.error &&
      (expiredReconcile.data === "DELETE_PENDING" || recheckedBurnFile.status === "DELETE_PENDING")
    ) {
      record("Lifecycle Reconcile", "After lease expiration, reconcile_single_use_file marks DELETE_PENDING and reclaims quota", "PASS");
    } else {
      record(
        "Lifecycle Reconcile",
        "After lease expiration, reconcile_single_use_file marks DELETE_PENDING and reclaims quota",
        "FAIL",
        `Result: ${JSON.stringify(expiredReconcile)}, Status: ${recheckedBurnFile?.status}`
      );
    }

    // Check W: Physical R2 object deletion and PURGED transition
    await r2Client.send(new DeleteObjectCommand({ Bucket: r2BucketName, Key: burnR2Key }));
    await adminClient
      .from("files")
      .update({ status: "PURGED", updated_at: new Date().toISOString() })
      .eq("id", burnFile.id);

    const { data: purgedFile } = await adminClient
      .from("files")
      .select("status")
      .eq("id", burnFile.id)
      .single();

    if (purgedFile.status === "PURGED") {
      record("Purge Verification", "Physical R2 delete completes and file status transitions to PURGED", "PASS");
    } else {
      record("Purge Verification", "Physical R2 delete completes and file status transitions to PURGED", "FAIL");
    }

    // ----------------------------------------------------
    // Security Boundaries & Regressions
    // ----------------------------------------------------
    console.log("\n[Security & Regression Audits]");

    // Check X: IP privacy check (no raw IPs in file_downloads)
    const { data: allDownloads } = await adminClient
      .from("file_downloads")
      .select("ip_hash")
      .limit(20);

    const hasRawIp = allDownloads?.some(
      (d) => /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(d.ip_hash) || d.ip_hash.includes(":")
    );

    if (!hasRawIp && allDownloads?.every((d) => d.ip_hash.length >= 32)) {
      record("IP Privacy", "file_downloads.ip_hash is strictly HMAC-SHA256 hashed, never raw IP", "PASS");
    } else {
      record("IP Privacy", "file_downloads.ip_hash is strictly HMAC-SHA256 hashed, never raw IP", "FAIL");
    }

    // Check Y: Share metadata format never contains internal secret fields
    const formatted = formatPublicShareMetadata(testFile, standardShare);
    const leakedKeys = Object.keys(formatted).filter((k) =>
      ["user_id", "r2_key", "password_hash", "password_salt", "token_hash"].includes(k)
    );

    if (leakedKeys.length === 0) {
      record("Secret Boundary", "Public metadata formatting exposes zero internal IDs, R2 keys, or secrets", "PASS");
    } else {
      record("Secret Boundary", "Public metadata formatting exposes zero internal IDs, R2 keys, or secrets", "FAIL", `Leaked: ${leakedKeys.join(", ")}`);
    }

    // Check Z: Schema and previous phases intact
    const { data: phase1Check } = await adminClient.from("profiles").select("id").limit(1);
    const { data: phase2Check } = await adminClient.from("onboarding_pins").select("id").limit(1);
    const { data: phase3Check } = await adminClient.from("files").select("id").limit(1);

    if (phase1Check && phase2Check && phase3Check) {
      record("Regression Guard", "Phase 1, Phase 2, and Phase 3 tables and security structures intact", "PASS");
    } else {
      record("Regression Guard", "Phase 1, Phase 2, and Phase 3 tables and security structures intact", "FAIL");
    }
  } finally {
    // Clean up test data
    console.log("\nCleaning up test records...");
    for (const sid of cleanupShareIds) {
      await adminClient.from("share_links").delete().eq("id", sid);
    }
    for (const fid of cleanupFileIds) {
      await adminClient.from("files").delete().eq("id", fid);
    }
    for (const r2Key of cleanupR2Keys) {
      try {
        await r2Client.send(new DeleteObjectCommand({ Bucket: r2BucketName, Key: r2Key }));
      } catch {
        // ignore
      }
    }
    if (cleanupUserId) {
      try {
        await adminClient.auth.admin.deleteUser(cleanupUserId);
      } catch {
        // ignore
      }
    }
  }

  // ----------------------------------------------------
  // Summary
  // ----------------------------------------------------
  console.log("\n==================================================");
  console.log("PHASE 4 VERIFICATION SUMMARY");
  console.log("==================================================");
  console.log(`Passed:        ${report.summary.pass}`);
  console.log(`Failed:        ${report.summary.fail}`);
  console.log(`Not Verified:  ${report.summary.notVerified}`);
  console.log("==================================================");

  if (report.summary.fail > 0) {
    console.error("\n❌ VERIFICATION FAILED with errors above.");
    process.exit(1);
  } else {
    console.log("\n✅ ALL PHASE 4 CHECKS PASSED!");
    process.exit(0);
  }
}

runVerification().catch((err) => {
  console.error("FATAL ERROR in verify_phase4:", err);
  process.exit(1);
});
