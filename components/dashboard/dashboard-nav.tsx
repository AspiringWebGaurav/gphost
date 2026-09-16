"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Upload,
  Files,
  Link as LinkIcon,
  Clock,
  Settings,
  ShieldAlert,
} from "lucide-react";

interface DashboardNavProps {
  isAdmin?: boolean;
  onNavigate?: () => void;
}

export function DashboardNav({ isAdmin = false, onNavigate }: DashboardNavProps) {
  const pathname = usePathname();

  const navItems = [
    { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
    { label: "Upload", href: "/upload", icon: Upload },
    { label: "Files", href: "/files", icon: Files },
    { label: "Links", href: "/links", icon: LinkIcon },
    { label: "Expiring", href: "/expiring", icon: Clock },
    { label: "Settings", href: "/settings", icon: Settings },
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
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors ${
              isActive
                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold border border-blue-500/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <Icon className={`w-4 h-4 ${isActive ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`} />
            <span>{item.label}</span>
          </Link>
        );
      })}

      {isAdmin && (
        <div className="pt-3 mt-3 border-t border-border">
          <Link
            href="/admin"
            onClick={onNavigate}
            className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium text-purple-600 dark:text-purple-300 hover:bg-purple-500/10 border border-purple-500/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>Admin Panel</span>
            </div>
          </Link>
        </div>
      )}
    </nav>
  );
}
