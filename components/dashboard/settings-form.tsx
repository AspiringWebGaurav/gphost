"use client";

import React, { useState } from "react";
import {
  Check,
  AlertCircle,
  Loader2,
  ShieldCheck,
  User,
  Calendar,
  Lock,
  HardDrive,
  Mail,
  Award,
  Link as LinkIcon,
} from "lucide-react";

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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 items-stretch">
      {/* Profile Form (Left Column) */}
      <form
        onSubmit={handleSubmit}
        className="p-4 sm:p-5 rounded-2xl bg-card border border-border/80 shadow-xs flex flex-col justify-between space-y-4"
      >
        <div className="space-y-4">
          {/* Symmetrical Card Header */}
          <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20 shadow-2xs">
                <User className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-foreground truncate">
                  Profile Information
                </h3>
                <p className="text-[11.5px] text-muted-foreground truncate">
                  Your public display name and Google SSO identity
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
              Identity
            </span>
          </div>

          {successMsg && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2 animate-in fade-in duration-150">
              <Check className="w-4 h-4 shrink-0" />
              <span className="font-semibold">{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-semibold">{errorMsg}</span>
            </div>
          )}

          {/* Auto-Fetched Google Avatar */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/80">
            {initialProfile.avatar_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={initialProfile.avatar_url}
                alt={fullName || initialProfile.email}
                className="w-11 h-11 rounded-xl object-cover ring-2 ring-border shadow-xs shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 font-bold text-base flex items-center justify-center ring-2 ring-border shrink-0">
                {(fullName || initialProfile.email)[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs sm:text-sm font-bold text-foreground">Profile Avatar</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  Google SSO
                </span>
              </div>
              <p className="text-[11.5px] text-muted-foreground mt-0.5 truncate">
                Synchronized with your authenticated Google workspace account.
              </p>
            </div>
          </div>

          {/* Display Name Input with Save Button */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Display Name</span>
              <span className="text-[11px] text-muted-foreground font-mono">
                {fullName.length}/100
              </span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="e.g. Alex Smith"
                value={fullName}
                maxLength={100}
                onChange={(e) => setFullName(e.target.value)}
                className="flex-1 px-3.5 py-2 h-10 rounded-xl bg-background border border-border text-xs sm:text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
              />
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-1.5 px-4 h-10 rounded-xl bg-foreground text-background text-xs sm:text-sm font-bold hover:opacity-90 transition shadow-xs disabled:opacity-50 shrink-0 cursor-pointer active:scale-[0.98]"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Save</span>
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Appears on file share landing pages, download portals, and team audit logs.
            </p>
          </div>
        </div>

        {/* Symmetrical Left Footer */}
        <div className="pt-2.5 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 text-[11px]">
            <Lock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span>OAuth 2.0 Single Sign-On Active</span>
          </div>
          <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
            Secured
          </span>
        </div>
      </form>

      {/* Account Info (Right Column) */}
      <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border/80 shadow-xs flex flex-col justify-between space-y-4">
        <div className="space-y-4">
          {/* Symmetrical Card Header */}
          <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20 shadow-2xs">
                <ShieldCheck className="w-4 h-4 text-blue-500" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-foreground truncate">
                  Account Details
                </h3>
                <p className="text-[11.5px] text-muted-foreground truncate">
                  Subscription plan, role authorization &amp; storage limit
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
              Verified
            </span>
          </div>

          {/* Symmetrical 2x2 Grid */}
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            {/* 1. Email */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-muted/30 border border-border/80 min-w-0 flex flex-col justify-between space-y-1">
              <div className="text-muted-foreground text-[11px] font-medium flex items-center gap-1">
                <Mail className="w-3 h-3 text-muted-foreground" />
                <span>Email Address</span>
              </div>
              <div className="font-bold text-foreground truncate text-xs sm:text-sm">
                {initialProfile.email}
              </div>
            </div>

            {/* 2. Role & Status */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-muted/30 border border-border/80 min-w-0 flex flex-col justify-between space-y-1">
              <div className="text-muted-foreground text-[11px] font-medium flex items-center gap-1">
                <Award className="w-3 h-3 text-muted-foreground" />
                <span>Role &amp; Status</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-md text-[10.5px] font-mono font-bold uppercase bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20">
                  {initialProfile.role}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10.5px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20">
                  {initialProfile.status}
                </span>
              </div>
            </div>

            {/* 3. Storage Limit */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-muted/30 border border-border/80 min-w-0 flex flex-col justify-between space-y-1">
              <div className="text-muted-foreground text-[11px] font-medium flex items-center gap-1">
                <HardDrive className="w-3 h-3 text-muted-foreground" />
                <span>Storage Limit</span>
              </div>
              <div className="font-bold text-foreground text-xs sm:text-sm flex items-center gap-1.5">
                <span>{formatBytes(initialProfile.quota_bytes)}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-semibold">
                  {initialProfile.quota_bytes === -1 ? "High Cap" : "Fixed"}
                </span>
              </div>
            </div>

            {/* 4. Permanent Links */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-muted/30 border border-border/80 min-w-0 flex flex-col justify-between space-y-1">
              <div className="text-muted-foreground text-[11px] font-medium flex items-center gap-1">
                <LinkIcon className="w-3 h-3 text-muted-foreground" />
                <span>Permanent Links</span>
              </div>
              <div className="text-foreground text-xs sm:text-sm font-bold truncate flex items-center gap-1.5">
                <span className={initialProfile.can_create_permanent ? "text-emerald-600 dark:text-emerald-400" : ""}>
                  {initialProfile.can_create_permanent ? "Allowed" : "Standard (90d max)"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Symmetrical Right Footer */}
        <div className="pt-2.5 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 text-[11px]">
            <Calendar className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span>
              Member since {new Date(initialProfile.created_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground">
            Account ID: {initialProfile.email.split("@")[0]}
          </span>
        </div>
      </div>
    </div>
  );
}
