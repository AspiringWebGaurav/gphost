import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getR2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/releases/gpn/latest
 * Automated release update endpoint for the Gaurav Personal Notes (GPN) desktop application.
 * Compatible with Tauri v2 autoupdater manifest specifications.
 */
export async function GET(req: NextRequest) {
  try {
    const adminClient = createAdminClient();

    // 1. Resolve active binary release (slug: 'gpn-app' or gpn executable)
    const { data: binShare } = await adminClient
      .from("share_links")
      .select(`
        id, slug, is_active,
        file:files (
          id, sanitized_name, filename, byte_size, sha256, updated_at, created_at, r2_key
        )
      `)
      .eq("slug", "gpn-app")
      .eq("is_active", true)
      .maybeSingle();

    const binFile = binShare?.file ? (Array.isArray(binShare.file) ? binShare.file[0] : binShare.file) : null;

    if (!binFile) {
      return NextResponse.json(
        { error: "No active GPN binary release available" },
        {
          status: 404,
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        }
      );
    }

    // 2. Resolve active signature file (slug: 'gpn-app-sig')
    const { data: sigShare } = await adminClient
      .from("share_links")
      .select(`
        id, slug, is_active,
        file:files (
          id, sanitized_name, r2_key
        )
      `)
      .eq("slug", "gpn-app-sig")
      .eq("is_active", true)
      .maybeSingle();

    const sigFile = sigShare?.file ? (Array.isArray(sigShare.file) ? sigShare.file[0] : sigShare.file) : null;
    let signatureString = "";

    if (sigFile && (sigFile as any).r2_key) {
      try {
        const r2Client = getR2Client();
        const s3Res = await r2Client.send(
          new GetObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: (sigFile as any).r2_key,
          })
        );
        if (s3Res.Body) {
          const sigBytes = await (s3Res.Body as any).transformToByteArray();
          signatureString = Buffer.from(sigBytes).toString("utf8").trim();
        }
      } catch (sigErr) {
        console.warn("Could not retrieve signature text:", sigErr);
      }
    }

    // 3. Extract semantic version from filename (e.g. gpn-setup-1.0.2.exe -> 1.0.2)
    const rawName = (binFile as any).sanitized_name || (binFile as any).filename || "";
    const versionMatch = rawName.match(/(\d+\.\d+\.\d+)/);
    const version = versionMatch ? versionMatch[1] : "1.0.0";

    const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const forwardedProto = req.headers.get("x-forwarded-proto") || (forwardedHost?.startsWith("localhost") ? "http" : "https");
    const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : (process.env.NEXT_PUBLIC_APP_URL || "https://gphost.eu.cc");

    const permanentDownloadUrl = `${origin}/raw/gpn-app`;

    const manifest = {
      version,
      notes: `Gaurav Personal Notes update v${version}`,
      pub_date: (binFile as any).updated_at || (binFile as any).created_at || new Date().toISOString(),
      platforms: {
        "windows-x86_64": {
          signature: signatureString,
          url: permanentDownloadUrl,
        },
      },
      file: {
        name: rawName,
        size: (binFile as any).byte_size,
        sha256: (binFile as any).sha256 || null,
        url: permanentDownloadUrl,
      },
    };

    return NextResponse.json(manifest, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err: unknown) {
    console.error("[GPN Latest Release] Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
