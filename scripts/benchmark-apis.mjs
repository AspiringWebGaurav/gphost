import fs from "node:fs";
import http from "node:http";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Parse .env.local
const envFile = fs.readFileSync(".env.local", "utf-8");
const env = {};
for (const line of envFile.split("\n")) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
    const idx = trimmed.indexOf("=");
    const k = trimmed.slice(0, idx).trim();
    let v = trimmed.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
}

const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);
const s3 = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});
const redis = env.UPSTASH_REDIS_REST_URL ? new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }) : null;
const R2_BUCKET = env.R2_BUCKET_NAME || "gphosting-files";
const BASE_URL = "http://127.0.0.1:3000";

async function measureHttp(method, path, headers = {}, body = null) {
  const start = performance.now();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
    redirect: "manual",
  });
  const duration = performance.now() - start;
  const text = await res.text();
  return { status: res.status, duration, headers: Object.fromEntries(res.headers.entries()), bodyLength: text.length };
}

function calculateStats(latencies) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const avg = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
  return { min, max, p50, p95, p99, avg };
}

async function run() {
  console.log("==================================================================");
  console.log("  GPHOST PRODUCTION API BOTTLENECK & SCALING BENCHMARK");
  console.log("==================================================================");

  // 1. Setup Benchmark Fixture
  const { data: users } = await adminClient.from("profiles").select("id").eq("status", "approved").limit(1);
  const userId = users[0].id;

  const r2Key = `bench-${Date.now()}.png`;
  const pngBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );
  await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: r2Key, Body: pngBuffer, ContentType: "image/png" }));

  const fileId = crypto.randomUUID();
  await adminClient.from("files").insert({
    id: fileId,
    user_id: userId,
    filename: "benchmark-asset.png",
    sanitized_name: "benchmark-asset.png",
    mime_type: "image/png",
    byte_size: pngBuffer.length,
    r2_key: r2Key,
    status: "ACTIVE",
    expiry_preset: "24h",
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  });

  const slug = `bench_${crypto.randomBytes(4).toString("hex")}`;
  const shareId = crypto.randomUUID();
  await adminClient.from("share_links").insert({
    id: shareId,
    file_id: fileId,
    slug,
    token_hash: crypto.randomBytes(32).toString("hex"),
    is_active: true,
    max_downloads: 1000,
  });

  const rawKey = `gp_live_${crypto.randomBytes(24).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  if (redis) {
    await redis.set(`api_key:${keyHash}`, { userId, keyId: "bench-key", name: "Benchmark Key" }, { ex: 3600 });
  }

  // Pre-seed Redis cache for raw slug
  if (redis) {
    await redis.set(`raw_slug:${slug}`, { r2Key, sanitizedName: "benchmark-asset.png", mimeType: "image/png" }, { ex: 300 });
  }

  const ITERATIONS = 15;
  const results = {};

  const endpoints = [
    {
      name: "Direct CDN Raw Access (/raw/[slug]) [Cached Edge]",
      method: "GET",
      path: `/raw/${slug}`,
      headers: {},
      body: null,
    },
    {
      name: "Smart Preview URL (/api/share/[slug]/preview)",
      method: "GET",
      path: `/api/share/${slug}/preview`,
      headers: {},
      body: null,
    },
    {
      name: "Claim Presigned Download URL (/api/share/[slug]/claim)",
      method: "POST",
      path: `/api/share/${slug}/claim`,
      headers: { "Content-Type": "application/json" },
      body: {},
    },
    {
      name: "Developer API Key Presigned Negotiation (/api/v1/upload)",
      method: "POST",
      path: "/api/v1/upload",
      headers: {
        Authorization: `Bearer ${rawKey}`,
        "Content-Type": "application/json",
      },
      body: {
        filename: "dataset.zip",
        size: 5000000,
        mimeType: "application/zip",
      },
    },
    {
      name: "Per-File Telemetry Analytics (/api/files/[id]/analytics)",
      method: "GET",
      path: `/api/files/${fileId}/analytics`,
      headers: {},
      body: null,
    },
  ];

  for (const ep of endpoints) {
    process.stdout.write(`Benchmarking ${ep.name}... `);
    // Warmup
    await measureHttp(ep.method, ep.path, ep.headers, ep.body);

    const latencies = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const res = await measureHttp(ep.method, ep.path, ep.headers, ep.body);
      latencies.push(res.duration);
    }
    const stats = calculateStats(latencies);
    results[ep.name] = stats;
    console.log(`p50: ${stats.p50.toFixed(1)}ms | p95: ${stats.p95.toFixed(1)}ms | min: ${stats.min.toFixed(1)}ms`);
  }

  // Cleanup
  await adminClient.from("share_links").delete().eq("id", shareId);
  await adminClient.from("files").delete().eq("id", fileId);
  await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: r2Key })).catch(() => {});
  if (redis) {
    await redis.del(`api_key:${keyHash}`);
    await redis.del(`raw_slug:${slug}`);
  }

  console.log("\n==================================================================");
  console.log("  SUMMARY TABLE");
  console.log("==================================================================");
  console.table(
    Object.entries(results).map(([name, s]) => ({
      Endpoint: name,
      "Min (ms)": s.min.toFixed(1),
      "p50 (ms)": s.p50.toFixed(1),
      "p95 (ms)": s.p95.toFixed(1),
      "p99 (ms)": s.p99.toFixed(1),
      "Avg (ms)": s.avg.toFixed(1),
    }))
  );

  fs.writeFileSync("scripts/benchmark-results.json", JSON.stringify(results, null, 2));
}

run().catch(console.error);
