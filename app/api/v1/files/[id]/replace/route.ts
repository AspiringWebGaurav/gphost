import { NextRequest } from "next/server";
import { POST as handleReplace } from "@/app/api/v1/replace/route";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    if (!formData.has("target")) {
      formData.set("target", id);
    }
    const modifiedReq = new NextRequest(req.url, {
      method: "POST",
      headers: req.headers,
      body: formData,
    });
    return handleReplace(modifiedReq);
  } else {
    const body = await req.json().catch(() => ({}));
    body.target = id;
    const modifiedReq = new NextRequest(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(body),
    });
    return handleReplace(modifiedReq);
  }
}
