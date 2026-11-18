"use client";

import React, { useState, useEffect, useSyncExternalStore } from "react";
import {
  X,
  Terminal,
  Copy,
  Check,
  ShieldCheck,
} from "lucide-react";

interface TerminalUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = "curl" | "powershell" | "python" | "folders";

export function TerminalUploadModal({
  isOpen,
  onClose,
}: TerminalUploadModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("curl");
  const [apiKey, setApiKey] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "https://gphost.app"
  );

  useEffect(() => {
    // Try to fetch user's active API keys if available
    async function fetchKeys() {
      try {
        const res = await fetch("/api/user/api-keys");
        if (res.ok) {
          const data = await res.json();
          if (data.keys && data.keys.length > 0) {
            setApiKey(data.keys[0].masked_key || "gp_live_••••••••••••");
          }
        }
      } catch {
        // Fallback to placeholder
      }
    }

    if (isOpen) {
      void fetchKeys();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const displayKey = apiKey || "gp_live_YOUR_API_KEY";

  const snippets: Record<TabType, { code: string; language: string; filename: string }> = {
    curl: {
      language: "bash",
      filename: "terminal.sh",
      code: `# Standard file upload via curl (optional folder destination)
curl -X POST "${origin}/api/v1/upload" \\
  -H "Authorization: Bearer ${displayKey}" \\
  -F "file=@/path/to/document.pdf" \\
  -F "folder=documents/invoices" \\
  -F "expiry=30d"

# Tamper-Proof Mode (verifies SHA-256 integrity):
# HASH=$(sha256sum document.pdf | awk '{print $1}')
# curl -X POST "${origin}/api/v1/upload" \\
#   -H "Authorization: Bearer ${displayKey}" \\
#   -H "X-Content-SHA256: $HASH" \\
#   -F "file=@/path/to/document.pdf"`,
    },
    powershell: {
      language: "powershell",
      filename: "upload.ps1",
      code: `# Upload file using Windows PowerShell (optional folder)
$Headers = @{ Authorization = "Bearer ${displayKey}" }
$Form = @{
    file = Get-Item "C:\\path\\to\\document.pdf"
    folder = "documents/invoices"
    expiry = "30d"
}
Invoke-RestMethod -Uri "${origin}/api/v1/upload" -Method Post -Headers $Headers -Form $Form`,
    },
    python: {
      language: "python",
      filename: "upload.py",
      code: `import hashlib, requests

url = "${origin}/api/v1/upload"
with open("document.pdf", "rb") as f:
    content = f.read()

sha256 = hashlib.sha256(content).hexdigest()
headers = {
    "Authorization": "Bearer ${displayKey}",
    "X-Content-SHA256": sha256  # Anti-tamper verification
}
files = {"file": ("document.pdf", content)}
data = {"folder": "documents/invoices", "expiry": "30d"}

response = requests.post(url, headers=headers, files=files, data=data)
print(response.json())`,
    },
    folders: {
      language: "bash",
      filename: "folders.sh",
      code: `# 1. Create a folder (or subfolder hierarchy)
curl -X POST "${origin}/api/v1/folders" \\
  -H "Authorization: Bearer ${displayKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"path": "projects/v1"}'

# 2. Upload file into folder
curl -X POST "${origin}/api/v1/upload" \\
  -H "Authorization: Bearer ${displayKey}" \\
  -F "file=@document.pdf" \\
  -F "folder=projects/v1"

# 3. List folder hierarchy tree
curl -H "Authorization: Bearer ${displayKey}" \\
  "${origin}/api/v1/folders?tree=true"

# 4. Rename or move a folder
curl -X PATCH "${origin}/api/v1/folders" \\
  -H "Authorization: Bearer ${displayKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"path": "projects/v1", "newName": "v2"}'

# 5. Delete folder & contents recursively
curl -X DELETE "${origin}/api/v1/folders?path=projects/v2&recursive=true" \\
  -H "Authorization: Bearer ${displayKey}"`,
    },
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippets[activeTab].code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/45 dark:bg-black/65 backdrop-blur-md animate-in fade-in duration-150 overflow-y-auto"
    >
      <div className="relative w-full max-w-4xl lg:max-w-5xl bg-card/95 dark:bg-card/90 backdrop-blur-2xl border border-white/30 dark:border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden my-auto animate-in zoom-in-95 duration-150 ring-1 ring-black/5 dark:ring-white/5">
        {/* Ambient Top Glow */}
        <div className="absolute -top-24 -left-24 w-52 h-52 bg-blue-500/10 dark:bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-border/80 flex items-center justify-between bg-muted/20 shrink-0 relative z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Terminal className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-foreground">Upload via Terminal</h3>
                <span className="px-1.5 py-0.5 rounded-full text-[9.5px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1 shrink-0">
                  <ShieldCheck className="w-3 h-3" />
                  Anti-Tamper Active
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                Minimal cURL, PowerShell &amp; Python CLI snippets with SHA-256 integrity
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer shrink-0"
            title="Close (Esc)"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Symmetrical Horizontal Two-Column Side-by-Side Layout */}
        <div className="p-3.5 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4 items-stretch">
          {/* Left Column: Command Request Snippet */}
          <div className="rounded-xl border border-border/80 bg-muted/20 overflow-hidden shadow-2xs flex flex-col h-full min-h-[260px]">
            {/* Top Toolbar: Language Selector & Copy Button */}
            <div className="px-3 py-2 bg-muted/40 border-b border-border/70 flex items-center justify-between gap-2 shrink-0 h-10">
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-background/80 border border-border/60 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab("curl")}
                  className={`px-2 py-0.5 rounded-md font-mono text-[11px] transition cursor-pointer ${
                    activeTab === "curl"
                      ? "bg-muted text-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  cURL (Bash)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("powershell")}
                  className={`px-2 py-0.5 rounded-md font-mono text-[11px] transition cursor-pointer ${
                    activeTab === "powershell"
                      ? "bg-muted text-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  PowerShell
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("python")}
                  className={`px-2 py-0.5 rounded-md font-mono text-[11px] transition cursor-pointer ${
                    activeTab === "python"
                      ? "bg-muted text-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Python
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("folders")}
                  className={`px-2 py-0.5 rounded-md font-mono text-[11px] transition cursor-pointer ${
                    activeTab === "folders"
                      ? "bg-muted text-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Folders (API)
                </button>
              </div>

              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium text-foreground transition cursor-pointer shadow-2xs shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-500 font-medium">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            {/* Code Body */}
            <div className="p-3 bg-background font-mono text-[11px] sm:text-xs text-foreground/90 overflow-x-auto selection:bg-blue-500/20 leading-relaxed flex-1">
              <pre suppressHydrationWarning className="whitespace-pre">
                {snippets[activeTab].code.split("\n").map((line, idx) => {
                  const isComment = line.trim().startsWith("#");
                  return (
                    <div key={idx} className={isComment ? "text-muted-foreground/70" : "text-foreground/90"}>
                      {line || "\u00A0"}
                    </div>
                  );
                })}
              </pre>
            </div>
          </div>

          {/* Right Column: Expected JSON Response with Anti-Tamper Verification */}
          <div className="rounded-xl border border-border/80 bg-muted/20 overflow-hidden shadow-2xs flex flex-col h-full min-h-[260px]">
            {/* Top Toolbar: Status Header */}
            <div className="px-3 py-2 bg-muted/40 border-b border-border/70 flex items-center justify-between gap-2 shrink-0 h-10">
              <div className="flex items-center gap-1.5 font-mono text-xs">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  {activeTab === "folders" ? "HTTP 200/201" : "HTTP 201"}
                </span>
                <span className="text-xs font-semibold text-foreground">
                  {activeTab === "folders" ? "Folder REST Response" : "Expected JSON Response"}
                </span>
              </div>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold font-mono flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-500" />
                Anti-Tamper Verified
              </span>
            </div>

            {/* Response JSON Body */}
            <div className="p-3 bg-background font-mono text-[11px] sm:text-xs text-foreground/85 overflow-x-auto leading-relaxed flex-1">
              <pre suppressHydrationWarning className="whitespace-pre">
                {activeTab === "folders"
                  ? `{
  "success": true,
  "message": "Folder 'projects/v1' created successfully",
  "folder": {
    "name": "v1",
    "path": "projects/v1",
    "parent_path": "projects",
    "depth": 2
  }
}`
                  : `{
  "success": true,
  "fileId": "e4a7d65b-...",
  "filename": "document.pdf",
  "folder": "documents/invoices",
  "sha256": "e3b0c442...[sha256_hash]...",
  "integrity": "verified_authentic",
  "downloadUrl": "${origin}/f/a1b2c3d4",
  "rawUrl": "${origin}/raw/a1b2c3d4",
  "expiresAt": "2026-10-18T12:00:00.000Z"
}`}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground shrink-0">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="text-[11px] hidden sm:inline">Protected against tampering, executable execution, webshells &amp; DoS flood.</span>
            <span className="text-[11px] sm:hidden">Anti-Tamper protected.</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition text-xs font-semibold cursor-pointer shadow-xs active:scale-95"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
