/**
 * Supabase Auth JS issues a console.warn when a stale/expired refresh token
 * is encountered during SSR initial session loading (_emitInitialSession).
 * 
 * As documented in @supabase/auth-js (GoTrueClient.ts):
 * "A missing session, a transient/aborted network failure ... or a dead refresh token
 * (e.g. stale SSR cookies) is not an application error — warn rather than surface it raw."
 * 
 * However, Next.js Turbopack dev server formats console.warn(Error) as a loud error block:
 * `Error [AuthApiError]: Invalid Refresh Token: Refresh Token Not Found`
 * 
 * This helper filters out this specific, expected SSR stale-token warning while preserving
 * all other application warnings and genuine errors intact.
 */

let installed = false;

export function installStaleSessionWarningFilter(): void {
  if (installed || typeof window !== "undefined") {
    return;
  }
  installed = true;

  const originalWarn = console.warn;
  console.warn = function (...args: unknown[]) {
    const first = args[0];
    if (first && typeof first === "object") {
      const err = first as { code?: string; status?: number; message?: string; name?: string };
      if (
        err.code === "refresh_token_not_found" ||
        err.code === "refresh_token_already_used" ||
        err.code === "session_expired" ||
        (err.status === 400 && typeof err.message === "string" && err.message.includes("Refresh Token")) ||
        (err.name === "AuthApiError" && typeof err.message === "string" && err.message.includes("Refresh Token"))
      ) {
        // Expected stale SSR session cleanup - suppress terminal noise
        return;
      }
    }
    if (
      typeof first === "string" &&
      (first.includes("refresh_token_not_found") ||
        first.includes("refresh_token_already_used") ||
        first.includes("Invalid Refresh Token"))
    ) {
      return;
    }
    return originalWarn.apply(console, args);
  };
}

// Auto-install immediately on module load in server runtime
installStaleSessionWarningFilter();
