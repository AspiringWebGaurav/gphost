"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Terminal,
  Copy,
  Check,
  Key,
} from "lucide-react";

interface TerminalUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = "curl" | "powershell" | "python";

export function TerminalUploadModal({
  isOpen,
  onClose,
}: TerminalUploadModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("curl");
  const [apiKey, setApiKey] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [origin] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return window.location.origin;
    }
    return "https://gphost.app";
  });

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

  if (!isOpen) return null;

  const displayKey = apiKey || "gp_live_YOUR_API_KEY";

  const snippets: Record<TabType, { code: string; language: string; filename: string }> = {
    curl: {
      language: "bash",
      filename: "terminal.sh",
      code: `# 1-line file upload via curl
curl -X POST "${origin}/api/v1/upload" \\
  -H "Authorization: Bearer ${displayKey}" \\
  -F "file=@/path/to/document.pdf" \\
  -F "expiry=30d"`,
    },
    powershell: {
      language: "powershell",
      filename: "upload.ps1",
      code: `# Upload file using Windows PowerShell
$Headers = @{ Authorization = "Bearer ${displayKey}" }
$Form = @{
    file = Get-Item "C:\\path\\to\\document.pdf"
    expiry = "30d"
}
Invoke-RestMethod -Uri "${origin}/api/v1/upload" -Method Post -Headers $Headers -Form $Form`,
    },
    python: {
      language: "python",
      filename: "upload.py",
      code: `import requests

url = "${origin}/api/v1/upload"
headers = {"Authorization": "Bearer ${displayKey}"}
files = {"file": open("document.pdf", "rb")}
data = {"expiry": "30d"}

response = requests.post(url, headers=headers, files=files, data=data)
print(response.json())`,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Upload via Terminal</h3>
              <p className="text-[11px] text-muted-foreground">Minimal cURL, PowerShell &amp; Python CLI snippets</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="px-5 pt-3 pb-2 flex items-center justify-between gap-2 border-b border-border/40">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted/50 text-xs">
            <button
              onClick={() => setActiveTab("curl")}
              className={`px-3 py-1 rounded-lg font-mono text-[11px] transition cursor-pointer ${
                activeTab === "curl"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              cURL (Bash)
            </button>
            <button
              onClick={() => setActiveTab("powershell")}
              className={`px-3 py-1 rounded-lg font-mono text-[11px] transition cursor-pointer ${
                activeTab === "powershell"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              PowerShell
            </button>
            <button
              onClick={() => setActiveTab("python")}
              className={`px-3 py-1 rounded-lg font-mono text-[11px] transition cursor-pointer ${
                activeTab === "python"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Python
            </button>
          </div>

          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted transition cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-500">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        {/* Code body */}
        <div className="p-4 bg-[#0d1117] text-zinc-100 font-mono text-xs overflow-x-auto selection:bg-blue-500/30">
          <pre className="whitespace-pre leading-relaxed">{snippets[activeTab].code}</pre>
        </div>

        {/* Expected JSON Response */}
        <div className="p-4 border-t border-border bg-muted/10 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
            <span>Expected JSON Response (HTTP 201)</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Ready to pipe to jq</span>
          </div>
          <pre className="p-2.5 rounded-xl bg-background border border-border font-mono text-[11px] text-muted-foreground overflow-x-auto">
{`{
  "success": true,
  "id": "e4a7d65b-...",
  "filename": "document.pdf",
  "shareUrl": "${origin}/f/a1b2c3d4",
  "rawUrl": "${origin}/raw/a1b2c3d4",
  "expiresAt": "2026-10-18T12:00:00.000Z"
}`}
          </pre>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[11px]">Manage your API keys in Settings &rarr; API Keys.</span>
          </div>

          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg border border-border text-foreground hover:bg-muted transition text-xs font-medium cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
