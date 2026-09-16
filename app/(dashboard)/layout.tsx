import React from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser, getUserProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { QuotaWidget } from "@/components/dashboard/quota-widget";
import { StorageProvider } from "@/components/storage/storage-provider";
import { LogoutButton } from "@/components/auth/logout-button";
import { IdleSessionMonitor } from "@/components/auth/idle-session-monitor";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Layers } from "lucide-react";

import { MobileNav } from "@/components/dashboard/mobile-nav";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login?next=/dashboard");
  }

  const profile = await getUserProfile(user.id);
  if (!profile) {
    redirect("/login");
  }

  if (profile.status === "revoked") {
    redirect("/login?reason=revoked");
  }

  if (profile.status !== "approved") {
    redirect("/access-gate");
  }

  // If user was issued an Onboarding PIN by administrator, force verification at access-gate before vault access
  if (user.email) {
    const adminClient = createAdminClient();
    const nowIso = new Date().toISOString();
    const { data: activePin } = await adminClient
      .from("onboarding_pins")
      .select("id")
      .eq("is_active", true)
      .ilike("label", `%User: ${user.email}%`)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .limit(1)
      .maybeSingle();

    if (activePin) {
      redirect("/access-gate");
    }
  }

  const isAdmin = profile.role === "admin";

  return (
    <StorageProvider initialProfile={profile} initialUserId={user.id}>
      <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row antialiased transition-colors duration-200">
        <IdleSessionMonitor />
      {/* Desktop Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col justify-between hidden md:flex sticky top-0 h-screen p-5 transition-colors">
        <div className="space-y-6">
          {/* Brand */}
          <div className="px-1">
            <BrandLogo size="sm" href="/dashboard" subtitle="Console" />
          </div>

          {/* Navigation */}
          <DashboardNav isAdmin={isAdmin} />
        </div>

        {/* Quota Widget at bottom of sidebar */}
        <div className="pt-4 border-t border-border">
          <QuotaWidget
            quotaBytes={profile.quota_bytes}
            storageUsedBytes={profile.storage_used_bytes}
            reservedBytes={profile.reserved_bytes}
            isAdmin={isAdmin}
          />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="h-14 md:h-16 border-b border-border bg-background/80 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40 shrink-0 transition-colors">
          <div className="flex items-center gap-2.5 md:hidden">
            <MobileNav
              isAdmin={isAdmin}
              profile={{
                email: profile.email,
                full_name: profile.full_name,
                avatar_url: profile.avatar_url,
                role: profile.role,
                quota_bytes: profile.quota_bytes,
                storage_used_bytes: profile.storage_used_bytes,
                reserved_bytes: profile.reserved_bytes,
              }}
            />
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
                <Layers className="w-4 h-4" />
              </div>
              <span className="font-bold text-foreground text-sm">GPHosting</span>
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-2.5 text-xs text-muted-foreground">
            {profile.avatar_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={profile.avatar_url}
                alt={profile.full_name || profile.email}
                className="w-6 h-6 rounded-full object-cover ring-1 ring-border shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : null}
            <span>Signed in as</span>
            <span className="text-foreground font-medium">{profile.email}</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span
              className={`hidden sm:inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                isAdmin
                  ? "bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/20"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20"
              }`}
            >
              {isAdmin ? "Admin" : "Standard"}
            </span>
            <ThemeToggle />
            <LogoutButton variant="outline" className="hidden sm:inline-flex" />
          </div>
        </header>

        {/* Page Content with Mobile Safe-Bottom Padding */}
        <main className="flex-1 p-3.5 sm:p-5 md:p-6 pb-20 md:pb-6 max-w-5xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
    </StorageProvider>
  );
}
