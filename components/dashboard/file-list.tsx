"use client";

import React, { useState } from "react";
import {
  File as FileIcon,
  Trash2,
  Share2,
  Copy,
  Check,
  Clock,
  HardDrive,
  Loader2,
  X,
  Link as LinkIcon,
  Lock,
  Globe,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import {
  formatTimeRemaining,
  EXPIRY_OPTIONS,
} from "@/lib/storage/expiry";

export interface FileItem {
  id: string;
  sanitized_name: string;
  byte_size: number;
  mime_type: string;
  status: string;
  expires_at: string | null;
  created_at: string;
}

interface FileListProps {
  files: FileItem[];
  onFileDeleted?: () => void;
  hideHeader?: boolean;
  maxHeight?: string;
  isPremium?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatExpiry(expiresAt: string | null, baseTime?: number): string {
  return formatTimeRemaining(expiresAt, baseTime);
}

interface ShareResponseData {
  slug: string;
  shareUrl: string;
  expires_at: string | null;
  is_single_use?: boolean;
  is_password_protected?: boolean;
  is_custom_slug?: boolean;
  is_premium?: boolean;
  xurl?: {
    shortUrl?: string;
    status: "pending" | "active" | "failed" | "cooldown";
    error?: string;
  };
}

export function FileList({
  files,
  onFileDeleted,
  hideHeader = false,
  maxHeight,
  isPremium = false,
}: FileListProps) {
  const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null);
  const [isDeletingFile, setIsDeletingFile] = useState(false);
  const [shareFile, setShareFile] = useState<FileItem | null>(null);

  // Real-time live countdown ticker (ticks every second for smooth 35m -> 34m updates)
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Share modal state
  const [sharePreset, setSharePreset] = useState<string>("file_expiry");
  const [maxDownloads, setMaxDownloads] = useState<string>("");
  const [isSingleUse, setIsSingleUse] = useState(false);
  const [sharePassword, setSharePassword] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [shortenWithXurl, setShortenWithXurl] = useState(false);
  const [creatingShare, setCreatingShare] = useState(false);
  const [shareResult, setShareResult] = useState<ShareResponseData | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copiedDirect, setCopiedDirect] = useState(false);
  const [copiedXurl, setCopiedXurl] = useState(false);

  const handleDeleteConfirm = async () => {
    if (!fileToDelete) return;
    setIsDeletingFile(true);
    try {
      const res = await fetch(`/api/files/${fileToDelete.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to delete file");
      } else {
        setFileToDelete(null);
        if (onFileDeleted) onFileDeleted();
      }
    } catch (err) {
      console.error("Error deleting file:", err);
      alert("Network error deleting file");
    } finally {
      setIsDeletingFile(false);
    }
  };

  const handleCreateShare = async () => {
    if (!shareFile) return;

    if (shareFile.expires_at && new Date(shareFile.expires_at).getTime() <= currentTime) {
      setShareError("This file has expired. Share links cannot be created for expired files.");
      return;
    }

    setCreatingShare(true);
    setShareError(null);
    setShareResult(null);

    try {
      const payload: Record<string, unknown> = {
        fileId: shareFile.id,
        maxDownloads: maxDownloads ? parseInt(maxDownloads, 10) : null,
        isSingleUse,
        expiresInPreset: sharePreset,
        shortenWithXurl,
      };

      if (customSlug.trim()) {
        payload.customSlug = customSlug.trim();
      }

      if (sharePassword.trim()) {
        payload.password = sharePassword.trim();
      }

      const res = await fetch("/api/share/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate share link");
      }

      const shareData = data.share || data;
      setShareResult(shareData);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Error creating share link");
    } finally {
      setCreatingShare(false);
    }
  };

  const copyToClipboard = (text: string, isXurl = false) => {
    navigator.clipboard.writeText(text);
    if (isXurl) {
      setCopiedXurl(true);
      setTimeout(() => setCopiedXurl(false), 2000);
    } else {
      setCopiedDirect(true);
      setTimeout(() => setCopiedDirect(false), 2000);
    }
  };

  if (files.length === 0) {
    return (
      <div
        className={`text-center ${
          hideHeader
            ? "py-6 px-4 rounded-xl bg-muted/20 border border-dashed border-border/80"
            : "p-10 rounded-2xl border border-border bg-card"
        }`}
      >
        <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-muted-foreground mx-auto mb-2">
          <HardDrive className="w-4 h-4 opacity-50" />
        </div>
        <h4 className="text-sm font-semibold text-foreground mb-0.5">No Active Files</h4>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          You haven&apos;t uploaded any files yet. Drag and drop a file above to start sharing.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Your Files ({files.length})
          </h3>
        </div>
      )}

      <div
        className={`overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border ${
          maxHeight ? `${maxHeight} overflow-y-auto` : ""
        }`}
      >
        {files.map((file) => {
          return (
            <div
              key={file.id}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/40 transition-colors"
            >
              {/* File Info */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                  <FileIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate max-w-xs sm:max-w-md">
                    {file.sanitized_name}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span>{formatBytes(file.byte_size)}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatExpiry(file.expires_at)}
                    </span>
                    <span>•</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-mono uppercase ${
                        file.status === "ACTIVE"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                      }`}
                    >
                      {file.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <button
                  onClick={() => {
                    setShareFile(file);
                    setShareResult(null);
                    setShareError(null);
                    setSharePassword("");
                    setCustomSlug("");
                    setSharePreset("file_expiry");
                    setMaxDownloads("");
                    setIsSingleUse(false);
                    setShortenWithXurl(false);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-medium transition-colors cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                  <span>Share</span>
                </button>

                <button
                  onClick={() => setFileToDelete(file)}
                  className="p-1.5 rounded-lg border border-border hover:border-red-500/30 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
                  title="Delete file"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Share Modal Dialog */}
      {shareFile && (() => {
        const fileRemainingMs = shareFile.expires_at
          ? new Date(shareFile.expires_at).getTime() - currentTime
          : null;
        const isFileExpired = fileRemainingMs !== null && fileRemainingMs <= 0;

        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl lg:max-w-3xl bg-card border border-border rounded-2xl p-5 md:p-6 shadow-2xl space-y-4 max-h-[94vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-border pb-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Share2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">Create Share Link</h4>
                    <p className="text-[11px] text-muted-foreground">Configure custom link, access restrictions, and strict expiry sync</p>
                  </div>
                </div>
                <button
                  onClick={() => setShareFile(null)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Compact File & Plan Status Strip with Realtime Expiration Ticker */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-muted/40 border border-border">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-background border border-border/80 text-blue-500 flex items-center justify-center shrink-0">
                    <FileIcon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-foreground truncate max-w-[280px] sm:max-w-[360px]" title={shareFile.sanitized_name}>
                      {shareFile.sanitized_name}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-2 font-mono">
                      <span>{formatBytes(shareFile.byte_size)}</span>
                      <span>&bull;</span>
                      {shareFile.expires_at ? (
                        isFileExpired ? (
                          <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 inline" />
                            <span>Expired</span>
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            Expires {formatExpiry(shareFile.expires_at, currentTime)}
                          </span>
                        )
                      ) : (
                        <span className="text-purple-600 dark:text-purple-300 font-medium">
                          Permanent
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {isPremium ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs shrink-0 self-start sm:self-auto">
                    <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                    <span className="font-semibold text-[11px]">Premium Plan</span>
                    <span className="text-[10px] text-blue-500/80 dark:text-blue-400/80">&bull; Custom slug unlocked</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted border border-border text-muted-foreground text-xs shrink-0 self-start sm:self-auto">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                    <span className="font-medium text-[11px] text-foreground">Standard Plan</span>
                    <span className="text-[10px] text-muted-foreground">&bull; PRO for custom slug</span>
                  </div>
                )}
              </div>

              {!shareResult ? (
                <div className="space-y-4">
                  {/* Expired File Warning Banner */}
                  {isFileExpired && (
                    <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 flex items-start gap-2.5 animate-in fade-in duration-200">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div className="space-y-0.5 text-xs">
                        <div className="font-semibold">File Has Expired — Share Link Creation Locked</div>
                        <div className="text-[11px] text-rose-600/90 dark:text-rose-400/90">
                          This file has reached the end of its retention lifecycle. Share links cannot be created for expired files.
                        </div>
                      </div>
                    </div>
                  )}

                  <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${isFileExpired ? "opacity-45 pointer-events-none select-none" : ""}`}>
                    {/* Left Column: Link Settings */}
                    <div className="space-y-3.5">
                      {/* Expiry Selector strictly synchronized with file upload */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-blue-500" />
                            <span>Link Expiration</span>
                          </label>
                          {shareFile.expires_at && !isFileExpired && (
                            <span className="text-[10px] font-mono font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              <span>Strict Sync</span>
                            </span>
                          )}
                          {shareFile.expires_at && isFileExpired && (
                            <span className="text-[10px] font-mono font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Expired</span>
                            </span>
                          )}
                        </div>

                        <select
                          value={sharePreset}
                          onChange={(e) => setSharePreset(e.target.value)}
                          disabled={isFileExpired}
                          className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:border-blue-500 cursor-pointer font-medium disabled:cursor-not-allowed"
                        >
                          {shareFile.expires_at ? (
                            <>
                              <option
                                value="file_expiry"
                                className={isFileExpired ? "font-semibold text-rose-600 dark:text-rose-400" : "font-semibold text-blue-600 dark:text-blue-400"}
                              >
                                {isFileExpired
                                  ? "File Expired (Cannot create share link)"
                                  : `Strictly Synced with File Lifecycle (${formatExpiry(shareFile.expires_at, currentTime)}) [Default]`}
                              </option>
                              {!isFileExpired &&
                                EXPIRY_OPTIONS.filter(
                                  (opt) => opt.durationMs !== null && fileRemainingMs !== null && opt.durationMs < fileRemainingMs
                                ).map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                            </>
                          ) : (
                            <>
                              <option value="file_expiry" className="font-semibold text-purple-600 dark:text-purple-300">
                                Permanent / Matches File (Never Expire)
                              </option>
                              {EXPIRY_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </>
                          )}
                        </select>

                        <div className="text-[11px] text-muted-foreground pt-0.5">
                          {shareFile.expires_at ? (
                            isFileExpired ? (
                              <span className="text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>Target file has expired. Sharing is locked.</span>
                              </span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                                <Check className="w-3.5 h-3.5 shrink-0" />
                                <span>XURL &amp; GPHost links strictly expire in {formatExpiry(shareFile.expires_at, currentTime)}.</span>
                              </span>
                            )
                          ) : (
                            <span>Target file is permanent. You can select custom link retention or keep permanent.</span>
                          )}
                        </div>
                      </div>

                    {/* Custom Slug Option */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                          <span>Custom Link Slug</span>
                          {isPremium ? (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                              PRO
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border flex items-center gap-1">
                              <Lock className="w-2.5 h-2.5" />
                              <span>PRO ONLY</span>
                            </span>
                          )}
                        </label>
                        <span className="text-[10px] text-muted-foreground">
                          {isPremium ? "Letters, numbers, dashes" : "Upgrade to unlock"}
                        </span>
                      </div>

                      {isPremium ? (
                        <div className="space-y-1">
                          <div className="flex items-center rounded-xl bg-background border border-border focus-within:border-blue-500 transition overflow-hidden">
                            <span className="px-3 py-2 bg-muted/40 text-[11px] text-muted-foreground border-r border-border font-mono select-none">
                              /f/
                            </span>
                            <input
                              type="text"
                              placeholder="my-custom-slug"
                              value={customSlug}
                              onChange={(e) =>
                                setCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
                              }
                              maxLength={48}
                              className="w-full px-3 py-2 text-xs text-foreground bg-transparent focus:outline-none font-mono placeholder:text-muted-foreground"
                            />
                            {customSlug && (
                              <button
                                type="button"
                                onClick={() => setCustomSlug("")}
                                className="p-1.5 mr-1 text-muted-foreground hover:text-foreground cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          {customSlug && (
                            <div className="text-[10px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5">
                              <span className="font-medium text-foreground">Sync:</span>
                              <span className="font-mono text-blue-600 dark:text-blue-400 truncate max-w-[170px]">
                                gphost.eu.cc/f/{customSlug}
                              </span>
                              {shortenWithXurl && (
                                <>
                                  <span className="text-muted-foreground">&bull;</span>
                                  <span className="font-mono text-indigo-500 dark:text-indigo-400 truncate max-w-[140px]">
                                    xurl.eu.cc/{customSlug}
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center rounded-xl bg-muted/20 border border-border overflow-hidden opacity-60 cursor-not-allowed">
                          <span className="px-3 py-2 bg-muted/40 text-[11px] text-muted-foreground border-r border-border font-mono select-none">
                            /f/
                          </span>
                          <input
                            type="text"
                            disabled
                            placeholder="Upgrade to Premium to set custom slugs"
                            className="w-full px-3 py-2 text-xs text-muted-foreground bg-transparent focus:outline-none font-mono cursor-not-allowed"
                          />
                        </div>
                      )}
                    </div>

                    {/* Download Limit */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-foreground">Max Downloads (Optional)</label>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {isSingleUse ? "Single-Use: 1" : maxDownloads ? `${maxDownloads} max` : "Unlimited"}
                        </span>
                      </div>
                      <input
                        type="number"
                        min="1"
                        placeholder={isSingleUse ? "1 (Single-Use Link Locked)" : "Unlimited (e.g. 5, 10, 50)"}
                        value={isSingleUse ? "1" : maxDownloads}
                        onChange={(e) => setMaxDownloads(e.target.value)}
                        disabled={isSingleUse}
                        className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500 font-mono disabled:opacity-50"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {isSingleUse ? (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            Strictly immutable: link destroys itself immediately after first download.
                          </span>
                        ) : (
                          <span>Owner can set a download limit enforced by backend database locks, or leave empty for unlimited.</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Right Column: Security & Distribution Settings */}
                  <div className="space-y-3.5">
                    {/* Password Protection */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Password (Optional)</span>
                      </label>
                      <input
                        type="password"
                        placeholder="Leave blank for public link"
                        value={sharePassword}
                        onChange={(e) => setSharePassword(e.target.value)}
                        maxLength={128}
                        className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {/* Single-Use Burn Checkbox Card */}
                    <label className="flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/60 border border-border cursor-pointer transition select-none">
                      <div>
                        <div className="text-xs font-medium text-foreground">Single-Use Link</div>
                        <div className="text-[11px] text-muted-foreground">Expires automatically after 1st download</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={isSingleUse}
                        onChange={(e) => setIsSingleUse(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </label>

                    {/* Shorten with XURL Checkbox Card */}
                    <label className="flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/60 border border-border cursor-pointer transition select-none">
                      <div>
                        <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-blue-500" />
                          <span>Shorten &amp; Sync Link</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">Creates clean synchronized xurl.eu.cc short link (synced expiry)</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={shortenWithXurl}
                        onChange={(e) => setShortenWithXurl(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>

                {shareError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
                    {shareError}
                  </div>
                )}

                <div className="pt-3 border-t border-border flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground hidden sm:block">
                    {isFileExpired
                      ? "Expired files cannot have share links generated."
                      : "Share links inherit synchronized lifecycle with target files."}
                  </p>
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => setShareFile(null)}
                      className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-xs font-medium text-foreground transition cursor-pointer"
                    >
                      {isFileExpired ? "Close" : "Cancel"}
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateShare}
                      disabled={creatingShare || isFileExpired}
                      className={`inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold transition shadow-xs ${
                        isFileExpired
                          ? "bg-muted text-muted-foreground cursor-not-allowed border border-border"
                          : "bg-blue-600 hover:bg-blue-500 text-white cursor-pointer disabled:opacity-50"
                      }`}
                    >
                      {creatingShare && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {isFileExpired ? (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>Sharing Locked (File Expired)</span>
                        </>
                      ) : (
                        <span>Generate Share Link</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>Share link active! Anyone with this link can access the file.</span>
                </div>

                {/* Synced Expiration & Metadata Card */}
                <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      <span>Synced Expiration:</span>
                    </span>
                    <span className="font-semibold text-foreground font-mono">
                      {formatExpiry(shareResult.expires_at, currentTime)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1.5 border-t border-border/60">
                    <span>Target &amp; Short Link Sync:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      <span>Strict Backend Immutability Verified</span>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Primary Direct Link */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs font-medium text-foreground">Direct Link</label>
                        {shareResult.is_custom_slug && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                            Custom Slug
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">Primary Link</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={shareResult.shareUrl || (shareResult as unknown as { share?: { shareUrl?: string } }).share?.shareUrl || ""}
                        className="flex-1 px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground font-mono select-all"
                      />
                      <button
                        onClick={() =>
                          copyToClipboard(
                            shareResult.shareUrl || (shareResult as unknown as { share?: { shareUrl?: string } }).share?.shareUrl || "",
                            false
                          )
                        }
                        className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shadow-xs shrink-0"
                      >
                        {copiedDirect ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedDirect ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Optional XURL Short Link */}
                  {shareResult.xurl?.shortUrl ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <label className="text-xs font-medium text-foreground">Short Link</label>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                            Synced
                          </span>
                        </div>
                        <span className="text-[10px] text-blue-500 font-mono">xurl.eu.cc</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={shareResult.xurl.shortUrl}
                          className="flex-1 px-3 py-2 rounded-xl bg-background border border-border text-xs text-blue-600 dark:text-blue-400 font-mono select-all"
                        />
                        <button
                          onClick={() => copyToClipboard(shareResult.xurl!.shortUrl!, true)}
                          className="px-3 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-medium flex items-center gap-1.5 border border-border transition cursor-pointer shrink-0"
                        >
                          {copiedXurl ? <Check className="w-3.5 h-3.5" /> : <LinkIcon className="w-3.5 h-3.5" />}
                          <span>{copiedXurl ? "Copied" : "Copy"}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">Short Link Status</label>
                      <div className="p-2 rounded-xl bg-muted/20 border border-border text-[11px] text-muted-foreground flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span>Short link was not requested for this share.</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* XURL Non-Active Status Notice */}
                {shareResult.xurl && shareResult.xurl.status !== "active" && (
                  <div className="p-2.5 rounded-xl bg-muted/60 border border-border text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <span>Shortener:</span>
                      <span className="uppercase font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground">
                        {shareResult.xurl.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-muted-foreground">
                      {shareResult.xurl.error || "Shortlink pending. Direct link works normally."}
                    </p>
                  </div>
                )}

                <div className="pt-2 border-t border-border flex justify-end">
                  <button
                    onClick={() => setShareFile(null)}
                    className="px-5 py-2 rounded-xl bg-foreground text-background text-xs font-semibold hover:opacity-90 transition cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ); })()}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={Boolean(fileToDelete)}
        onClose={() => !isDeletingFile && setFileToDelete(null)}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeletingFile}
        title="Delete File?"
        description={
          <div className="space-y-1.5">
            <p>
              Are you sure you want to permanently delete{" "}
              <strong className="text-foreground">{fileToDelete?.sanitized_name}</strong>?
            </p>
            <p className="text-[11px] text-muted-foreground">
              Your storage quota will be instantly restored and all share links for this file will stop working permanently.
            </p>
          </div>
        }
        confirmText="Yes, Delete File"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}
