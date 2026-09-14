import { NextRequest } from "next/server";
import { DELETE as deleteShareLink } from "../route";

export const dynamic = "force-dynamic";

/**
 * Revoke route handler that delegates to nuclear DELETE
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  return deleteShareLink(req, context);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  return deleteShareLink(req, context);
}
