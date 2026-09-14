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
} from "lucide-react";

export interface OnboardingPinItem {
  id: string;
  label: string | null;
  is_active: boolean;
  max_uses: number;
  times_used: number;
  expires_at: string | null;
  created_at: string;
}

interface PinsManagerProps {
  initialPins: OnboardingPinItem[];
}

export function PinsManager({ initialPins }: PinsManagerProps) {
  const [pins, setPins] = useState<OnboardingPinItem[]>(initialPins);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form State
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [expiryHours, setExpiryHours] = useState(24);
  const [customPin, setCustomPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Revealed Plaintext PIN Modal State
  const [revealedPin, setRevealedPin] = useState<{
    pin: string;
    label: string | null;
    expiresAt: string | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke state
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setCreateError(null);

    try {
      const expiresAt = new Date(Date.now() + expiryHours * 3600 * 1000).toISOString();
      const body: {
        label?: string;
        max_uses: number;
        expires_at: string;
        pin?: string;
      } = {
        label: label.trim() || undefined,
        max_uses: maxUses,
        expires_at: expiresAt,
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
        throw new Error(data.error || "Failed to create PIN");
      }

      // Add to local list
      const newPinRecord: OnboardingPinItem = {
        id: data.pin_id,
        label: label.trim() || null,
        is_active: true,
        max_uses: maxUses,
        times_used: 0,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      };

      setPins((prev) => [newPinRecord, ...prev]);
      setShowCreateModal(false);
      setRevealedPin({
        pin: data.pin,
        label: label.trim() || null,
        expiresAt: expiresAt,
      });

      // Reset form
      setLabel("");
      setMaxUses(1);
      setExpiryHours(24);
      setCustomPin("");
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Creation failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async (pinId: string) => {
    setRevokingId(pinId);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/pins?pinId=${pinId}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to revoke PIN");
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
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Active & Past PINs</h2>
          <p className="text-xs text-neutral-400">
            PINs grant instantaneous onboarding bypass for invited users.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs transition shadow-lg shadow-purple-600/20"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Generate Fast-Track PIN</span>
        </button>
      </div>

      {/* PINs List */}
      <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-950/40 text-neutral-400 font-semibold">
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Usage</th>
                <th className="px-4 py-3">Expires At</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
              {pins.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-neutral-500">
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
                    <tr key={pin.id} className="hover:bg-neutral-800/30 transition">
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">
                          {pin.label || "Untitled Fast-Track PIN"}
                        </div>
                        <div className="text-[11px] text-neutral-500 font-mono">
                          ID: {pin.id.slice(0, 8)}...
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {isUsable ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle className="w-3 h-3" />
                            Active
                          </span>
                        ) : isExhausted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-neutral-800 text-neutral-400">
                            Exhausted
                          </span>
                        ) : isExpired ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Clock className="w-3 h-3" />
                            Expired
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                            <Ban className="w-3 h-3" />
                            Revoked
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px]">
                        <span className="text-white font-semibold">
                          {pin.times_used}
                        </span>{" "}
                        / <span className="text-neutral-400">{pin.max_uses}</span> uses
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px] text-neutral-400">
                        {pin.expires_at
                          ? new Date(pin.expires_at).toLocaleString()
                          : "Never"}
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px] text-neutral-500">
                        {new Date(pin.created_at).toLocaleDateString()}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {pin.is_active && !isExpired && !isExhausted ? (
                          <button
                            onClick={() => handleRevoke(pin.id)}
                            disabled={revokingId === pin.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-red-950/60 hover:text-red-400 text-neutral-300 font-medium text-[11px] transition disabled:opacity-50"
                          >
                            {revokingId === pin.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Ban className="w-3 h-3" />
                            )}
                            <span>Revoke</span>
                          </button>
                        ) : (
                          <span className="text-neutral-600 text-[11px] italic">
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

      {/* Create PIN Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-semibold text-white">
                  Generate Fast-Track PIN
                </h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-neutral-300 font-medium">
                  Label / Intended Recipient
                </label>
                <input
                  type="text"
                  placeholder="e.g. VIP invite for developer partner"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-neutral-300 font-medium">Max Uses</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={maxUses}
                    onChange={(e) => setMaxUses(Number(e.target.value))}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-200 focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-neutral-300 font-medium">Validity</label>
                  <select
                    value={expiryHours}
                    onChange={(e) => setExpiryHours(Number(e.target.value))}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-200 focus:outline-none focus:border-purple-500"
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
                  <label className="text-neutral-300 font-medium">
                    Custom 4-Digit PIN (Optional)
                  </label>
                  <span className="text-[11px] text-neutral-500">
                    Leave blank to auto-generate
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={4}
                  placeholder="e.g. 7492"
                  value={customPin}
                  onChange={(e) => setCustomPin(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-purple-500 font-mono tracking-widest text-center"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-neutral-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium transition disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Generate PIN</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revealed Plaintext PIN Modal */}
      {revealedPin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="bg-neutral-900 border border-purple-500/40 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-5 text-xs text-center animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-purple-500/15 border border-purple-500/30 flex items-center justify-center mx-auto text-purple-400">
              <KeyRound className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">
                Fast-Track PIN Generated
              </h3>
              <p className="text-neutral-400 text-xs mt-1">
                {revealedPin.label || "One-time invitation PIN"}
              </p>
            </div>

            {/* Plaintext PIN Banner */}
            <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800 flex flex-col items-center gap-2">
              <span className="text-neutral-500 text-[11px] uppercase tracking-wider font-semibold">
                Access PIN
              </span>
              <span className="text-3xl font-extrabold text-purple-400 font-mono tracking-widest">
                {revealedPin.pin}
              </span>
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 font-medium text-xs transition border border-purple-500/30 mt-1"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copied ? "Copied to Clipboard!" : "Copy PIN"}</span>
              </button>
            </div>

            {/* Strict Security Alert */}
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-left flex gap-2.5 text-[11px] text-amber-300">
              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <strong className="font-semibold block text-amber-200">
                  One-Time Secret Notice
                </strong>
                Save or send this PIN immediately. In accordance with zero-trust security invariants, this PIN is stored using Argon2id salted hashing and cannot be retrieved again once dismissed.
              </div>
            </div>

            <button
              onClick={() => setRevealedPin(null)}
              className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs transition"
            >
              I Have Saved This PIN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
