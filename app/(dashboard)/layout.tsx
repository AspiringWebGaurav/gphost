import React from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser, getUserProfile } from "@/lib/auth/session";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { QuotaWidget } from "@/components/dashboard/quota-widget";
import { LogoutButton } from "@/components/auth/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Layers } from "lucide-react";

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

  if (profile.status !== "approved") {
    redirect("/access-gate");
  }

  const isAdmin = profile.role === "admin";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row antialiased transition-colors duration-200">
      {/* Desktop Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col justify-between hidden md:flex sticky top-0 h-screen p-5 transition-colors">
        <div className="space-y-6">
          {/* Brand */}
          <Link href="/dashboard" className="flex items-center gap-3 px-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold tracking-tight text-foreground text-sm">GPHosting</div>
              <div className="text-[10px] text-muted-foreground font-mono">Console</div>
            </div>
          </Link>

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
        <header className="h-16 border-b border-border bg-background/80 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-40 shrink-0 transition-colors">
          <div className="flex items-center gap-3 md:hidden">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <Layers className="w-4 h-4" />
            </div>
            <span className="font-bold text-foreground text-sm">GPHosting</span>
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

          <div className="flex items-center gap-3">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                isAdmin
                  ? "bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/20"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20"
              }`}
            >
              {isAdmin ? "Admin" : "Standard"}
            </span>
            <ThemeToggle />
            <LogoutButton variant="outline" />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-6 max-w-5xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
