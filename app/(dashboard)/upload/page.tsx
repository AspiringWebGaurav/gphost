import { redirect } from "next/navigation";
import { getAuthenticatedUser, getUserProfile } from "@/lib/auth/session";
import { UploadZone } from "@/components/upload/upload-zone";
import { UploadCloud, ShieldCheck, Zap } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login?next=/upload");
  }

  const profile = await getUserProfile(user.id);
  if (!profile) {
    redirect("/login");
  }

  if (profile.status !== "approved") {
    redirect("/access-gate");
  }

  const isAdmin = profile.role === "admin";

  return (
    <div className="space-y-6 max-w-4xl w-full mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          Upload Files
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Upload files up to 1 GB directly to secure cloud storage. Fast, private, and automatic.
        </p>
      </div>

      {/* Upload Zone Component */}
      <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border shadow-2xs">
        <UploadZone
          canCreatePermanent={profile.can_create_permanent || isAdmin}
          isAdmin={isAdmin}
        />
      </div>

      {/* Feature Badges - Sleek 1-line strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-muted-foreground">
        <div className="p-3 rounded-xl bg-card border border-border flex items-center gap-2.5 shadow-2xs">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          <div className="min-w-0">
            <div className="text-foreground font-semibold text-sm leading-tight">Verified Storage</div>
            <div className="text-xs text-muted-foreground truncate mt-0.5">SHA-256 checksum integrity</div>
          </div>
        </div>
        <div className="p-3 rounded-xl bg-card border border-border flex items-center gap-2.5 shadow-2xs">
          <Zap className="w-4 h-4 text-blue-500 shrink-0" />
          <div className="min-w-0">
            <div className="text-foreground font-semibold text-sm leading-tight">Direct Speed</div>
            <div className="text-xs text-muted-foreground truncate mt-0.5">Zero intermediary latency</div>
          </div>
        </div>
        <div className="p-3 rounded-xl bg-card border border-border flex items-center gap-2.5 shadow-2xs">
          <UploadCloud className="w-4 h-4 text-purple-500 shrink-0" />
          <div className="min-w-0">
            <div className="text-foreground font-semibold text-sm leading-tight">Reliable Uploads</div>
            <div className="text-xs text-muted-foreground truncate mt-0.5">Automatic resumable parts</div>
          </div>
        </div>
      </div>
    </div>
  );
}
