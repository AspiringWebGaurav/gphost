"use client";

import React, { useState, useEffect, useCallback, useSyncExternalStore } from "react";
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
} from "lucide-react";

interface ApiKeyItem {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  created_at: string;
}

export function ApiKeysManager() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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
      setNewKeyName("");
      setIsModalOpen(false);
      fetchKeys();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error generating API key");
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key? CLI scripts using it will stop working immediately.")) {
      return;
    }

    try {
      const res = await fetch("/api/user/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId }),
      });

      if (res.ok) {
        setKeys((prev) => prev.filter((k) => k.id !== keyId));
      }
    } catch {
      alert("Failed to revoke key");
    }
  };

  const copyToClipboard = (text: string, setter: (val: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const sampleCurl = `curl -H "Authorization: Bearer ${createdRawKey || "gp_live_YOUR_KEY"}" \\\n  -F "file=@screenshot.png" \\\n  ${origin}/api/v1/upload`;

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Key className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-foreground">
              Developer API Keys &amp; Terminal Upload
            </h3>
            <p className="text-xs text-muted-foreground">
              Programmatically upload files from your terminal or CI/CD pipelines via cURL or scripts.
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setIsModalOpen(true);
            setErrorMsg(null);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition cursor-pointer shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New API Key</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Prominent Raw Key Reveal Card */}
      {createdRawKey && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300 text-xs">
              <ShieldCheck className="w-4 h-4" />
              <span>New API Key Generated</span>
            </div>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Save this secret now</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={createdRawKey}
              className="flex-1 px-3 py-2 rounded-xl bg-background border border-emerald-500/40 text-xs font-mono text-foreground select-all"
            />
            <button
              onClick={() => copyToClipboard(createdRawKey, setCopiedKey)}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0"
            >
              {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey ? "Copied" : "Copy"}</span>
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            For security, this secret key will <strong>never</strong> be displayed again. If you lose it, you must generate a new one.
          </p>
        </div>
      )}

      {/* Interactive cURL Snippet (Notion Clean Code Block Style) */}
      <div className="rounded-xl border border-border/80 bg-muted/20 overflow-hidden shadow-2xs">
        <div className="px-3.5 py-2.5 bg-muted/40 border-b border-border/70 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Terminal className="w-3.5 h-3.5 text-blue-500" />
            <span>Upload from Terminal in 1 Line</span>
          </div>
          <button
            onClick={() => copyToClipboard(sampleCurl, setCopiedCurl)}
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition cursor-pointer px-2 py-0.5 rounded-md hover:bg-background/80"
          >
            {copiedCurl ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            <span className={copiedCurl ? "text-emerald-500 font-medium" : ""}>
              {copiedCurl ? "Copied" : "Copy cURL"}
            </span>
          </button>
        </div>
        <pre suppressHydrationWarning className="p-3.5 bg-background font-mono text-xs text-foreground/90 leading-relaxed overflow-x-auto select-all">
          {sampleCurl}
        </pre>
      </div>

      {/* Keys Table / List */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground">Active Keys</h4>

        {loading ? (
          <div className="py-6 flex items-center justify-center text-muted-foreground gap-2 text-xs">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading keys...</span>
          </div>
        ) : keys.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
            No API keys created yet. Generate a key above to start using the CLI.
          </div>
        ) : (
          <div className="divide-y divide-border border border-border rounded-xl overflow-hidden bg-background">
            {keys.map((k) => (
              <div key={k.id} className="p-3 sm:p-3.5 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="font-semibold text-foreground flex items-center gap-2">
                    <span>{k.name}</span>
                    <span className="px-2 py-0.5 rounded-md bg-muted font-mono text-[10px] text-muted-foreground">
                      {k.key_prefix}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-3 mt-0.5">
                    <span>Created: {new Date(k.created_at).toLocaleDateString()}</span>
                    <span>•</span>
                    <span>Last used: {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}</span>
                  </div>
                </div>

                <button
                  onClick={() => handleRevoke(k.id)}
                  className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                  title="Revoke key"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: New Key Name */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h4 className="text-sm font-bold text-foreground">Create API Key</h4>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Key Description / Name</label>
                <input
                  type="text"
                  placeholder="e.g. CI/CD Pipeline, MacBook CLI"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  maxLength={64}
                  autoFocus
                  required
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl text-xs text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={generating || !newKeyName.trim()}
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {generating && <Loader2 className="w-3 h-3 animate-spin" />}
                  <span>Generate Key</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
