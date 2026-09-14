"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Turnstile } from "@marsidev/react-turnstile";
import { useTheme } from "@/components/theme-provider";
import { KeyRound, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface PinEntryCardProps {
  onSuccessRedirect?: string;
}

export function PinEntryCard({ onSuccessRedirect = "/dashboard" }: PinEntryCardProps) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [pin, setPin] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!/^\d{4}$/.test(pin)) {
      setErrorMessage("PIN must be exactly 4 decimal digits.");
      return;
    }

    if (!turnstileToken) {
      setErrorMessage("Please complete the security challenge.");
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);

      const response = await fetch("/api/onboarding/pin-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, turnstileToken }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setErrorMessage(data.error || "Failed to verify PIN");
        setLoading(false);
        return;
      }

      setSuccessMessage(data.message || "PIN verified successfully! Redirecting...");
      setTimeout(() => {
        router.push(onSuccessRedirect);
        router.refresh();
      }, 1000);
    } catch {
      setErrorMessage("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="w-full p-6 rounded-2xl bg-card border border-border text-left shadow-xs transition-colors">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
          <KeyRound className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Have an Access Code?</h3>
          <p className="text-xs text-muted-foreground">Enter your 4-digit code for instant access</p>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-rose-600 dark:text-rose-400 text-xs leading-relaxed">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400 text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="pin-input" className="block text-xs font-medium text-muted-foreground mb-1.5">
            4-Digit Code
          </label>
          <input
            id="pin-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={pin}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "").slice(0, 4);
              setPin(val);
            }}
            placeholder="••••"
            className="w-full text-center tracking-[0.6em] text-2xl font-mono py-2.5 px-4 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>

        {/* Turnstile Bot Defense */}
        {siteKey && (
          <div className="flex justify-center my-2">
            <Turnstile
              siteKey={siteKey}
              onSuccess={(token) => setTurnstileToken(token)}
              onError={() => setErrorMessage("Security check failed. Please refresh.")}
              options={{ theme: resolvedTheme, size: "flexible" }}
            />
          </div>
        )}

        <button
          type="submit"
          id="redeem-pin-btn"
          disabled={loading || pin.length !== 4 || (siteKey ? !turnstileToken : false)}
          className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-500/10"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Checking code...</span>
            </>
          ) : (
            <span>Continue</span>
          )}
        </button>
      </form>
    </div>
  );
}
