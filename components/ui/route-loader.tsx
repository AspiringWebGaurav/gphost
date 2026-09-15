"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function startRouteLoader() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("gphost-route-start"));
  }
}

export function stopRouteLoader() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("gphost-route-done"));
  }
}

function NavigationWatcher({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    onNavigate();
  }, [pathname, searchParams, onNavigate]);

  return null;
}

export function RouteLoader() {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  const done = useCallback(() => {
    clearAllTimeouts();
    setProgress(100);

    // Snappy fade out and reset
    const tFade = setTimeout(() => {
      setVisible(false);
      const tReset = setTimeout(() => {
        setProgress(0);
      }, 200);
      timeoutsRef.current.push(tReset);
    }, 150);

    timeoutsRef.current.push(tFade);
  }, [clearAllTimeouts]);

  const start = useCallback(() => {
    clearAllTimeouts();
    setVisible(true);
    setProgress(30);

    // Fast, responsive trickle progression (Google / YouTube style)
    const t1 = setTimeout(() => setProgress(55), 100);
    const t2 = setTimeout(() => setProgress(78), 250);
    const t3 = setTimeout(() => setProgress(90), 500);

    // Watchdog fallback: finish after 6s to guarantee bar never gets stuck
    const tWatchdog = setTimeout(() => {
      done();
    }, 6000);

    timeoutsRef.current.push(t1, t2, t3, tWatchdog);
  }, [clearAllTimeouts, done]);

  useEffect(() => {
    // Zero-lag event capture on internal navigation links
    const handleDocumentClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;

      if (
        anchor.target === "_blank" ||
        anchor.hasAttribute("download") ||
        anchor.getAttribute("rel")?.includes("external")
      ) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (
        !href ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("javascript:")
      ) {
        return;
      }

      try {
        const targetUrl = new URL(anchor.href, window.location.href);
        if (targetUrl.origin !== window.location.origin) {
          return;
        }

        // Ignore clicks on current page anchors
        if (
          targetUrl.pathname === window.location.pathname &&
          targetUrl.search === window.location.search
        ) {
          return;
        }

        start();
      } catch {
        // Ignore invalid URLs
      }
    };

    const handlePopState = () => {
      start();
    };

    const handleRouteStart = () => start();
    const handleRouteDone = () => done();

    document.addEventListener("click", handleDocumentClick, { capture: true });
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("gphost-route-start", handleRouteStart);
    window.addEventListener("gphost-route-done", handleRouteDone);

    return () => {
      document.removeEventListener("click", handleDocumentClick, { capture: true });
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("gphost-route-start", handleRouteStart);
      window.removeEventListener("gphost-route-done", handleRouteDone);
      clearAllTimeouts();
    };
  }, [start, done, clearAllTimeouts]);

  return (
    <>
      <Suspense fallback={null}>
        <NavigationWatcher onNavigate={done} />
      </Suspense>

      {/* 1. Sleek Minimalist Top Loading Bar (Google / YouTube Style) */}
      <div
        className={`fixed top-0 left-0 right-0 h-[2.5px] z-[99999] pointer-events-none transition-opacity duration-200 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden="true"
      >
        <div
          className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400 transition-all duration-200 ease-out shadow-[0_0_8px_rgba(37,99,235,0.6)]"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 2. Google / Microsoft Minimalist Centered Spinner */}
      <div
        className={`fixed inset-0 z-[99999] flex items-center justify-center pointer-events-none transition-opacity duration-200 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden="true"
      >
        <div className="p-3 rounded-full bg-background/60 dark:bg-zinc-950/60 backdrop-blur-md border border-border/40 shadow-xl">
          <svg
            className="w-7 h-7 animate-spin text-blue-600 dark:text-blue-500"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              className="opacity-20"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-90"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
      </div>
    </>
  );
}
