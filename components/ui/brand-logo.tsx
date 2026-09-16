import React from "react";
import Link from "next/link";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BrandLogoProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  textClassName?: string;
  subtitle?: string;
  glow?: boolean;
  className?: string;
  asLink?: boolean;
  href?: string;
}

const sizeMap = {
  xs: { box: "w-6 h-6 rounded-md", icon: "w-3.5 h-3.5", text: "text-sm", sub: "text-[10px]" },
  sm: { box: "w-8 h-8 rounded-lg", icon: "w-4 h-4", text: "text-base", sub: "text-xs" },
  md: { box: "w-9 h-9 rounded-xl", icon: "w-5 h-5", text: "text-base", sub: "text-xs" },
  lg: { box: "w-11 h-11 rounded-2xl", icon: "w-6 h-6", text: "text-lg", sub: "text-xs" },
  xl: { box: "w-14 h-14 rounded-2xl", icon: "w-8 h-8", text: "text-2xl", sub: "text-sm" },
};

export function BrandLogoSymbol({
  size = "md",
  glow = true,
  className,
}: {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  glow?: boolean;
  className?: string;
}) {
  const { box, icon } = sizeMap[size];

  return (
    <div
      className={cn(
        "relative flex items-center justify-center shrink-0 bg-gradient-to-tr from-blue-600 via-indigo-500 to-cyan-400 text-white shadow-md ring-1 ring-white/20 transition-all duration-200 group-hover:scale-105",
        glow && "shadow-blue-500/25 dark:shadow-indigo-500/30",
        box,
        className
      )}
    >
      {/* 360° Geometric Layered Vault Emblem */}
      <Layers
        className={cn("text-white shrink-0", icon)}
        strokeWidth={2.4}
        aria-hidden="true"
      />
    </div>
  );
}

export function BrandLogo({
  size = "md",
  showText = true,
  textClassName,
  subtitle,
  glow = true,
  className,
  asLink = true,
  href = "/",
}: BrandLogoProps) {
  const { text, sub } = sizeMap[size];

  const content = (
    <div className={cn("flex items-center gap-3 select-none group", className)}>
      <BrandLogoSymbol size={size} glow={glow} />
      {showText && (
        <div className="flex flex-col">
          <span
            className={cn(
              "font-bold tracking-tight text-foreground transition-colors duration-200 group-hover:text-blue-500 dark:group-hover:text-cyan-400",
              text,
              textClassName
            )}
          >
            GPHosting
          </span>
          {subtitle && (
            <span className={cn("text-muted-foreground font-medium -mt-0.5", sub)}>
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (asLink) {
    return (
      <Link href={href} className="inline-flex focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
        {content}
      </Link>
    );
  }

  return content;
}
