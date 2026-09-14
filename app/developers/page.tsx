import Link from "next/link";
import { ArrowLeft, Code2, Terminal, ShieldAlert } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

export default function DevelopersPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased transition-colors duration-200">
      <header className="h-16 border-b border-border/80 bg-background/80 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-50">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Home</span>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            API Reference
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto py-12 px-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 text-xs font-medium mb-4">
          <Code2 className="w-3.5 h-3.5" />
          <span>How it Works</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-3">
          How GPHosting Works
        </h1>
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed mb-10">
          A simple guide to direct uploads, secure link sharing, and API endpoints.
        </p>

        <div className="space-y-12 text-muted-foreground text-sm">
          {/* Section 1: Overview */}
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Terminal className="w-5 h-5 text-blue-500 dark:text-blue-400" />
              <span>1. Direct Upload Process</span>
            </h2>
            <p>
              To make uploads as fast as possible, files stream directly from your browser to Cloudflare R2 storage.
              Your file content never passes through our application servers.
            </p>

            <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3 font-mono text-xs">
              <div className="text-foreground font-sans font-semibold text-sm">How an upload happens:</div>
              <ol className="list-decimal pl-5 space-y-1.5 text-muted-foreground">
                <li>Your browser asks for an upload slot (<span className="text-blue-600 dark:text-blue-400">POST /api/files/initiate-upload</span>).</li>
                <li>The server checks your storage quota and gives you a temporary, secure direct-upload link.</li>
                <li>Your browser uploads the file directly to storage.</li>
                <li>Your browser notifies the server that the upload is done (<span className="text-blue-600 dark:text-blue-400">POST /api/files/complete-upload</span>).</li>
              </ol>
            </div>
          </section>

          {/* Section 2: Endpoints Table */}
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-foreground">2. Main API Endpoints</h2>
            <div className="overflow-x-auto border border-border rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted text-muted-foreground border-b border-border font-medium">
                  <tr>
                    <th className="p-3">Endpoint</th>
                    <th className="p-3">Method</th>
                    <th className="p-3">Access</th>
                    <th className="p-3">Limit</th>
                    <th className="p-3">What it does</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono">
                  <tr>
                    <td className="p-3 text-foreground font-semibold">/api/files/initiate-upload</td>
                    <td className="p-3 text-amber-500 font-bold">POST</td>
                    <td className="p-3 text-muted-foreground">Logged in</td>
                    <td className="p-3 text-muted-foreground">30 / hr</td>
                    <td className="p-3 text-muted-foreground font-sans">Start an upload and get a direct upload link.</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-foreground font-semibold">/api/files/complete-upload</td>
                    <td className="p-3 text-amber-500 font-bold">POST</td>
                    <td className="p-3 text-muted-foreground">Logged in</td>
                    <td className="p-3 text-muted-foreground">60 / hr</td>
                    <td className="p-3 text-muted-foreground font-sans">Confirm upload is finished and save the file.</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-foreground font-semibold">/api/share/create</td>
                    <td className="p-3 text-amber-500 font-bold">POST</td>
                    <td className="p-3 text-muted-foreground">Logged in</td>
                    <td className="p-3 text-muted-foreground">60 / hr</td>
                    <td className="p-3 text-muted-foreground font-sans">Create a share link with password/expiry.</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-foreground font-semibold">/api/share/[slug]</td>
                    <td className="p-3 text-blue-500 font-bold">GET</td>
                    <td className="p-3 text-emerald-600 dark:text-emerald-400">Public</td>
                    <td className="p-3 text-muted-foreground">120 / min</td>
                    <td className="p-3 text-muted-foreground font-sans">Get public details for a shared file.</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-foreground font-semibold">/api/share/[slug]/claim</td>
                    <td className="p-3 text-amber-500 font-bold">POST</td>
                    <td className="p-3 text-emerald-600 dark:text-emerald-400">Public</td>
                    <td className="p-3 text-muted-foreground">10 / min</td>
                    <td className="p-3 text-muted-foreground font-sans">Get a temporary download link.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 3: Security */}
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              <span>3. Key Security Features</span>
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-foreground">Safe Downloads:</strong> All files download as attachments to prevent potentially dangerous scripts from opening in your browser.
              </li>
              <li>
                <strong className="text-foreground">Self-Destructing Links:</strong> Once a single-use file is downloaded, its link expires immediately.
              </li>
              <li>
                <strong className="text-foreground">Protected Storage:</strong> Internal storage paths and server keys are never sent to the browser.
              </li>
            </ul>
          </section>
        </div>
      </main>

      <footer className="border-t border-border py-8 px-6 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} GPHosting. Simple, Fast &amp; Private.
      </footer>
    </div>
  );
}
