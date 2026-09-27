"use client";

import React, { useState } from "react";
import { Check, AlertCircle, Loader2, Shield } from "lucide-react";

interface SettingsFormProps {
  initialProfile: {
    email: string;
    full_name: string | null;
    avatar_url: string | null;
    role: string;
    status: string;
    quota_bytes: number;
    can_create_permanent: boolean;
    created_at: string;
  };
}

function formatBytes(bytes: number): string {
  if (bytes === -1) return "Unlimited";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function SettingsForm({ initialProfile }: SettingsFormProps) {
  const [fullName, setFullName] = useState(initialProfile.full_name || "");
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || data.message || "Failed to update profile");
      } else {
        setSuccessMsg("Display name updated successfully");
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } catch {
      setErrorMsg("Network error updating profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-3.5 items-stretch">
      {/* Profile Form (Left Column) */}
      <form
        onSubmit={handleSubmit}
        className="p-3.5 sm:p-4 rounded-2xl bg-card border border-border shadow-xs flex flex-col justify-between space-y-2.5"
      >
        <div className="space-y-2.5">
          <h3 className="text-base sm:text-lg font-bold text-foreground">Profile Information</h3>

          {successMsg && (
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Auto-Fetched Google Avatar */}
          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 border border-border">
            {initialProfile.avatar_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={initialProfile.avatar_url}
                alt={fullName || initialProfile.email}
                className="w-10 h-10 rounded-xl object-cover ring-2 ring-border shadow-xs shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 font-bold text-base flex items-center justify-center ring-2 ring-border shrink-0">
                {(fullName || initialProfile.email)[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <span>Profile Photo</span>
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  Google
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                Auto-fetched from your Google account.
              </p>
            </div>
          </div>

          {/* Display Name Input with Inline Save Button */}
          <div className="flex items-end gap-2 pt-0.5">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-semibold text-foreground block">Display Name</label>
              <input
                type="text"
                placeholder="e.g. Alex Smith"
                value={fullName}
                maxLength={100}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-1.5 h-9 rounded-xl bg-background border border-border text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 h-9 rounded-xl bg-foreground text-background text-sm font-bold hover:opacity-90 transition shadow-xs disabled:opacity-50 shrink-0 cursor-pointer active:scale-[0.98]"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save</span>
            </button>
          </div>
        </div>
      </form>

      {/* Account Info (Right Column) */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-card border border-border shadow-xs flex flex-col justify-between space-y-2.5">
        <div className="space-y-2">
          <h3 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-500" />
            <span>Account Details</span>
          </h3>

          <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
            <div className="p-2 sm:p-2.5 rounded-xl bg-muted/40 border border-border min-w-0">
              <div className="text-muted-foreground text-xs font-medium mb-0.5">Email Address</div>
              <div className="font-bold text-foreground truncate text-sm">{initialProfile.email}</div>
            </div>

            <div className="p-2 sm:p-2.5 rounded-xl bg-muted/40 border border-border min-w-0">
              <div className="text-muted-foreground text-xs font-medium mb-0.5">Role &amp; Status</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="px-2 py-0.5 rounded-md text-xs font-mono font-bold uppercase bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20">
                  {initialProfile.role}
                </span>
                <span className="px-2 py-0.5 rounded-md text-xs font-mono font-bold uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20">
                  {initialProfile.status}
                </span>
              </div>
            </div>

            <div className="p-2 sm:p-2.5 rounded-xl bg-muted/40 border border-border min-w-0">
              <div className="text-muted-foreground text-xs font-medium mb-0.5">Storage Limit</div>
              <div className="font-bold text-foreground text-sm">{formatBytes(initialProfile.quota_bytes)}</div>
            </div>

            <div className="p-2 sm:p-2.5 rounded-xl bg-muted/40 border border-border min-w-0">
              <div className="text-muted-foreground text-xs font-medium mb-0.5">Permanent Links</div>
              <div className="text-foreground text-sm font-bold truncate">
                {initialProfile.can_create_permanent ? "Allowed" : "Standard (90d max)"}
              </div>
            </div>
          </div>
        </div>

        <div className="py-1.5 px-3 rounded-xl bg-blue-500/5 border border-blue-500/15 text-xs text-muted-foreground font-medium truncate">
          Member since {new Date(initialProfile.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}.
        </div>
      </div>
    </div>
  );
}
