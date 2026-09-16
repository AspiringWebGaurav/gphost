"use client";

import React, { useState } from "react";
import {
  KeyRound,
  Plus,
  Copy,
  Check,
  Ban,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  X,
  ShieldAlert,
  HardDrive,
  FileBox,
} from "lucide-react";

export interface OnboardingPinItem {
  id: string;
  label: string | null;
  quota_bytes?: number | null;
  max_files?: number | null;
  is_active: boolean;
  max_uses: number;
  times_used: number;
  expires_at: string | null;
  created_at: string;
}

interface PinsManagerProps {
  initialPins: OnboardingPinItem[];
}

function formatQuota(bytes: number | null | undefined): string {
  if (!bytes) return "Default (5 GB)";
  if (bytes === -1) return "Unlimited";
  if (bytes < 1024 * 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024))} MB`;
  }
  const gb = bytes / (1024 * 1024 * 1024);
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
}

function getQuotaBytes(preset: string, customMb: number): number | null {
  switch (preset) {
    case "1mb":
      return 1024 * 1024;
    case "10mb":
      return 10 * 1024 * 1024;
    case "50mb":
      return 50 * 1024 * 1024;
    case "100mb":
      return 100 * 1024 * 1024;
    case "500mb":
      return 500 * 1024 * 1024;
    case "1gb":
      return 1024 * 1024 * 1024;
    case "5gb":
      return 5 * 1024 * 1024 * 1024;
    case "unlimited":
      return -1;
    case "custom":
      return Math.max(1, Math.floor(customMb)) * 1024 * 1024;
    default:
      return null;
  }
}

export function PinsManager({ initialPins }: PinsManagerProps) {
  const [pins, setPins] = useState<OnboardingPinItem[]>(initialPins);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form State
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [expiryHours, setExpiryHours] = useState(24);
  const [customPin, setCustomPin] = useState("");
  const [quotaPreset, setQuotaPreset] = useState<string>("5gb");
  const [customQuotaMb, setCustomQuotaMb] = useState<number>(10);
  const [fileLimitPreset, setFileLimitPreset] = useState<string>("5");
  const [customFileLimit, setCustomFileLimit] = useState<number>(5);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Revealed Plaintext PIN Modal State
  const [revealedPin, setRevealedPin] = useState<{
    pin: string;
    label: string | null;
    quotaBytes?: number | null;
    maxFiles?: number | null;
    expiresAt: string | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke state
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const computeMaxFiles = (): number | null => {
    if (fileLimitPreset === "unlimited") return null;
    if (fileLimitPreset === "custom") return Math.max(1, Math.floor(customFileLimit));
    const parsed = parseInt(fileLimitPreset, 10);
    return isNaN(parsed) ? null : parsed;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setCreateError(null);

    try {
      const expiresAt = new Date(Date.now() + expiryHours * 3600 * 1000).toISOString();
      const computedQuotaBytes = getQuotaBytes(quotaPreset, customQuotaMb);
      const computedMaxFiles = computeMaxFiles();

      const body: {
        label?: string;
        max_uses: number;
        expires_at: string;
        pin?: string;
        quota_bytes?: number | null;
        max_files?: number | null;
      } = {
        label: label.trim() || undefined,
        max_uses: maxUses,
        expires_at: expiresAt,
        quota_bytes: computedQuotaBytes,
        max_files: computedMaxFiles,
      };

      if (customPin.trim()) {
        if (!/^\d{4}$/.test(customPin.trim())) {
          throw new Error("Custom PIN must be exactly 4 digits");
        }
        body.pin = customPin.trim();
      }

      const res = await fetch("/api/admin/pins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || "Failed to create PIN");
      }

      const createdPin = data.pin;
      // Add to local list
      const newPinRecord: OnboardingPinItem = {
        id: createdPin.id,
        label: createdPin.label || label.trim() || null,
        quota_bytes: createdPin.quota_bytes ?? computedQuotaBytes,
        max_files: createdPin.max_files ?? computedMaxFiles,
        is_active: true,
        max_uses: createdPin.max_uses ?? maxUses,
        times_used: 0,
        expires_at: createdPin.expires_at ?? expiresAt,
        created_at: new Date().toISOString(),
      };

      setPins([newPinRecord, ...pins]);
      setShowCreateModal(false);

      // Reveal plaintext PIN in modal
      setRevealedPin({
        pin: createdPin.plaintextPin,
        label: createdPin.label || label.trim() || null,
        quotaBytes: createdPin.quota_bytes ?? computedQuotaBytes,
        maxFiles: createdPin.max_files ?? computedMaxFiles,
        expiresAt: createdPin.expires_at ?? expiresAt,
      });

      // Reset form
      setLabel("");
      setMaxUses(1);
      setCustomPin("");
      setQuotaPreset("5gb");
      setFileLimitPreset("5");
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create PIN");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async (pinId: string) => {
    if (!confirm("Are you sure you want to deactivate and revoke this fast-track PIN?")) {
      return;
    }

    setRevokingId(pinId);
    setActionError(null);

    try {
      const res = await fetch("/api/admin/pins", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin_id: pinId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || "Failed to revoke PIN");
      }

      setPins((prev) =>
        prev.map((p) => (p.id === pinId ? { ...p, is_active: false } : p))
      );
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Revocation failed");
    } finally {
      setRevokingId(null);
    }
  };

  const copyToClipboard = () => {
    if (!revealedPin) return;
    navigator.clipboard.writeText(revealedPin.pin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {actionError && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 flex items-center gap-2 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Top Controls */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs text-muted-foreground font-mono">
            {pins.length} Registered {pins.length === 1 ? "PIN" : "PINs"}
          </span>
        </div>
        <button
          onClick={() => {
            setCreateError(null);
            setShowCreateModal(true);
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Generate New PIN</span>
        </button>
      </div>

      {/* PINs Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                <th className="px-4 py-3">Label / Recipient</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">File Limit</th>
                <th className="px-4 py-3">Storage Quota</th>
                <th className="px-4 py-3">Usage</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-muted-foreground">
              {pins.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-muted-foreground">
                    No onboarding PINs created yet.
                  </td>
                </tr>
              ) : (
                pins.map((pin) => {
                  const isExpired =
                    pin.expires_at && new Date(pin.expires_at) < new Date();
                  const isExhausted = pin.times_used >= pin.max_uses;
                  const isUsable = pin.is_active && !isExpired && !isExhausted;

                  return (
                    <tr key={pin.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">
                          {pin.label || "Untitled Fast-Track PIN"}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          ID: {pin.id.slice(0, 8)}...
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {isUsable ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                            <CheckCircle className="w-3 h-3" />
                            Active
                          </span>
                        ) : isExhausted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                            Exhausted
                          </span>
                        ) : isExpired ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                            <Clock className="w-3 h-3" />
                            Expired
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20">
                            <Ban className="w-3 h-3" />
                            Revoked
                          </span>
                        )}
                      </td>

                      {/* File Limit */}
                      <td className="px-4 py-3 font-mono text-[11px]">
                        {pin.max_files ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                            <FileBox className="w-3 h-3 text-purple-500" />
                            {pin.max_files} files max
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Unlimited</span>
                        )}
                      </td>

                      {/* Storage Quota */}
                      <td className="px-4 py-3 font-mono text-[11px]">
                        {pin.quota_bytes ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                            <HardDrive className="w-3 h-3 text-blue-500" />
                            {formatQuota(pin.quota_bytes)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Default (5 GB)</span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px]">
                        <span className="text-foreground font-semibold">
                          {pin.times_used}
                        </span>{" "}
                        / <span className="text-muted-foreground">{pin.max_uses}</span> uses
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                        {pin.expires_at
                          ? new Date(pin.expires_at).toLocaleString()
                          : "Never"}
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                        {new Date(pin.created_at).toLocaleDateString()}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {pin.is_active && !isExpired && !isExhausted ? (
                          <button
                            onClick={() => handleRevoke(pin.id)}
                            disabled={revokingId === pin.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 text-muted-foreground font-medium text-[11px] transition border border-border cursor-pointer disabled:opacity-50"
                          >
                            {revokingId === pin.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Ban className="w-3 h-3" />
                            )}
                            <span>Revoke</span>
                          </button>
                        ) : (
                          <span className="text-muted-foreground/60 text-[11px] italic">
                            Inactive
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE PIN MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-xs">
          <div className="bg-card border border-border text-card-foreground rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <h3 className="text-sm font-semibold text-foreground">
                  Generate Fast-Track Onboarding PIN
                </h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-foreground font-medium">
                  Label / Intended Recipient
                </label>
                <input
                  type="text"
                  placeholder="e.g. Developer partner fast-track pass"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                />
              </div>

              {/* File Access Limit */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-foreground font-medium flex items-center gap-1.5">
                    <FileBox className="w-3.5 h-3.5 text-purple-500" />
                    <span>How many files can this PIN access/upload?</span>
                  </label>
                  <span className="text-[11px] font-mono text-purple-600 dark:text-purple-400 font-semibold">
                    {fileLimitPreset === "unlimited" ? "Unlimited" : `${computeMaxFiles()} files`}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { label: "1 File", val: "1" },
                    { label: "3 Files", val: "3" },
                    { label: "5 Files", val: "5" },
                    { label: "10 Files", val: "10" },
                    { label: "25 Files", val: "25" },
                    { label: "50 Files", val: "50" },
                    { label: "Unlimited", val: "unlimited" },
                    { label: "Custom", val: "custom" },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setFileLimitPreset(opt.val)}
                      className={`py-1.5 px-2 rounded-xl text-xs font-medium border transition cursor-pointer text-center ${
                        fileLimitPreset === opt.val
                          ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                          : "bg-background border-border text-foreground hover:bg-muted"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {fileLimitPreset === "custom" && (
                  <div className="pt-1.5">
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={customFileLimit}
                      onChange={(e) => setCustomFileLimit(parseInt(e.target.value, 10) || 1)}
                      placeholder="Enter file count..."
                      className="w-full bg-background border border-border rounded-xl px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                    />
                  </div>
                )}
              </div>

              {/* Storage Quota Assignment */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-foreground font-medium flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-blue-500" />
                    <span>Allocated Storage Quota</span>
                  </label>
                  <span className="text-[11px] text-muted-foreground">Hard cap</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { id: "100mb", label: "100 MB", desc: "Starter" },
                    { id: "500mb", label: "500 MB", desc: "Basic" },
                    { id: "1gb", label: "1 GB", desc: "Pro" },
                    { id: "5gb", label: "5 GB", desc: "Standard" },
                    { id: "10gb", label: "10 GB", desc: "Extended" },
                    { id: "unlimited", label: "Unlimited", desc: "Admin" },
                    { id: "10mb", label: "10 MB", desc: "Test" },
                    { id: "custom", label: "Custom", desc: "Manual MB" },
                  ].map((preset) => {
                    const isSelected = quotaPreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setQuotaPreset(preset.id)}
                        className={`px-2 py-1.5 rounded-xl border text-center transition flex flex-col items-center justify-center cursor-pointer ${
                          isSelected
                            ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                            : "bg-background border-border text-foreground hover:bg-muted"
                        }`}
                      >
                        <span className="font-semibold text-xs leading-tight">{preset.label}</span>
                        <span className={`text-[9px] mt-0.5 ${isSelected ? "text-blue-100" : "text-muted-foreground"}`}>
                          {preset.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {quotaPreset === "custom" && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="number"
                      min={1}
                      max={102400}
                      value={customQuotaMb}
                      onChange={(e) => setCustomQuotaMb(Math.max(1, Number(e.target.value)))}
                      className="w-full bg-background border border-border rounded-xl px-3 py-1.5 text-foreground font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      placeholder="Enter quota in Megabytes"
                    />
                    <span className="text-xs text-muted-foreground font-mono shrink-0">MB</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-foreground font-medium">Max Uses</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={maxUses}
                    onChange={(e) => setMaxUses(Number(e.target.value))}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-foreground font-medium">Validity</label>
                  <select
                    value={expiryHours}
                    onChange={(e) => setExpiryHours(Number(e.target.value))}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30 cursor-pointer"
                  >
                    <option value={24}>24 Hours</option>
                    <option value={72}>3 Days</option>
                    <option value={168}>7 Days</option>
                    <option value={720}>30 Days</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-foreground font-medium">
                    Custom 4-Digit PIN (Optional)
                  </label>
                  <span className="text-[11px] text-muted-foreground">
                    Leave blank to auto-generate
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={4}
                  placeholder="e.g. 7492"
                  value={customPin}
                  onChange={(e) => setCustomPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30 font-mono tracking-widest text-center"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium transition cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Generate PIN</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REVEALED PIN MODAL */}
      {revealedPin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-card border border-border text-card-foreground rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-5 text-xs text-center">
            <div className="w-12 h-12 rounded-full bg-purple-500/15 border border-purple-500/30 flex items-center justify-center mx-auto text-purple-600 dark:text-purple-400">
              <KeyRound className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-foreground">
                Fast-Track PIN Generated
              </h3>
              <p className="text-muted-foreground text-xs mt-1">
                {revealedPin.label || "One-time invitation PIN"}
              </p>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-300 text-xs font-semibold">
                <FileBox className="w-3.5 h-3.5 text-purple-500" />
                <span>Limit: {revealedPin.maxFiles ? `${revealedPin.maxFiles} files` : "Unlimited files"}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                <HardDrive className="w-3.5 h-3.5 text-blue-500" />
                <span>Storage: {formatQuota(revealedPin.quotaBytes)}</span>
              </span>
            </div>

            {/* Plaintext PIN Banner */}
            <div className="p-4 bg-muted/40 rounded-xl border border-border flex flex-col items-center gap-2">
              <span className="text-muted-foreground text-[11px] uppercase tracking-wider font-semibold">
                Access PIN
              </span>
              <span className="text-3xl font-extrabold text-purple-600 dark:text-purple-400 font-mono tracking-widest">
                {revealedPin.pin}
              </span>
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-500 font-medium text-xs transition shadow-xs cursor-pointer mt-1"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copied ? "Copied to Clipboard!" : "Copy PIN"}</span>
              </button>
            </div>

            {/* Security Alert */}
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-left flex gap-2.5 text-[11px] text-amber-800 dark:text-amber-300">
              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <strong className="font-semibold block text-amber-900 dark:text-amber-200">
                  One-Time Secret Notice
                </strong>
                Save or send this PIN immediately. In accordance with zero-trust security invariants, this PIN is stored using Argon2id salted hashing and cannot be retrieved again once dismissed.
              </div>
            </div>

            <button
              onClick={() => setRevealedPin(null)}
              className="w-full py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-medium text-xs transition cursor-pointer"
            >
              I Have Saved This PIN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
