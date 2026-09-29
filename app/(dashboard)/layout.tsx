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
import { Layers, Home, BookOpen } from "lucide-react";

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

  const adminClient = createAdminClient();
  const nowIso = new Date().toISOString();

  const [profile, activePinRes] = await Promise.all([
    getUserProfile(user.id),
    user.email
      ? adminClient
          .from("onboarding_pins")
          .select("id")
          .eq("is_active", true)
          .ilike("label", `%User: ${user.email}%`)
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!profile) {
    redirect("/login");
  }

  if (profile.status === "revoked") {
    redirect("/login?reason=revoked");
  }

  if (profile.status !== "approved") {
    redirect("/access-gate");
  }

  if (activePinRes.data) {
    redirect("/access-gate");
  }

  const isAdmin = profile.role === "admin";

  return (
    <StorageProvider initialProfile={profile} initialUserId={user.id}>
      <div className="min-h-screen md:h-screen md:overflow-hidden bg-background text-foreground flex flex-col md:flex-row antialiased transition-colors duration-200">
        <IdleSessionMonitor />
      {/* Desktop Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col justify-between hidden md:flex sticky top-0 h-screen p-5 shrink-0 transition-colors">
        <div className="space-y-6">
          {/* Brand - Links to Landing Page */}
          <div className="px-1">
            <BrandLogo size="sm" href="/" subtitle="Console" />
          </div>

          {/* Navigation */}
          <DashboardNav isAdmin={isAdmin} />
        </div>

        {/* Bottom Sidebar: Sign Out above Storage Quota Widget */}
        <div className="pt-3 border-t border-border space-y-3">
          <LogoutButton
            variant="sidebar"
            userEmail={profile.email}
            className="w-full"
          />

          <QuotaWidget
            quotaBytes={profile.quota_bytes}
            storageUsedBytes={profile.storage_used_bytes}
            reservedBytes={profile.reserved_bytes}
            isAdmin={isAdmin}
          />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 w-full max-w-full overflow-x-hidden md:h-screen md:overflow-y-auto">
        {/* Top Navbar */}
        <header className="h-14 md:h-16 border-b border-border bg-background dark:bg-[#070a12] md:bg-background/80 md:backdrop-blur-xl px-3 sm:px-6 flex items-center justify-between sticky top-0 z-40 shrink-0 shadow-xs md:shadow-none transition-colors">
          <div className="flex items-center gap-2 sm:gap-2.5 md:hidden min-w-0">
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
            <Link href="/" className="flex items-center gap-1.5 sm:gap-2 min-w-0" title="Return to Landing Page">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <span className="font-bold text-foreground text-sm truncate">GPHosting</span>
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-2.5 text-sm text-muted-foreground min-w-0">
            {profile.avatar_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={profile.avatar_url}
                alt={profile.full_name || profile.email}
                className="w-7 h-7 rounded-full object-cover ring-1 ring-border shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : null}
            <span>Signed in as</span>
            <span className="text-foreground font-semibold truncate">{profile.email}</span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 h-8 sm:h-9 rounded-xl border border-border bg-card/60 hover:bg-muted/60 text-xs sm:text-sm font-semibold text-foreground transition-all duration-150 shadow-xs shrink-0"
              title="Return to Landing Page"
            >
              <Home className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500" />
              <span className="hidden sm:inline">Home</span>
            </Link>

            <Link
              href="/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 h-8 sm:h-9 rounded-xl border border-border bg-card/60 hover:bg-muted/60 text-xs sm:text-sm font-semibold text-foreground transition-all duration-150 shadow-xs shrink-0"
              title="Documentation & Usage Guides (Opens in new tab)"
            >
              <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500" />
              <span className="hidden sm:inline">Docs</span>
            </Link>

            <span
              className={`hidden sm:inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                isAdmin
                  ? "bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/20"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20"
              }`}
            >
              {isAdmin ? "Admin" : "Standard"}
            </span>
            <ThemeToggle className="h-8 w-8 sm:h-9 sm:w-9 shrink-0" />
          </div>
        </header>

        {/* Page Content with Mobile Safe-Bottom Padding */}
        <main className="flex-1 p-2.5 sm:p-4 md:px-6 md:py-2.5 pb-16 md:pb-2.5 max-w-5xl w-full mx-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
    </StorageProvider>
  );
}
