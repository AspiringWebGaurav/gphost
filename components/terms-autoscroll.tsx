"use client";

import { useEffect } from "react";

export function TermsAutoScroll() {
  useEffect(() => {
    function scrollToTarget() {
      const hash = window.location.hash;
      if (!hash) return;
      try {
        const target = document.querySelector(hash);
        if (target) {
          // Clear any previous active highlight
          document.querySelectorAll(".highlight-pulse-active").forEach((el) => {
            el.classList.remove("highlight-pulse-active");
          });

          setTimeout(() => {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
            requestAnimationFrame(() => {
              target.classList.add("highlight-pulse-active");
            });
          }, 150);
        }
      } catch {
        // Invalid selector, ignore
      }
    }

    scrollToTarget();
    window.addEventListener("hashchange", scrollToTarget);
    return () => window.removeEventListener("hashchange", scrollToTarget);
  }, []);

  return null;
}
