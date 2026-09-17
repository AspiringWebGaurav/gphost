import fs from "node:fs";
import crypto from "node:crypto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Parse .env.local
const envFile = fs.readFileSync(".env.local", "utf-8");
const env: Record<string, string> = {};
for (const line of envFile.split("\n")) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
}

export const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_SECRET_KEY = env.SUPABASE_SECRET_KEY;
export const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const R2_ENDPOINT = env.R2_ENDPOINT;
export const R2_ACCESS_KEY_ID = env.R2_ACCESS_KEY_ID;
export const R2_SECRET_ACCESS_KEY = env.R2_SECRET_ACCESS_KEY;
export const R2_BUCKET_NAME = env.R2_BUCKET_NAME || "gphosting-files";
export const REDIS_URL = env.UPSTASH_REDIS_REST_URL;
export const REDIS_TOKEN = env.UPSTASH_REDIS_REST_TOKEN;

export const adminClient: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

export const s3 = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export const redis = REDIS_URL && REDIS_TOKEN ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN }) : null;

export interface TestFixture {
  userId: string;
  fileId: string;
  shareId: string;
  slug: string;
  r2Key: string;
  apiKeyId: string;
  apiKeyRaw: string;
  apiKeyHash: string;
}

export async function createTestFixture(): Promise<TestFixture> {
  // Find an existing approved user (e.g. admin or regular user)
  const { data: users, error: uErr } = await adminClient
    .from("profiles")
    .select("id")
    .eq("status", "approved")
    .limit(1);

  if (uErr || !users || users.length === 0) {
    throw new Error("No approved user found in database to attach test fixtures.");
  }
  const userId = users[0].id;

  // 1. Upload sample object directly to R2
  const r2Key = `test-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.txt`;
  const fileContent = "Hello GPHost CDN & E2E Testing! Verified Edge Content.";
  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
      Body: Buffer.from(fileContent),
      ContentType: "text/plain",
    })
  );

  // 2. Insert test file in database
  const fileId = crypto.randomUUID();
  const { error: fErr } = await adminClient.from("files").insert({
    id: fileId,
    user_id: userId,
    filename: "test-sample.txt",
    sanitized_name: "test-sample.txt",
    mime_type: "text/plain",
    byte_size: Buffer.byteLength(fileContent),
    r2_key: r2Key,
    status: "ACTIVE",
    expiry_preset: "24h",
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  });
  if (fErr) throw fErr;

  // 3. Insert test share link
  const shareId = crypto.randomUUID();
  const slug = `t_${crypto.randomBytes(4).toString("hex")}`;
  const { error: sErr } = await adminClient.from("share_links").insert({
    id: shareId,
    file_id: fileId,
    slug,
    token_hash: crypto.randomBytes(32).toString("hex"),
    is_active: true,
    max_downloads: 100,
  });
  if (sErr) throw sErr;

  // 4. Generate test API key & seed Redis cache
  const apiKeyId = crypto.randomUUID();
  const rawKey = `gp_live_${crypto.randomBytes(24).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  if (redis) {
    await redis.set(
      `apikey:${keyHash}`,
      {
        userId,
        profile: { id: userId, email: "test@example.com", role: "admin", status: "approved" },
        keyId: apiKeyId,
      },
      { ex: 3600 }
    );
  }

  // Attempt database insertion if user_api_keys table exists
  try {
    await adminClient.from("user_api_keys").insert({
      id: apiKeyId,
      user_id: userId,
      name: "Playwright Automated Test Key",
      key_prefix: rawKey.slice(0, 12),
      key_hash: keyHash,
    });
  } catch {
    // Non-blocking fallback
  }

  return {
    userId,
    fileId,
    shareId,
    slug,
    r2Key,
    apiKeyId,
    apiKeyRaw: rawKey,
    apiKeyHash: keyHash,
  };
}

export async function cleanupTestFixture(fixture: TestFixture): Promise<void> {
  try {
    if (fixture.r2Key) {
      await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: fixture.r2Key })).catch(() => {});
    }
    if (fixture.shareId) {
      await adminClient.from("share_links").delete().eq("id", fixture.shareId);
    }
    if (fixture.fileId) {
      await adminClient.from("file_events").delete().eq("file_id", fixture.fileId);
      await adminClient.from("files").delete().eq("id", fixture.fileId);
    }
    if (fixture.apiKeyId) {
      await adminClient.from("user_api_keys").delete().eq("id", fixture.apiKeyId);
    }
    if (redis && fixture.apiKeyHash) {
      await redis.del(`apikey:${fixture.apiKeyHash}`).catch(() => {});
    }
  } catch (err) {
    console.error("Warning during test fixture cleanup:", err);
  }
}
