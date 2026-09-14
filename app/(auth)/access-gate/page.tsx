import { redirect } from "next/navigation";
import { getAuthenticatedUser, getUserProfile } from "@/lib/auth/session";
import { PinEntryCard } from "@/components/auth/pin-entry-card";
import { LogoutButton } from "@/components/auth/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ShieldAlert, Clock, UserX, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AccessGatePage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  const profile = await getUserProfile(user.id);
  const status = profile?.status || "pending";

  if (status === "approved") {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-background text-foreground relative overflow-hidden transition-colors duration-200">
      {/* Ambient background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="w-full max-w-lg p-8 rounded-2xl bg-card border border-border shadow-xl backdrop-blur-xl relative transition-colors">
        {/* Top bar with user email, theme toggle, and logout */}
        <div className="flex items-center justify-between pb-6 mb-6 border-b border-border">
          <div className="text-xs text-muted-foreground truncate max-w-[200px] sm:max-w-[260px]">
            Signed in as <span className="font-semibold text-foreground">{user.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>

        {/* Status: Pending */}
        {status === "pending" && (
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4 text-amber-500 shadow-md shadow-amber-500/10">
              <Clock className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">
              Account Pending Approval
            </h1>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed max-w-sm">
              Your account is registered. Enter an invite PIN to get started immediately, or submit a request for account approval.
            </p>

            {/* PIN Entry Card */}
            <div className="w-full mb-6">
              <PinEntryCard onSuccessRedirect="/dashboard" />
            </div>

            {/* Request option */}
            <div className="w-full pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>Don&apos;t have an invite PIN?</span>
              <a
                href="/request-access"
                className="text-blue-600 dark:text-blue-400 hover:underline font-medium inline-flex items-center gap-1 transition-colors"
              >
                <span>Request access</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}

        {/* Status: Rejected */}
        {status === "rejected" && (
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4 text-rose-500 shadow-md shadow-rose-500/10">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">
              Access Not Approved
            </h1>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed max-w-sm">
              Your request could not be approved at this time. If you believe this is a mistake, please reach out to the site owner.
            </p>
            <div className="p-4 rounded-xl bg-muted border border-border text-xs text-muted-foreground w-full mb-6">
              Contact: <span className="text-foreground font-mono">gauravpatil9262@gmail.com</span>
            </div>
          </div>
        )}

        {/* Status: Revoked */}
        {status === "revoked" && (
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4 text-rose-500 shadow-md shadow-rose-500/10">
              <UserX className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">
              Account Access Revoked
            </h1>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed max-w-sm">
              Your upload access has been deactivated. Please contact support if you need help.
            </p>
            <div className="p-4 rounded-xl bg-muted border border-border text-xs text-muted-foreground w-full mb-6">
              Contact: <span className="text-foreground font-mono">gauravpatil9262@gmail.com</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
