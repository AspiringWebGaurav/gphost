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

  const navItems: Array<{
    label: string;
    href: string;
    icon: typeof LayoutDashboard;
    target?: string;
  }> = [
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
            href={item.href === "/upload" ? "/upload?pick=1" : item.href}
            prefetch={item.target ? false : true}
            target={item.target}
            rel={item.target ? "noopener noreferrer" : undefined}
            onClick={(e) => {
              onNavigate?.();
              if (item.href === "/upload") {
                if (typeof window !== "undefined") {
                  sessionStorage.setItem("gphost_auto_pick", Date.now().toString());
                  if (pathname === "/upload") {
                    e.preventDefault();
                    window.dispatchEvent(new CustomEvent("gphost:trigger-file-pick"));
                  }
                }
              }
            }}
            className={`flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
              isActive
                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold border border-blue-500/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <Icon className={`w-[18px] h-[18px] ${isActive ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`} />
            <span>{item.label}</span>
          </Link>
        );
      })}

      {isAdmin && (
        <div className="pt-2.5 mt-2.5 border-t border-border">
          <Link
            href="/admin"
            prefetch={true}
            onClick={onNavigate}
            className="flex items-center justify-between px-3.5 py-2 rounded-xl text-sm font-medium text-purple-600 dark:text-purple-300 hover:bg-purple-500/10 border border-purple-500/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-[18px] h-[18px] text-purple-600 dark:text-purple-400" />
              <span>Admin Panel</span>
            </div>
          </Link>
        </div>
      )}
    </nav>
  );
}
