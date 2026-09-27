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
  Maximize2,
  Search,
  X,
  RefreshCw,
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

export function ApiKeysManager() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [revealSecret, setRevealSecret] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedPrefixId, setCopiedPrefixId] = useState<string | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExpandedModalOpen, setIsExpandedModalOpen] = useState(false);
  const [searchKeyQuery, setSearchKeyQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Dedicated API Key Modal flow states
  const [modalStep, setModalStep] = useState<"form" | "reveal">("form");
  const [activeCreatedKeyName, setActiveCreatedKeyName] = useState<string>("");
  const [modalRevealSecret, setModalRevealSecret] = useState(true);
  const [modalCopiedKey, setModalCopiedKey] = useState(false);
  const [modalCopiedCurl, setModalCopiedCurl] = useState(false);
  const [curlSnippetMode, setCurlSnippetMode] = useState<"standard" | "tamperProof">("standard");

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
    const timer = setTimeout(() => {
      void fetchKeys();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchKeys]);

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

  // Blended execution for Revoke, Rotate, or Revoke All
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

  // Mask key with asterisks: e.g. "gp_live_********************************3a8f"
  const getMaskedKey = (raw: string) => {
    if (raw.length <= 12) return "****************";
    const prefix = raw.slice(0, 8); // e.g. "gp_live_"
    const suffix = raw.slice(-4);
    return `${prefix}********************************${suffix}`;
  };

  const filteredKeys = useMemo(() => {
    if (!searchKeyQuery.trim()) return keys;
    const q = searchKeyQuery.toLowerCase();
    return keys.filter((k) => k.name.toLowerCase().includes(q) || k.key_prefix.toLowerCase().includes(q));
  }, [keys, searchKeyQuery]);

  const sampleCurl = `curl -H "Authorization: Bearer ${createdRawKey || "gp_live_YOUR_KEY"}" \\\n  -F "file=@screenshot.png" \\\n  ${origin}/api/v1/upload`;

  const secureSha256Curl = `# 1. Calculate file integrity checksum (SHA-256)\nHASH=$(sha256sum screenshot.png | awk '{print $1}')\n\n# 2. Upload with cryptographic anti-tamper verification\ncurl -H "Authorization: Bearer ${createdRawKey || "gp_live_YOUR_KEY"}" \\\n  -H "X-Content-SHA256: $HASH" \\\n  -F "file=@screenshot.png" \\\n  ${origin}/api/v1/upload`;

  return (
    <div className="p-3.5 sm:p-4 rounded-2xl bg-card border border-border shadow-xs space-y-3">
      {/* Card Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Key className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Developer API Keys &amp; Terminal Upload
            </h3>
            <p className="text-xs text-muted-foreground">
              Programmatically upload files from your terminal or CI/CD pipelines via cURL or scripts.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card/60 hover:bg-muted text-foreground text-xs font-semibold transition cursor-pointer shadow-2xs hover:border-blue-500/30"
            title="Read simple API documentation & guides (Opens in new tab)"
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-500" />
            <span>Docs</span>
          </Link>

          <button
            onClick={() => {
              setModalStep("form");
              setNewKeyName("");
              setModalCopiedKey(false);
              setModalCopiedCurl(false);
              setErrorMsg(null);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition cursor-pointer shadow-xs active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New API Key</span>
          </button>
        </div>
      </div>

      {successToast && (
        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-between gap-2 animate-in fade-in duration-150">
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

      {errorMsg && (
        <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Enterprise Raw Key Reveal Banner */}
      {createdRawKey && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border-2 border-emerald-500/30 space-y-2 animate-in fade-in duration-200">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold text-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>New API Key Generated Successfully</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[11px] font-semibold">
              <Lock className="w-3 h-3" />
              <span>Copy now — will never be shown again</span>
            </div>
          </div>

          {/* Masked Key Display with Show/Hide & Enterprise Copy */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <div className="flex-1 min-w-0 flex items-center bg-background border border-emerald-500/40 rounded-xl px-3 py-1.5 font-mono text-xs text-foreground select-all overflow-x-auto">
              <span className="tracking-wider truncate">
                {revealSecret ? createdRawKey : getMaskedKey(createdRawKey)}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setRevealSecret(!revealSecret)}
                className="px-2.5 py-1.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title={revealSecret ? "Hide secret with asterisks" : "Reveal secret key"}
              >
                {revealSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{revealSecret ? "Hide" : "Reveal"}</span>
              </button>

              <button
                type="button"
                onClick={() => copyToClipboard(createdRawKey, setCopiedKey)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs ${
                  copiedKey
                    ? "bg-emerald-600 text-white"
                    : "bg-blue-600 hover:bg-blue-500 text-white active:scale-[0.98]"
                }`}
                title="Copy unmasked secret to clipboard"
              >
                {copiedKey ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey ? "Copied!" : "Copy Key"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCreatedRawKey(null);
                  setRevealSecret(false);
                }}
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Side-by-side: cURL Snippet (Left) + Active Keys (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        {/* Left Column: Interactive cURL Snippet */}
        <div className="lg:col-span-6 rounded-xl border border-border bg-card overflow-hidden shadow-xs flex flex-col justify-between">
          <div className="px-3 py-1.5 bg-muted/40 border-b border-border flex items-center justify-between flex-wrap gap-1.5">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <Terminal className="w-3.5 h-3.5 text-blue-500" />
                <span>Upload Terminal</span>
              </div>

              {/* Mode Toggle: Standard vs Anti-Tamper SHA-256 */}
              <div className="flex items-center gap-0.5 bg-background/80 border border-border p-0.5 rounded-lg text-[10.5px]">
                <button
                  type="button"
                  onClick={() => setCurlSnippetMode("standard")}
                  className={`px-1.5 py-0.5 rounded transition cursor-pointer font-medium ${
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
                  className={`px-1.5 py-0.5 rounded transition cursor-pointer font-medium flex items-center gap-1 ${
                    curlSnippetMode === "tamperProof"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/30"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Uploads with cryptographic SHA-256 checksum to prevent MITM tampering"
                >
                  <ShieldCheck className="w-3 h-3 text-emerald-500" />
                  <span>Anti-Tamper</span>
                </button>
              </div>
            </div>

            <button
              onClick={() =>
                copyToClipboard(
                  curlSnippetMode === "standard" ? sampleCurl : secureSha256Curl,
                  setCopiedCurl
                )
              }
              className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 transition cursor-pointer px-2 py-0.5 rounded-lg hover:bg-background border border-transparent hover:border-border"
            >
              {copiedCurl ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              <span className={copiedCurl ? "text-emerald-500 font-bold" : ""}>
                {copiedCurl ? "Copied" : "Copy cURL"}
              </span>
            </button>
          </div>
          <pre suppressHydrationWarning className="p-2.5 bg-background font-mono text-xs sm:text-[12px] text-foreground leading-relaxed overflow-x-auto select-all flex-1 font-medium">
            {curlSnippetMode === "standard" ? sampleCurl : secureSha256Curl}
          </pre>
        </div>

        {/* Right Column: Keys Table / List */}
        <div className="lg:col-span-6 flex flex-col space-y-2">
          <div className="flex items-center justify-between text-xs shrink-0">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <span>Active Keys</span>
                <span className="px-1.5 py-0.2 rounded-full bg-muted text-xs font-bold text-muted-foreground">
                  {keys.length}
                </span>
              </h4>

              {keys.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmAction({ type: "revokeAll" })}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 border border-rose-500/25 px-2 py-0.5 rounded-lg transition cursor-pointer"
                  title="Emergency Revoke All Keys for security"
                >
                  <ShieldAlert className="w-3 h-3 text-rose-500" />
                  <span>Revoke All</span>
                </button>
              )}
            </div>

            {keys.length > 0 && (
              <button
                type="button"
                onClick={() => setIsExpandedModalOpen(true)}
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-500 transition cursor-pointer px-1.5 py-0.5 rounded hover:bg-blue-500/10"
                title="Expand full view to manage all keys"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Expand View</span>
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center py-6 text-muted-foreground gap-2 text-xs font-medium">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              <span>Loading keys...</span>
            </div>
          ) : keys.length === 0 ? (
            <div className="flex-1 w-full min-h-[92px] flex items-center justify-center p-4 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl bg-muted/10 font-medium">
              <span>No API keys created yet. Generate a key above to start using the CLI.</span>
            </div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden bg-background flex-1 flex flex-col justify-between">
              <div className="divide-y divide-border max-h-[88px] overflow-y-auto">
                {keys.slice(0, 3).map((k) => (
                  <div key={k.id} className="p-2 sm:p-2.5 flex items-center justify-between gap-2.5 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-foreground truncate">{k.name}</span>
                        <span className="px-1.5 py-0.2 rounded-md bg-muted font-mono text-[11px] font-semibold text-muted-foreground">
                          {k.key_prefix}••••••••
                        </span>
                        <span className="px-1.5 py-0.2 rounded-full text-[9.5px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          Active
                        </span>
                      </div>
                      <div className="text-[10.5px] text-muted-foreground flex items-center gap-2 mt-0.5 font-medium">
                        <span>Created {new Date(k.created_at).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>{k.last_used_at ? `Used ${new Date(k.last_used_at).toLocaleDateString()}` : "Never used"}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() =>
                          copyToClipboard(k.key_prefix, () => {
                            setCopiedPrefixId(k.id);
                            setTimeout(() => setCopiedPrefixId(null), 2000);
                          })
                        }
                        className="p-1 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
                        title="Copy key prefix"
                      >
                        {copiedPrefixId === k.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmAction({ type: "rotate", keyId: k.id, keyName: k.name })}
                        className="p-1 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 transition cursor-pointer"
                        title="Rotate API key (Generate fresh secret)"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmAction({ type: "revoke", keyId: k.id, keyName: k.name })}
                        className="p-1 rounded-lg text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                        title="Revoke key"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {keys.length > 3 && (
                <button
                  type="button"
                  onClick={() => setIsExpandedModalOpen(true)}
                  className="w-full py-1 bg-muted/30 hover:bg-muted/60 text-center text-[11px] font-bold text-blue-600 dark:text-blue-400 border-t border-border transition cursor-pointer"
                >
                  View all {keys.length} keys in expanded view →
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Expanded API Keys Modal (supports 20+ keys cleanly) */}
      {isExpandedModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    <span>All Active API Keys</span>
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs font-bold">
                      {keys.length}
                    </span>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Review, search, rotate, or revoke any developer keys across all devices.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {keys.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfirmAction({ type: "revokeAll" })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition cursor-pointer"
                    title="Emergency Revoke All Keys for security"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                    <span>Revoke All</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setIsExpandedModalOpen(false);
                    setSearchKeyQuery("");
                  }}
                  className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Search Bar */}
            <div className="p-3 border-b border-border bg-muted/20">
              <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search keys by name or prefix..."
                  value={searchKeyQuery}
                  onChange={(e) => setSearchKeyQuery(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-1.5 rounded-xl bg-background border border-border text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Modal Body: Scrollable Keys List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 divide-y divide-border">
              {filteredKeys.length === 0 ? (
                <div className="py-8 text-center text-xs sm:text-sm text-muted-foreground">
                  {searchKeyQuery ? `No API keys matching "${searchKeyQuery}"` : "No API keys created yet."}
                </div>
              ) : (
                filteredKeys.map((k) => (
                  <div key={k.id} className="pt-2.5 first:pt-0 flex items-center justify-between gap-3 text-xs sm:text-sm">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-foreground">{k.name}</span>
                        <span className="px-2 py-0.5 rounded-md bg-muted font-mono text-xs font-semibold text-muted-foreground">
                          {k.key_prefix}****************
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          Active
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 font-medium">
                        <span>Created {new Date(k.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>
                        <span>•</span>
                        <span>{k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleDateString()}` : "Never used"}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() =>
                          copyToClipboard(k.key_prefix, () => {
                            setCopiedPrefixId(k.id);
                            setTimeout(() => setCopiedPrefixId(null), 2000);
                          })
                        }
                        className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
                        title="Copy key prefix"
                      >
                        {copiedPrefixId === k.id ? (
                          <Check className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmAction({ type: "rotate", keyId: k.id, keyName: k.name })}
                        className="p-2 rounded-xl text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 transition cursor-pointer"
                        title="Rotate key (Generate fresh secret)"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmAction({ type: "revoke", keyId: k.id, keyName: k.name })}
                        className="p-2 rounded-xl text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                        title="Revoke key"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 sm:p-4 border-t border-border bg-muted/20 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsExpandedModalOpen(false);
                  setSearchKeyQuery("");
                  setModalStep("form");
                  setNewKeyName("");
                  setModalCopiedKey(false);
                  setModalCopiedCurl(false);
                  setErrorMsg(null);
                  setIsModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold transition cursor-pointer shadow-xs active:scale-[0.98]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Create Another Key</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsExpandedModalOpen(false);
                  setSearchKeyQuery("");
                }}
                className="px-4 py-1.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs sm:text-sm font-semibold transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

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
                    This key grants write access to upload files directly via the CLI or cURL. The secret key is hashed with SHA-256 and will only be displayed once upon generation.
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

      {/* Blended In-App Confirmation Modal (Replaces browser "localhost says" popup) */}
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
