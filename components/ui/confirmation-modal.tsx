"use client";

import React, { useEffect, useCallback } from "react";
import { AlertTriangle, Trash2, X, Loader2 } from "lucide-react";

export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "default";
  isLoading?: boolean;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Yes, Delete",
  cancelText = "Cancel",
  variant = "danger",
  isLoading = false,
}: ConfirmationModalProps) {
  // Handle ESC key press to close modal
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) {
        onClose();
      }
    },
    [onClose, isLoading]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const isDanger = variant === "danger";

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/45 dark:bg-black/65 backdrop-blur-md flex items-center justify-center p-4 transition-all duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/30 dark:border-white/10 bg-card/90 dark:bg-card/85 backdrop-blur-2xl shadow-2xl shadow-black/15 dark:shadow-black/50 ring-1 ring-black/5 dark:ring-white/5 p-5 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        {/* Ambient Top Glow */}
        <div
          className={`absolute -top-20 -left-20 w-44 h-44 rounded-full blur-3xl pointer-events-none ${
            isDanger ? "bg-rose-500/10 dark:bg-rose-500/15" : "bg-amber-500/10 dark:bg-amber-500/15"
          }`}
        />

        {/* Close icon */}
        {!isLoading && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent hover:border-border/60 transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Icon & Title */}
        <div className="flex items-start gap-3.5 relative z-10">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
              isDanger
                ? "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400 shadow-sm shadow-rose-500/10"
                : "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400 shadow-sm shadow-amber-500/10"
            }`}
          >
            {isDanger ? <Trash2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          </div>

          <div className="min-w-0 pr-6">
            <h3 className="text-base sm:text-lg font-bold text-foreground tracking-tight">{title}</h3>
            <div className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              {description}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-3 border-t border-border/80 flex items-center justify-end gap-2.5 relative z-10">
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-border/80 bg-muted/30 hover:bg-muted/70 text-xs font-semibold text-muted-foreground hover:text-foreground transition disabled:opacity-50 cursor-pointer active:scale-98"
          >
            {cancelText}
          </button>

          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer ${
              isDanger
                ? "bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-rose-600/30 hover:shadow-rose-600/50"
                : "bg-amber-600 hover:bg-amber-700 active:bg-amber-800 shadow-amber-600/30 hover:shadow-amber-600/50"
            }`}
          >
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
