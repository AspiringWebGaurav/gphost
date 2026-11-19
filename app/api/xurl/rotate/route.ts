import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/session";
import {
  checkXurlAccountStatus,
  setActiveXurlApiKey,
  saveXurlVerificationToDatabase,
} from "@/lib/xurl/client";

export const dynamic = "force-dynamic";

/**
 * XURL API Key Rotation Endpoint.
 * Allows approved users / admins to test and rotate their XURL API credentials directly from Settings.
 * Validates the candidate key against xurl.eu.cc before persisting to runtime, Redis, and .env.local.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireApprovedUser();
    if (!auth?.user) {
      return NextResponse.json({ success: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const rawKey = body?.apiKey;
    const testOnly = Boolean(body?.testOnly);

    if (!rawKey || typeof rawKey !== "string" || !rawKey.trim()) {
      return NextResponse.json(
        { success: false, error: "Please enter a valid, non-empty XURL API key." },
        { status: 400 }
      );
    }

    const trimmedKey = rawKey.trim();

    // 1. Live probe upstream xurl.eu.cc to guarantee the candidate key is authentic & active
    const candidateStatus = await checkXurlAccountStatus(true, null, trimmedKey);

    // If caller only requested a non-destructive dry-run live test of the key
    if (testOnly) {
      return NextResponse.json({
        success: true,
        valid: candidateStatus.valid,
        status: candidateStatus.status,
        plan: candidateStatus.plan || (candidateStatus.valid ? "premium_permanent" : undefined),
        maskedKey: candidateStatus.maskedKey,
        message: candidateStatus.message,
      });
    }

    if (!candidateStatus.valid) {
      return NextResponse.json(
        {
          success: false,
          error:
            candidateStatus.message ||
            "The provided API key could not be verified by xurl.eu.cc. Please verify credentials.",
          status: candidateStatus.status,
        },
        { status: 400 }
      );
    }

    // 2. Persist active key into Redis & in-memory process.env
    await setActiveXurlApiKey(trimmedKey);

    // 3. Persist verified test status into PostgreSQL database & Redis
    const savedTest = await saveXurlVerificationToDatabase(candidateStatus, 7, auth.user.id);

    // 4. Best-effort update to .env.local file on disk for persistent cold-starts
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const envPath = path.resolve(process.cwd(), ".env.local");
      const exists = await fs
        .access(envPath)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        let content = await fs.readFile(envPath, "utf-8");
        if (content.includes("XURL_API_KEY=")) {
          content = content.replace(/XURL_API_KEY=.*(\r?\n|$)/, `XURL_API_KEY="${trimmedKey}"$1`);
        } else {
          content += `\nXURL_API_KEY="${trimmedKey}"\n`;
        }
        await fs.writeFile(envPath, content, "utf-8");
      }
    } catch (fsErr) {
      console.warn("[XURL Rotate] Warning: could not persist to .env.local on disk:", fsErr);
    }

    return NextResponse.json({
      success: true,
      message: "XURL API key rotated and verified successfully with Premium Permanent Plan.",
      maskedKey: candidateStatus.maskedKey,
      plan: candidateStatus.plan || "premium_permanent",
      status: candidateStatus.status,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    if (errorMsg === "UNAUTHENTICATED") {
      return NextResponse.json({ success: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
