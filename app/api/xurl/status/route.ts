import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { checkXurlAccountStatus } from "@/lib/xurl/client";

export const dynamic = "force-dynamic";

/**
 * Live XURL Account & Plan Status Endpoint.
 * Informs authenticated clients whether XURL API key is active, account is valid on xurl.eu.cc,
 * and confirms link lifecycle permissions.
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const forceFresh = searchParams.get("fresh") === "1" || searchParams.get("force") === "true";

    const status = await checkXurlAccountStatus(forceFresh);
    return NextResponse.json(
      {
        success: true,
        ...status,
      },
      {
        headers: {
          "Cache-Control": forceFresh
            ? "no-store, no-cache, must-revalidate"
            : "private, max-age=60, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
