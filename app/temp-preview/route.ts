import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // 1. Strict Cost & Quota Defense: Never run or execute in production (0 bill, 0 invocations)
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const filePath = path.join(process.cwd(), "temp-test", "index.html");

  // 2. On-demand single check (fired ONLY when user switches tabs/focuses the window)
  if (req.nextUrl.searchParams.has("check-mtime")) {
    try {
      const stat = await fs.stat(filePath);
      return NextResponse.json({ mtime: stat.mtimeMs });
    } catch {
      return NextResponse.json({ mtime: 0 });
    }
  }

  try {
    let html = await fs.readFile(filePath, "utf-8");

    // 3. Zero-Polling Smart Watcher:
    // NO setInterval loops. NO background hammering. NO terminal log spam.
    // Checks ONCE only when you switch focus from your code editor back to the browser window!
    const smartFocusReloadSnippet = `
  <!-- GPHost Zero-Overhead Live Watcher (Zero background polling) -->
  <script id="gphost-smart-watcher">
    (() => {
      let initialMtime = null;
      let checking = false;

      async function checkOnFocus() {
        if (checking) return;
        checking = true;
        try {
          const res = await fetch('/temp-preview?check-mtime=1', { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            if (initialMtime !== null && data.mtime && data.mtime !== initialMtime) {
              console.log('[GPHost] File updated on disk, refreshing view...');
              window.location.reload();
            }
            initialMtime = data.mtime;
          }
        } catch (e) {
        } finally {
          checking = false;
        }
      }

      // 1. Initial snapshot on page load
      checkOnFocus();

      // 2. Only checks ONCE when you Alt+Tab / focus back to Chrome (Zero requests while typing code)
      window.addEventListener('focus', checkOnFocus);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) checkOnFocus();
      });
    })();
  </script>
`;

    if (html.includes("</body>")) {
      html = html.replace("</body>", `${smartFocusReloadSnippet}\n</body>`);
    } else {
      html += smartFocusReloadSnippet;
    }

    const res = new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Access-Control-Allow-Origin": "*",
      },
    });

    res.headers.delete("Content-Security-Policy");
    return res;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse(
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>temp-test/index.html not found</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #020617; color: #f8fafc; padding: 2rem; text-align: center; }
    .card { max-width: 540px; margin: 5rem auto; padding: 2.5rem; background: #0f172a; border-radius: 1.5rem; border: 1px solid #1e293b; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
    h2 { color: #f43f5e; margin-top: 0; }
    code { color: #38bdf8; background: #020617; padding: 0.2rem 0.5rem; border-radius: 6px; font-family: monospace; }
  </style>
</head>
<body>
  <div class="card">
    <h2>temp-test/index.html not found</h2>
    <p>Please make sure <code>temp-test/index.html</code> exists in the root of your repository.</p>
    <p style="font-size: 0.85rem; color: #94a3b8; margin-top: 1.5rem;">${message}</p>
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
