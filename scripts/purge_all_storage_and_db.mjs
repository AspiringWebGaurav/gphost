import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { Redis } from "@upstash/redis";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in environment");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const bucketName = process.env.R2_BUCKET_NAME || "gphosting-files";

const redisUrl = (process.env.UPSTASH_REDIS_REST_URL || "").replace(/^["']|["']$/g, "");
const redisToken = (process.env.UPSTASH_REDIS_REST_TOKEN || "").replace(/^["']|["']$/g, "");

const redis = redisUrl && redisToken ? new Redis({
  url: redisUrl,
  token: redisToken,
}) : null;

async function purgeR2() {
  console.log("\n--- 1. PURGING CLOUDFLARE R2 BUCKET ---");
  let totalDeleted = 0;

  while (true) {
    const listRes = await r2Client.send(new ListObjectsV2Command({ Bucket: bucketName }));
    if (!listRes.Contents || listRes.Contents.length === 0) {
      break;
    }

    const objectsToDelete = listRes.Contents.map((obj) => ({ Key: obj.Key }));
    console.log(`  Deleting batch of ${objectsToDelete.length} objects from R2 '${bucketName}'...`);
    for (const obj of objectsToDelete) {
      console.log(`    - ${obj.Key}`);
    }

    await r2Client.send(
      new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: { Objects: objectsToDelete },
      })
    );

    totalDeleted += objectsToDelete.length;
  }

  console.log(`✓ Cloudflare R2 bucket '${bucketName}' is now 100% clean (deleted ${totalDeleted} objects).`);
}

async function purgeRedis() {
  console.log("\n--- 2. PURGING UPSTASH REDIS ---");
  if (!redis) {
    console.log("  Upstash Redis not configured, skipping.");
    return;
  }
  try {
    const keysBefore = await redis.keys("*");
    console.log(`  Found ${keysBefore.length} keys in Redis before flush:`, keysBefore);

    await redis.flushdb();

    const keysAfter = await redis.keys("*");
    console.log(`✓ Upstash Redis is now 100% clean (remaining keys: ${keysAfter.length}).`);
  } catch (err) {
    console.error("  Error flushing Redis:", err.message);
  }
}

async function purgeSupabase() {
  console.log("\n--- 3. PURGING SUPABASE POSTGRESQL & AUTH ---");

  // Step A: Delete dependent tables
  const tables = [
    "cron_cleanup_claims",
    "file_events",
    "user_api_keys",
    "api_keys",
    "file_downloads",
    "xurl_mappings",
    "share_links",
    "files",
    "onboarding_pins",
    "access_requests",
    "audit_logs",
  ];

  for (const table of tables) {
    const { error, count } = await supabase
      .from(table)
      .delete({ count: "exact" })
      .neq("id", "00000000-0000-0000-0000-000000000000"); // deletes all rows

    if (error) {
      console.error(`  Error deleting from ${table}:`, error.message);
    } else {
      console.log(`  ✓ Table '${table}' wiped (deleted ${count ?? "all"} rows).`);
    }
  }

  // Step B & C: Reset Admin profile(s) & preserve all admin accounts
  console.log("\n  Managing Profiles & Auth Users:");
  const { data: allProfiles, error: pErr } = await supabase.from("profiles").select("id, email, role, status");
  const { data: authData, error: aErr } = await supabase.auth.admin.listUsers();

  if (pErr) {
    console.error("  Error reading profiles:", pErr.message);
  }
  if (aErr) {
    console.error("  Error reading auth users:", aErr.message);
  }

  // Authoritative sole admin email
  const adminEmails = new Set([adminEmail || "gauravpatil5737@gmail.com"]);
  const bannedEmails = new Set(["gauravpatil9262@gmail.com"]);

  console.log("  Authoritative Sole Admin Account identified for preservation & full access:");
  for (const email of adminEmails) {
    console.log(`    - ${email}`);
  }

  // Delete banned profiles immediately
  for (const banned of bannedEmails) {
    await supabase.from("profiles").delete().ilike("email", banned);
  }

  // Reset sole admin profile to 0 usage and approved status; delete all others
  for (const p of allProfiles || []) {
    const emailLower = (p.email || "").toLowerCase();
    const isSoleAdmin = adminEmails.has(emailLower) && !bannedEmails.has(emailLower);
    if (isSoleAdmin) {
      await supabase
        .from("profiles")
        .update({
          storage_used_bytes: 0,
          reserved_bytes: 0,
          quota_bytes: -1,
          role: "admin",
          status: "approved",
          can_create_permanent: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", p.id);
      console.log(`  ✓ Sole Admin profile '${p.email}' preserved with full admin access (0 used bytes, unlimited quota, approved).`);
    } else {
      await supabase.from("profiles").delete().eq("id", p.id);
      console.log(`  ✓ Non-admin/removed profile '${p.email}' (${p.id}) deleted.`);
    }
  }

  // Handle auth.users: ensure sole admin is preserved, gauravpatil9262 and others deleted
  for (const u of authData?.users || []) {
    const userEmail = (u.email || "").toLowerCase();
    const isSoleAdmin = adminEmails.has(userEmail) && !bannedEmails.has(userEmail);
    if (!isSoleAdmin) {
      const { error: delAuthErr } = await supabase.auth.admin.deleteUser(u.id);
      if (delAuthErr) {
        console.error(`  Error deleting user ${u.email}:`, delAuthErr.message);
      } else {
        console.log(`  ✓ Removed user '${u.email}' (${u.id}) deleted from auth.users.`);
      }
    } else {
      console.log(`  ✓ Sole Admin auth user '${u.email}' preserved.`);

      // Ensure profile exists for this preserved auth user
      const existingProfile = (allProfiles || []).find((p) => p.id === u.id);
      if (!existingProfile) {
        await supabase.from("profiles").upsert({
          id: u.id,
          email: u.email,
          full_name: u.user_metadata?.full_name || u.email?.split("@")[0] || "Admin",
          avatar_url: u.user_metadata?.avatar_url || null,
          role: "admin",
          status: "approved",
          quota_bytes: -1,
          storage_used_bytes: 0,
          reserved_bytes: 0,
          can_create_permanent: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        console.log(`  ✓ Created missing admin profile for '${u.email}'.`);
      }
    }
  }

  console.log("✓ Supabase PostgreSQL & Auth cleanup complete.");
}

function cleanLocalCache() {
  console.log("\n--- 4. CLEANING APPLICATION BUILD & LOCAL CACHE ---");
  const cacheDir = path.resolve(".next", "cache");
  if (fs.existsSync(cacheDir)) {
    try {
      fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 3 });
      console.log("  ✓ Successfully purged .next/cache directory.");
    } catch (err) {
      console.warn("  ⚠ Could not purge .next/cache directly (may be in active use by dev server):", err.message);
    }
  } else {
    console.log("  ✓ .next/cache is already clean.");
  }
}

async function run() {
  console.log("=================================================");
  console.log("   GPHOSTING: TOTAL CLOUD & DATABASE PURGE       ");
  console.log(`   Admin Email: ${adminEmail} (Preserved)       `);
  console.log("=================================================");

  await purgeR2();
  await purgeRedis();
  await purgeSupabase();
  cleanLocalCache();

  console.log("\n=================================================");
  console.log("✓ ALL STORAGE, CACHE, AND DATABASE DATA PURGED!  ");
  console.log("  Your environment is 100% fresh and ready to    ");
  console.log("  test all dynamic flows from scratch.           ");
  console.log("=================================================\n");
}

run().catch((err) => {
  console.error("Purge encountered fatal error:", err);
  process.exit(1);
});
