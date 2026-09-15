"use client";

import React, { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";

interface BackToTopProps {
  threshold?: number;
  className?: string;
}

export function BackToTop({ threshold = 300, className = "" }: BackToTopProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + window.innerHeight;
      const pageHeight = document.documentElement.scrollHeight;
      // Appears when scrolled down towards the bottom or past threshold
      const isAtBottom = scrollPosition >= pageHeight - 350;
      const isScrolledPastThreshold = window.scrollY > threshold;

      if (isAtBottom || isScrolledPastThreshold) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    handleScroll();

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
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
      title="Back to top"
      className={`fixed bottom-4 right-4 sm:bottom-4.5 sm:right-6 z-40 flex items-center gap-1.5 px-3 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-background/95 hover:bg-background text-foreground border border-border shadow-md shadow-black/5 dark:shadow-black/20 backdrop-blur-md transition-all duration-300 ease-out cursor-pointer hover:scale-105 active:scale-95 group ${
        isVisible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-3 pointer-events-none"
      } ${className}`}
    >
      <ArrowUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 group-hover:-translate-y-0.5 transition-transform duration-200" />
      <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
        Top
      </span>
    </button>
  );
}
