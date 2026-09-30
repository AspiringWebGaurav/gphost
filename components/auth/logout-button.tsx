"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  LogOut,
  Loader2,
  Laptop,
  Cloud,
  Link2,
  Unlink2,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface LogoutButtonProps {
  className?: string;
  variant?: "outline" | "ghost" | "default" | "sidebar";
  userEmail?: string;
  label?: string;
  redirectTo?: string;
}

export function LogoutButton({
  className,
  variant = "ghost",
  userEmail,
  label = "Sign out",
  redirectTo = "/",
}: LogoutButtonProps) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDetaching, setIsDetaching] = useState(false);
  const [detachmentPhase, setDetachmentPhase] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // Lock body scroll and handle Escape key while confirmation modal is open
  useEffect(() => {
    if (!showConfirm) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowConfirm(false);
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showConfirm]);

  const handleInitiateLogout = async () => {
    if (isDetaching) return;
    setIsDetaching(true);
    setDetachmentPhase(0);
    setProgress(15);

    // Timeline of the Detachment Experience
    // Phase 0 (0ms): Handshake initiation
    // Phase 1 (300ms): Conduit severed & pods decouple
    // Phase 2 (750ms): Flushing cache & cookies
    // Phase 3 (1200ms): Completed & navigation to landing page

    const t1 = setTimeout(() => {
      setDetachmentPhase(1);
      setProgress(45);
    }, 320);

    const t2 = setTimeout(() => {
      setDetachmentPhase(2);
      setProgress(78);
    }, 750);

    const t3 = setTimeout(() => {
      setDetachmentPhase(3);
      setProgress(100);
    }, 1150);

    // Concurrently trigger client signOut and server cookie destruction
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("gphost_last_active");
        sessionStorage.clear();
      }
      const supabase = createClient();
      await supabase.auth.signOut({ scope: "local" });
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    } catch (err) {
      console.error("SignOut error:", err);
    }

    // After the cinematic detachment finishes, return cleanly to landing page
    const tFinal = setTimeout(() => {
      if (typeof window !== "undefined") {
        window.location.href = redirectTo;
      } else {
        router.push(redirectTo);
        router.refresh();
      }
    }, 1550);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(tFinal);
    };
  };

  // Sidebar Card Button Variant
  if (variant === "sidebar") {
    return (
      <>
        <button
          type="button"
          id="sidebar-logout-btn"
          onClick={() => setShowConfirm(true)}
          disabled={isDetaching}
          className={`group relative w-full flex items-center justify-between p-2.5 rounded-xl border border-border bg-card/60 hover:bg-rose-500/10 hover:border-rose-500/30 text-foreground transition-all duration-200 cursor-pointer shadow-xs disabled:opacity-50 ${className || ""}`}
          title="Sign out and detach current session"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-muted group-hover:bg-rose-500/15 border border-border group-hover:border-rose-500/30 flex items-center justify-center text-muted-foreground group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors shrink-0">
              <LogOut className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </div>
            <div className="text-left min-w-0">
              <p className="text-sm font-semibold text-foreground group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors leading-tight">
                {label}
              </p>
              <p className="text-xs text-muted-foreground truncate max-w-[130px]">
                {userEmail || "End active session"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 group-hover:bg-rose-500 transition-colors animate-pulse" />
            <ChevronRight className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
          </div>
        </button>

        {mounted && showConfirm && createPortal(
          <LogoutConfirmationModal
            userEmail={userEmail}
            onConfirm={() => {
              setShowConfirm(false);
              handleInitiateLogout();
            }}
            onCancel={() => setShowConfirm(false)}
          />,
          document.body
        )}

        {mounted && isDetaching && createPortal(
          <DetachmentOverlay
            phase={detachmentPhase}
            progress={progress}
            userEmail={userEmail}
          />,
          document.body
        )}
      </>
    );
  }

  // Standard Pill Variants (Outline, Ghost, Default)
  const baseStyle =
    variant === "outline"
      ? "border border-border bg-background hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-600 dark:hover:text-rose-400 text-foreground"
      : variant === "default"
      ? "bg-foreground text-background hover:opacity-90"
      : "hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 text-muted-foreground";

  return (
    <>
      <button
        type="button"
        id="logout-btn"
        onClick={() => setShowConfirm(true)}
        disabled={isDetaching}
        className={`py-2 px-3 rounded-xl text-xs font-medium inline-flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 ${baseStyle} ${className || ""}`}
      >
        {isDetaching ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-500" />
        ) : (
          <LogOut className="w-3.5 h-3.5" />
        )}
        <span>{label}</span>
      </button>

      {mounted && showConfirm && createPortal(
        <LogoutConfirmationModal
          userEmail={userEmail}
          onConfirm={() => {
            setShowConfirm(false);
            handleInitiateLogout();
          }}
          onCancel={() => setShowConfirm(false)}
        />,
        document.body
      )}

      {mounted && isDetaching && createPortal(
        <DetachmentOverlay
          phase={detachmentPhase}
          progress={progress}
          userEmail={userEmail}
        />,
        document.body
      )}
    </>
  );
}

