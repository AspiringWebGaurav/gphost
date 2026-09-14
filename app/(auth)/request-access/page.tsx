import { redirect } from "next/navigation";
import { getAuthenticatedUser, getUserProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { AccessRequestForm } from "@/components/auth/access-request-form";
import { PinEntryCard } from "@/components/auth/pin-entry-card";
import { LogoutButton } from "@/components/auth/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ShieldCheck, ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RequestAccessPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  const profile = await getUserProfile(user.id);
  if (profile?.status === "approved") {
    redirect("/dashboard");
  }

  // Check database for an existing pending request
  const adminClient = createAdminClient();
  const { data: existingRequest } = await adminClient
    .from("access_requests")
    .select("id, status, created_at")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-background text-foreground relative overflow-hidden transition-colors duration-200">
      {/* Ambient background glow */}
      <div className="absolute top-1/4 left-1/3 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="w-full max-w-lg p-8 rounded-2xl bg-card border border-border shadow-xl backdrop-blur-xl relative transition-colors">
        {/* Navigation & Actions Header */}
        <div className="flex items-center justify-between pb-6 mb-6 border-b border-border">
          <a
            href="/access-gate"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </a>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>

        {/* Page Title */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-3 text-blue-600 dark:text-blue-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Request Upload Access</h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Submit a quick request for account review, or enter an invite PIN below to start right away.
          </p>
        </div>

        {/* Access Request Form */}
        <div className="mb-8">
          <AccessRequestForm existingPendingRequest={!!existingRequest} />
        </div>

        {/* Fast-track PIN section */}
        <div className="pt-6 border-t border-border">
          <PinEntryCard onSuccessRedirect="/dashboard" />
        </div>
      </div>
    </div>
  );
}
