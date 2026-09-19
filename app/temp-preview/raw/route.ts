import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "temp-test", "index.html");
    const html = await fs.readFile(filePath, "utf-8");

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse(
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Temp Test File Not Found</title>
  <style>
    body { font-family: sans-serif; background: #090d16; color: #f1f5f9; padding: 2rem; text-align: center; }
    .card { max-width: 500px; margin: 4rem auto; padding: 2rem; background: #1e293b; border-radius: 1rem; border: 1px solid #334155; }
    code { color: #38bdf8; background: #0f172a; padding: 0.2rem 0.4rem; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>temp-test/index.html not found</h2>
    <p>Please make sure <code>temp-test/index.html</code> exists in the root of the project.</p>
    <p style="font-size: 0.8rem; color: #94a3b8;">${message}</p>
  </div>
</body>
</html>`,
      {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  }
}
