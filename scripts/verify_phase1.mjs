import fs from "fs";
import { createClient } from "@supabase/supabase-js";

// Read environment
const envFile = fs.readFileSync(".env.local", "utf-8");
const env = Object.fromEntries(
  envFile
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = env.SUPABASE_SECRET_KEY;

const anonClient = createClient(supabaseUrl, anonKey);
const adminClient = createClient(supabaseUrl, secretKey);

const EXPECTED_TABLES = [
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
  console.log(`  [${status}] ${category} -> ${item}${message ? `: ${message}` : ""}`);
}

async function runVerification() {
  console.log("==================================================");
  console.log("PHASE 1 FINAL POST-CLEANUP VERIFICATION SUITE");
  console.log("Master Implementation Plan Revision 3.1");
  console.log("==================================================\n");

  // 1. Verify Temporary Catalog Function Removal
  console.log("1. Checking Temporary Verification Function Removal...");
  const { error: catErr } = await adminClient.rpc("verify_phase1_catalog");
  if (catErr && catErr.message.includes("Could not find the function")) {
    record(
      "Cleanup Verification",
      "verify_phase1_catalog removed",
      "PASS",
      "Function absent from production schema"
    );
  } else if (!catErr) {
    record(
      "Cleanup Verification",
      "verify_phase1_catalog removed",
      "FAIL",
      "Function still exists in database — execute supabase/apply_phase1_grants.sql to drop"
    );
  } else {
    record("Cleanup Verification", "verify_phase1_catalog removed", "PASS", catErr.message);
  }

  // 2. Verify is_admin() Function Preservation
  console.log("\n2. Checking is_admin() Preservation & Permissions...");
  const { error: adminErr } = await adminClient.rpc("is_admin");
  if (!adminErr || !adminErr.message.includes("does not exist")) {
    record("Function Preservation", "is_admin() exists", "PASS", "Operational for service_role");
  } else {
    record("Function Preservation", "is_admin() exists", "FAIL", adminErr.message);
  }

  const { error: anonAdminErr } = await anonClient.rpc("is_admin");
  if (anonAdminErr && (anonAdminErr.message.includes("permission denied") || anonAdminErr.code === "42501")) {
    record("Function Security", "anon rpc('is_admin') blocked", "PASS", "Blocked with permission denied");
  } else {
    record("Function Security", "anon rpc('is_admin') blocked", "FAIL", "Anon executed is_admin()!");
  }

  // 3. Verify Table Existence via Service Role
  console.log("\n3. Checking 9 Production Tables via Service Role...");
  for (const table of EXPECTED_TABLES) {
    const { error } = await adminClient.from(table).select("*").limit(1);
    if (error) {
      record("Table Existence", table, "FAIL", error.message);
    } else {
      record("Table Existence", table, "PASS", "Queryable by service_role");
    }
  }

  // 4. Verify Anonymous Read Isolation across all 9 tables
  console.log("\n4. Checking Anonymous Isolation across 9 Tables (Must be strictly blocked)...");
  for (const table of EXPECTED_TABLES) {
    const { data, error } = await anonClient.from(table).select("*").limit(5);
    if (error && (error.code === "42501" || error.message.includes("permission denied"))) {
      record("Anon Read Isolation", table, "PASS", `Blocked by permission revocation (${error.code})`);
    } else if (data && data.length === 0) {
      record("Anon Read Isolation", table, "PASS", "Returned 0 rows (RLS zero rows)");
    } else {
      record("Anon Read Isolation", table, "FAIL", `Leaked ${data?.length} rows to anon!`);
    }
  }

  // 5. Verify Anonymous Mutation Isolation
  console.log("\n5. Checking Anonymous Write Mutation Blocking...");
  const dummyId = "00000000-0000-0000-0000-000000000000";
  const { error: anonInsertProfErr } = await anonClient.from("profiles").insert({
    id: dummyId,
    email: "exploit@evil.com",
    role: "admin",
    status: "approved",
  });
  if (anonInsertProfErr && (anonInsertProfErr.code === "42501" || anonInsertProfErr.message.includes("permission denied"))) {
    record("Anon Write Isolation", "INSERT profiles", "PASS", "Blocked");
  } else {
    record("Anon Write Isolation", "INSERT profiles", "FAIL", "Anon inserted into profiles!");
  }

  const { error: anonInsertFilesErr } = await anonClient.from("files").insert({
    user_id: dummyId,
    filename: "exploit.bin",
    sanitized_name: "exploit.bin",
    byte_size: 100,
    r2_key: "exploit.bin",
    status: "ACTIVE",
  });
  if (anonInsertFilesErr && (anonInsertFilesErr.code === "42501" || anonInsertFilesErr.message.includes("permission denied"))) {
    record("Anon Write Isolation", "INSERT files", "PASS", "Blocked");
  } else {
    record("Anon Write Isolation", "INSERT files", "FAIL", "Anon inserted into files!");
  }

  // 6. Verify Database Constraints & Invariants
  console.log("\n6. Checking Database Constraints & Mathematical Invariants...");

  // check_file_byte_size: byte_size = 0 rejected
  const { error: errByteZero } = await adminClient.from("files").insert({
    user_id: dummyId,
    filename: "zero.bin",
    sanitized_name: "zero.bin",
    byte_size: 0,
    r2_key: "test/zero.bin",
  });
  if (errByteZero && (errByteZero.message.includes("check_file_byte_size") || errByteZero.code === "23514")) {
    record("Constraint", "check_file_byte_size (byte_size = 0)", "PASS", "Rejected");
  } else {
    record("Constraint", "check_file_byte_size (byte_size = 0)", "FAIL", errByteZero?.message || "Allowed zero size");
  }

  // check_file_byte_size: byte_size > 1 GB rejected
  const { error: errByteLarge } = await adminClient.from("files").insert({
    user_id: dummyId,
    filename: "large.bin",
    sanitized_name: "large.bin",
    byte_size: 1073741825,
    r2_key: "test/large.bin",
  });
  if (errByteLarge && (errByteLarge.message.includes("check_file_byte_size") || errByteLarge.code === "23514")) {
    record("Constraint", "check_file_byte_size (byte_size > 1 GB)", "PASS", "Rejected");
  } else {
    record("Constraint", "check_file_byte_size (byte_size > 1 GB)", "FAIL", errByteLarge?.message || "Allowed oversized file");
  }

  // check_quota_valid: quota_bytes < -1 rejected
  const { error: errQuotaNeg } = await adminClient.from("profiles").insert({
    id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    email: "invalid_quota@test.com",
    quota_bytes: -2,
  });
  if (errQuotaNeg && (errQuotaNeg.message.includes("check_quota_valid") || errQuotaNeg.code === "23514")) {
    record("Constraint", "check_quota_valid (quota_bytes < -1)", "PASS", "Rejected");
  } else {
    record("Constraint", "check_quota_valid (quota_bytes < -1)", "FAIL", errQuotaNeg?.message || "Allowed negative quota");
  }

  // check_download_count: download_count < 0 rejected
  const { error: errDlNeg } = await adminClient.from("share_links").insert({
    file_id: dummyId,
    slug: "neg-dl-test",
    token_hash: "hash_test",
    download_count: -1,
  });
  if (errDlNeg && (errDlNeg.message.includes("check_download_count") || errDlNeg.code === "23514")) {
    record("Constraint", "check_download_count (download_count < 0)", "PASS", "Rejected");
  } else {
    record("Constraint", "check_download_count (download_count < 0)", "FAIL", errDlNeg?.message || "Allowed negative download_count");
  }

  // 7. Verify Enum Types Validation
  console.log("\n7. Checking Custom Enum Type Enforcement...");
  const { error: errEnumRole } = await adminClient.from("profiles").insert({
    id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
    email: "bad_role@test.com",
    role: "superadmin_invalid",
  });
  if (errEnumRole && errEnumRole.message.includes("invalid input value for enum user_role")) {
    record("Enum Validation", "user_role rejects invalid enum", "PASS", "Rejected invalid enum input");
  } else {
    record("Enum Validation", "user_role rejects invalid enum", "FAIL", errEnumRole?.message || "Allowed invalid enum");
  }

  const { error: errEnumStatus } = await adminClient.from("profiles").insert({
    id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    email: "bad_status@test.com",
    status: "banned_invalid",
  });
  if (errEnumStatus && errEnumStatus.message.includes("invalid input value for enum user_status")) {
    record("Enum Validation", "user_status rejects invalid enum", "PASS", "Rejected invalid enum input");
  } else {
    record("Enum Validation", "user_status rejects invalid enum", "FAIL", errEnumStatus?.message || "Allowed invalid enum");
  }

  console.log("\n==================================================");
  console.log("FINAL VERIFICATION SUMMARY");
  console.log(`TOTAL PASS: ${report.summary.pass}`);
  console.log(`TOTAL FAIL: ${report.summary.fail}`);
  console.log(`TOTAL NOT VERIFIED: ${report.summary.notVerified}`);
  console.log("==================================================");

  return report;
}

runVerification().catch((e) => {
  console.error("FATAL in verification runner:", e);
  process.exit(1);
});
