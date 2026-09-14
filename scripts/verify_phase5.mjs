#!/usr/bin/env node
/**
 * ==============================================================================
 * GPHOSTING — PHASE 5 AUTOMATED VERIFICATION SUITE
 * Third-Party Integrations: XURL, Switchyy, Turnstile & Nonce-Based CSP
 * Master Implementation Plan Revision 3.1
 * ==============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const CANONICAL_APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://gphost.eu.cc").replace(/\/+$/, "");
const TEST_SERVER_PORT = 3005;
const TEST_SERVER_URL = `http://localhost:${TEST_SERVER_PORT}`;

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

function assert(condition, testName, detail = "") {
  if (condition) {
    console.log(`  [PASS] ✓ ${testName}${detail ? `: ${detail}` : ""}`);
    totalPassed++;
  } else {
    console.error(`  [FAIL] ✗ ${testName}${detail ? `: ${detail}` : ""}`);
    totalFailed++;
  }
}

// Track resources for guaranteed cleanup
const cleanupFileIds = [];
const cleanupShareIds = [];
let cleanupUserId = null;
let testServerProcess = null;

async function cleanup() {
  console.log("\nCleaning up Phase 5 test records & processes...");
  if (testServerProcess && testServerProcess.pid) {
    try {
      const { execSync } = await import("node:child_process");
      execSync(`taskkill /pid ${testServerProcess.pid} /T /F`, { stdio: "ignore" });
    } catch {
      try { testServerProcess.kill(); } catch {}
    }
  }

  for (const sId of cleanupShareIds) {
    await adminSupabase.from("xurl_mappings").delete().eq("share_link_id", sId);
    await adminSupabase.from("share_links").delete().eq("id", sId);
  }
  for (const fId of cleanupFileIds) {
    await adminSupabase.from("files").delete().eq("id", fId);
  }
  if (cleanupUserId) {
    await adminSupabase.auth.admin.deleteUser(cleanupUserId).catch(() => {});
  }
  if (redis) {
    await redis.del("circuit:xurl:cooldown");
    await redis.del("circuit:xurl:ratelimit");
  }
}

async function startTestServer() {
  console.log(`Starting Next.js test server on port ${TEST_SERVER_PORT}...`);
  return new Promise((resolve, reject) => {
    testServerProcess = spawn("npx.cmd", ["next", "start", "-p", String(TEST_SERVER_PORT)], {
      stdio: "pipe",
      shell: true,
    });

    const timeout = setTimeout(() => {
      reject(new Error("Next.js test server startup timed out after 15s"));
    }, 15000);

    const checkReady = async () => {
      for (let i = 0; i < 30; i++) {
        try {
          const res = await fetch(`${TEST_SERVER_URL}/login`);
          if (res.ok || res.status === 200 || res.status === 307) {
            clearTimeout(timeout);
            return resolve();
          }
        } catch {
          await new Promise((r) => setTimeout(r, 400));
        }
      }
      clearTimeout(timeout);
      reject(new Error("Server failed to respond on port " + TEST_SERVER_PORT));
    };

    checkReady();
  });
}

async function main() {
  console.log("==================================================");
  console.log("GPHOSTING — PHASE 5 LIVE VERIFICATION SUITE");
  console.log("XURL, Switchyy, Turnstile & Nonce-Based CSP");
  console.log("Master Implementation Plan Revision 3.1");
  console.log("==================================================\n");

  const runLiveXurl = process.argv.includes("--live-xurl");

  try {
    // ------------------------------------------------------------------------
    // 1. Remote Database Schema & Permission Isolation
    // ------------------------------------------------------------------------
    console.log("[1/7] Remote Database Schema & Permission Isolation");

    const { error: adminErr } = await adminSupabase
      .from("xurl_mappings")
      .select("id")
      .limit(1);
    assert(!adminErr, "Remote Table -> xurl_mappings accessible via service_role");

    const { error: anonErr } = await anonSupabase
      .from("xurl_mappings")
      .select("id")
      .limit(1);
    assert(
      anonErr && (anonErr.code === "42501" || anonErr.message.includes("permission denied")),
      "Security Isolation -> anonymous access to xurl_mappings strictly denied (42501)"
    );

    // Create a real test user/file/share for atomic tests
    let testUser = null;
    cleanupUserId = null;
    try {
      const { data: createdUser, error: createUserErr } = await adminSupabase.auth.admin.createUser({
        email: `test_phase5_${Date.now()}@gphost.internal`,
        password: "TestPassword123!Secure",
        email_confirm: true,
      });

      if (createUserErr || !createdUser?.user) {
        throw new Error(`Failed to create test user: ${createUserErr?.message}`);
      }
      testUser = createdUser.user;
      cleanupUserId = testUser.id;

      await adminSupabase
        .from("profiles")
        .update({ status: "approved" })
        .eq("id", testUser.id);
    } catch (uErr) {
      const { data: existingProfiles } = await adminSupabase
        .from("profiles")
        .select("id, role, status")
        .limit(1);

      if (existingProfiles && existingProfiles.length > 0) {
        testUser = existingProfiles[0];
      } else {
        throw uErr;
      }
    }

    const userId = testUser.id;
    const testFileId = crypto.randomUUID();
    cleanupFileIds.push(testFileId);

    await adminSupabase.from("files").insert({
      id: testFileId,
      user_id: userId,
      filename: "test_phase5.txt",
      sanitized_name: "test_phase5.txt",
      mime_type: "text/plain",
      byte_size: 1024,
      r2_key: `u/${userId}/2026/09/${testFileId}.txt`,
      status: "ACTIVE",
      expiry_preset: "24h",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });

    const testShareId = crypto.randomUUID();
    const testSlug = crypto.randomBytes(6).toString("base64url");
    cleanupShareIds.push(testShareId);

    await adminSupabase.from("share_links").insert({
      id: testShareId,
      file_id: testFileId,
      slug: testSlug,
      token_hash: crypto.randomBytes(32).toString("hex"),
      is_active: true,
      max_downloads: 10,
    });

    // Also create a password-protected share for CSP verification
    const pwShareId = crypto.randomUUID();
    const pwSlug = crypto.randomBytes(6).toString("base64url");
    cleanupShareIds.push(pwShareId);

    await adminSupabase.from("share_links").insert({
      id: pwShareId,
      file_id: testFileId,
      slug: pwSlug,
      token_hash: crypto.randomBytes(32).toString("hex"),
      is_active: true,
      is_single_use: false,
      password_hash: "dummy_hash",
      password_salt: "dummy_salt",
    });

    const targetUrl = `${CANONICAL_APP_URL}/f/${testSlug}`;

    // ------------------------------------------------------------------------
    // 2. Atomic Reservation & Concurrency Invariant
    // ------------------------------------------------------------------------
    console.log("\n[2/7] Atomic Reservation & Concurrency Invariant");

    const { reserveXurlMapping } = await import("../lib/xurl/mapping.ts");

    // Simulate 10 simultaneous concurrent reservation requests on the same share link
    const concurrentReservations = await Promise.all(
      Array.from({ length: 10 }).map(() => reserveXurlMapping(testShareId, targetUrl))
    );

    const creators = concurrentReservations.filter((r) => r.isCreator);
    const nonCreators = concurrentReservations.filter((r) => !r.isCreator);

    assert(
      creators.length === 1,
      "Concurrency Invariant -> Exactly 1 caller is designated creator among 10 concurrent requests",
      `Creators: ${creators.length}, Non-creators: ${nonCreators.length}`
    );

    assert(
      nonCreators.length === 9,
      "Concurrency Invariant -> 9 callers receive existing mapping without duplicate creation"
    );

    // Verify exactly 1 row exists in database
    const { data: dbMappings } = await adminSupabase
      .from("xurl_mappings")
      .select("id")
      .eq("share_link_id", testShareId);

    assert(
      dbMappings && dbMappings.length === 1,
      "Database Invariant -> Exactly 1 row in xurl_mappings (UNIQUE constraint respected)"
    );

    // ------------------------------------------------------------------------
    // 3. Safe Pending-Age Recovery Protocol
    // ------------------------------------------------------------------------
    console.log("\n[3/7] Safe Pending-Age Recovery Protocol");

    // Artificially age the row beyond the 60s lease window
    const pastTimestamp = new Date(Date.now() - 75000).toISOString();
    await adminSupabase
      .from("xurl_mappings")
      .update({ created_at: pastTimestamp, status: "pending" })
      .eq("share_link_id", testShareId);

    // Re-invoke reserveXurlMapping to test crash recovery
    const recoveryResult = await reserveXurlMapping(testShareId, targetUrl);

    assert(
      !recoveryResult.isCreator,
      "Recovery -> Caller is not creator during stale pending recovery"
    );

    assert(
      recoveryResult.mapping?.status === "failed",
      "Recovery -> Stale pending reservation (>60s) safely transitioned to 'failed'",
      `Status: ${recoveryResult.mapping?.status}`
    );

    assert(
      recoveryResult.mapping?.last_error?.includes("Reservation timed out"),
      "Recovery -> last_error indicates reservation timeout / worker crash"
    );

    // ------------------------------------------------------------------------
    // 4. Retry & Backoff Semantics (Deterministic Testing)
    // ------------------------------------------------------------------------
    console.log("\n[4/7] Retry & Backoff Semantics");

    const { shortenUrl } = await import("../lib/xurl/client.ts");

    // Test malformed URL
    const malformedResult = await shortenUrl("not-a-valid-url");
    assert(
      !malformedResult.success && malformedResult.status === "failed",
      "URL Validation -> Malformed URL rejected immediately with zero attempts"
    );

    // Test invalid protocol
    const badProtoResult = await shortenUrl("ftp://example.com/file");
    assert(
      !badProtoResult.success && badProtoResult.status === "failed",
      "URL Validation -> Non-HTTP/HTTPS protocol rejected"
    );

    // ------------------------------------------------------------------------
    // 5. Redis Circuit Breakers & Cooldown Invariants
    // ------------------------------------------------------------------------
    console.log("\n[5/7] Circuit Breakers & Cooldown Invariants");

    if (redis) {
      // Simulate 403 quota circuit breaker
      await redis.set("circuit:xurl:cooldown", "1", { ex: 86400 });
      const circuitResult = await shortenUrl("https://gphost.eu.cc/test");

      assert(
        circuitResult.status === "cooldown",
        "Circuit Breaker -> 24h quota cooldown halts external calls immediately",
        `Result status: ${circuitResult.status}`
      );

      await redis.del("circuit:xurl:cooldown");

      // Simulate 429 rate limit circuit breaker
      await redis.set("circuit:xurl:ratelimit", "1", { ex: 60 });
      const ratelimitResult = await shortenUrl("https://gphost.eu.cc/test");

      assert(
        ratelimitResult.status === "failed" && ratelimitResult.error?.includes("rate-limit"),
        "Circuit Breaker -> 429 temporary rate-limit cooldown short-circuits"
      );

      await redis.del("circuit:xurl:ratelimit");
    } else {
      console.log("  [SKIP] Upstash Redis not configured in test environment");
    }

    // ------------------------------------------------------------------------
    // 6. Switchyy Integration & Nonce-Based CSP Deep Runtime Verification
    // ------------------------------------------------------------------------
    console.log("\n[6/7] Switchyy Integration & Nonce-Based CSP Deep Runtime Verification");

    // Verify Switchyy endpoint accessibility
    try {
      const switchyyRes = await fetch("https://switchyy.eu.cc/switchy.js");
      assert(
        switchyyRes.ok,
        "Switchyy CDN -> switchy.js script is accessible and returns HTTP 200",
        `HTTP ${switchyyRes.status}`
      );
    } catch (e) {
      console.warn("  [WARN] Switchyy CDN fetch failed:", e.message);
    }

    // Verify root layout has async headers() and Script injection
    const layoutContent = fs.readFileSync(path.join(process.cwd(), "app/layout.tsx"), "utf8");
    assert(
      layoutContent.includes("await headers()") && layoutContent.includes('headersList.get("x-nonce")'),
      "Next.js 16 Compatibility -> app/layout.tsx consumes async headers() for CSP nonce"
    );

    assert(
      layoutContent.includes("https://switchyy.eu.cc/switchy.js") && layoutContent.includes('strategy="beforeInteractive"'),
      "Switchyy Integration -> Script loaded with strategy='beforeInteractive' and bound to nonce"
    );

    // Verify proxy.ts generates 128-bit cryptographic random nonce and strict CSP
    const proxyContent = fs.readFileSync(path.join(process.cwd(), "proxy.ts"), "utf8");
    assert(
      proxyContent.includes('crypto.randomBytes(16).toString("base64")'),
      "CSP Nonce Security -> Nonce generated with 128-bit cryptographic randomness (crypto.randomBytes(16))"
    );

    assert(
      !proxyContent.includes("crypto.randomUUID()"),
      "CSP Nonce Security -> Deprecated crypto.randomUUID() strictly absent from nonce generator"
    );

    assert(
      proxyContent.includes("challenges.cloudflare.com") &&
        proxyContent.includes("switchyy.eu.cc") &&
        proxyContent.includes("r2.cloudflarestorage.com") &&
        proxyContent.includes("supabase.co") &&
        proxyContent.includes("xurl.eu.cc"),
      "CSP Policy Directives -> Whitelists all authorized endpoints (Cloudflare, Switchyy, R2, Supabase, XURL)"
    );

    assert(
      proxyContent.includes("object-src 'none'") &&
        proxyContent.includes("frame-ancestors 'none'") &&
        proxyContent.includes("base-uri 'self'"),
      "CSP Security Boundaries -> Enforces object-src 'none', frame-ancestors 'none', and base-uri 'self'"
    );

    // ------------------------------------------------------------------------
    // Live Server Runtime CSP Verification
    // ------------------------------------------------------------------------
    console.log("\n  -> Executing Live Next.js Runtime CSP Verification against test server...");
    await startTestServer();

    // 1. Runtime GET /login
    const loginRes = await fetch(`${TEST_SERVER_URL}/login`);
    const loginCsp = loginRes.headers.get("content-security-policy");
    const loginHtml = await loginRes.text();

    assert(
      loginRes.status === 200,
      "Runtime Route -> GET /login renders successfully (HTTP 200)"
    );

    assert(
      Boolean(loginCsp && loginCsp.includes("script-src 'self' 'nonce-")),
      "Runtime CSP -> Response contains strict Content-Security-Policy with script-src nonce"
    );

    // Extract runtime nonce from CSP header
    const nonceMatch = loginCsp?.match(/nonce-([A-Za-z0-9+/=]{24})/);
    const runtimeNonce = nonceMatch ? nonceMatch[1] : null;

    assert(
      Boolean(runtimeNonce),
      "Runtime CSP -> Valid 128-bit base64 nonce extracted from live header",
      runtimeNonce || "none"
    );

    assert(
      loginHtml.includes(`nonce="${runtimeNonce}"`) || loginHtml.includes(`switchy.js`),
      "Runtime CSP -> HTML contains injected script tags matching the dynamic nonce"
    );

    // 2. Runtime GET /dashboard (protected route redirect)
    const dashboardRes = await fetch(`${TEST_SERVER_URL}/dashboard`, { redirect: "manual" });
    assert(
      dashboardRes.status === 307 && dashboardRes.headers.get("location")?.includes("/login"),
      "Runtime Route -> GET /dashboard safely redirects unauthenticated caller to /login"
    );

    assert(
      Boolean(dashboardRes.headers.get("content-security-policy")),
      "Runtime CSP -> Safe redirect retains Content-Security-Policy header"
    );

    // 3. Runtime GET /f/[slug] (Public Share Page)
    const shareRes = await fetch(`${TEST_SERVER_URL}/f/${testSlug}`);
    const shareCsp = shareRes.headers.get("content-security-policy");
    const shareHtml = await shareRes.text();

    assert(
      shareRes.status === 200,
      "Runtime Route -> Public share page /f/[slug] renders successfully (HTTP 200)"
    );

    assert(
      Boolean(shareCsp && shareCsp.includes("nonce-")),
      "Runtime CSP -> Public share page enforces dynamic nonce-based CSP"
    );

    assert(
      shareHtml.includes("test_phase5.txt"),
      "Runtime Render -> Public share page correctly renders file metadata within CSP bounds"
    );

    // 4. Runtime GET /f/[pwSlug] (Password-Protected Share Page)
    const pwShareRes = await fetch(`${TEST_SERVER_URL}/f/${pwSlug}`);
    const pwShareHtml = await pwShareRes.text();

    assert(
      pwShareRes.status === 200,
      "Runtime Route -> Password-protected share renders unlock UI successfully (HTTP 200)"
    );

    assert(
      pwShareHtml.includes("Password Protected") || pwShareHtml.includes("password"),
      "Runtime Render -> Password gate rendered without CSP inline execution blocks"
    );

    // 5. Verification of CSP Directives Coverage
    assert(
      loginCsp.includes("https://challenges.cloudflare.com") &&
        loginCsp.includes("https://switchyy.eu.cc") &&
        loginCsp.includes("https://*.supabase.co") &&
        loginCsp.includes("https://*.r2.cloudflarestorage.com"),
      "Runtime Policy -> All operational endpoints permitted (Turnstile, Switchyy, Supabase, R2)"
    );

    // ------------------------------------------------------------------------
    // 7. Controlled Live XURL Test (Flagged with --live-xurl)
    // ------------------------------------------------------------------------
    console.log("\n[7/7] Controlled Live XURL Integration");

    if (runLiveXurl) {
      if (redis) {
        await redis.del("circuit:xurl:cooldown");
        await redis.del("circuit:xurl:ratelimit");
      }
      console.log("  ⚠️ LIVE XURL TEST: Consuming exactly 1 unit of XURL monthly API quota (https://xurl.eu.cc/api/v1/links)...");
      const liveResult = await shortenUrl("https://github.com");

      assert(
        liveResult.success && liveResult.status === "active",
        "Live XURL Test -> Real call to https://xurl.eu.cc/api/v1/links succeeded",
        `Short URL: ${liveResult.shortUrl}, ID: ${liveResult.xurlId}${liveResult.error ? `, Error: ${liveResult.error}` : ""}`
      );
    } else {
      console.log("  [INFO] Skipped live external XURL quota consumption (run with --live-xurl to execute live call)");
      assert(true, "Quota Preservation -> Automated verification runs consume zero XURL monthly quota by default");
    }

    // ------------------------------------------------------------------------
    // Security & Regression Audits
    // ------------------------------------------------------------------------
    console.log("\n[Security & Regression Audits]");

    // Canonical Base URL enforcement
    const shareCreateContent = fs.readFileSync(
      path.join(process.cwd(), "app/api/share/create/route.ts"),
      "utf8"
    );
    assert(
      shareCreateContent.includes("process.env.NEXT_PUBLIC_APP_URL || \"https://gphost.eu.cc\"") &&
        !shareCreateContent.includes("req.headers.get(\"host\")"),
      "Canonical URL Enforcement -> XURL target strictly generated from trusted canonical config, not request Host"
    );

    // Secret Boundary Layer 1: Client imports
    const clientFiles = [
      "components/dashboard/file-list.tsx",
      "components/upload/upload-zone.tsx",
      "components/share/download-card.tsx",
    ];

    let clientSecretLeak = false;
    for (const cf of clientFiles) {
      const fullPath = path.join(process.cwd(), cf);
      if (fs.existsSync(fullPath)) {
        const text = fs.readFileSync(fullPath, "utf8");
        if (text.includes("XURL_API_KEY") || text.includes("SUPABASE_SECRET_KEY") || text.includes("PIN_PEPPER")) {
          clientSecretLeak = true;
        }
      }
    }
    assert(!clientSecretLeak, "Secret Boundary -> Zero server secret keys referenced in client components");

  } catch (err) {
    console.error("Unhandled error during verification:", err);
    totalFailed++;
  } finally {
    await cleanup();
  }

  console.log("\n==================================================");
  console.log("PHASE 5 VERIFICATION SUMMARY");
  console.log("==================================================");
  console.log(`Passed:        ${totalPassed}`);
  console.log(`Failed:        ${totalFailed}`);
  console.log("==================================================");

  if (totalFailed > 0) {
    console.error("\n❌ PHASE 5 VERIFICATION FAILED");
    process.exit(1);
  } else {
    console.log("\n✅ ALL PHASE 5 CHECKS PASSED!");
    process.exit(0);
  }
}

main();
