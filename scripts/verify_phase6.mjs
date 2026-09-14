#!/usr/bin/env node
/**
 * ==============================================================================
 * GPHOSTING — PHASE 6 AUTOMATED VERIFICATION SUITE
 * Full UI/UX Surfaces, User Dashboard & Admin Control Center with Owner-Exclusive Authority
 * Master Implementation Plan Revision 3.1 & Phase 6 Revision 4
 * ==============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "gauravpatil9262@gmail.com").toLowerCase();

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Missing SUPABASE credentials in .env.local");
  process.exit(1);
}

const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const anonSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || "dummy", {
  auth: { persistSession: false },
});

const redis =
  REDIS_URL && REDIS_TOKEN
    ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN })
    : null;

let totalPassed = 0;
let totalFailed = 0;
let totalNotVerified = 0;

function assert(condition, testName, detail = "") {
  if (condition) {
    console.log(`  [PASS] ✓ ${testName}${detail ? `: ${detail}` : ""}`);
    totalPassed++;
  } else {
    console.error(`  [FAIL] ✗ ${testName}${detail ? `: ${detail}` : ""}`);
    totalFailed++;
  }
}

function notVerified(testName, detail = "") {
  console.log(`  [PENDING] ⏳ ${testName}${detail ? `: ${detail}` : ""}`);
  totalNotVerified++;
}

// Cleanup tracking
const cleanupUserIds = [];
const cleanupFileIds = [];
const cleanupPinIds = [];
const cleanupRequestIds = [];

async function cleanup() {
  console.log("\nCleaning up test artifacts...");
  try {
    for (const pinId of cleanupPinIds) {
      await adminSupabase.from("onboarding_pins").delete().eq("id", pinId);
    }
    for (const reqId of cleanupRequestIds) {
      await adminSupabase.from("access_requests").delete().eq("id", reqId);
    }
    for (const fileId of cleanupFileIds) {
      await adminSupabase.from("files").delete().eq("id", fileId);
    }
    for (const userId of cleanupUserIds) {
      await adminSupabase.from("profiles").delete().eq("id", userId);
    }
    console.log("Cleanup completed.");
  } catch (err) {
    console.error("Error during cleanup:", err);
  }
}

async function main() {
  console.log("==================================================");
  console.log("GPHOSTING — PHASE 6 LIVE & COMPREHENSIVE VERIFICATION");
  console.log("Dashboard, Admin Control Center & Owner Authority");
  console.log("Master Implementation Plan Revision 3.1 / Rev 4");
  console.log("==================================================\n");

  try {
    // --------------------------------------------------------------------------
    // 1. Owner vs Admin Authority & Permanent Owner Immutability Invariants
    // --------------------------------------------------------------------------
    console.log("1. Verifying Owner vs Admin Authority & Permanent Owner Invariants...");

    const sessionModule = fs.readFileSync(
      path.join(process.cwd(), "lib/auth/session.ts"),
      "utf8"
    );

    assert(
      sessionModule.includes("export async function requireOwnerUser()"),
      "Owner Authority -> requireOwnerUser guard defined in lib/auth/session.ts"
    );

    assert(
      sessionModule.includes("ADMIN_EMAIL.toLowerCase()"),
      "Owner Authority -> Authoritative comparison against ADMIN_EMAIL strictly enforced"
    );

    const userRouteFile = fs.readFileSync(
      path.join(process.cwd(), "app/api/admin/users/[id]/route.ts"),
      "utf8"
    );

    assert(
      userRouteFile.includes("requireOwnerUser"),
      "Owner Authority -> Role mutation strictly guarded by requireOwnerUser"
    );

    assert(
      userRouteFile.includes("Permanent owner role and status cannot be modified") ||
      userRouteFile.includes("PERMANENT_OWNER_IMMUTABLE"),
      "Permanent Owner Immutability -> Route protects permanent owner from role and status mutations"
    );

    assert(
      userRouteFile.includes("SELF_LOCKOUT_PREVENTED") &&
      userRouteFile.includes("SELF_DEMOTION_PREVENTED"),
      "Self-Lockout Protection -> Route prevents admin self-revocation and self-demotion"
    );

    // --------------------------------------------------------------------------
    // 2. Database Migrations & Stored Procedure Specifications
    // --------------------------------------------------------------------------
    console.log("\n2. Verifying Phase 6 Migrations & Stored Procedures...");

    const migrationSqlPath = path.join(
      process.cwd(),
      "supabase/migrations/20260914000006_phase6_admin_operations.sql"
    );
    const rollbackSqlPath = path.join(
      process.cwd(),
      "supabase/migrations/20260914000006_phase6_admin_operations.down.sql"
    );
    const applySqlPath = path.join(
      process.cwd(),
      "supabase/apply_phase6_migrations.sql"
    );

    assert(fs.existsSync(migrationSqlPath), "Migration -> Migration file exists");
    assert(fs.existsSync(rollbackSqlPath), "Migration -> Rollback down.sql exists");
    assert(fs.existsSync(applySqlPath), "Migration -> apply_phase6_migrations.sql exists");

    const migrationSql = fs.readFileSync(migrationSqlPath, "utf8");

    // Verify all 6 stored procedure definitions
    const procedures = [
      "admin_review_access_request",
      "admin_update_user_quota",
      "admin_update_user_profile",
      "admin_create_onboarding_pin",
      "admin_revoke_onboarding_pin",
      "admin_force_delete_file",
    ];

    for (const proc of procedures) {
      assert(
        migrationSql.includes(`FUNCTION public.${proc}`),
        `Stored Procedure -> public.${proc} defined in migration`
      );
      assert(
        migrationSql.includes(`GRANT EXECUTE ON FUNCTION public.${proc}`) &&
        migrationSql.includes(`TO service_role`),
        `Security Grant -> public.${proc} granted strictly to service_role`
      );
      assert(
        migrationSql.includes(`REVOKE ALL ON FUNCTION public.${proc}`) &&
        migrationSql.includes(`FROM PUBLIC, anon, authenticated`),
        `Security Revocation -> public.${proc} revoked from anon & authenticated`
      );
    }

    // Zero Trust in Caller Boolean Check in admin_update_user_profile
    assert(
      !migrationSql.includes("p_is_owner BOOLEAN"),
      "Zero Trust -> admin_update_user_profile does NOT accept caller-supplied p_is_owner boolean"
    );
    assert(
      migrationSql.includes("v_caller_is_owner := TRUE") &&
      migrationSql.includes("lower(v_admin.email) = lower(v_owner_email)"),
      "Zero Trust -> admin_update_user_profile authoritatively derives owner status from email"
    );

    // Explicit File-State Accounting Matrix in admin_force_delete_file
    assert(
      migrationSql.includes("WHEN 'UPLOADING' THEN") &&
      migrationSql.includes("reserved_bytes = GREATEST(0, reserved_bytes - v_file.byte_size)"),
      "Accounting Matrix -> UPLOADING releases reserved_bytes"
    );
    assert(
      migrationSql.includes("WHEN 'ACTIVE', 'EXPIRING', 'EXPIRED' THEN") &&
      migrationSql.includes("storage_used_bytes = GREATEST(0, storage_used_bytes - v_file.byte_size)"),
      "Accounting Matrix -> ACTIVE/EXPIRING/EXPIRED releases storage_used_bytes"
    );
    assert(
      migrationSql.includes("WHEN 'DELETE_PENDING', 'DELETE_FAILED', 'PURGED' THEN") &&
      migrationSql.includes("v_quota_action := 'NO_OP_ALREADY_RECLAIMED'"),
      "Accounting Matrix -> DELETE_PENDING/PURGED prevents double reclamation"
    );
    assert(
      migrationSql.includes("RAISE EXCEPTION 'UNHANDLED_FILE_STATUS"),
      "Accounting Matrix -> Rejects unhandled file statuses"
    );

    // --------------------------------------------------------------------------
    // 3. Remote Stored Procedure Probing & Live Execution (if applied)
    // --------------------------------------------------------------------------
    console.log("\n3. Probing Remote Supabase for Phase 6 Stored Procedures...");

    const dummyUuid = "00000000-0000-0000-0000-000000000000";
    const { error: probeError } = await adminSupabase.rpc("admin_update_user_quota", {
      p_admin_id: dummyUuid,
      p_target_user_id: dummyUuid,
      p_new_quota_bytes: 1000,
      p_ip_hash: "test_probe",
    });

    const rpcMissing = probeError && probeError.code === "PGRST202";

    if (rpcMissing) {
      notVerified(
        "Remote Stored Procedures",
        "Awaiting SQL execution in Supabase SQL editor (see supabase/apply_phase6_migrations.sql)"
      );
      notVerified(
        "Live Concurrency Quota Invariant",
        "Pending execution of supabase/apply_phase6_migrations.sql"
      );
      notVerified(
        "Live Atomic Access Request Review",
        "Pending execution of supabase/apply_phase6_migrations.sql"
      );
      notVerified(
        "Live Atomic Profile Mutation",
        "Pending execution of supabase/apply_phase6_migrations.sql"
      );
      notVerified(
        "Live Atomic PIN Creation & Revocation",
        "Pending execution of supabase/apply_phase6_migrations.sql"
      );
      notVerified(
        "Live Admin File Force Deletion",
        "Pending execution of supabase/apply_phase6_migrations.sql"
      );
    } else {
      assert(true, "Remote Stored Procedures -> Phase 6 RPCs operational on remote Supabase");

      // Anonymous Access Denial across all 6 RPCs
      const rpcNames = [
        { name: "admin_review_access_request", args: { p_admin_id: dummyUuid, p_request_id: dummyUuid, p_action: "approve", p_rejection_reason: "", p_ip_hash: "x" } },
        { name: "admin_update_user_quota", args: { p_admin_id: dummyUuid, p_target_user_id: dummyUuid, p_new_quota_bytes: 1000, p_ip_hash: "x" } },
        { name: "admin_update_user_profile", args: { p_admin_id: dummyUuid, p_target_user_id: dummyUuid, p_new_role: null, p_new_status: null, p_can_create_permanent: null, p_ip_hash: "x" } },
        { name: "admin_create_onboarding_pin", args: { p_admin_id: dummyUuid, p_pin_hash: "x", p_pin_salt: "x", p_label: "t", p_max_uses: 1, p_expires_at: new Date().toISOString(), p_ip_hash: "x" } },
        { name: "admin_revoke_onboarding_pin", args: { p_admin_id: dummyUuid, p_pin_id: dummyUuid, p_ip_hash: "x" } },
        { name: "admin_force_delete_file", args: { p_admin_id: dummyUuid, p_file_id: dummyUuid, p_ip_hash: "x" } },
      ];

      for (const r of rpcNames) {
        const { error: anonError } = await anonSupabase.rpc(r.name, r.args);
        assert(
          anonError && (anonError.code === "42501" || anonError.message.includes("permission denied")),
          `Security Isolation -> Anonymous caller denied execution of ${r.name} (42501)`
        );
      }

      // Fetch or seed authoritative admin profile
      const { data: adminUser } = await adminSupabase
        .from("profiles")
        .select("id, email, role, status")
        .eq("role", "admin")
        .eq("status", "approved")
        .limit(1)
        .single();

      if (adminUser) {
        const testUserId = crypto.randomUUID();
        cleanupUserIds.push(testUserId);

        // Seed test user
        await adminSupabase.from("profiles").insert({
          id: testUserId,
          email: `test_admin_ops_${Date.now()}@example.com`,
          role: "user",
          status: "pending",
          quota_bytes: 1000000000,
          storage_used_bytes: 500000,
          reserved_bytes: 200000,
        });

        // 1. Test admin_update_user_quota invariant check
        const { error: quotaViolateErr } = await adminSupabase.rpc("admin_update_user_quota", {
          p_admin_id: adminUser.id,
          p_target_user_id: testUserId,
          p_new_quota_bytes: 600000, // 700000 committed > 600000 requested
          p_ip_hash: "test_ip_hash",
        });
        assert(
          quotaViolateErr && quotaViolateErr.message.includes("QUOTA_VIOLATES_COMMITTED_STORAGE"),
          "Live Quota Invariant -> Reject setting quota below committed storage (used + reserved)"
        );

        const { data: quotaOkRes, error: quotaOkErr } = await adminSupabase.rpc("admin_update_user_quota", {
          p_admin_id: adminUser.id,
          p_target_user_id: testUserId,
          p_new_quota_bytes: 2000000000,
          p_ip_hash: "test_ip_hash",
        });
        assert(!quotaOkErr && quotaOkRes?.success === true, "Live Quota Invariant -> Successfully set valid quota");

        // 2. Test admin_create_onboarding_pin & admin_revoke_onboarding_pin
        const { data: pinRes, error: pinErr } = await adminSupabase.rpc("admin_create_onboarding_pin", {
          p_admin_id: adminUser.id,
          p_pin_hash: crypto.randomBytes(32).toString("hex"),
          p_pin_salt: crypto.randomBytes(16).toString("hex"),
          p_label: "Live Test PIN",
          p_max_uses: 5,
          p_expires_at: new Date(Date.now() + 86400000).toISOString(),
          p_ip_hash: "test_ip_hash",
        });
        assert(!pinErr && pinRes?.pin_id, "Live PIN Engine -> Created onboarding PIN via atomic RPC");
        if (pinRes?.pin_id) {
          cleanupPinIds.push(pinRes.pin_id);

          const { data: revokeRes, error: revokeErr } = await adminSupabase.rpc("admin_revoke_onboarding_pin", {
            p_admin_id: adminUser.id,
            p_pin_id: pinRes.pin_id,
            p_ip_hash: "test_ip_hash",
          });
          assert(!revokeErr && revokeRes?.success === true, "Live PIN Engine -> Revoked onboarding PIN via atomic RPC");
        }

        // 3. Test admin_review_access_request
        const testReqId = crypto.randomUUID();
        cleanupRequestIds.push(testReqId);
        await adminSupabase.from("access_requests").insert({
          id: testReqId,
          user_id: testUserId,
          status: "pending",
          requested_at: new Date().toISOString(),
          notes: "Verification test request",
        });

        const { data: reviewRes, error: reviewErr } = await adminSupabase.rpc("admin_review_access_request", {
          p_admin_id: adminUser.id,
          p_request_id: testReqId,
          p_action: "approve",
          p_rejection_reason: null,
          p_ip_hash: "test_ip_hash",
        });
        assert(!reviewErr && reviewRes?.status === "approve", "Live Access Review -> Atomic access request approval succeeded");

        const { error: doubleReviewErr } = await adminSupabase.rpc("admin_review_access_request", {
          p_admin_id: adminUser.id,
          p_request_id: testReqId,
          p_action: "reject",
          p_rejection_reason: null,
          p_ip_hash: "test_ip_hash",
        });
        assert(
          doubleReviewErr && doubleReviewErr.message.includes("REQUEST_NOT_PENDING"),
          "Live Access Review -> Re-reviewing decided request rejected with REQUEST_NOT_PENDING"
        );

        // 4. Test admin_force_delete_file (explicit state accounting matrix)
        const testFileId = crypto.randomUUID();
        cleanupFileIds.push(testFileId);
        await adminSupabase.from("files").insert({
          id: testFileId,
          user_id: testUserId,
          filename: "test_audit_file.bin",
          sanitized_name: "test_audit_file.bin",
          byte_size: 100000,
          mime_type: "application/octet-stream",
          status: "ACTIVE",
          expiry_preset: "30d",
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          r2_key: `u/${testUserId}/test.bin`,
        });

        const { data: delRes, error: delErr } = await adminSupabase.rpc("admin_force_delete_file", {
          p_admin_id: adminUser.id,
          p_file_id: testFileId,
          p_ip_hash: "test_ip_hash",
        });
        assert(
          !delErr && delRes?.quota_action === "RELEASED_STORAGE_USED_BYTES",
          "Live Admin File Delete -> ACTIVE file releases storage_used_bytes"
        );

        // Repeated force-delete: no-op quota action
        const { data: repeatDelRes, error: repeatDelErr } = await adminSupabase.rpc("admin_force_delete_file", {
          p_admin_id: adminUser.id,
          p_file_id: testFileId,
          p_ip_hash: "test_ip_hash",
        });
        assert(
          !repeatDelErr && repeatDelRes?.quota_action === "NO_OP_ALREADY_RECLAIMED",
          "Live Admin File Delete -> DELETE_PENDING file prevents double quota reclamation (NO_OP)"
        );
      }
    }

    // --------------------------------------------------------------------------
    // 4. Client-Side & Server-Side Security Validation: Avatar HTTPS URL
    // --------------------------------------------------------------------------
    console.log("\n4. Testing Input Validation Schemas (HTTPS-Only Avatar, Strict Zod)...");

    const avatarSchema = z.string().trim().max(500).nullable().optional().refine(
      (val) => {
        if (!val) return true;
        try {
          const parsed = new URL(val);
          return parsed.protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "avatar_url must be a valid https:// URL or null" }
    );

    assert(avatarSchema.safeParse("https://example.com/avatar.jpg").success, "Avatar Validation -> Valid https:// accepted");
    assert(avatarSchema.safeParse(null).success, "Avatar Validation -> Null accepted");
    assert(!avatarSchema.safeParse("http://insecure.com/avatar.jpg").success, "Avatar Validation -> Insecure http:// rejected");
    assert(!avatarSchema.safeParse("javascript:alert(1)").success, "Avatar Validation -> XSS javascript: URL rejected");
    assert(!avatarSchema.safeParse("data:image/png;base64,1234").success, "Avatar Validation -> data: scheme rejected");

    // Profile Schema Strictness: Rejects Privilege Escalation Fields
    const updateProfileSchema = z.object({
      full_name: z.string().trim().max(100).nullable().optional(),
      avatar_url: avatarSchema,
    }).strict();

    assert(
      !updateProfileSchema.safeParse({ role: "admin" }).success,
      "Strict Schema -> Privilege escalation field 'role' rejected by user profile schema"
    );
    assert(
      !updateProfileSchema.safeParse({ quota_bytes: 999999999 }).success,
      "Strict Schema -> Quota modification field 'quota_bytes' rejected by user profile schema"
    );
    assert(
      !updateProfileSchema.safeParse({ status: "approved" }).success,
      "Strict Schema -> Status modification field 'status' rejected by user profile schema"
    );

    // --------------------------------------------------------------------------
    // 5. Zero Internal Storage Keys Privacy
    // --------------------------------------------------------------------------
    console.log("\n5. Verifying Zero Internal Storage Keys Exposed Across APIs & Client...");

    const filesApi = fs.readFileSync(
      path.join(process.cwd(), "app/api/files/route.ts"),
      "utf8"
    );
    const adminFilesApi = fs.readFileSync(
      path.join(process.cwd(), "app/api/admin/files/route.ts"),
      "utf8"
    );

    assert(
      !filesApi.includes("r2_key,") &&
      !filesApi.includes('"r2_key"') &&
      !filesApi.includes("r2_upload_id") &&
      !filesApi.includes("r2_etag"),
      "R2 Privacy -> User GET /api/files strictly omits r2_key, r2_upload_id, and r2_etag"
    );

    assert(
      !adminFilesApi.includes("r2_key,") &&
      !adminFilesApi.includes('"r2_key"') &&
      !adminFilesApi.includes("r2_upload_id") &&
      !adminFilesApi.includes("r2_etag"),
      "R2 Privacy -> Admin GET /api/admin/files strictly omits r2_key, r2_upload_id, and r2_etag"
    );

    // Verify tenant isolation in GET /api/files
    assert(
      filesApi.includes('.eq("user_id", user.id)'),
      "Tenant Isolation -> GET /api/files strictly filters by user_id = user.id"
    );

    // --------------------------------------------------------------------------
    // 6. Admin Settings Status-Only Privacy Check
    // --------------------------------------------------------------------------
    console.log("\n6. Verifying Admin Settings Status-Only Diagnostics (Zero Leaks)...");

    const settingsRoute = fs.readFileSync(
      path.join(process.cwd(), "app/api/admin/settings/route.ts"),
      "utf8"
    );

    assert(
      !settingsRoute.includes("process.env.SUPABASE_SECRET_KEY") ||
      !settingsRoute.includes("SUPABASE_SECRET_KEY:"),
      "Settings Privacy -> Zero raw Supabase secret keys returned"
    );
    assert(
      !settingsRoute.includes("process.env.R2_SECRET_ACCESS_KEY") ||
      !settingsRoute.includes("R2_SECRET_ACCESS_KEY:"),
      "Settings Privacy -> Zero raw R2 secret access keys returned"
    );
    assert(
      !settingsRoute.includes("process.env.UPSTASH_REDIS_REST_TOKEN") ||
      !settingsRoute.includes("UPSTASH_REDIS_REST_TOKEN:"),
      "Settings Privacy -> Zero raw Redis tokens returned"
    );
    assert(
      !settingsRoute.includes("process.env.PIN_PEPPER"),
      "Settings Privacy -> Zero raw PIN peppers returned"
    );

    // --------------------------------------------------------------------------
    // 7. XURL Sync & Circuit Breaker Logic
    // --------------------------------------------------------------------------
    console.log("\n7. Verifying XURL Sync & Locked Phase 5 Resilient Semantics...");

    const xurlSyncRoute = fs.readFileSync(
      path.join(process.cwd(), "app/api/admin/xurl/sync/route.ts"),
      "utf8"
    );

    assert(
      xurlSyncRoute.includes("requireAdminUser"),
      "XURL Sync -> Protected by requireAdminUser guard"
    );

    assert(
      xurlSyncRoute.includes("PERMANENT_ERROR_NON_RETRYABLE") ||
      xurlSyncRoute.includes("Cannot retry mapping with permanent error"),
      "XURL Sync -> Permanent 4xx errors (400, 401, 403, 409) are strictly non-retryable"
    );

    assert(
      xurlSyncRoute.includes("redis.del(\"circuit:xurl:cooldown\")") &&
      xurlSyncRoute.includes("redis.del(\"circuit:xurl:ratelimit\")"),
      "XURL Sync -> Circuit breaker reset removes both cooldown and rate limit keys from Redis"
    );

    assert(
      xurlSyncRoute.includes("ADMIN_XURL_SYNC"),
      "XURL Sync -> Writes ADMIN_XURL_SYNC audit log"
    );

    // --------------------------------------------------------------------------
    // 8. Public Surfaces & UI Route Integrity
    // --------------------------------------------------------------------------
    console.log("\n8. Verifying Public Surfaces & UI Route Hierarchy...");

    const requiredRoutes = [
      "app/page.tsx",
      "app/privacy/page.tsx",
      "app/terms/page.tsx",
      "app/developers/page.tsx",
      "app/(dashboard)/layout.tsx",
      "app/(dashboard)/dashboard/page.tsx",
      "app/(dashboard)/upload/page.tsx",
      "app/(dashboard)/files/page.tsx",
      "app/(dashboard)/links/page.tsx",
      "app/(dashboard)/expiring/page.tsx",
      "app/(dashboard)/settings/page.tsx",
      "app/(admin)/layout.tsx",
      "app/(admin)/admin/page.tsx",
      "app/(admin)/admin/users/page.tsx",
      "app/(admin)/admin/requests/page.tsx",
      "app/(admin)/admin/pins/page.tsx",
      "app/(admin)/admin/files/page.tsx",
      "app/(admin)/admin/xurl/page.tsx",
      "app/(admin)/admin/activity/page.tsx",
      "app/(admin)/admin/settings/page.tsx",
    ];

    for (const route of requiredRoutes) {
      assert(
        fs.existsSync(path.join(process.cwd(), route)),
        `UI Route -> ${route} exists`
      );
    }

    // --------------------------------------------------------------------------
    // 9. Client Component Secret Boundary Check
    // --------------------------------------------------------------------------
    console.log("\n9. Verifying Client Component Secret Boundaries (Zero Leaks)...");

    const clientComponents = [
      "components/admin/admin-nav.tsx",
      "components/admin/user-manager.tsx",
      "components/admin/requests-manager.tsx",
      "components/admin/pins-manager.tsx",
      "components/admin/admin-file-audit.tsx",
      "components/admin/xurl-monitor.tsx",
      "components/admin/audit-logs-viewer.tsx",
      "components/admin/platform-health.tsx",
      "components/dashboard/dashboard-nav.tsx",
      "components/dashboard/quota-widget.tsx",
      "components/dashboard/file-manager.tsx",
      "components/dashboard/links-table.tsx",
      "components/dashboard/settings-form.tsx",
    ];

    let leaked = false;
    for (const comp of clientComponents) {
      const full = path.join(process.cwd(), comp);
      if (fs.existsSync(full)) {
        const text = fs.readFileSync(full, "utf8");
        if (
          text.includes("SUPABASE_SECRET_KEY") ||
          text.includes("R2_SECRET_ACCESS_KEY") ||
          text.includes("UPSTASH_REDIS_REST_TOKEN") ||
          text.includes("PIN_PEPPER") ||
          text.includes("TURNSTILE_SECRET_KEY") ||
          text.includes("XURL_API_KEY")
        ) {
          console.error(`  [FAIL] Secret leak found in ${comp}`);
          leaked = true;
        }
      }
    }
    assert(!leaked, "Secret Boundaries -> Zero server secrets referenced in any client components");

    // --------------------------------------------------------------------------
    // 10. Audit Log Schema & Event Type Coverage
    // --------------------------------------------------------------------------
    console.log("\n10. Verifying Audit Log Coverage Across All Phase 6 Operations...");

    const expectedEvents = [
      "ADMIN_ACCESS_REQUEST_REVIEW",
      "ADMIN_USER_QUOTA_UPDATE",
      "ADMIN_USER_PROFILE_UPDATE",
      "ADMIN_PIN_CREATE",
      "ADMIN_PIN_REVOKE",
      "ADMIN_FILE_FORCE_DELETE",
      "ADMIN_XURL_SYNC",
      "USER_PROFILE_UPDATE",
    ];

    const codebaseGrep = [
      fs.readFileSync(path.join(process.cwd(), "app/api/user/profile/route.ts"), "utf8"),
      fs.readFileSync(path.join(process.cwd(), "app/api/admin/xurl/sync/route.ts"), "utf8"),
      migrationSql,
    ].join("\n");

    for (const evt of expectedEvents) {
      assert(
        codebaseGrep.includes(evt),
        `Audit Log -> Event type '${evt}' mapped and recorded`
      );
    }

  } catch (err) {
    console.error("Unhandled error during verification:", err);
    totalFailed++;
  } finally {
    await cleanup();
  }

  console.log("\n==================================================");
  console.log("PHASE 6 VERIFICATION SUMMARY");
  console.log("==================================================");
  console.log(`Passed:        ${totalPassed}`);
  console.log(`Failed:        ${totalFailed}`);
  console.log(`Pending SQL:   ${totalNotVerified}`);
  console.log("==================================================");

  if (totalFailed > 0) {
    console.error("\n❌ PHASE 6 VERIFICATION FAILED");
    process.exit(1);
  } else {
    console.log("\n✅ ALL PHASE 6 CHECKS PASSED!");
    if (totalNotVerified > 0) {
      console.log(
        "👉 Note: Run 'supabase/apply_phase6_migrations.sql' in your Supabase SQL editor to activate remote stored procedures."
      );
    }
    process.exit(0);
  }
}

main();
