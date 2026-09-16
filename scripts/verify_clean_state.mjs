import { createClient } from "@supabase/supabase-js";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Redis } from "@upstash/redis";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL.replace(/^["']|["']$/g, ""),
  token: process.env.UPSTASH_REDIS_REST_TOKEN.replace(/^["']|["']$/g, ""),
});

async function verify() {
  const { count: fCount } = await sb.from("files").select("*", { count: "exact", head: true });
  const { count: sCount } = await sb.from("share_links").select("*", { count: "exact", head: true });
  const { count: rCount } = await sb.from("access_requests").select("*", { count: "exact", head: true });
  const { count: pCount } = await sb.from("onboarding_pins").select("*", { count: "exact", head: true });
  const { count: aCount } = await sb.from("audit_logs").select("*", { count: "exact", head: true });
  const { data: profiles } = await sb.from("profiles").select("email, role, status, storage_used_bytes");
  const { data: authData } = await sb.auth.admin.listUsers();
  const r2Res = await r2.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME || "gphosting-files" }));
  const redisKeys = await redis.keys("*");

  console.log("\n=================================================");
  console.log("   CLEAN STATE VERIFICATION REPORT              ");
  console.log("=================================================");
  console.log(`Cloudflare R2 Objects: ${r2Res.KeyCount || 0}`);
  console.log(`Upstash Redis Keys:    ${redisKeys.length}`);
  console.log(`Files in Database:     ${fCount}`);
  console.log(`Share Links in DB:     ${sCount}`);
  console.log(`Access Requests in DB: ${rCount}`);
  console.log(`Onboarding PINs in DB: ${pCount}`);
  console.log(`Audit Logs in DB:      ${aCount}`);
  console.log(`Auth Users in Auth:    ${authData?.users?.length || 0}`);
  authData?.users?.forEach((u) => console.log(`  - ${u.email} (${u.id})`));
  console.log(`Profiles in DB:        ${profiles?.length || 0}`);
  profiles?.forEach((p) => console.log(`  - ${p.email}: role=${p.role}, status=${p.status}, used=${p.storage_used_bytes} B`));
  console.log("=================================================\n");
}

verify().catch(console.error);
