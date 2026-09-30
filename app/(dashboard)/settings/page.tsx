import { redirect } from "next/navigation";
import { requireApprovedUser } from "@/lib/auth/session";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { ApiKeysManager } from "@/components/dashboard/api-keys-manager";
import { GdprComplianceCard } from "@/components/dashboard/gdpr-compliance-card";
import { Settings } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let profile;
  try {
    const auth = await requireApprovedUser();
    profile = auth.profile;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "UNAUTHENTICATED") {
      redirect("/login?next=/settings");
    }
    redirect("/access-gate");
  }

  return (
    <div className="space-y-3 sm:space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Settings className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate">
              Account &amp; Developer Settings
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              Manage your profile, data transparency, and developer API keys.
            </p>
          </div>
        </div>
      </div>

      <SettingsForm
        initialProfile={{
          email: profile.email,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          role: profile.role,
          status: profile.status,
          quota_bytes: profile.quota_bytes,
          can_create_permanent: profile.can_create_permanent,
          created_at: profile.created_at,
        }}
      />

      <GdprComplianceCard
        storageUsedBytes={profile.storage_used_bytes || 0}
        quotaBytes={profile.quota_bytes || 0}
        role={profile.role}
        memberSince={profile.created_at}
      />

      <ApiKeysManager />
    </div>
  );
}

