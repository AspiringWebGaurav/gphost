"use client";

import React, { useRef, useState, useEffect } from "react";
import { Copy, Check } from "lucide-react";

interface AutoScrollingFilenameProps {
  filename: string;
  className?: string;
}

export function AutoScrollingFilename({
  filename,
  className = "",
}: AutoScrollingFilenameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowDist, setOverflowDist] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  // Measure overflow distance dynamically using ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    const measure = () => {
      const diff = text.scrollWidth - container.clientWidth;
      setOverflowDist(diff > 2 ? diff : 0);
    };

    measure();

    const observer = new ResizeObserver(() => {
      measure();
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [filename]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(filename);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Dynamic animation duration based on overflow distance (smooth comfortable reading speed)
  const duration = Math.max(6, Math.round(overflowDist / 22) + 4);

  return (
    <div
      className="relative min-w-0 max-w-full"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Auto-scrolling text container */}
      <div
        ref={containerRef}
        className={`relative overflow-hidden w-full cursor-default ${
          overflowDist > 0
            ? "[mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)]"
            : ""
        }`}
      >
        <span
          ref={textRef}
          className={`inline-block whitespace-nowrap will-change-transform ${className}`}
          style={
            overflowDist > 0
              ? {
                  animation: `marqueePingPong ${duration}s ease-in-out infinite alternate`,
                  animationPlayState: isHovered ? "paused" : "running",
                  ["--marquee-dist" as string]: `-${overflowDist}px`,
                }
              : undefined
          }
          title={filename}
        >
          {filename}
        </span>
      </div>

      {/* Floating full-name tooltip card on hover when text overflows */}
      {isHovered && overflowDist > 0 && (
        <div className="absolute left-0 bottom-full mb-2 z-40 max-w-xs sm:max-w-md w-max p-2.5 rounded-xl bg-popover/95 text-popover-foreground border border-border shadow-xl backdrop-blur-md text-xs font-medium break-all animate-in fade-in zoom-in-95 duration-150 pointer-events-auto flex items-center justify-between gap-2.5">
          <span className="select-all text-foreground text-[11px] leading-relaxed">
            {filename}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded-lg bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition shrink-0 cursor-pointer"
            title={copied ? "Copied!" : "Copy filename"}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      )}

      {/* CSS Keyframe for bidirectional ping-pong scrolling */}
      <style jsx global>{`
        @keyframes marqueePingPong {
          0%,
          18% {
            transform: translateX(0);
          }
          75%,
          100% {
            transform: translateX(var(--marquee-dist, 0px));
          }
        }
      `}</style>
    </div>
  );
}
