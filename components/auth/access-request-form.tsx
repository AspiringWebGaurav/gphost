"use client";

import { useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { useTheme } from "@/components/theme-provider";
import { Send, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface AccessRequestFormProps {
  existingPendingRequest?: boolean;
}

export function AccessRequestForm({ existingPendingRequest = false }: AccessRequestFormProps) {
  const { resolvedTheme } = useTheme();
  const [reason, setReason] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasPending, setHasPending] = useState(existingPendingRequest);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (reason.trim().length < 10) {
      setErrorMessage("Please enter at least 10 characters explaining what you'll use GPHosting for.");
      return;
    }

    if (!turnstileToken) {
      setErrorMessage("Please complete the security challenge.");
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);

      const response = await fetch("/api/onboarding/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, turnstileToken }),
      });

      const data = await response.json();

      if (response.status === 409) {
        setHasPending(true);
        setErrorMessage(data.error || "A request is already under review.");
        setLoading(false);
        return;
      }

      if (!response.ok || !data.success) {
        setErrorMessage(data.error || "Failed to submit request.");
        setLoading(false);
        return;
      }

      setHasPending(true);
      setSuccessMessage(data.message || "Your access request was successfully submitted!");
      setLoading(false);
    } catch {
      setErrorMessage("Network error while submitting request. Please try again.");
      setLoading(false);
    }
  };

  if (hasPending) {
    return (
      <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-left">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Request Under Review</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Your request has been received and is waiting for review. You will get access once approved.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-rose-600 dark:text-rose-400 text-xs leading-relaxed">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400 text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      <div>
        <label htmlFor="reason" className="block text-xs font-medium text-muted-foreground mb-1.5">
          How do you plan to use GPHosting?
        </label>
        <textarea
          id="reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Tell us briefly what kind of files you plan to share..."
          className="w-full text-xs p-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-none"
        />
        <div className="flex justify-between items-center mt-1 text-[11px] text-muted-foreground">
          <span>Minimum 10 characters</span>
          <span>{reason.length}/1000</span>
        </div>
      </div>

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
        id="submit-request-btn"
        disabled={loading || reason.trim().length < 10 || (siteKey ? !turnstileToken : false)}
        className="w-full py-2.5 px-4 rounded-xl bg-foreground hover:opacity-90 text-background font-medium text-xs flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs active:scale-[0.99]"
      >
        {loading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Submitting...</span>
          </>
        ) : (
          <>
            <Send className="w-3.5 h-3.5" />
            <span>Submit Request</span>
          </>
        )}
      </button>
    </form>
  );
}
