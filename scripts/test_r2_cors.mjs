import fs from "fs";

// Load environment variables from .env.local
const envFile = fs.readFileSync(".env.local", "utf-8");
envFile
  .split("\n")
  .filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
  .forEach((l) => {
    const key = l.slice(0, l.indexOf("=")).trim();
    let val = l.slice(l.indexOf("=") + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  });

const { createPresignedPutUrl, generateR2ObjectKey } = await import("../lib/storage/r2.ts");

async function checkCors() {
  console.log("Checking Cloudflare R2 CORS configuration for bucket: gphosting-files...\n");

  const testKey = generateR2ObjectKey("test-cors-check", "cors-check.tmp");
  const presignedUrl = await createPresignedPutUrl(testKey, "text/plain", 120);

  try {
    const res = await fetch(presignedUrl, {
      method: "OPTIONS",
      headers: {
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type",
      },
    });

    const allowOrigin = res.headers.get("access-control-allow-origin");
    const allowMethods = res.headers.get("access-control-allow-methods");
    const exposeHeaders = res.headers.get("access-control-expose-headers");

    if (res.status >= 200 && res.status < 300) {
      console.log("✅ CORS IS SUCCESSFULLY CONFIGURED AND ACTIVE!");
      console.log(`- Status: HTTP ${res.status}`);
      console.log(`- Access-Control-Allow-Origin: ${allowOrigin}`);
      console.log(`- Access-Control-Allow-Methods: ${allowMethods}`);
      console.log(`- Access-Control-Expose-Headers: ${exposeHeaders}`);
      console.log("\nBrowser direct uploads will now succeed!");
    } else {
      console.log(`❌ CORS is NOT working yet (HTTP ${res.status}).`);
      const body = await res.text();
      if (body) {
        console.log(`- Response: ${body}`);
      }
      console.log("\nPlease follow the Cloudflare Dashboard link to add the CORS policy.");
    }
  } catch (err) {
    console.log("❌ Network error checking CORS:", err.message);
  }
}

checkCors();
