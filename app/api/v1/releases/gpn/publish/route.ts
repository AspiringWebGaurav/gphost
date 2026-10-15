import { NextRequest } from "next/server";
import { POST as dynamicPost } from "../../[appId]/publish/route";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return dynamicPost(req, { params: Promise.resolve({ appId: "gpn" }) });
}
