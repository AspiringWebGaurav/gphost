"use client";

import React, { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  Terminal,
  AlertCircle,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Eye,
  EyeOff,
  Lock,
  CheckCircle2,
  BookOpen,
  Search,
  X,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Code2,
  Calendar,
  Clock,
  FolderTree,
} from "lucide-react";

interface ApiKeyItem {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  created_at: string;
}

const KEY_NAME_PRESETS = [
  "MacBook Terminal",
  "CI/CD Pipeline",
  "Production Server",
  "GitHub Actions",
  "Local Dev",
];

interface ApiKeysManagerProps {
  initialKeys?: ApiKeyItem[];
}

export function ApiKeysManager({ initialKeys = [] }: ApiKeysManagerProps) {
  const [keys, setKeys] = useState<ApiKeyItem[]>(initialKeys);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [revealSecret, setRevealSecret] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedPrefixId, setCopiedPrefixId] = useState<string | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchKeyQuery, setSearchKeyQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(5);

  // Terminal Drawer snippet states
  const [snippetLanguage, setSnippetLanguage] = useState<"curl" | "powershell" | "python" | "folders">("curl");
  const [curlSnippetMode, setCurlSnippetMode] = useState<"standard" | "tamperProof">("standard");

  // Dedicated API Key Modal flow states
  const [modalStep, setModalStep] = useState<"form" | "reveal">("form");
  const [activeCreatedKeyName, setActiveCreatedKeyName] = useState<string>("");
  const [modalRevealSecret, setModalRevealSecret] = useState(true);
  const [modalCopiedKey, setModalCopiedKey] = useState(false);
  const [modalCopiedCurl, setModalCopiedCurl] = useState(false);

  const closeModal = () => {
    setIsModalOpen(false);
    setTimeout(() => {
      setModalStep("form");
      setNewKeyName("");
      setModalCopiedKey(false);
      setModalCopiedCurl(false);
    }, 200);
  };

  // Blended In-App Confirmation Modal state (no browser confirm/alert popups)
  const [confirmAction, setConfirmAction] = useState<{
    type: "revoke" | "rotate" | "revokeAll";
    keyId?: string;
    keyName?: string;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "https://gphost.app"
  );

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/user/api-keys");
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
      }
    } catch {
      setErrorMsg("Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialKeys.length > 0) return;
    const timer = setTimeout(() => {
      void fetchKeys();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchKeys, initialKeys.length]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    setGenerating(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate key");
      }

      setCreatedRawKey(data.rawKey);
      setActiveCreatedKeyName(data.key?.name || newKeyName.trim());
      setRevealSecret(true);
      setModalRevealSecret(true);
      setModalCopiedKey(false);
      setModalCopiedCurl(false);
      setModalStep("reveal");
      fetchKeys();
      setSuccessToast(`New API key "${data.key?.name || "CLI Key"}" generated successfully.`);
      setTimeout(() => setSuccessToast(null), 3500);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error generating API key");
    } finally {
      setGenerating(false);
    }
  };

  const executeConfirmedAction = async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    setErrorMsg(null);

    try {
      if (confirmAction.type === "revoke" && confirmAction.keyId) {
        const res = await fetch("/api/user/api-keys", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyId: confirmAction.keyId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to revoke key");

        setKeys((prev) => prev.filter((k) => k.id !== confirmAction.keyId));
        setSuccessToast(`API key "${confirmAction.keyName || "Selected"}" revoked.`);
        setTimeout(() => setSuccessToast(null), 3500);
      } else if (confirmAction.type === "rotate" && confirmAction.keyId) {
        const res = await fetch("/api/user/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "rotate", keyId: confirmAction.keyId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to rotate key");

        setCreatedRawKey(data.rawKey);
        setActiveCreatedKeyName(confirmAction.keyName || "Rotated Key");
        setRevealSecret(true);
        setModalRevealSecret(true);
        setModalCopiedKey(false);
        setModalCopiedCurl(false);
        setModalStep("reveal");
        setIsModalOpen(true);
        fetchKeys();
        setSuccessToast(`API key "${confirmAction.keyName || "Selected"}" rotated with a fresh secret.`);
        setTimeout(() => setSuccessToast(null), 4000);
      } else if (confirmAction.type === "revokeAll") {
        const res = await fetch("/api/user/api-keys", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to revoke all keys");

        setKeys([]);
        setSuccessToast("All active API keys have been revoked for security.");
        setTimeout(() => setSuccessToast(null), 4000);
      }
      setConfirmAction(null);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  const copyToClipboard = (text: string, setter: (val: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const getMaskedKey = (raw: string) => {
    if (raw.length <= 12) return "****************";
    const prefix = raw.slice(0, 8);
    const suffix = raw.slice(-4);
    return `${prefix}********************************${suffix}`;
  };

  // Filtered keys by search
  const filteredKeys = useMemo(() => {
    if (!searchKeyQuery.trim()) return keys;
    const q = searchKeyQuery.toLowerCase();
    return keys.filter(
      (k) => k.name.toLowerCase().includes(q) || k.key_prefix.toLowerCase().includes(q)
    );
  }, [keys, searchKeyQuery]);

  // Reset page to 1 whenever search query or pageSize changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchKeyQuery, pageSize]);

  // Pagination calculation
  const totalItems = filteredKeys.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedKeys = useMemo(() => {
    return filteredKeys.slice(startIndex, endIndex);
  }, [filteredKeys, startIndex, endIndex]);

  // Active or placeholder token string
  const activeTokenPlaceholder = createdRawKey || "gp_live_YOUR_SECRET_KEY";

  // Code Snippets across languages
  const sampleCurl = `curl -X POST "${origin}/api/v1/upload" \\
  -H "Authorization: Bearer ${activeTokenPlaceholder}" \\
  -F "file=@/path/to/document.pdf" \\
  -F "expiry=30d"`;

  const secureSha256Curl = `# 1. Calculate SHA-256 hash
HASH=$(sha256sum document.pdf | awk '{print $1}')

# 2. Upload with cryptographic anti-tamper header
curl -X POST "${origin}/api/v1/upload" \\
  -H "Authorization: Bearer ${activeTokenPlaceholder}" \\
  -H "X-Content-SHA256: $HASH" \\
  -F "file=@document.pdf" \\
  -F "expiry=30d"`;

  const samplePowerShell = `$headers = @{
    Authorization = "Bearer ${activeTokenPlaceholder}"
}
$form = @{
    file = Get-Item "C:\\path\\to\\document.pdf"
    expiry = "30d"
}
$response = Invoke-RestMethod -Uri "${origin}/api/v1/upload" -Method Post -Headers $headers -Form $form
$response | ConvertTo-Json -Depth 4`;

  const samplePython = `import requests

url = "${origin}/api/v1/upload"
headers = {"Authorization": "Bearer ${activeTokenPlaceholder}"}
files = {"file": open("document.pdf", "rb")}
data = {"expiry": "30d"}

response = requests.post(url, headers=headers, files=files, data=data)
print(response.json())`;

  const sampleFolders = `# 1. Create a nested folder programmatically
curl -X POST "${origin}/api/v1/folders" \\
  -H "Authorization: Bearer ${activeTokenPlaceholder}" \\
  -H "Content-Type: application/json" \\
  -d '{"path": "reports/q4-audit", "description": "Quarterly audit docs"}'

# 2. Upload directly into the folder
curl -X POST "${origin}/api/v1/upload" \\
  -H "Authorization: Bearer ${activeTokenPlaceholder}" \\
  -F "file=@audit.pdf" \\
  -F "folder=reports/q4-audit"`;

  const activeSnippet = useMemo(() => {
    if (snippetLanguage === "powershell") return samplePowerShell;
    if (snippetLanguage === "python") return samplePython;
    if (snippetLanguage === "folders") return sampleFolders;
    return curlSnippetMode === "tamperProof" ? secureSha256Curl : sampleCurl;
  }, [snippetLanguage, curlSnippetMode, samplePowerShell, samplePython, sampleFolders, secureSha256Curl, sampleCurl]);

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border/80 shadow-xs space-y-4 sm:space-y-5">
      {/* Symmetrical Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3 sm:pb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20 shadow-2xs">
            <Key className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-bold text-foreground truncate">
                Developer API Keys &amp; Terminal Access
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
                {keys.length} {keys.length === 1 ? "Active Key" : "Active Keys"}
              </span>
            </div>
            <p className="text-[11.5px] text-muted-foreground mt-0.5 truncate">
              Manage cryptographic bearer tokens for CLI terminal uploads, CI/CD scripts, and REST APIs.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
          <Link
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/80 bg-muted/20 hover:bg-muted text-foreground text-xs font-semibold transition cursor-pointer shadow-2xs hover:border-blue-500/30"
            title="Read API documentation & code examples (Opens in new tab)"
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-500" />
            <span>Docs</span>
          </Link>

          {keys.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmAction({ type: "revokeAll" })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-500/25 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold transition cursor-pointer shadow-2xs"
              title="Emergency Revoke All Keys for security"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Revoke All</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setModalStep("form");
              setNewKeyName("");
              setModalCopiedKey(false);
              setModalCopiedCurl(false);
              setErrorMsg(null);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition cursor-pointer shadow-xs active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New API Key</span>
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {successToast && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-between gap-2 animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="font-semibold">{successToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessToast(null)}
            className="text-emerald-600 hover:text-emerald-700 p-0.5 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Error Notification */}
      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-600 hover:text-rose-700 p-0.5 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Enterprise Raw Key Reveal Banner (Shown after creation or rotation) */}
      {createdRawKey && (
        <div className="p-3.5 sm:p-4 rounded-xl bg-emerald-500/10 border-2 border-emerald-500/30 space-y-2.5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold text-xs sm:text-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>New API Secret Generated — Copy Immediately</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[11px] font-semibold">
              <Lock className="w-3 h-3" />
              <span>Will not be displayed again</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <div className="flex-1 min-w-0 flex items-center bg-background border border-emerald-500/40 rounded-xl px-3.5 py-2 font-mono text-xs text-foreground select-all overflow-x-auto shadow-2xs">
              <span className="tracking-wider truncate">
                {revealSecret ? createdRawKey : getMaskedKey(createdRawKey)}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setRevealSecret(!revealSecret)}
                className="px-2.5 py-2 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title={revealSecret ? "Hide secret" : "Reveal secret"}
              >
                {revealSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{revealSecret ? "Hide" : "Reveal"}</span>
              </button>

              <button
                type="button"
                onClick={() => copyToClipboard(createdRawKey, setCopiedKey)}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs ${
                  copiedKey
                    ? "bg-emerald-600 text-white"
                    : "bg-blue-600 hover:bg-blue-500 text-white active:scale-[0.98]"
                }`}
              >
                {copiedKey ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey ? "Copied!" : "Copy Secret"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCreatedRawKey(null);
                  setRevealSecret(false);
                }}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Symmetrical Search & Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search API keys by name or prefix..."
            value={searchKeyQuery}
            onChange={(e) => setSearchKeyQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 h-9 rounded-xl bg-background border border-border/80 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500 transition shadow-2xs"
          />
          {searchKeyQuery && (
            <button
              type="button"
              onClick={() => setSearchKeyQuery("")}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center text-xs">
          <span className="text-muted-foreground text-[11px] font-medium">Show:</span>
          <div className="flex items-center border border-border/80 rounded-xl bg-muted/20 p-0.5">
            {[5, 10, 20].map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setPageSize(size)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  pageSize === size
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground font-mono pl-1">
            {totalItems} total
          </span>
        </div>
      </div>

      {/* Primary API Keys Table UI */}
      <div className="border border-border/80 rounded-xl overflow-hidden bg-background shadow-2xs">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-2.5 text-xs font-medium">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <span>Loading authorized API keys...</span>
          </div>
        ) : totalItems === 0 ? (
          <div className="py-12 px-4 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-muted/50 border border-border/80 flex items-center justify-center text-muted-foreground">
              <Key className="w-6 h-6 opacity-60" />
            </div>
            <div className="max-w-sm space-y-1">
              <h4 className="text-sm font-bold text-foreground">
                {searchKeyQuery ? "No matching API keys" : "No API keys generated yet"}
              </h4>
              <p className="text-xs text-muted-foreground">
                {searchKeyQuery
                  ? `No keys found matching "${searchKeyQuery}". Clear your search query to view all.`
                  : "Generate your first API key to enable fast file uploads from your terminal or CI/CD pipelines."}
              </p>
            </div>
            {!searchKeyQuery && (
              <button
                type="button"
                onClick={() => {
                  setModalStep("form");
                  setNewKeyName("");
                  setIsModalOpen(true);
                }}
                className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition cursor-pointer shadow-xs active:scale-[0.98]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create First API Key</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border/80 bg-muted/30 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  <th className="py-3 px-4">Key Name &amp; Target</th>
                  <th className="py-3 px-3">Secret Key Prefix</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Created</th>
                  <th className="py-3 px-3">Last Used</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {paginatedKeys.map((k) => (
                  <tr
                    key={k.id}
                    className="hover:bg-muted/30 transition-colors group"
                  >
                    {/* Name & Target */}
                    <td className="py-3 px-4 min-w-[180px]">
                      <div className="font-bold text-foreground text-xs sm:text-sm flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="truncate">{k.name}</span>
                      </div>
                      <div className="text-[10.5px] text-muted-foreground mt-0.5 font-mono">
                        ID: {k.id.slice(0, 8)}...
                      </div>
                    </td>

                    {/* Secret Key Prefix */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/50 border border-border/70 font-mono text-[11.5px] text-foreground">
                        <span>{k.key_prefix}••••••••</span>
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(k.key_prefix, () => {
                              setCopiedPrefixId(k.id);
                              setTimeout(() => setCopiedPrefixId(null), 2000);
                            })
                          }
                          className="p-0.5 rounded hover:bg-background text-muted-foreground hover:text-foreground transition cursor-pointer"
                          title="Copy key prefix"
                        >
                          {copiedPrefixId === k.id ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Active
                      </span>
                    </td>

                    {/* Created */}
                    <td className="py-3 px-3 whitespace-nowrap text-muted-foreground text-[11.5px]">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-muted-foreground opacity-70" />
                        <span>
                          {new Date(k.created_at).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    </td>

                    {/* Last Used */}
                    <td className="py-3 px-3 whitespace-nowrap text-muted-foreground text-[11.5px]">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-muted-foreground opacity-70" />
                        <span>
                          {k.last_used_at
                            ? new Date(k.last_used_at).toLocaleDateString(undefined, {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })
                            : "Never used"}
                        </span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({ type: "rotate", keyId: k.id, keyName: k.name })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border/80 bg-background hover:bg-muted text-blue-600 dark:text-blue-400 text-xs font-semibold transition cursor-pointer shadow-2xs"
                          title="Rotate secret key (invalidates previous secret)"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span className="hidden sm:inline">Rotate</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({ type: "revoke", keyId: k.id, keyName: k.name })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-500/25 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold transition cursor-pointer shadow-2xs"
                          title="Revoke this API key permanently"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span className="hidden sm:inline">Revoke</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Symmetrical Pagination Footer */}
        {totalItems > 0 && (
          <div className="p-3 sm:px-4 border-t border-border/80 bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="text-muted-foreground text-[11.5px] font-medium">
              Showing <strong className="text-foreground">{startIndex + 1}</strong> to{" "}
              <strong className="text-foreground">{endIndex}</strong> of{" "}
              <strong className="text-foreground">{totalItems}</strong> {totalItems === 1 ? "key" : "keys"}
            </div>

            <div className="flex items-center gap-1.5 self-center sm:self-auto">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border/80 bg-background hover:bg-muted text-foreground disabled:opacity-40 disabled:pointer-events-none text-xs font-medium transition cursor-pointer shadow-2xs"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              {/* Page Number Pills */}
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => {
                  // Only show numbers near current page if many pages
                  if (
                    totalPages > 7 &&
                    num !== 1 &&
                    num !== totalPages &&
                    Math.abs(num - currentPage) > 1
                  ) {
                    if (num === 2 || num === totalPages - 1) {
                      return (
                        <span key={num} className="px-1 text-muted-foreground text-xs">
                          ...
                        </span>
                      );
                    }
                    return null;
                  }

                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setCurrentPage(num)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center transition cursor-pointer ${
                        currentPage === num
                          ? "bg-blue-600 text-white shadow-xs"
                          : "border border-border/80 bg-background hover:bg-muted text-foreground"
                      }`}
                    >
                      {num}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border/80 bg-background hover:bg-muted text-foreground disabled:opacity-40 disabled:pointer-events-none text-xs font-medium transition cursor-pointer shadow-2xs"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Terminal Upload Snippets Drawer (Integrated & Balanced) */}
      <div className="rounded-xl border border-border/80 bg-muted/15 overflow-hidden space-y-0">
        <div className="p-3 sm:px-4 bg-muted/40 border-b border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20">
              <Terminal className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-xs font-bold text-foreground">CLI &amp; Terminal Upload Code Snippets</span>
              <p className="text-[11px] text-muted-foreground">Select your preferred tool or programming language</p>
            </div>
          </div>

          {/* Language Selector Tabs */}
          <div className="flex items-center gap-1 bg-background border border-border/80 p-0.5 rounded-xl text-xs shrink-0 self-start sm:self-center">
            <button
              type="button"
              onClick={() => setSnippetLanguage("curl")}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                snippetLanguage === "curl"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              cURL (Bash)
            </button>
            <button
              type="button"
              onClick={() => setSnippetLanguage("powershell")}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                snippetLanguage === "powershell"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              PowerShell
            </button>
            <button
              type="button"
              onClick={() => setSnippetLanguage("python")}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                snippetLanguage === "python"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Python
            </button>
            <button
              type="button"
              onClick={() => setSnippetLanguage("folders")}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer flex items-center gap-1 ${
                snippetLanguage === "folders"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FolderTree className="w-3 h-3" />
              <span>Folders API</span>
            </button>
          </div>
        </div>

        {/* Sub-toolbar: Anti-tamper mode for cURL & Copy button */}
        <div className="px-3.5 py-2 bg-muted/20 border-b border-border/60 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-xs">
            {snippetLanguage === "curl" && (
              <div className="flex items-center gap-1 bg-background border border-border/80 p-0.5 rounded-lg text-[10.5px]">
                <button
                  type="button"
                  onClick={() => setCurlSnippetMode("standard")}
                  className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                    curlSnippetMode === "standard"
                      ? "bg-muted text-foreground font-bold shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Standard
                </button>
                <button
                  type="button"
                  onClick={() => setCurlSnippetMode("tamperProof")}
                  className={`px-2 py-0.5 rounded font-medium transition cursor-pointer flex items-center gap-1 ${
                    curlSnippetMode === "tamperProof"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/30"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Uploads with cryptographic SHA-256 checksum to prevent MITM tampering"
                >
                  <ShieldCheck className="w-3 h-3 text-emerald-500" />
                  <span>Anti-Tamper (SHA-256)</span>
                </button>
              </div>
            )}
            <span className="text-[11px] text-muted-foreground">
              {snippetLanguage === "folders"
                ? "Full programmatic folder creation, nesting & scoped uploads"
                : "Runs directly in your terminal, Docker container, or CI/CD runner"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => copyToClipboard(activeSnippet, setCopiedSnippet)}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-border/80 bg-background hover:bg-muted text-foreground text-xs font-semibold transition cursor-pointer shadow-2xs"
          >
            {copiedSnippet ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">Copied Snippet!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Snippet</span>
              </>
            )}
          </button>
        </div>

        {/* Monospace Snippet Box */}
        <pre
          suppressHydrationWarning
          className="p-3.5 sm:p-4 bg-background/95 font-mono text-xs sm:text-[12px] text-foreground leading-relaxed overflow-x-auto select-all font-medium"
        >
          {activeSnippet}
        </pre>

        {/* Symmetrical Reassurance Footer */}
        <div className="p-2.5 sm:px-4 bg-muted/30 border-t border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span>Encrypted with HTTPS TLS 1.3 &bull; SHA-256 Tamper Resistance &bull; Rate-limit Protected</span>
          </div>
          <Link
            href="/docs"
            target="_blank"
            className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold"
          >
            <Code2 className="w-3 h-3" />
            <span>View Full Developer REST API Reference &rarr;</span>
          </Link>
        </div>
      </div>

      {/* Modal: Generate New API Key & One-Time Reveal Flow */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !generating) {
              closeModal();
            }
          }}
        >
          <div className="w-full max-w-lg bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 relative">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border pb-3.5">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                    modalStep === "reveal"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                      : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                  }`}
                >
                  {modalStep === "reveal" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Key className="w-4 h-4 text-blue-500" />
                  )}
                </div>
                <div>
                  <h4 className="text-base font-bold text-foreground flex items-center gap-2">
                    <span>{modalStep === "reveal" ? "API Key Created" : "Generate New API Key"}</span>
                    {modalStep === "reveal" ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                        Secret Ready
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[10px] font-bold">
                        Step 1 of 2
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {modalStep === "reveal" ? (
                      <span>
                        Key for <strong className="text-foreground">{activeCreatedKeyName || "CLI Access"}</strong>
                      </span>
                    ) : (
                      "Create a secret token for terminal uploads and automated scripts."
                    )}
                  </p>
                </div>
              </div>

              {!generating && (
                <button
                  type="button"
                  onClick={closeModal}
                  className="text-muted-foreground hover:text-foreground cursor-pointer text-sm font-bold p-1.5 rounded-lg hover:bg-muted transition"
                  aria-label="Close dialog"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Error Message inside modal if generation fails */}
            {errorMsg && modalStep === "form" && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {modalStep === "form" ? (
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">
                      Key Name / Description
                    </label>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {newKeyName.length}/64
                    </span>
                  </div>

                  <input
                    type="text"
                    placeholder="e.g. CI/CD Pipeline, MacBook Terminal"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    maxLength={64}
                    autoFocus
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                  />

                  {/* Quick-fill preset chips */}
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] text-muted-foreground font-medium">
                      Quick presets:
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {KEY_NAME_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setNewKeyName(preset)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition cursor-pointer active:scale-95 ${
                            newKeyName === preset
                              ? "bg-blue-500/15 border-blue-500/40 text-blue-600 dark:text-blue-400 font-semibold"
                              : "border-border bg-muted/40 hover:bg-muted text-foreground/80 hover:text-foreground"
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Scope & Security Information Card */}
                <div className="p-3 rounded-xl bg-muted/20 border border-border space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 text-foreground font-semibold">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                    <span>Upload &amp; File Management Access</span>
                  </div>
                  <p className="text-[11.5px] text-muted-foreground leading-relaxed pl-5.5">
                    This key grants full programmatic access to upload files, manage folders, and delete objects via the CLI or cURL. The secret key is hashed with SHA-256 and will only be displayed once upon generation.
                  </p>
                </div>

                {/* Framed Footer */}
                <div className="pt-3 border-t border-border -mx-5 -mb-5 sm:-mx-6 sm:-mb-6 p-4 bg-muted/10 rounded-b-2xl flex items-center justify-between">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={generating || !newKeyName.trim()}
                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold transition disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-xs active:scale-[0.98]"
                  >
                    {generating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Generating Key...</span>
                      </>
                    ) : (
                      <>
                        <Key className="w-4 h-4" />
                        <span>Generate Key</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              /* Step 2: One-Time Reveal View */
              <div className="space-y-4">
                {/* Security Warning Callout */}
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                    <strong className="font-bold">Copy your secret key now.</strong> For your security, this raw secret will <span className="underline decoration-amber-500/50 underline-offset-2 font-semibold">never be shown again</span> once you leave this window.
                  </div>
                </div>

                {/* Secret Key Input Box with Mask Toggle & Copy */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">Secret API Key</span>
                    <button
                      type="button"
                      onClick={() => setModalRevealSecret(!modalRevealSecret)}
                      className="text-muted-foreground hover:text-foreground flex items-center gap-1 transition cursor-pointer text-[11px] font-medium"
                      title={modalRevealSecret ? "Hide secret" : "Reveal secret"}
                    >
                      {modalRevealSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{modalRevealSecret ? "Hide" : "Reveal"}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0 bg-background border border-border rounded-xl px-3.5 py-2.5 font-mono text-xs sm:text-sm text-foreground select-all overflow-x-auto tracking-wide">
                      {modalRevealSecret
                        ? (createdRawKey || "")
                        : getMaskedKey(createdRawKey || "")}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (createdRawKey) {
                          copyToClipboard(createdRawKey, setModalCopiedKey);
                        }
                      }}
                      className={`shrink-0 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs ${
                        modalCopiedKey
                          ? "bg-emerald-600 text-white"
                          : "bg-blue-600 hover:bg-blue-500 text-white active:scale-[0.98]"
                      }`}
                      title="Copy secret key to clipboard"
                    >
                      {modalCopiedKey ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy Key</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Instant Test Command Snippet with Tamper-Proof SHA-256 Tab */}
                <div className="rounded-xl border border-border bg-background overflow-hidden">
                  <div className="px-3 py-1.5 bg-muted/40 border-b border-border flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                        <Terminal className="w-3.5 h-3.5 text-blue-500" />
                        <span>Upload Command</span>
                      </div>
                      <div className="flex items-center gap-0.5 bg-muted p-0.5 rounded-lg text-[10.5px]">
                        <button
                          type="button"
                          onClick={() => setCurlSnippetMode("standard")}
                          className={`px-2 py-0.5 rounded-md transition cursor-pointer font-medium ${
                            curlSnippetMode === "standard"
                              ? "bg-background text-foreground shadow-2xs font-semibold"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Standard
                        </button>
                        <button
                          type="button"
                          onClick={() => setCurlSnippetMode("tamperProof")}
                          className={`px-2 py-0.5 rounded-md transition cursor-pointer font-medium flex items-center gap-1 ${
                            curlSnippetMode === "tamperProof"
                              ? "bg-background text-emerald-600 dark:text-emerald-400 shadow-2xs font-semibold"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          title="Verify payload hash to prevent tampering in transit"
                        >
                          <ShieldCheck className="w-3 h-3 text-emerald-500" />
                          <span>Anti-Tamper (SHA-256)</span>
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          curlSnippetMode === "standard" ? sampleCurl : secureSha256Curl,
                          setModalCopiedCurl
                        )
                      }
                      className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 transition cursor-pointer px-2 py-0.5 rounded-lg hover:bg-muted"
                    >
                      {modalCopiedCurl ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      <span className={modalCopiedCurl ? "text-emerald-500 font-bold" : ""}>
                        {modalCopiedCurl ? "Copied" : "Copy cURL"}
                      </span>
                    </button>
                  </div>
                  <pre suppressHydrationWarning className="p-2.5 font-mono text-[11.5px] text-foreground/90 overflow-x-auto select-all leading-relaxed">
                    {curlSnippetMode === "standard" ? sampleCurl : secureSha256Curl}
                  </pre>
                </div>

                {/* Framed Footer */}
                <div className="pt-3 border-t border-border -mx-5 -mb-5 sm:-mx-6 sm:-mb-6 p-4 bg-muted/10 rounded-b-2xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 text-xs">
                    {modalCopiedKey ? (
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Key saved to clipboard
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-muted-foreground font-medium">
                        <Lock className="w-3.5 h-3.5 text-amber-500" />
                        Store key securely before closing
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-5 py-2 rounded-xl bg-foreground text-background hover:bg-foreground/90 text-xs sm:text-sm font-bold transition cursor-pointer shadow-xs active:scale-[0.98]"
                  >
                    Done / I&apos;ve Saved My Key
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Blended In-App Confirmation Modal */}
      {confirmAction && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !actionLoading) {
              setConfirmAction(null);
            }
          }}
        >
          <div className="w-full max-w-md bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 relative">
            {!actionLoading && (
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <div className="flex items-start gap-3.5">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  confirmAction.type === "rotate"
                    ? "bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 shadow-sm shadow-blue-500/10"
                    : "bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 shadow-sm shadow-rose-500/10"
                }`}
              >
                {confirmAction.type === "rotate" ? (
                  <RefreshCw className="w-5 h-5 text-blue-500" />
                ) : confirmAction.type === "revokeAll" ? (
                  <ShieldAlert className="w-5 h-5 text-rose-500" />
                ) : (
                  <Trash2 className="w-5 h-5 text-rose-500" />
                )}
              </div>

              <div className="min-w-0 pr-6 space-y-1">
                <h3 className="text-base font-bold text-foreground tracking-tight">
                  {confirmAction.type === "rotate"
                    ? "Rotate API Key Secret?"
                    : confirmAction.type === "revokeAll"
                    ? "Emergency Revoke All Keys?"
                    : "Revoke API Key?"}
                </h3>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  {confirmAction.type === "rotate" ? (
                    <>
                      Rotating key{" "}
                      <strong className="text-foreground">{confirmAction.keyName}</strong> will immediately invalidate its current secret and generate a brand-new live key. CLI scripts or automation pipelines using the old secret will stop working until updated.
                    </>
                  ) : confirmAction.type === "revokeAll" ? (
                    <>
                      Are you sure you want to revoke{" "}
                      <strong className="text-rose-600 dark:text-rose-400">ALL {keys.length} active API keys</strong>? All terminal uploads, background scripts, and CI/CD pipelines will lose access immediately. This cannot be undone.
                    </>
                  ) : (
                    <>
                      Are you sure you want to revoke key{" "}
                      <strong className="text-foreground">{confirmAction.keyName}</strong>? CLI scripts and terminal commands using it will stop working immediately.
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 rounded-xl border border-border bg-background hover:bg-muted text-xs font-semibold text-foreground transition disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={actionLoading}
                onClick={executeConfirmedAction}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition shadow-sm disabled:opacity-50 cursor-pointer ${
                  confirmAction.type === "rotate"
                    ? "bg-blue-600 hover:bg-blue-500 shadow-blue-600/20"
                    : "bg-rose-600 hover:bg-rose-500 shadow-rose-600/20"
                }`}
              >
                {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {confirmAction.type === "rotate"
                    ? "Rotate Secret"
                    : confirmAction.type === "revokeAll"
                    ? "Revoke All Keys"
                    : "Revoke Key"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
