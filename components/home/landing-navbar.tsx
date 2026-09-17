"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X, Sparkles, HelpCircle, Shield, FileText, UploadCloud, LayoutDashboard, UserCheck } from "lucide-react";
import { BrandLogo } from "@/components/ui/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/auth/logout-button";
import { cn } from "@/lib/utils";

interface LandingNavbarProps {
  user: { id: string; email?: string } | null;
  profile: { full_name?: string | null; role?: string; status?: string } | null;
  isApproved: boolean;
  isAdmin: boolean;
}

export function LandingNavbar({ user, profile, isApproved, isAdmin }: LandingNavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId: number | null = null;

    const updateScrollState = () => {
      const scrollY = window.scrollY;
      // Smooth hysteresis threshold:
      // Enter compact floating capsule past 65px (avoids twitchy trigger on first micro-wheel)
      // Expand back to full header when near top under 25px
      setIsScrolled((prev) => {
        if (!prev && scrollY > 65) return true;
        if (prev && scrollY < 25) return false;
        return prev;
      });
      rafId = null;
    };

    const handleScroll = () => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(updateScrollState);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    updateScrollState();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, []);

  // Close mobile menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setMobileMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileMenuOpen]);

  return (
    <div
      ref={navRef}
      className="sticky top-0 inset-x-0 z-50 pointer-events-none w-full flex flex-col items-center px-0"
    >
      <header
        className={cn(
          "gpu-nav-capsule pointer-events-auto flex items-center justify-between",
          isScrolled
            ? "w-[calc(100%-1.5rem)] sm:w-[calc(100%-3rem)] max-w-5xl h-13 sm:h-14 translate-y-2 sm:translate-y-3 px-3.5 sm:px-5 rounded-xl sm:rounded-2xl bg-background/85 dark:bg-background/85 backdrop-blur-xl border border-border/70 shadow-lg shadow-black/5 dark:shadow-black/25"
            : "w-full max-w-full h-15 sm:h-16 translate-y-0 px-4 sm:px-8 md:px-12 rounded-none bg-background/0 backdrop-blur-0 border border-transparent shadow-none"
        )}
      >
        {/* Brand Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <BrandLogo size="sm" className="sm:hidden" />
          <BrandLogo size="md" className="hidden sm:flex" />
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground font-medium">
          {user && isApproved ? (
            <>
              <Link href="/dashboard" className="text-foreground font-semibold hover:text-blue-500 transition-colors">
                Dashboard
              </Link>
              <Link href="/upload" className="hover:text-foreground transition-colors">
                Upload
              </Link>
              {isAdmin && (
                <Link href="/admin" className="text-purple-600 dark:text-purple-400 font-semibold hover:opacity-80 transition-opacity">
                  Admin Panel
                </Link>
              )}
            </>
          ) : (
            <>
              <Link href="#features" className="hover:text-foreground transition-colors duration-150">
                Features
              </Link>
              <Link
                href="/developers"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors duration-150"
              >
                How to Use
              </Link>
            </>
          )}
          <Link
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors duration-150"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors duration-150"
          >
            Terms
          </Link>
        </nav>

        {/* Actions (Sign In / Dashboard + Theme Toggle + Mobile Menu Trigger) */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {user ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/60 text-xs text-muted-foreground font-medium border border-border">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                <span className="truncate max-w-[120px]">{profile?.full_name || user.email}</span>
              </span>
              <Link
                href={isApproved ? (isAdmin ? "/admin" : "/dashboard") : "/access-gate"}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 h-8 sm:h-9 rounded-lg sm:rounded-xl text-xs font-semibold bg-foreground text-background hover:opacity-90 transition-opacity shadow-sm shrink-0"
              >
                <span>{isAdmin ? "Admin" : "Dashboard"}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <LogoutButton variant="outline" className="hidden sm:inline-flex h-8 sm:h-9 text-xs" />
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 h-8 sm:h-9 rounded-lg sm:rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-sm shadow-blue-500/20 transition-all duration-200 shrink-0"
            >
              <span>Sign In</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Mobile Hamburger Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Animated Dropdown Drawer */}
      {mobileMenuOpen && (
        <div
          className={cn(
            "md:hidden pointer-events-auto p-3 sm:p-4 rounded-2xl bg-background/95 backdrop-blur-2xl border border-border/80 shadow-2xl space-y-2 animate-in fade-in slide-in-from-top-2 duration-200",
            isScrolled
              ? "w-[calc(100%-1.5rem)] sm:w-[calc(100%-3rem)] max-w-5xl mt-3 sm:mt-4"
              : "w-[calc(100%-1.5rem)] sm:w-[calc(100%-3rem)] max-w-full mt-2"
          )}
        >
          <div className="flex flex-col space-y-1 text-sm font-medium">
            {user && isApproved ? (
              <>
                <Link
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-foreground font-semibold hover:bg-muted/70 transition-colors"
                >
                  <LayoutDashboard className="w-4 h-4 text-blue-500" />
                  <span>Dashboard</span>
                </Link>
                <Link
                  href="/upload"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                >
                  <UploadCloud className="w-4 h-4 text-indigo-500" />
                  <span>Upload File</span>
                </Link>
                {isAdmin && (
                  <Link
                    href="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-purple-600 dark:text-purple-400 font-semibold hover:bg-muted/70 transition-colors"
                  >
                    <UserCheck className="w-4 h-4 text-purple-500" />
                    <span>Admin Panel</span>
                  </Link>
                )}
              </>
            ) : (
              <>
                <Link
                  href="#features"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                >
                  <Sparkles className="w-4 h-4 text-blue-500" />
                  <span>Features</span>
                </Link>
                <Link
                  href="/developers"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                >
                  <HelpCircle className="w-4 h-4 text-indigo-500" />
                  <span>How to Use</span>
                </Link>
              </>
            )}
            <Link
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
            >
              <Shield className="w-4 h-4 text-muted-foreground" />
              <span>Privacy Policy</span>
            </Link>
            <Link
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
            >
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span>Terms of Service</span>
            </Link>
          </div>

          {/* User Session Footer or Quick Sign In */}
          {user ? (
            <div className="pt-2.5 mt-1 border-t border-border flex items-center justify-between gap-2 px-1">
              <span className="text-xs text-muted-foreground truncate max-w-[190px]">
                {profile?.full_name || user.email}
              </span>
              <LogoutButton variant="outline" className="h-8 text-xs shrink-0" />
            </div>
          ) : (
            <div className="pt-2 mt-1 border-t border-border">
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm"
              >
                <span>Sign In to Account</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
