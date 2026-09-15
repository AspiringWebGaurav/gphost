import { requireAdminUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { PinsManager, OnboardingPinItem } from "@/components/admin/pins-manager";
import { KeyRound } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminPinsPage() {
  await requireAdminUser();
  const adminClient = createAdminClient();

  // Fetch all onboarding PINs
  const { data: pins, error } = await adminClient
    .from("onboarding_pins")
    .select("id, label, is_active, max_uses, times_used, expires_at, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load onboarding pins:", error);
  }

  const initialPins: OnboardingPinItem[] = (pins || []).map((p) => {
    let displayLabel = p.label || "";
    let quotaBytes: number | null = null;
    const match = displayLabel.match(/\[quota:(\d+)\]/);
    if (match) {
      quotaBytes = parseInt(match[1], 10);
      displayLabel = displayLabel.replace(/\s*\[quota:\d+\]/, "").trim();
    }
    return {
      id: p.id,
      label: displayLabel || null,
      quota_bytes: quotaBytes,
      is_active: Boolean(p.is_active),
      max_uses: Number(p.max_uses),
      times_used: Number(p.times_used),
      expires_at: p.expires_at,
      created_at: p.created_at,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-purple-400 text-xs font-semibold uppercase tracking-wider mb-1">
          <KeyRound className="w-3.5 h-3.5" />
          <span>Access Grants</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Fast-Track Onboarding PINs
        </h1>
        <p className="text-xs text-neutral-400 mt-1">
          Create and manage 4-digit invitation PINs. All PINs are stored as Argon2id salted hashes and plaintexts are revealed only once.
        </p>
      </div>

      <PinsManager initialPins={initialPins} />
    </div>
  );
}
