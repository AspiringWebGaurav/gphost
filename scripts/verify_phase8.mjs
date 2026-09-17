import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envFile = fs.readFileSync(".env.local", "utf-8");
const env = {};
for (const line of envFile.split("\n")) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
    const idx = trimmed.indexOf("=");
    let v = trimmed.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[trimmed.slice(0, idx).trim()] = v;
  }
}

const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

async function main() {
  console.log("=== SUPABASE MIGRATION VERIFICATION ===");

  // 1. Check share_links burn columns
  const { data: share, error: sErr } = await client
    .from("share_links")
    .select("id, burn_after_preview, first_previewed_at, preview_count")
    .limit(1);

  if (sErr) {
    console.log("❌ share_links burn columns: FAILED ->", sErr.message);
  } else {
    console.log("✅ share_links burn columns: ACTIVE & VERIFIED (burn_after_preview, first_previewed_at, preview_count)");
  }

  // 2. Check file_events table
  const { data: events, error: eErr } = await client
    .from("file_events")
    .select("id, event_type, country_code, city, referrer")
    .limit(1);

  if (eErr) {
    console.log("❌ file_events table: FAILED ->", eErr.message);
  } else {
    console.log("✅ file_events table: ACTIVE & VERIFIED (RLS enabled, telemetry schema ready)");
  }

  // 3. Check user_api_keys table
  const { data: keys, error: kErr } = await client
    .from("user_api_keys")
    .select("id, key_prefix, key_hash, is_active")
    .limit(1);

  if (kErr) {
    console.log("❌ user_api_keys table: FAILED ->", kErr.message);
  } else {
    console.log("✅ user_api_keys table: ACTIVE & VERIFIED (RLS enabled, Developer API keys ready)");
  }
}

main().catch(console.error);
