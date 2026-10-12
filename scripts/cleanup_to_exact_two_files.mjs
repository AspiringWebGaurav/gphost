import { createClient } from "@supabase/supabase-js";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const bucketName = process.env.R2_BUCKET_NAME || "gphosting-files";

const BASE_0_0_0_FILE_ID = "ba8b445b-5501-4a72-915a-772456b91282";
const ACTIVE_0_0_1_FILE_ID = "8de69735-ac7f-494f-a48a-f6a2990bd8bf";

console.log("=== GPHOST RELEASES CLEANUP: ENSURE EXACTLY 2 ISOLATED FILES ===");
console.log(`Preserving Base 0.0.0 file: ${BASE_0_0_0_FILE_ID}`);
console.log(`Preserving Active 0.0.1 file: ${ACTIVE_0_0_1_FILE_ID}`);

// 1. Fetch all files
const { data: allFiles, error: fErr } = await supabase.from("files").select("*");
if (fErr) {
  console.error("Error fetching files:", fErr);
  process.exit(1);
}

const filesToDelete = (allFiles || []).filter(
  (f) => f.id !== BASE_0_0_0_FILE_ID && f.id !== ACTIVE_0_0_1_FILE_ID
);

console.log(`\nFound ${filesToDelete.length} obsolete files to delete:`);
for (const f of filesToDelete) {
  console.log(` - ${f.id} (${f.byte_size} bytes, R2: ${f.storage_key || f.r2_key})`);
}

// 2. Delete each obsolete file from R2 and Supabase
for (const f of filesToDelete) {
  const r2Key = f.storage_key || f.r2_key;
  if (r2Key) {
    try {
      await r2.send(new DeleteObjectCommand({ Bucket: bucketName, Key: r2Key }));
      console.log(`  ✓ Deleted object from R2: ${r2Key}`);
    } catch (e) {
      console.warn(`  ! Could not delete R2 object ${r2Key}:`, e.message);
    }
  }

  // Delete related share_links
  await supabase.from("share_links").delete().eq("file_id", f.id);

  // Delete related app_releases if any
  await supabase.from("app_releases").delete().eq("binary_file_id", f.id);

  // Delete from files table
  const { error: delErr } = await supabase.from("files").delete().eq("id", f.id);
  if (delErr) {
    console.error(`  ✗ Error deleting file row ${f.id}:`, delErr.message);
  } else {
    console.log(`  ✓ Deleted DB record for file ${f.id}`);
  }
}

// 3. Ensure share_link for slug 'gpn-app' strictly points to BASE_0_0_0_FILE_ID
console.log("\nEnsuring vanity link '/raw/gpn-app' is strictly anchored to Base 0.0.0...");
// Delete any other share link that stole 'gpn-app'
await supabase.from("share_links").delete().eq("slug", "gpn-app");

// Re-create the permanent share link for gpn-app pointing to Base 0.0.0
const crypto = await import("crypto");
const tokenHash = crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex");

const { data: newLink, error: linkErr } = await supabase
  .from("share_links")
  .insert({
    file_id: BASE_0_0_0_FILE_ID,
    slug: "gpn-app",
    token_hash: tokenHash,
    is_active: true,
    expires_at: null,
  })
  .select()
  .single();

if (linkErr) {
  console.error("Error creating gpn-app share link:", linkErr.message);
} else {
  console.log("✓ Anchored 'gpn-app' slug permanently to Base 0.0.0:", newLink.id);
}

// Delete random single-use or test share links for the other files
await supabase.from("share_links").delete().neq("slug", "gpn-app");

// 4. Update app_releases table
console.log("\nConfiguring app_releases:");
// Ensure 0.0.0 record
await supabase
  .from("app_releases")
  .upsert(
    {
      app_id: "gpn",
      version: "0.0.0",
      binary_file_id: BASE_0_0_0_FILE_ID,
      binary_byte_size: 4477222,
      binary_sha256: "0d796a30ce6883efd567e1316248040092c35b87ec125df53e2f121dbefc78e9",
      is_active: false,
      is_published: true,
      release_notes: "v0.0.0: Base Release with Persistent Sidebar Update Badge",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "app_id,version" }
  );
console.log("✓ Configured v0.0.0 in app_releases (isolated base installer).");

// Ensure 0.0.1 active record
await supabase
  .from("app_releases")
  .upsert(
    {
      app_id: "gpn",
      version: "0.0.1",
      binary_file_id: ACTIVE_0_0_1_FILE_ID,
      binary_byte_size: 4476820,
      binary_sha256: "ce16faf65d49933c5c1e63f4dccd91789d2072f6184b4fb7216766d93353fdd2",
      is_active: true,
      is_published: true,
      release_notes: "v0.0.1: Quick Capture & Direct In-Place OTA Release",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "app_id,version" }
  );
console.log("✓ Configured v0.0.1 in app_releases (active OTA update).");

// 5. Recalculate profile storage usage
const { data: remainingFiles } = await supabase.from("files").select("byte_size");
const totalUsed = (remainingFiles || []).reduce((sum, f) => sum + (f.byte_size || 0), 0);

await supabase
  .from("profiles")
  .update({ storage_used_bytes: totalUsed, updated_at: new Date().toISOString() })
  .eq("email", "gauravpatil5737@gmail.com");

console.log(`\n✓ Profile storage_used_bytes updated to exactly ${totalUsed} bytes (${(totalUsed / (1024 * 1024)).toFixed(2)} MB).`);

// 6. Verify remaining files count
const { data: finalFiles } = await supabase.from("files").select("id, byte_size, storage_key");
console.log(`\nFinal Files Count in Database: ${finalFiles?.length} (Expected: 2)`);
for (const f of finalFiles || []) {
  console.log(` - ID: ${f.id} (${(f.byte_size / (1024 * 1024)).toFixed(2)} MB)`);
}
