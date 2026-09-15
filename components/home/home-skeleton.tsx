import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggleSkeleton } from "@/components/theme-toggle";
import { Layers } from "lucide-react";

export function HomeNavbarSkeleton() {
  return (
    <header className="h-16 border-b border-border/80 bg-background/80 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-50 transition-colors duration-200">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600/20 via-indigo-500/20 to-cyan-400/20 flex items-center justify-center shrink-0 animate-pulse">
          <Layers className="w-5 h-5 text-muted-foreground/40" />
        </div>
        <Skeleton className="h-5 w-24 rounded-md" />
      </div>

      <nav className="hidden md:flex items-center gap-6">
        <Skeleton className="h-4 w-16 rounded-md" />
        <Skeleton className="h-4 w-24 rounded-md" />
        <Skeleton className="h-4 w-14 rounded-md" />
        <Skeleton className="h-4 w-12 rounded-md" />
      </nav>

      <div className="flex items-center gap-2.5">
        <Skeleton className="h-9 w-24 rounded-xl" />
        <ThemeToggleSkeleton />
      </div>
    </header>
  );
}

export function HomeHeroSkeleton() {
  return (
    <section className="relative pt-20 sm:pt-28 pb-20 px-6 max-w-6xl mx-auto text-center flex flex-col items-center overflow-hidden">
      {/* Ambient Lighting Background — Identical to production page to prevent background popping */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] sm:w-[850px] h-[350px] sm:h-[450px] bg-gradient-to-tr from-blue-600/20 via-indigo-500/15 to-purple-600/10 blur-[130px] pointer-events-none -z-10 dark:block hidden rounded-full"
        aria-hidden="true"
      />
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] sm:w-[700px] h-[300px] bg-gradient-to-tr from-blue-100/70 via-indigo-50/50 to-transparent blur-[100px] pointer-events-none -z-10 dark:hidden block rounded-full"
        aria-hidden="true"
      />

      {/* Pill Badge Skeleton */}
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-border/60 bg-muted/40 mb-6 animate-pulse">
        <span className="w-2 h-2 rounded-full bg-blue-500/40 animate-pulse" />
        <Skeleton className="h-3.5 w-44 rounded-full" />
      </div>

      {/* Headline Skeleton */}
      <div className="flex flex-col items-center gap-3.5 mb-6 max-w-3xl w-full">
        <Skeleton className="h-10 sm:h-12 md:h-14 w-11/12 sm:w-4/5 rounded-2xl" />
        <Skeleton className="h-10 sm:h-12 md:h-14 w-3/4 sm:w-3/5 rounded-2xl" />
      </div>

      {/* Subtitle Skeleton */}
      <div className="flex flex-col items-center gap-2 mb-10 max-w-2xl w-full">
        <Skeleton className="h-4 sm:h-5 w-11/12 rounded-md" />
        <Skeleton className="h-4 sm:h-5 w-4/5 rounded-md" />
      </div>

      {/* Action Buttons Skeleton */}
      <div className="flex flex-col sm:flex-row items-center gap-3.5 w-full sm:w-auto">
        <Skeleton className="w-full sm:w-44 h-12 rounded-xl" />
        <Skeleton className="w-full sm:w-40 h-12 rounded-xl" />
      </div>

      {/* Metrics Row Skeleton */}
      <div className="mt-16 pt-10 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-6 text-left max-w-4xl w-full">
        <div>
          <Skeleton className="h-8 sm:h-9 w-20 rounded-md mb-2" />
          <Skeleton className="h-3.5 w-24 rounded-md" />
        </div>
        <div>
          <Skeleton className="h-8 sm:h-9 w-20 rounded-md mb-2" />
          <Skeleton className="h-3.5 w-24 rounded-md" />
        </div>
        <div>
          <Skeleton className="h-8 sm:h-9 w-20 rounded-md mb-2" />
          <Skeleton className="h-3.5 w-24 rounded-md" />
        </div>
        <div>
          <Skeleton className="h-8 sm:h-9 w-24 rounded-md mb-2" />
          <Skeleton className="h-3.5 w-32 rounded-md" />
        </div>
      </div>
    </section>
  );
}

export function HomeFeaturesSkeleton() {
  return (
    <section className="py-20 px-6 max-w-6xl mx-auto">
      {/* Section Header Skeleton */}
      <div className="text-center max-w-2xl mx-auto mb-16 flex flex-col items-center">
        <Skeleton className="h-8 sm:h-9 w-72 sm:w-96 rounded-xl mb-3" />
        <Skeleton className="h-4 w-60 sm:w-80 rounded-md" />
      </div>

      {/* 3 Feature Cards Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="p-6 rounded-2xl bg-card border border-border shadow-xs flex flex-col justify-between"
          >
            <div>
              <Skeleton className="w-10 h-10 rounded-xl mb-5" />
              <Skeleton className="h-6 w-36 rounded-md mb-2" />
              <div className="space-y-2 mt-3">
                <Skeleton className="h-4 w-full rounded-md" />
                <Skeleton className="h-4 w-5/6 rounded-md" />
                <Skeleton className="h-4 w-4/6 rounded-md" />
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-border flex items-center gap-2">
              <Skeleton className="w-3.5 h-3.5 rounded-full shrink-0" />
              <Skeleton className="h-3.5 w-32 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function HomeFooterSkeleton() {
  return (
    <footer className="border-t border-border/80 bg-muted/30 py-6 px-6 transition-colors">
      <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4 pb-10 sm:pb-0">
        <div className="flex items-center gap-3">
          <Skeleton className="w-7 h-7 rounded-lg shrink-0" />
          <Skeleton className="h-3.5 w-60 sm:w-72 rounded-md" />
        </div>

        <div className="flex items-center gap-6">
          <Skeleton className="h-3.5 w-20 rounded-md" />
          <Skeleton className="h-3.5 w-24 rounded-md" />
          <Skeleton className="h-3.5 w-20 rounded-md" />
        </div>
      </div>
    </footer>
  );
}

export function HomeSkeleton() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased transition-colors duration-200">
      <HomeNavbarSkeleton />
      <main className="flex-1">
        <HomeHeroSkeleton />
        <HomeFeaturesSkeleton />
      </main>
      <HomeFooterSkeleton />
    </div>
  );
}
