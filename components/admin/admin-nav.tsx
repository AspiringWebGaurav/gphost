"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  KeyRound,
  FileBox,
  Globe,
  Activity,
  ShieldCheck,
  ArrowLeft,
  Home,
} from "lucide-react";

interface AdminNavProps {
  isOwner?: boolean;
  onNavigate?: () => void;
}

export function AdminNav({ isOwner = false, onNavigate }: AdminNavProps) {
  const pathname = usePathname();

  const navItems = [
    { label: "Overview", href: "/admin", icon: LayoutDashboard },
    { label: "Users & Quotas", href: "/admin/users", icon: Users },
    { label: "Access Requests", href: "/admin/requests", icon: UserCheck },
    { label: "Onboarding PINs", href: "/admin/pins", icon: KeyRound },
    { label: "Global File Audit", href: "/admin/files", icon: FileBox },
    { label: "XURL Monitor", href: "/admin/xurl", icon: Globe },
    { label: "Audit Logs", href: "/admin/activity", icon: Activity },
    {
      label: isOwner ? "Platform Health (Owner)" : "Platform Health",
      href: "/admin/settings",
      icon: ShieldCheck,
    },
  ];

  return (
    <nav className="space-y-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition ${
              isActive
                ? "bg-purple-500/15 text-purple-700 dark:text-purple-300 font-semibold border border-purple-500/30"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <Icon className={`w-4 h-4 ${isActive ? "text-purple-600 dark:text-purple-400" : "text-muted-foreground"}`} />
            <span>{item.label}</span>
          </Link>
        );
      })}

      <div className="pt-4 mt-4 border-t border-border space-y-1">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition"
        >
          <Home className="w-4 h-4 text-purple-500" />
          <span>Landing Page</span>
        </Link>
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Dashboard</span>
        </Link>
      </div>
    </nav>
  );
}
