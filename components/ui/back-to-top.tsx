"use client";

import React, { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";

interface BackToTopProps {
  threshold?: number;
  className?: string;
}

export function BackToTop({ threshold = 250, className = "" }: BackToTopProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > threshold) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    handleScroll();

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [threshold]);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Back to top"
      title="Scroll to top"
      className={`fixed bottom-6 right-6 z-40 flex items-center gap-1.5 px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-full bg-background/90 hover:bg-background text-foreground border border-border/80 shadow-lg shadow-black/5 dark:shadow-black/30 backdrop-blur-md transition-all duration-300 ease-out cursor-pointer hover:scale-105 active:scale-95 group ${
        isVisible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-4 pointer-events-none"
      } ${className}`}
    >
      <ArrowUp className="w-4 h-4 text-blue-600 dark:text-blue-400 group-hover:-translate-y-0.5 transition-transform duration-200" />
      <span className="text-xs font-semibold hidden sm:inline text-muted-foreground group-hover:text-foreground transition-colors">
        Top
      </span>
    </button>
  );
}
