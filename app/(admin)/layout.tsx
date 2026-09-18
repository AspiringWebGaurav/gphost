import React from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdminUser, ADMIN_EMAIL } from "@/lib/auth/session";
import { AdminNav } from "@/components/admin/admin-nav";
import { LogoutButton } from "@/components/auth/logout-button";
import { IdleSessionMonitor } from "@/components/auth/idle-session-monitor";
import { ThemeToggle } from "@/components/theme-toggle";
import { ShieldAlert, Crown, Home } from "lucide-react";

import { MobileAdminNav } from "@/components/admin/mobile-admin-nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user, profile;
  try {
    const auth = await requireAdminUser();
    user = auth.user;
    profile = auth.profile;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "UNAUTHENTICATED") {
      redirect("/login?next=/admin");
    }
    // Access denied or not admin
    redirect("/dashboard");
  }

  const isOwner = user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row antialiased transition-colors duration-200">
      <IdleSessionMonitor />
      {/* Desktop Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col justify-between hidden md:flex sticky top-0 h-screen p-5 transition-colors">
        <div className="space-y-6">
          {/* Admin Brand - Links to Landing Page */}
          <Link href="/" className="flex items-center gap-3 px-1" title="Return to Landing Page">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-500/20 ring-1 ring-purple-400/30">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold tracking-tight text-foreground text-sm">GPHosting</div>
              <div className="text-[10px] text-purple-600 dark:text-purple-400 font-mono flex items-center gap-1">
                {isOwner && <Crown className="w-2.5 h-2.5 text-amber-500" />}
                <span>{isOwner ? "Owner Console" : "Admin Console"}</span>
              </div>
            </div>
          </Link>

          {/* Navigation */}
          <AdminNav isOwner={isOwner} />
        </div>

        {/* Admin Footer Controls: Sign Out + Control Panel Card */}
        <div className="pt-3 border-t border-border space-y-3">
          <LogoutButton
            variant="sidebar"
            userEmail={profile.email}
            className="w-full"
          />

          <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs">
            <div className="text-purple-700 dark:text-purple-300 font-medium text-[11px] mb-0.5">Control Panel</div>
            <div className="text-muted-foreground text-[10px] leading-tight">
              Protected by PostgreSQL row locks &amp; security policies.
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="h-14 md:h-16 border-b border-border bg-background/80 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40 transition-colors">
          <div className="flex items-center gap-2.5 md:hidden">
            <MobileAdminNav isOwner={isOwner} email={profile.email} />
            <Link href="/" className="flex items-center gap-2" title="Return to Landing Page">
              <div className="w-7 h-7 rounded-lg bg-purple-600 flex items-center justify-center text-white shadow-xs">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <span className="font-bold text-foreground text-sm">GPHost Admin</span>
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Admin:</span>
            <span className="text-foreground font-medium">{profile.email}</span>
            {isOwner && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                <Crown className="w-2.5 h-2.5" />
                <span>Owner</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 h-8 sm:h-9 rounded-xl border border-border bg-card/60 hover:bg-muted/60 text-xs font-semibold text-foreground transition-all duration-150 shadow-xs shrink-0"
              title="Return to Landing Page"
            >
              <Home className="w-3.5 h-3.5 text-purple-500" />
              <span>Home</span>
            </Link>
            <ThemeToggle />
            <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20">
              Admin Mode
            </span>
          </div>
        </header>

        {/* Page Content with Mobile Safe-Bottom Padding */}
        <main className="flex-1 p-3.5 sm:p-6 md:p-8 pb-20 md:pb-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
