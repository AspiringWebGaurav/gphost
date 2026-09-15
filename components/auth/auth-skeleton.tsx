import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggleSkeleton } from "@/components/theme-toggle";
import { Layers } from "lucide-react";

export function AuthSkeleton() {
  return (
    <div className="h-screen max-h-screen w-screen max-w-full overflow-hidden flex flex-col bg-background text-foreground relative antialiased">
      {/* Main Split Section */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden relative">
        {/* Left Column (Desktop Showcase) */}
        <div className="hidden lg:flex lg:col-span-6 xl:col-span-7 h-full flex-col justify-between p-8 xl:p-12 2xl:p-16 border-r border-border/80 bg-muted/25 dark:bg-zinc-950/50 relative overflow-hidden">
          {/* Ambient Glows */}
          <div
            className="absolute -top-20 -left-20 w-80 h-80 bg-blue-600/10 blur-[100px] rounded-full pointer-events-none"
            aria-hidden="true"
          />
          <div
            className="absolute -bottom-20 -right-20 w-80 h-80 bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none"
            aria-hidden="true"
          />

          {/* Left Top Brand */}
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600/25 via-indigo-500/25 to-cyan-400/25 flex items-center justify-center shrink-0 animate-pulse">
              <Layers className="w-4 h-4 text-muted-foreground/40" />
            </div>
            <Skeleton className="h-4 w-20 rounded-md" />
          </div>

          {/* Left Center Content */}
          <div className="space-y-6 my-auto max-w-xl relative z-10 py-4 w-full">
            <div className="space-y-3">
              <Skeleton className="h-10 w-4/5 rounded-xl" />
              <Skeleton className="h-10 w-3/5 rounded-xl" />
              <Skeleton className="h-4 w-2/3 rounded-md mt-2" />
            </div>

            {/* Lock Framework Card Skeleton */}
            <div className="p-5 rounded-2xl bg-card/75 border border-border/80 shadow-xl backdrop-blur-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="w-7 h-7 rounded-lg" />
                  <Skeleton className="h-4 w-36 rounded-md" />
                </div>
                <Skeleton className="h-4 w-16 rounded-full" />
              </div>

              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Skeleton className="w-6 h-6 rounded-md shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-3.5 w-28 rounded-md" />
                      <Skeleton className="h-3 w-5/6 rounded-md" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Left bottom note */}
          <div className="relative z-10 flex items-center gap-2">
            <Skeleton className="w-3.5 h-3.5 rounded-full" />
            <Skeleton className="h-3 w-48 rounded-md" />
          </div>
        </div>

        {/* Right Column (Auth Panel) */}
        <div className="lg:col-span-6 xl:col-span-5 h-full flex flex-col justify-between p-8 xl:p-14 relative bg-background">
          {/* Top Action Row */}
          <div className="flex items-center justify-between w-full max-w-sm mx-auto">
            <Skeleton className="h-8 w-28 rounded-full" />
            <ThemeToggleSkeleton className="rounded-full" />
          </div>

          {/* Centered Auth Form Skeleton */}
          <div className="my-auto w-full py-4">
            <div className="w-full max-w-sm mx-auto flex flex-col items-center text-center">
              <div className="w-13 h-13 rounded-2xl bg-muted/60 mb-4 animate-pulse" />
              <Skeleton className="h-7 w-48 rounded-lg mb-2" />
              <Skeleton className="h-4 w-60 rounded-md mb-8" />
              <Skeleton className="h-12 w-full rounded-xl mb-4" />
              <Skeleton className="h-3.5 w-48 rounded-md" />
            </div>
          </div>

          {/* Spacer */}
          <div className="w-full max-w-sm mx-auto" />
        </div>
      </div>

      {/* Footer Bar */}
      <footer className="h-13 border-t border-border/80 bg-card/60 backdrop-blur-md px-6 sm:px-8 lg:px-12 flex items-center justify-between shrink-0 z-20">
        <Skeleton className="h-3.5 w-24 rounded-md" />
        <div className="flex items-center gap-4 sm:gap-6">
          <Skeleton className="h-3 w-20 rounded-md" />
          <Skeleton className="h-3 w-20 rounded-md" />
          <Skeleton className="h-3 w-16 rounded-md hidden md:block" />
        </div>
      </footer>
    </div>
  );
}
