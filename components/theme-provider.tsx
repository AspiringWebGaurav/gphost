"use client";

import React, { createContext, useContext, useEffect, useSyncExternalStore } from "react";

type Theme = "dark" | "light" | "system";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "dark" | "light";
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function subscribeToTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("gphost-theme-change", callback);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("gphost-theme-change", callback);
    media.removeEventListener("change", callback);
  };
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  storageKey = "gphost-theme",
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}) {
  const currentTheme = useSyncExternalStore<Theme>(
    subscribeToTheme,
    () => {
      try {
        const val = localStorage.getItem(storageKey) as Theme | null;
        if (val === "dark" || val === "light" || val === "system") {
          return val;
        }
      } catch {
        // Fallback
      }
      return defaultTheme;
    },
    () => defaultTheme
  );

  const resolvedTheme: "dark" | "light" = useSyncExternalStore<"dark" | "light">(
    subscribeToTheme,
    () => {
      try {
        const val = localStorage.getItem(storageKey) as Theme | null;
        if (val === "dark") return "dark";
        if (val === "light") return "light";
        if (val === "system") {
          return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        }
      } catch {
        // Fallback
      }
      if (defaultTheme === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      return defaultTheme;
    },
    () => (defaultTheme === "system" ? "light" : defaultTheme)
  );

  // Synchronize DOM with resolvedTheme on mount and theme changes
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = (newTheme: Theme) => {
    try {
      localStorage.setItem(storageKey, newTheme);
      window.dispatchEvent(new Event("gphost-theme-change"));
    } catch {
      // Ignore storage errors
    }
    const root = document.documentElement;
    let resolved: "dark" | "light" = "light";
    if (newTheme === "system") {
      resolved = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } else {
      resolved = newTheme;
    }
    root.classList.remove("light", "dark");
    root.classList.add(resolved);
  };

  return (
    <ThemeContext.Provider value={{ theme: currentTheme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
