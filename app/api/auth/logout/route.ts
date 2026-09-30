import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Logout Route Handler:
 * Clears the server session, invalidates auth cookies, and returns to landing page.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });

  const acceptHeader = request.headers.get("accept") || "";
  if (acceptHeader.includes("text/html")) {
    const redirectRes = NextResponse.redirect(new URL("/", request.url));
    redirectRes.cookies.delete("gphost_last_active");
    return redirectRes;
  }

  const response = NextResponse.json({ success: true, message: "Logged out successfully" });
  response.cookies.delete("gphost_last_active");
  return response;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const res = NextResponse.redirect(new URL("/", request.url));
  res.cookies.delete("gphost_last_active");
  return res;
}

