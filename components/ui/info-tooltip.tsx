"use client";

import React, { useState, useRef, useEffect } from "react";
import { Info, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InfoTooltipProps {
  content: React.ReactNode;
  title?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  children?: React.ReactNode;
  className?: string;
  iconClassName?: string;
  variant?: "default" | "info" | "purple" | "emerald" | "amber";
}

export function InfoTooltip({
  content,
  title,
  side = "top",
  align = "center",
  children,
  className,
  iconClassName,
  variant = "default",
}: InfoTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on escape or outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  const sideClasses = {
    top: "bottom-full mb-2",
    bottom: "top-full mt-2",
    left: "right-full mr-2",
    right: "left-full ml-2",
  };

  const alignClasses = {
    start: "left-0",
    center: "left-1/2 -translate-x-1/2",
    end: "right-0",
  };

  const variantBorder = {
    default: "border-border/80 shadow-black/10 dark:shadow-black/40",
    info: "border-blue-500/30 shadow-blue-500/10",
    purple: "border-purple-500/30 shadow-purple-500/10",
    emerald: "border-emerald-500/30 shadow-emerald-500/10",
    amber: "border-amber-500/30 shadow-amber-500/10",
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative inline-flex items-center", className)}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        className="inline-flex items-center justify-center p-0.5 rounded-full text-muted-foreground hover:text-foreground transition-colors cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-label={title || "More information"}
        aria-expanded={isOpen}
      >
        {children || (
          <HelpCircle
            className={cn("w-3.5 h-3.5 text-muted-foreground/70 hover:text-foreground transition-colors", iconClassName)}
          />
        )}
      </button>

      {isOpen && (
        <div
          role="tooltip"
          className={cn(
            "absolute z-50 w-64 sm:w-72 p-3 rounded-xl bg-popover/98 dark:bg-popover/95 backdrop-blur-xl border text-popover-foreground text-xs shadow-xl animate-in fade-in zoom-in-95 duration-150 pointer-events-none",
            sideClasses[side],
            alignClasses[align],
            variantBorder[variant]
          )}
        >
          {title && (
            <div className="font-semibold text-foreground text-xs mb-1 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span>{title}</span>
            </div>
          )}
          <div className="text-[11px] leading-relaxed text-muted-foreground font-normal">
            {content}
          </div>
        </div>
      )}
    </div>
  );
}
