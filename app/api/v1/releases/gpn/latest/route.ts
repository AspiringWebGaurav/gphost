import { NextRequest } from "next/server";
import { GET as dynamicGet } from "../../[appId]/latest/route";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return dynamicGet(req, { params: Promise.resolve({ appId: "gpn" }) });
}
