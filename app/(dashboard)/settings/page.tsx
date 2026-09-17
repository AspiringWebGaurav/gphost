import { redirect } from "next/navigation";
import { getAuthenticatedUser, getUserProfile } from "@/lib/auth/session";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { ApiKeysManager } from "@/components/dashboard/api-keys-manager";
import { Settings } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login?next=/settings");
  }

  const profile = await getUserProfile(user.id);
  if (!profile) {
    redirect("/login");
  }

  if (profile.status !== "approved") {
    redirect("/access-gate");
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs font-medium mb-1.5">
          <Settings className="w-3 h-3" />
          <span>Settings</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          Account &amp; Developer Settings
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage your profile, credentials, and developer API keys for terminal uploads.
        </p>
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

      <ApiKeysManager />
    </div>
  );
}
