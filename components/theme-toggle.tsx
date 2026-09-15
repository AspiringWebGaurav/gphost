"use client";

import { useTheme } from "./theme-provider";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  const handleToggle = () => {
    if (resolvedTheme) {
      setTheme(resolvedTheme === "dark" ? "light" : "dark");
    } else {
      const isDarkNow =
        typeof document !== "undefined" &&
        document.documentElement.classList.contains("dark");
      setTheme(isDarkNow ? "light" : "dark");
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label="Toggle theme"
      title="Toggle theme"
      className={`relative w-9 h-9 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-100/80 dark:bg-zinc-900/80 hover:bg-zinc-200/80 dark:hover:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white flex items-center justify-center shrink-0 transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${className || ""}`}
    >
      <Sun className="w-4 h-4 text-amber-400 transition-transform duration-200 hidden dark:block" />
      <Moon className="w-4 h-4 text-zinc-700 transition-transform duration-200 block dark:hidden" />
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}

export function ThemeToggleSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`relative w-9 h-9 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-100/80 dark:bg-zinc-900/80 flex items-center justify-center shrink-0 animate-pulse ${className || ""}`}
      aria-hidden="true"
    >
      <div className="w-4 h-4 rounded-full bg-zinc-300/70 dark:bg-zinc-700/70" />
    </div>
  );
}