/**
 * Minimalist Vercel/Geist-Style Confirmation Dialog
 */
function LogoutConfirmationModal({
  userEmail,
  onConfirm,
  onCancel,
}: {
  userEmail?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onCancel();
    }, 120);
  }, [isClosing, onCancel]);

  const handleConfirm = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onConfirm();
    }, 120);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  return (
    <div
      id="confirm-logout-modal"
      className={`fixed inset-0 z-[99999] flex items-center justify-center p-4 transition-all duration-150 ease-out ${
        isClosing
          ? "bg-black/0 backdrop-blur-none pointer-events-none"
          : "bg-black/45 backdrop-blur-xs"
      }`}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-logout-title"
    >
      {/* Vercel-Style Robust Framed Dialog */}
      <div
        className={`relative w-full max-w-[400px] overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl ring-1 ring-black/5 dark:ring-white/10 transition-all duration-150 ease-out ${
          isClosing
            ? "opacity-0 scale-95 translate-y-1 pointer-events-none"
            : "opacity-100 scale-100 translate-y-0 animate-in fade-in zoom-in-95 duration-150"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Upper Body Area */}
        <div className="p-5 pb-4">
          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center justify-center shrink-0">
                <LogOut className="w-4 h-4" />
              </div>
              <h2
                id="confirm-logout-title"
                className="text-base font-semibold text-foreground tracking-tight"
              >
                Sign out of GPHost
              </h2>
            </div>
            <button
              type="button"
              id="confirm-logout-close-btn"
              onClick={handleClose}
              aria-label="Close dialog"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Description */}
          <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
            Are you sure you want to end your current session? You will be signed out and returned to the home page.
          </p>

          {/* Account Pill (Tight, cohesive layout with avatar — no empty gap) */}
          {userEmail && (
            <div className="mt-3.5 py-2 px-3 rounded-xl bg-muted/40 border border-border/70 flex items-center gap-2.5">
              <div className="w-5 h-5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold text-[10px] flex items-center justify-center shrink-0 border border-rose-500/25">
                {userEmail.charAt(0).toUpperCase()}
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[11px] text-muted-foreground font-medium shrink-0">Account:</span>
                <span className="font-mono text-foreground font-semibold text-xs truncate">
                  {userEmail}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Robust Framed Footer Toolbar */}
        <div className="px-5 py-3 bg-muted/30 dark:bg-muted/20 border-t border-border/70 flex items-center justify-end gap-2">
          <button
            type="button"
            id="confirm-logout-no-btn"
            onClick={handleClose}
            className="h-8.5 px-3.5 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-semibold transition cursor-pointer shadow-2xs active:scale-[0.98]"
          >
            Cancel
          </button>
          <button
            type="button"
            id="confirm-logout-yes-btn"
            onClick={handleConfirm}
            className="h-8.5 px-4 rounded-lg bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-xs font-semibold transition cursor-pointer shadow-xs active:scale-[0.98] inline-flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Immersive Zero-Trust Session Detachment Portal Modal
 */
function DetachmentOverlay({
  phase,
  progress,
  userEmail,
}: {
  phase: number;
  progress: number;
  userEmail?: string;
}) {
  const isSevered = phase >= 1;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-background/80 dark:bg-black/85 backdrop-blur-xl animate-in fade-in duration-300">
      {/* Background ambient radial gradients */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-rose-500/10 via-purple-500/10 to-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Glass Detachment Capsule */}
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border/80 bg-card/95 p-6 sm:p-7 shadow-2xl backdrop-blur-2xl transition-all animate-in zoom-in-95 duration-200">
        {/* Subtle accent border glow */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-rose-500 to-purple-500" />

        {/* Top Header */}
        <div className="text-center space-y-1">
          <h3 className="text-base font-bold text-foreground tracking-tight">
            {phase === 3 ? "Session Decoupled" : "Detaching Active Session"}
          </h3>

          <p className="text-xs text-muted-foreground truncate max-w-xs mx-auto">
            {userEmail ? (
              <>Signed in as <span className="text-foreground font-medium">{userEmail}</span></>
            ) : (
              "Terminating authenticated connection..."
            )}
          </p>
        </div>

        {/* Cinematic Coupler Decoupling Graphic */}
        <div className="relative my-6 py-6 px-4 rounded-xl bg-muted/40 border border-border/60 flex items-center justify-between overflow-hidden shadow-inner">
          {/* Ambient center pulse glow */}
          <div
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full blur-xl pointer-events-none transition-all duration-500 ${
              isSevered ? "bg-rose-500/20 scale-125" : "bg-blue-500/20 scale-100"
            }`}
          />

          {/* Module A: Client Browser Pod */}
          <div
            className={`flex flex-col items-center gap-1.5 transition-all duration-500 ease-out z-10 ${
              isSevered
                ? "-translate-x-3 sm:-translate-x-5 -rotate-2 opacity-90"
                : "translate-x-0 rotate-0 opacity-100"
            }`}
          >
            <div
              className={`w-12 h-12 rounded-xl bg-background border flex items-center justify-center shadow-md transition-colors ${
                isSevered
                  ? "border-rose-500/40 text-rose-500 shadow-rose-500/10"
                  : "border-blue-500/40 text-blue-500 shadow-blue-500/10"
              }`}
            >
              <Laptop className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Browser
            </span>
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold ${
                isSevered
                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {isSevered ? "Detached" : "Active"}
            </span>
          </div>

          {/* Center Conduit & Severance Spark */}
          <div className="flex-1 mx-2 sm:mx-3 flex flex-col items-center justify-center relative z-10">
            {!isSevered ? (
              <div className="flex flex-col items-center gap-1 w-full">
                <div className="w-full flex items-center justify-center relative">
                  <div className="w-full h-0.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 animate-pulse" />
                  <div className="absolute w-6 h-6 rounded-full bg-background border border-blue-500/40 flex items-center justify-center shadow-xs">
                    <Link2 className="w-3 h-3 text-blue-500 animate-spin" />
                  </div>
                </div>
                <span className="text-[9px] font-mono text-muted-foreground uppercase mt-1">
                  Coupled
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 w-full animate-in zoom-in-75 duration-300">
                <div className="w-full flex items-center justify-between gap-1 relative">
                  <div className="h-0.5 w-5 bg-rose-500/40 rounded-full" />
                  <div className="w-7 h-7 rounded-full bg-rose-500/15 border border-rose-500/40 flex items-center justify-center text-rose-500 shadow-xs animate-pulse">
                    <Unlink2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="h-0.5 w-5 bg-rose-500/40 rounded-full" />
                </div>
                <span className="text-[9px] font-mono font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider mt-1 px-1.5 py-0.2 rounded bg-rose-500/10 border border-rose-500/20">
                  Severed
                </span>
              </div>
            )}
          </div>

          {/* Module B: GPHost Cloud Pod */}
          <div
            className={`flex flex-col items-center gap-1.5 transition-all duration-500 ease-out z-10 ${
              isSevered
                ? "translate-x-3 sm:translate-x-5 rotate-2 opacity-90"
                : "translate-x-0 rotate-0 opacity-100"
            }`}
          >
            <div
              className={`w-12 h-12 rounded-xl bg-background border flex items-center justify-center shadow-md transition-colors ${
                isSevered
                  ? "border-rose-500/40 text-rose-500 shadow-rose-500/10"
                  : "border-blue-500/40 text-blue-500 shadow-blue-500/10"
              }`}
            >
              <Cloud className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              GPHost Cloud
            </span>
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold ${
                isSevered
                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
              }`}
            >
              {isSevered ? "Released" : "Bound"}
            </span>
          </div>
        </div>

        {/* Live Step Progress Log */}
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between text-muted-foreground text-[11px] font-medium">
            <span>Security Checklist</span>
            <span className="font-mono text-foreground font-bold">{progress}%</span>
          </div>

          {/* Multi-tier Step Items */}
          <div className="space-y-1.5 rounded-lg bg-muted/20 border border-border/50 p-2.5">
            <StepItem
              label="Revoke cryptographic session tokens"
              active={phase === 0}
              done={phase >= 1}
            />
            <StepItem
              label="Flush client-side zero-trust cache"
              active={phase === 1}
              done={phase >= 2}
            />
            <StepItem
              label="Decouple credentials & return home"
              active={phase === 2}
              done={phase >= 3}
            />
          </div>

          {/* Neon Progress Bar */}
          <div className="w-full h-1.5 rounded-full bg-muted/60 overflow-hidden mt-3">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 via-rose-500 to-emerald-500 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Footer info note */}
        <div className="mt-4 text-center">
          <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3 text-rose-500" />
            <span>Returning to home safely...</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function StepItem({
  label,
  active,
  done,
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      {done ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
      ) : active ? (
        <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />
      ) : (
        <span className="w-3.5 h-3.5 rounded-full border border-border shrink-0" />
      )}
      <span
        className={
          done
            ? "text-muted-foreground line-through opacity-80"
            : active
            ? "text-foreground font-semibold"
            : "text-muted-foreground/60"
        }
      >
        {label}
      </span>
    </div>
  );
}
