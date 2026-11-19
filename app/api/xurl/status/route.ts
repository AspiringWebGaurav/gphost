import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import {
  checkXurlAccountStatus,
  getSavedXurlVerification,
  saveXurlVerificationToDatabase,
  updateXurlVerificationInterval,
  getXurlCheckIntervalDays,
  getActiveXurlApiKey,
  maskApiKey,
} from "@/lib/xurl/client";

export const dynamic = "force-dynamic";

/**
 * XURL Account & Plan Status Endpoint.
 * - Non-fresh GET: loads the latest verified status from PostgreSQL database / Redis with interval countdown.
 * - Fresh GET (?fresh=1): runs live test against xurl.eu.cc and persists the result to the database.
 * - POST: updates the check interval (e.g. 7 days / 10 days) and recalculates the due date.
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const forceFresh = searchParams.get("fresh") === "1" || searchParams.get("force") === "true";
    const customInterval = searchParams.get("interval");
    const intervalDays = customInterval ? parseInt(customInterval, 10) : undefined;

    const apiKey = await getActiveXurlApiKey();
    const maskedKey = apiKey ? maskApiKey(apiKey) : "";

    if (forceFresh) {
      // 1. Run live test against upstream
      const liveStatus = await checkXurlAccountStatus(true);

      // 2. Persist test result into PostgreSQL audit_logs and Redis
      const savedTest = await saveXurlVerificationToDatabase(
        liveStatus,
        intervalDays,
        user.id
      );

      return NextResponse.json({
        success: true,
        configured: Boolean(apiKey),
        maskedKey,
        savedTest,
        isDue: false,
        intervalDays: savedTest.intervalDays,
        status: savedTest.status,
        valid: savedTest.valid,
        plan: savedTest.plan,
        message: savedTest.message,
      });
    }

    // Non-fresh: read saved verification from database / Redis
    const savedTest = await getSavedXurlVerification();
    const currentInterval = await getXurlCheckIntervalDays();

    return NextResponse.json({
      success: true,
      configured: Boolean(apiKey),
      maskedKey,
      savedTest,
      intervalDays: savedTest?.intervalDays ?? currentInterval,
      isDue: savedTest?.isDue ?? true,
      status: savedTest?.status,
      valid: savedTest?.valid ?? false,
      plan: savedTest?.plan,
      message: savedTest?.message || (savedTest ? "" : "Untested: run live test to verify."),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

/**
 * Updates the verification interval (e.g. 7 days or 10 days) and recalculates next due date.
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const intervalDays = parseInt(String(body?.intervalDays), 10);

    if (isNaN(intervalDays) || intervalDays <= 0 || intervalDays > 365) {
      return NextResponse.json(
        { success: false, error: "Invalid interval: must be between 1 and 365 days." },
        { status: 400 }
      );
    }

    const updated = await updateXurlVerificationInterval(intervalDays);

    return NextResponse.json({
      success: true,
      message: `Verification interval updated to ${intervalDays} days.`,
      intervalDays,
      savedTest: updated,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
