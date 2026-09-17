"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  LayoutDashboard,
  Files,
  Upload,
  Link as LinkIcon,
  Crown,
} from "lucide-react";
import { BrandLogo } from "@/components/ui/brand-logo";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { QuotaWidget } from "@/components/dashboard/quota-widget";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/auth/logout-button";

interface MobileNavProps {
  isAdmin: boolean;
  profile: {
    email: string;
    full_name: string | null;
    avatar_url: string | null;
    role: "user" | "admin";
    quota_bytes: number;
    storage_used_bytes: number;
    reserved_bytes: number;
  };
}

export function MobileNav({ isAdmin, profile }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on escape key
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

  const bottomNavItems = [
    { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
    { label: "Files", href: "/files", icon: Files },
    { label: "Upload", href: "/upload", icon: Upload, isCenter: true },
    { label: "Links", href: "/links", icon: LinkIcon },
  ];

  return (
    <>
      {/* Mobile Top Header Hamburger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Open navigation menu"
        className="p-2 -ml-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 transition cursor-pointer md:hidden"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Slide-out Drawer & Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden animate-in fade-in duration-200">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={closeDrawer}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <div className="fixed inset-y-0 left-0 w-[290px] max-w-[85vw] bg-card border-r border-border shadow-2xl flex flex-col justify-between p-5 z-10 animate-in slide-in-from-left duration-250">
            {/* Drawer Header: Brand & Close */}
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div onClick={closeDrawer}>
                  <BrandLogo size="sm" href="/dashboard" subtitle="Console" />
                </div>

                <button
                  type="button"
                  onClick={closeDrawer}
                  aria-label="Close navigation menu"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* User Profile Card */}
              <div className="p-3 rounded-xl bg-muted/40 border border-border flex items-center gap-2.5">
                {profile.avatar_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={profile.avatar_url}
                    alt={profile.full_name || profile.email}
                    className="w-8 h-8 rounded-full object-cover ring-1 ring-border shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center shrink-0 border border-blue-500/20">
                    {profile.email.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-foreground truncate flex items-center gap-1">
                    <span>{profile.full_name || profile.email.split("@")[0]}</span>
                    {isAdmin && <Crown className="w-3 h-3 text-purple-500 shrink-0" />}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate font-mono">
                    {profile.email}
                  </div>
                </div>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase shrink-0 border ${
                    isAdmin
                      ? "bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/20"
                      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20"
                  }`}
                >
                  {isAdmin ? "Admin" : "User"}
                </span>
              </div>

              {/* Navigation Links */}
              <DashboardNav isAdmin={isAdmin} onNavigate={closeDrawer} />
            </div>

            {/* Bottom: Quota Widget & Actions */}
            <div className="space-y-4 pt-4 border-t border-border">
              <QuotaWidget
                quotaBytes={profile.quota_bytes}
                storageUsedBytes={profile.storage_used_bytes}
                reservedBytes={profile.reserved_bytes}
                isAdmin={isAdmin}
              />

              <div className="flex items-center justify-between pt-1">
                <ThemeToggle />
                <LogoutButton variant="outline" className="h-8 text-xs px-2.5 rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Native App-Style Bottom Navigation Bar (md:hidden) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-card/90 backdrop-blur-xl border-t border-border shadow-lg">
        <div className="flex items-center justify-around h-14 max-w-lg mx-auto px-2">
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            if (item.isCenter) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  className="flex flex-col items-center justify-center -mt-4 group select-none"
                  aria-label={item.label}
                >
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/30 ring-2 ring-background transition-transform active:scale-95 group-hover:scale-105">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-medium text-foreground mt-0.5">
                    {item.label}
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all duration-150 select-none ${
                  isActive
                    ? "text-blue-600 dark:text-blue-400 font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4 mb-0.5" />
                <span className="text-[10px] leading-tight">{item.label}</span>
              </Link>
            );
          })}

          {/* 5th Action: Menu button to trigger Drawer */}
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="flex flex-col items-center justify-center py-1 px-3 rounded-xl text-muted-foreground hover:text-foreground transition-all duration-150 select-none cursor-pointer"
            aria-label="Open full menu"
          >
            <Menu className="w-4 h-4 mb-0.5" />
            <span className="text-[10px] leading-tight">Menu</span>
          </button>
        </div>
      </div>
    </>
  );
}
