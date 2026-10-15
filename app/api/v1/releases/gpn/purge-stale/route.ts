import { NextRequest } from "next/server";
import { POST as dynamicPost, GET as dynamicGet } from "../../[appId]/purge-stale/route";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return dynamicPost(req, { params: Promise.resolve({ appId: "gpn" }) });
}

export async function GET(req: NextRequest) {
  return dynamicGet(req, { params: Promise.resolve({ appId: "gpn" }) });
}
