"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  ShieldAlert,
  Crown,
  LayoutDashboard,
  Users,
  UserCheck,
  KeyRound,
  FileBox,
} from "lucide-react";
import { AdminNav } from "@/components/admin/admin-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/auth/logout-button";

interface MobileAdminNavProps {
  isOwner: boolean;
  email: string;
}

export function MobileAdminNav({ isOwner, email }: MobileAdminNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Close drawer when pathname changes (React-recommended render-time state adjustment)
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setIsOpen(false);
  }

  const closeDrawer = () => setIsOpen(false);

  const adminBottomTabs = [
    { label: "Overview", href: "/admin", icon: LayoutDashboard },
    { label: "Users", href: "/admin/users", icon: Users },
    { label: "Requests", href: "/admin/requests", icon: UserCheck },
    { label: "PINs", href: "/admin/pins", icon: KeyRound },
    { label: "Audit", href: "/admin/files", icon: FileBox },
  ];

  return (
    <>
      {/* Mobile Header Hamburger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Open admin menu"
        className="p-2 -ml-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 transition cursor-pointer md:hidden"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Slide-out Drawer & Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden animate-in fade-in duration-200">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={closeDrawer}
            aria-hidden="true"
          />

          <div className="fixed inset-y-0 left-0 w-[290px] max-w-[85vw] bg-card border-r border-border shadow-2xl flex flex-col justify-between p-5 z-10 animate-in slide-in-from-left duration-250">
            <div className="space-y-5">
              {/* Drawer Header: Brand & Close */}
              <div className="flex items-center justify-between">
                <Link
                  href="/admin"
                  onClick={closeDrawer}
                  className="flex items-center gap-2.5"
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-500/20 ring-1 ring-purple-400/30">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold tracking-tight text-foreground text-sm leading-none">
                      GPHosting
                    </div>
                    <div className="text-[10px] text-purple-600 dark:text-purple-400 font-mono flex items-center gap-1 mt-0.5">
                      {isOwner && <Crown className="w-2.5 h-2.5 text-amber-500" />}
                      <span>{isOwner ? "Owner Console" : "Admin Console"}</span>
                    </div>
                  </div>
                </Link>

                <button
                  type="button"
                  onClick={closeDrawer}
                  aria-label="Close admin menu"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Admin Profile Strip */}
              <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-between">
                <div className="min-w-0 pr-2">
                  <div className="text-xs font-semibold text-foreground truncate flex items-center gap-1">
                    <span>{email.split("@")[0]}</span>
                    {isOwner && <Crown className="w-3 h-3 text-amber-500 shrink-0" />}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate font-mono">
                    {email}
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30 shrink-0">
                  {isOwner ? "Owner" : "Admin"}
                </span>
              </div>

              {/* Admin Navigation */}
              <AdminNav isOwner={isOwner} onNavigate={closeDrawer} />
            </div>

            {/* Bottom: Control Panel Status & Actions */}
            {/* Bottom Actions: Sign Out + Control Panel + Theme */}
            <div className="space-y-3 pt-4 border-t border-border">
              <LogoutButton
                variant="sidebar"
                userEmail={email}
                className="w-full"
              />

              <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs">
                <div className="text-purple-700 dark:text-purple-300 font-medium text-[11px] mb-0.5">
                  Control Panel
                </div>
                <div className="text-muted-foreground text-[10px] leading-tight">
                  Protected by PostgreSQL row locks &amp; security policies.
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">Interface Theme</span>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Mobile Quick Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-card/90 backdrop-blur-xl border-t border-border shadow-lg">
        <div className="flex items-center justify-around h-14 max-w-lg mx-auto px-1">
          {adminBottomTabs.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all duration-150 select-none ${
                  isActive
                    ? "text-purple-600 dark:text-purple-400 font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4 mb-0.5" />
                <span className="text-[10px] leading-tight">{item.label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-muted-foreground hover:text-foreground transition-all duration-150 select-none cursor-pointer"
            aria-label="Open all admin tools"
          >
            <Menu className="w-4 h-4 mb-0.5" />
            <span className="text-[10px] leading-tight">All</span>
          </button>
        </div>
      </div>
    </>
  );
}
