import { NextRequest } from "next/server";
import { GET as dynamicGet } from "../../../[appId]/download/[version]/route";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ version: string }> }
) {
  const { version } = await context.params;
  return dynamicGet(req, { params: Promise.resolve({ appId: "gpn", version }) });
}
