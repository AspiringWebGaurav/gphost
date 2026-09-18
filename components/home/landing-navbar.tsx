"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, X, Sparkles, HelpCircle, Shield, FileText, UploadCloud, LayoutDashboard, Home } from "lucide-react";
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
  const pathname = usePathname();

  // Close menu on route change (React-recommended render-time state adjustment)
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileMenuOpen(false);
  }

  // Prevent background scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    let rafId: number | null = null;

    const updateScrollState = () => {
      const scrollY = window.scrollY;
      setIsScrolled(scrollY > 20);
    };

    const onScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        updateScrollState();
        rafId = null;
      });
    };

    updateScrollState();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, []);

  // Keyboard accessibility (Escape closes mobile menu)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileMenuOpen]);

  return (
    <div
      ref={navRef}
      className="sticky top-0 inset-x-0 z-50 pointer-events-auto md:pointer-events-none w-full flex flex-col items-center px-0"
    >
      <header
        className={cn(
          "gpu-nav-capsule pointer-events-auto flex items-center justify-between gap-3 sm:gap-6 relative z-50 transition-all duration-200",
          // Mobile: Solid, heavy opaque background edge-to-edge with border and shadow (never transparent)
          "w-full h-14 px-4 bg-background dark:bg-[#070a12] border-b border-border shadow-md shadow-black/5 dark:shadow-black/25 rounded-none",
          // Desktop (md+): Dynamic floating capsule
          isScrolled
            ? "md:w-[calc(100%-3rem)] md:max-w-5xl md:h-14 md:translate-y-3 md:px-5 md:rounded-2xl md:bg-background/90 md:dark:bg-background/90 md:backdrop-blur-xl md:border md:border-border/70 md:shadow-lg"
            : "md:w-full md:max-w-full md:h-16 md:translate-y-0 md:px-8 md:lg:px-12 md:rounded-none md:bg-transparent md:border-transparent md:shadow-none"
        )}
      >
        {/* Brand Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <BrandLogo size="sm" className="sm:hidden" />
          <BrandLogo size="md" className="hidden sm:flex" />
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-5 lg:gap-6 text-sm text-muted-foreground font-medium shrink-0 whitespace-nowrap">
          {user && isApproved ? (
            <>
              <Link href="/" className="hover:text-foreground transition-colors">
                Home
              </Link>
              <Link href="/dashboard" className="text-foreground font-semibold hover:text-blue-500 transition-colors">
                Dashboard
              </Link>
              <Link href="/upload" className="hover:text-foreground transition-colors">
                Upload
              </Link>
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
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {user ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Synchronized User Identity Pill */}
              <Link
                href="/dashboard"
                className="hidden lg:inline-flex items-center gap-2 px-3 h-8 sm:h-9 rounded-xl border border-border bg-card/60 hover:bg-muted/60 text-xs font-semibold text-foreground transition-all duration-200 shadow-xs shrink-0 select-none group"
                title={`Signed in as ${profile?.full_name || user.email} (Open Dashboard)`}
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                </span>
                <span className="truncate max-w-[130px] tracking-tight group-hover:text-blue-500 transition-colors">
                  {profile?.full_name || user.email}
                </span>
              </Link>

              {/* Special Effect Admin Button on Navbar */}
              {isAdmin && (
                <Link
                  href="/admin"
                  className="relative group inline-flex items-center gap-1.5 px-3 h-8 sm:h-9 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-purple-600 via-fuchsia-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-[0_0_12px_rgba(168,85,247,0.4)] hover:shadow-[0_0_20px_rgba(217,70,239,0.7)] border border-purple-400/40 transition-all duration-200 hover:scale-[1.02] shrink-0 whitespace-nowrap"
                  title="Admin Center"
                >
                  <Shield className="w-3.5 h-3.5 text-purple-200 animate-pulse" />
                  <span>Admin</span>
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                </Link>
              )}

              {/* Dashboard Button */}
              <Link
                href={isApproved ? "/dashboard" : "/access-gate"}
                className="inline-flex items-center gap-1.5 px-3 h-8 sm:h-9 rounded-xl text-xs font-semibold bg-foreground text-background hover:opacity-90 transition-opacity shadow-sm shrink-0 whitespace-nowrap"
                title="Go to Dashboard"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Dashboard</span>
              </Link>
              <div className="hidden md:block">
                <LogoutButton variant="outline" className="h-8 sm:h-9 text-xs" />
              </div>
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
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer touch-manipulation relative z-10 select-none"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
            data-testid="landing-hamburger-button"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* High-Contrast Full-Screen Mobile Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          data-testid="mobile-menu-backdrop"
          className="fixed inset-0 bg-black/75 backdrop-blur-md z-40 md:hidden pointer-events-auto transition-opacity animate-in fade-in duration-200"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Elevated Navigation Sheet */}
      {mobileMenuOpen && (
        <div
          data-testid="mobile-menu-panel"
          className="fixed top-15 inset-x-3.5 max-w-md mx-auto md:hidden pointer-events-auto p-4 rounded-2xl bg-card text-card-foreground border border-border shadow-2xl space-y-2.5 z-50 animate-in fade-in slide-in-from-top-3 duration-250 ring-1 ring-black/10 dark:ring-white/10"
        >
          <div className="flex flex-col space-y-1 text-sm font-medium">
            {user && isApproved ? (
              <>
                <Link
                  href="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                >
                  <Home className="w-4 h-4 text-cyan-500" />
                  <span>Home</span>
                </Link>
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
                    className="relative overflow-hidden flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500/15 via-fuchsia-500/15 to-indigo-500/15 text-purple-700 dark:text-purple-300 font-bold border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.25)] hover:border-purple-500/50 transition-all"
                  >
                    <div className="flex items-center gap-2.5">
                      <Shield className="w-4 h-4 text-purple-500 animate-pulse" />
                      <span>Admin Center</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/40">
                      SPECIAL ACCESS
                    </span>
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
