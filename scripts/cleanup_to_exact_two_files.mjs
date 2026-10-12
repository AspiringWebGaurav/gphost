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

console.log("=== GPHOST RELEASES CLEANUP: ENSURE EXACTLY 2 ISOLATED FILES ===");

// 1. Fetch all releases for GPN to determine the active latest version
const { data: gpnReleases, error: relErr } = await supabase
  .from("app_releases")
  .select("*")
  .eq("app_id", "gpn")
  .order("created_at", { ascending: false });

if (relErr) {
  console.error("Error fetching releases:", relErr);
  process.exit(1);
}

// Find Base 0.0.0 release
const baseRelease = (gpnReleases || []).find((r) => r.version === "0.0.0");
// Find latest non-base release
const latestActiveOta = (gpnReleases || []).find((r) => r.version !== "0.0.0");

// 2. Fetch all files
const { data: allFiles, error: fErr } = await supabase.from("files").select("*, share_links(slug)");
if (fErr) {
  console.error("Error fetching files:", fErr);
  process.exit(1);
}

// Identify Base 0.0.0 file
const baseFile = (allFiles || []).find((f) => {
  const shareList = Array.isArray(f.share_links) ? f.share_links : f.share_links ? [f.share_links] : [];
  return shareList.some((s) => s.slug === "gpn-app") || (f.sanitized_name || "").includes("0.0.0") || f.id === baseRelease?.binary_file_id;
});

// Identify Active OTA file
const activeOtaFile = (allFiles || []).find((f) => {
  if (baseFile && f.id === baseFile.id) return false;
  return f.id === latestActiveOta?.binary_file_id || (latestActiveOta && (f.sanitized_name || "").includes(latestActiveOta.version));
});

console.log(`Preserving Base 0.0.0 file: ${baseFile ? baseFile.id + ' (' + baseFile.sanitized_name + ')' : 'None found'}`);
console.log(`Preserving Active OTA file: ${activeOtaFile ? activeOtaFile.id + ' (' + activeOtaFile.sanitized_name + ')' : 'None found'}`);

const preservedIds = new Set([baseFile?.id, activeOtaFile?.id].filter(Boolean));

const filesToDelete = (allFiles || []).filter((f) => !preservedIds.has(f.id));

console.log(`\nFound ${filesToDelete.length} obsolete files to delete:`);
for (const f of filesToDelete) {
  console.log(` - ${f.id} (${f.byte_size} bytes, ${f.sanitized_name || f.filename}, R2: ${f.storage_key || f.r2_key})`);
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

// 3. Ensure share_link for slug 'gpn-app' strictly points to Base 0.0.0
if (baseFile) {
  console.log("\nEnsuring vanity link '/raw/gpn-app' is strictly anchored to Base 0.0.0...");
  await supabase.from("share_links").delete().eq("slug", "gpn-app");

  const crypto = await import("crypto");
  const tokenHash = crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex");

  const { data: newLink, error: linkErr } = await supabase
    .from("share_links")
    .insert({
      file_id: baseFile.id,
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
}

// 4. Update app_releases table to ensure only Base 0.0.0 and active OTA remain
console.log("\nVerifying app_releases integrity...");
if (latestActiveOta) {
  await supabase
    .from("app_releases")
    .update({ is_active: true })
    .eq("id", latestActiveOta.id);
  console.log(`✓ Preserved active OTA release v${latestActiveOta.version}`);
}

// 5. Recalculate profile storage usage
const { data: remainingFiles } = await supabase.from("files").select("byte_size");
const totalUsed = (remainingFiles || []).reduce((sum, f) => sum + (f.byte_size || 0), 0);

await supabase
  .from("profiles")
  .update({ storage_used_bytes: totalUsed, updated_at: new Date().toISOString() })
  .eq("email", "gauravpatil5737@gmail.com");

console.log(`\n✓ Profile storage_used_bytes updated to exactly ${totalUsed} bytes (${(totalUsed / (1024 * 1024)).toFixed(2)} MB).`);

// 6. Verify remaining files count
const { data: finalFiles } = await supabase.from("files").select("id, sanitized_name, byte_size, r2_key");
console.log(`\nFinal Files Count in Database: ${finalFiles?.length} (Expected: 2)`);
for (const f of finalFiles || []) {
  console.log(` - ID: ${f.id} | ${f.sanitized_name} (${(f.byte_size / (1024 * 1024)).toFixed(2)} MB)`);
}
