import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Logout Route Handler:
 * Clears the server session and invalidates auth cookies.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Return clean JSON response or redirect based on request
  const acceptHeader = request.headers.get("accept") || "";
  if (acceptHeader.includes("text/html")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.json({ success: true, message: "Logged out successfully" });
}
