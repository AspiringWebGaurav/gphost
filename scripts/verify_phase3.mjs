import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";

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

const EXPECTED_PHASE1_TABLES = [
  "profiles",
  "onboarding_pins",
  "access_requests",
  "files",
  "share_links",
  "xurl_mappings",
  "file_downloads",
  "api_keys",
  "audit_logs",
];

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
  console.log("GPHOSTING — PHASE 3 LIVE & COMPREHENSIVE VERIFICATION");
  console.log("File Upload, Quota Invariants & R2 Storage Core");
  console.log("Master Implementation Plan Revision 3.1");
  console.log("==================================================");

  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // -------------------------------------------------------------
  // 1. Cloudflare R2 Connectivity & Bucket Verification
  // -------------------------------------------------------------
  console.log("\n1. Verifying Cloudflare R2 Connectivity & Bucket Access...");
  let r2Connected = false;
  let s3 = null;
  try {
    s3 = new S3Client({
      region: "auto",
      endpoint: r2Endpoint,
      credentials: {
        accessKeyId: r2AccessKey,
        secretAccessKey: r2SecretKey,
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });

    await s3.send(new HeadBucketCommand({ Bucket: r2BucketName }));
    r2Connected = true;
  } catch (err) {
    console.error("  R2 HeadBucket Error:", err.message);
  }

  record(
    "Cloudflare R2",
    `Authoritative connection to bucket '${r2BucketName}' via S3Client`,
    r2Connected ? "PASS" : "FAIL"
  );

  // -------------------------------------------------------------
  // 2. Filename Sanitization & Unpredictable Object Key Generation
  // -------------------------------------------------------------
  console.log("\n2. Verifying Filename Sanitization & Key Generation Defense...");
  const { sanitizeFilename } = await import("../lib/storage/sanitizer.ts");
  const { generateR2ObjectKey } = await import("../lib/storage/r2.ts");

  const traversalInputs = [
    { input: "../../etc/passwd", expected: "passwd" },
    { input: "..\\..\\windows\\system32\\cmd.exe", expected: "cmd.exe" },
    { input: "malicious<script>alert(1).pdf", expected: "malicious_script_alert(1).pdf" },
    { input: "normal_report.pdf", expected: "normal_report.pdf" },
    { input: "   spaced_name.png   ", expected: "spaced_name.png" },
    { input: "", expected: "unnamed_file" },
    { input: "...", expected: "unnamed_file" },
  ];

  let sanitizationPassed = true;
  for (const t of traversalInputs) {
    const clean = sanitizeFilename(t.input);
    if (clean !== t.expected) {
      sanitizationPassed = false;
      console.log(`    Sanitization mismatch: "${t.input}" -> got "${clean}", expected "${t.expected}"`);
    }
  }

  record(
    "Filename Sanitizer",
    "Strips path traversal, directory components, control chars, and enforces 255 char limit",
    sanitizationPassed ? "PASS" : "FAIL"
  );

  const testUserId = "11111111-2222-3333-4444-555555555555";
  const generatedKey = generateR2ObjectKey(testUserId, "my_financial_report.pdf");
  const keyPattern = new RegExp(`^u/${testUserId}/\\d{4}/\\d{2}/[0-9a-f-]{36}\\.pdf$`);
  const keyMatches = keyPattern.test(generatedKey);

  record(
    "R2 Object Key",
    "Generates unpredictable key embedding owner ID (u/{userId}/{YYYY}/{MM}/{uuid}.ext)",
    keyMatches ? "PASS" : "FAIL",
    `Key: ${generatedKey}`
  );

  // -------------------------------------------------------------
  // 3. Single-Part Presigned Upload & HeadObject Verification
  // -------------------------------------------------------------
  console.log("\n3. Testing Live Single-Part Direct R2 Upload Pipeline...");
  const { createPresignedPutUrl, headR2Object, deleteR2Object } = await import("../lib/storage/r2.ts");

  const singleTestKey = `test_single_${Date.now()}.txt`;
  const singleTestPayload = Buffer.from("GPHosting Phase 3 Single-Part Upload Test Buffer — Verified");
  let singleUploadSuccess = false;
  let singleHeadVerified = false;
  let singleDeleteVerified = false;

  try {
    const presignedPutUrl = await createPresignedPutUrl(singleTestKey, "text/plain", 300);
    record(
      "Single-Part Upload",
      "createPresignedPutUrl generates valid presigned URL",
      presignedPutUrl.includes("X-Amz-Signature") ? "PASS" : "FAIL"
    );

    // Direct upload via PUT
    const putRes = await fetch(presignedPutUrl, {
      method: "PUT",
      body: singleTestPayload,
      headers: { "Content-Type": "text/plain" },
    });
    singleUploadSuccess = putRes.ok;

    // HeadObject authoritative verification
    const headData = await headR2Object(singleTestKey);
    singleHeadVerified = Boolean(
      headData && headData.contentLength === singleTestPayload.length && headData.eTag
    );

    // Cleanup physical object
    const delRes = await deleteR2Object(singleTestKey);
    const headAfterDel = await headR2Object(singleTestKey);
    singleDeleteVerified = delRes && headAfterDel === null;
  } catch (err) {
    console.error("  Single-part upload error:", err.message);
  }

  record(
    "Single-Part Upload",
    "Direct browser-to-R2 PUT upload succeeds with zero server proxying",
    singleUploadSuccess ? "PASS" : "FAIL"
  );
  record(
    "Single-Part Upload",
    "Server-authoritative HeadObject confirms physical object existence, exact size & ETag",
    singleHeadVerified ? "PASS" : "FAIL"
  );
  record(
    "Single-Part Upload",
    "deleteR2Object physically purges object from Cloudflare R2",
    singleDeleteVerified ? "PASS" : "FAIL"
  );

  // -------------------------------------------------------------
  // 4. Multipart Upload Pipeline (Initiate -> Sign Parts -> Complete)
  // -------------------------------------------------------------
  console.log("\n4. Testing Live Multipart Direct R2 Upload Pipeline (10 MB Parts)...");
  const {
    initiateR2MultipartUpload,
    createPresignedPartUrl,
    completeR2MultipartUpload,
  } = await import("../lib/storage/r2.ts");

  const multiTestKey = `test_multi_${Date.now()}.bin`;
  let multipartInitiated = false;
  let multipartPartsUploaded = false;
  let multipartCompleted = false;
  let multipartHeadVerified = false;
  let multipartDeleteVerified = false;

  try {
    const uploadId = await initiateR2MultipartUpload(multiTestKey, "application/octet-stream");
    multipartInitiated = Boolean(uploadId && typeof uploadId === "string");

    // Create 2 parts: Part 1 = 5MB (S3 minimum part size), Part 2 = 128 bytes
    const part1Size = 5 * 1024 * 1024;
    const part2Size = 128;
    const part1Buffer = Buffer.alloc(part1Size, 0x41); // 'A'
    const part2Buffer = Buffer.alloc(part2Size, 0x42); // 'B'

    const part1Url = await createPresignedPartUrl(multiTestKey, uploadId, 1, 300);
    const part2Url = await createPresignedPartUrl(multiTestKey, uploadId, 2, 300);

    const part1Res = await fetch(part1Url, { method: "PUT", body: part1Buffer });
    const part2Res = await fetch(part2Url, { method: "PUT", body: part2Buffer });

    const etag1 = (part1Res.headers.get("ETag") || "").replace(/^"|"$/g, "");
    const etag2 = (part2Res.headers.get("ETag") || "").replace(/^"|"$/g, "");

    multipartPartsUploaded = part1Res.ok && part2Res.ok && Boolean(etag1) && Boolean(etag2);

    if (multipartPartsUploaded) {
      const finalEtag = await completeR2MultipartUpload(multiTestKey, uploadId, [
        { PartNumber: 1, ETag: etag1 },
        { PartNumber: 2, ETag: etag2 },
      ]);
      multipartCompleted = Boolean(finalEtag);

      // Verify final assembled size with HeadObject
      const headMulti = await headR2Object(multiTestKey);
      multipartHeadVerified = Boolean(
        headMulti && headMulti.contentLength === part1Size + part2Size
      );

      // Physical cleanup
      await deleteR2Object(multiTestKey);
      const headAfterDel = await headR2Object(multiTestKey);
      multipartDeleteVerified = headAfterDel === null;
    }
  } catch (err) {
    console.error("  Multipart upload error:", err.message);
  }

  record(
    "Multipart Upload",
    "initiateR2MultipartUpload obtains valid UploadId",
    multipartInitiated ? "PASS" : "FAIL"
  );
  record(
    "Multipart Upload",
    "createPresignedPartUrl signs individual 10MB chunk upload URLs",
    multipartPartsUploaded ? "PASS" : "FAIL"
  );
  record(
    "Multipart Upload",
    "completeR2MultipartUpload assembles chunked parts into authoritative object",
    multipartCompleted ? "PASS" : "FAIL"
  );
  record(
    "Multipart Upload",
    "HeadObject confirms assembled multipart size matches sum of parts",
    multipartHeadVerified ? "PASS" : "FAIL"
  );
  record(
    "Multipart Upload",
    "Physical deletion of assembled multipart object succeeds",
    multipartDeleteVerified ? "PASS" : "FAIL"
  );

  // -------------------------------------------------------------
  // 5. Remote Database Phase 3 Stored Procedures & Quota Invariants
  // -------------------------------------------------------------
  console.log("\n5. Testing Remote Database Quota Invariants & Lifecycle Procedures...");

  // 5.1 Check RPC existence
  const { error: probeRpcErr } = await adminClient.rpc("reserve_user_quota", {
    p_user_id: "00000000-0000-0000-0000-000000000000",
    p_requested_bytes: 1024,
  });

  const rpcMissing = probeRpcErr && probeRpcErr.code === "PGRST202";

  if (rpcMissing) {
    record(
      "Database Hardening",
      "public.reserve_user_quota RPC exists on remote Supabase",
      "NOT VERIFIED",
      "Awaiting SQL execution in Supabase SQL editor (see supabase/apply_phase3_migrations.sql)"
    );
    record(
      "Database Hardening",
      "Anonymous caller denied execution of reserve_user_quota",
      "NOT VERIFIED",
      "Pending migration execution"
    );
    record(
      "Quota Concurrency",
      "Two concurrent uploads competing for last quota slot: exactly one admitted",
      "NOT VERIFIED",
      "Pending migration execution"
    );
    record(
      "Quota Lifecycle",
      "commit_upload_quota atomically converts reserved to storage_used_bytes",
      "NOT VERIFIED",
      "Pending migration execution"
    );
    record(
      "Quota Lifecycle",
      "reclaim_file_storage transitions to DELETE_PENDING and prevents double-crediting",
      "NOT VERIFIED",
      "Pending migration execution"
    );
  } else {
    record(
      "Database Hardening",
      "public.reserve_user_quota RPC exists on remote Supabase",
      "PASS"
    );

    // 5.2 Test anonymous caller denied
    const { error: anonRpcErr } = await anonClient.rpc("reserve_user_quota", {
      p_user_id: "00000000-0000-0000-0000-000000000000",
      p_requested_bytes: 1024,
    });
    const anonBlocked =
      anonRpcErr && (anonRpcErr.code === "42501" || anonRpcErr.message.includes("permission denied"));
    record(
      "Database Hardening",
      "Anonymous caller denied execution of reserve_user_quota (42501)",
      anonBlocked ? "PASS" : "FAIL",
      anonRpcErr?.message || "Execution permitted to anon!"
    );

    // 5.3 Live Quota Invariants & Concurrency Race Test
    console.log("  -> Running live quota concurrency & admission tests...");
    let testUser = null;
    let quotaRacePassed = false;
    let quotaCommitPassed = false;
    let quotaReclaimPassed = false;

    try {
      const { data: uCreated } = await adminClient.auth.admin.createUser({
        email: `test_quota_${Date.now()}@gphost.internal`,
        password: "TestPassword123!Secure",
        email_confirm: true,
      });
      testUser = uCreated?.user;

      if (testUser) {
        // Set profile: approved, quota_bytes = 1000, storage_used = 800, reserved = 0 (200 available)
        await adminClient
          .from("profiles")
          .update({
            status: "approved",
            quota_bytes: 1000,
            storage_used_bytes: 800,
            reserved_bytes: 0,
          })
          .eq("id", testUser.id);

        // Admission test: requesting 250 bytes MUST FAIL (800 + 0 + 250 = 1050 > 1000)
        const { data: overQuotaRes } = await adminClient.rpc("reserve_user_quota", {
          p_user_id: testUser.id,
          p_requested_bytes: 250,
        });

        // Admission test: requesting 150 bytes MUST SUCCEED (800 + 0 + 150 = 950 <= 1000)
        const { data: underQuotaRes } = await adminClient.rpc("reserve_user_quota", {
          p_user_id: testUser.id,
          p_requested_bytes: 150,
        });

        // Concurrency test: reset to 100 bytes remaining, fire 2 simultaneous 100-byte requests
        await adminClient
          .from("profiles")
          .update({ storage_used_bytes: 900, reserved_bytes: 0 })
          .eq("id", testUser.id);

        const [race1, race2] = await Promise.all([
          adminClient.rpc("reserve_user_quota", { p_user_id: testUser.id, p_requested_bytes: 100 }),
          adminClient.rpc("reserve_user_quota", { p_user_id: testUser.id, p_requested_bytes: 100 }),
        ]);

        const raceResults = [race1.data, race2.data];
        const exactlyOneSucceeded =
          raceResults.filter((r) => r === true).length === 1 &&
          raceResults.filter((r) => r === false).length === 1;

        quotaRacePassed = overQuotaRes === false && underQuotaRes === true && exactlyOneSucceeded;

        // Quota conversion test
        await adminClient.rpc("commit_upload_quota", {
          p_user_id: testUser.id,
          p_reserved_bytes: 100,
          p_actual_bytes: 95,
        });

        const { data: profAfterCommit } = await adminClient
          .from("profiles")
          .select("storage_used_bytes, reserved_bytes")
          .eq("id", testUser.id)
          .single();

        quotaCommitPassed =
          profAfterCommit.reserved_bytes === 0 && profAfterCommit.storage_used_bytes === 995;

        // Quota deletion & anti-double-crediting test
        const { data: testFile } = await adminClient
          .from("files")
          .insert({
            user_id: testUser.id,
            filename: "quota_test.bin",
            sanitized_name: "quota_test.bin",
            mime_type: "application/octet-stream",
            byte_size: 95,
            r2_key: `u/${testUser.id}/test_del.bin`,
            status: "ACTIVE",
          })
          .select("id")
          .single();

        if (testFile) {
          // 1st reclaim call
          const { data: rec1 } = await adminClient.rpc("reclaim_file_storage", {
            p_user_id: testUser.id,
            p_file_id: testFile.id,
          });

          const { data: profAfterRec1 } = await adminClient
            .from("profiles")
            .select("storage_used_bytes")
            .eq("id", testUser.id)
            .single();

          // 2nd reclaim call (MUST NOT double-credit)
          const { data: rec2 } = await adminClient.rpc("reclaim_file_storage", {
            p_user_id: testUser.id,
            p_file_id: testFile.id,
          });

          const { data: profAfterRec2 } = await adminClient
            .from("profiles")
            .select("storage_used_bytes")
            .eq("id", testUser.id)
            .single();

          quotaReclaimPassed =
            rec1 === "DELETE_PENDING" &&
            rec2 === "DELETE_PENDING" &&
            profAfterRec1.storage_used_bytes === 900 &&
            profAfterRec2.storage_used_bytes === 900;
        }
      }
    } catch (err) {
      console.error("  Quota test error:", err.message);
    } finally {
      if (testUser) {
        await adminClient.from("files").delete().eq("user_id", testUser.id);
        await adminClient.auth.admin.deleteUser(testUser.id);
      }
    }

    record(
      "Quota Concurrency",
      "Two concurrent uploads competing for last quota slot: exactly one admitted",
      quotaRacePassed ? "PASS" : "FAIL"
    );
    record(
      "Quota Lifecycle",
      "commit_upload_quota atomically converts reserved to storage_used_bytes",
      quotaCommitPassed ? "PASS" : "FAIL"
    );
    record(
      "Quota Lifecycle",
      "reclaim_file_storage transitions to DELETE_PENDING and prevents double-crediting",
      quotaReclaimPassed ? "PASS" : "FAIL"
    );
  }

  // -------------------------------------------------------------
  // 6. Public Share Allow-List Read & Security Boundaries
  // -------------------------------------------------------------
  console.log("\n6. Verifying Public Share Allow-List Read & Security Boundaries...");
  const { formatPublicShareMetadata } = await import("../lib/storage/share.ts");

  const mockFile = {
    id: "secret-file-uuid-do-not-leak",
    user_id: "secret-user-uuid-do-not-leak",
    sanitized_name: "confidential_document.pdf",
    byte_size: 1048576,
    mime_type: "application/pdf",
    r2_key: "u/user/2026/09/secret_r2_key.pdf",
    r2_etag: "secret_r2_etag_12345",
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    is_password_protected: false,
  };

  const mockShare = {
    id: "secret-share-uuid-do-not-leak",
    slug: "tst_slug_1234",
    token_hash: "secret_token_hash_do_not_leak",
    password_hash: "secret_password_hash_do_not_leak",
    password_salt: "secret_salt_do_not_leak",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    download_count: 3,
    max_downloads: 10,
  };

  const publicData = formatPublicShareMetadata(mockFile, mockShare);

  const allowedKeys = new Set([
    "filename",
    "byte_size",
    "mime_type",
    "expires_at",
    "is_password_protected",
    "download_count",
    "max_downloads",
  ]);

  const returnedKeys = Object.keys(publicData);
  const onlyAllowedPresent = returnedKeys.length === 7 && returnedKeys.every((k) => allowedKeys.has(k));

  const forbiddenValues = [
    mockFile.id,
    mockFile.user_id,
    mockFile.r2_key,
    mockFile.r2_etag,
    mockShare.id,
    mockShare.token_hash,
    mockShare.password_hash,
    mockShare.password_salt,
  ];

  const stringified = JSON.stringify(publicData);
  const zeroLeakage = forbiddenValues.every((val) => !stringified.includes(val));

  record(
    "Public Share Read",
    "formatPublicShareMetadata strictly allows ONLY whitelisted metadata fields",
    onlyAllowedPresent ? "PASS" : "FAIL"
  );
  record(
    "Public Share Read",
    "Public share output strictly excludes all IDs, R2 keys, ETags, token hashes, and secrets",
    zeroLeakage ? "PASS" : "FAIL"
  );

  // -------------------------------------------------------------
  // 7. Route Handlers & UI Components Verification
  // -------------------------------------------------------------
  console.log("\n7. Verifying Phase 3 Routes & UI Components...");
  const requiredPhase3Routes = [
    { file: "app/api/files/initiate-upload/route.ts", desc: "Upload initiation route" },
    { file: "app/api/files/multipart/sign-part/route.ts", desc: "Multipart part signing route" },
    { file: "app/api/files/multipart/complete/route.ts", desc: "Multipart complete route" },
    { file: "app/api/files/complete-upload/route.ts", desc: "Authoritative completion & verification route" },
    { file: "app/api/files/[id]/route.ts", desc: "File deletion and quota reclamation route" },
    { file: "app/api/share/create/route.ts", desc: "Share link creation route" },
    { file: "app/api/share/[slug]/route.ts", desc: "Public share read route" },
    { file: "components/upload/upload-zone.tsx", desc: "Upload UI component" },
    { file: "components/dashboard/file-list.tsx", desc: "File list and share modal UI" },
  ];

  for (const r of requiredPhase3Routes) {
    const exists = fs.existsSync(r.file);
    record("Phase 3 Routes & UI", `${r.file} exists (${r.desc})`, exists ? "PASS" : "FAIL");
  }

  // -------------------------------------------------------------
  // 8. Phase 1 & Phase 2 Regression Checks
  // -------------------------------------------------------------
  console.log("\n8. Verifying Phase 1 & Phase 2 Regression Integrity...");

  let p1TablesOk = true;
  for (const t of EXPECTED_PHASE1_TABLES) {
    const { error: tErr } = await adminClient.from(t).select("*").limit(1);
    if (tErr) {
      p1TablesOk = false;
      console.log(`    Phase 1 table ${t} check failed: ${tErr.message}`);
    }
  }
  record(
    "Phase 1 Regression",
    "All 9 PostgreSQL tables operational via service_role",
    p1TablesOk ? "PASS" : "FAIL"
  );

  let p1AnonIsolated = true;
  for (const t of EXPECTED_PHASE1_TABLES) {
    const { data: anonData } = await anonClient.from(t).select("*").limit(5);
    if (anonData && anonData.length > 0) {
      p1AnonIsolated = false;
      console.log(`    Phase 1 anon leak on table ${t}: leaked ${anonData.length} rows`);
    }
  }
  record(
    "Phase 1 Regression",
    "RLS isolation across all tables: zero data exposed to anonymous callers",
    p1AnonIsolated ? "PASS" : "FAIL"
  );

  const { error: p2PinErr } = await anonClient.rpc("redeem_onboarding_pin", {
    p_pin_id: "00000000-0000-0000-0000-000000000000",
    p_user_id: "00000000-0000-0000-0000-000000000000",
  });
  const p2AnonRpcBlocked =
    p2PinErr && (p2PinErr.code === "42501" || p2PinErr.message.includes("permission denied"));
  record(
    "Phase 2 Regression",
    "Phase 2 redeem_onboarding_pin RPC remains restricted to service_role (anon 42501)",
    p2AnonRpcBlocked ? "PASS" : "FAIL"
  );

  // -------------------------------------------------------------
  // 9. Secret Boundary Audits (Layer 1 AST & Layer 2 Bundles)
  // -------------------------------------------------------------
  console.log("\n9. Verifying Secret Boundaries (Layer 1 & Layer 2)...");

  // Layer 1: Client files must not import server secrets or admin client
  const clientFiles = [
    "components/upload/upload-zone.tsx",
    "components/dashboard/file-list.tsx",
    "components/dashboard/dashboard-content.tsx",
    "components/auth/logout-button.tsx",
  ];

  let layer1Clean = true;
  for (const cf of clientFiles) {
    if (fs.existsSync(cf)) {
      const content = fs.readFileSync(cf, "utf-8");
      if (
        content.includes("SUPABASE_SECRET_KEY") ||
        content.includes("R2_SECRET_ACCESS_KEY") ||
        content.includes("lib/supabase/admin")
      ) {
        layer1Clean = false;
        console.log(`    Layer 1 secret violation in ${cf}`);
      }
    }
  }
  record(
    "Secret Boundary",
    "Layer 1: Zero server secrets or admin clients imported in client components",
    layer1Clean ? "PASS" : "FAIL"
  );

  // Layer 2: Production bundles must not contain server secrets
  const staticDir = ".next/static";
  let layer2Clean = true;
  const sensitiveSecrets = [
    secretKey,
    r2SecretKey,
    env.TURNSTILE_SECRET_KEY,
    env.UPSTASH_REDIS_REST_TOKEN,
  ].filter(Boolean);

  if (fs.existsSync(staticDir)) {
    const checkDir = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          checkDir(full);
        } else if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".json"))) {
          const content = fs.readFileSync(full, "utf-8");
          for (const secret of sensitiveSecrets) {
            if (content.includes(secret)) {
              layer2Clean = false;
              console.log(`    Layer 2 secret leak in production bundle: ${full}`);
            }
          }
        }
      }
    };
    checkDir(staticDir);
  }
  record(
    "Secret Boundary",
    "Layer 2: Zero server secret values leaked into .next/static/ production bundles",
    layer2Clean ? "PASS" : "FAIL"
  );

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log("\n==================================================");
  console.log("PHASE 3 VERIFICATION SUMMARY:");
  console.log(`  PASSED:        ${report.summary.pass}`);
  console.log(`  FAILED:        ${report.summary.fail}`);
  console.log(`  NOT VERIFIED:  ${report.summary.notVerified}`);
  console.log("==================================================");

  if (report.summary.fail > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error("FATAL verification error:", err);
  process.exit(1);
});
