import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser, getUserProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Clock, AlertTriangle, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatRemainingTime(expiresAt: string, currentMs: number): string {
  const diffMs = new Date(expiresAt).getTime() - currentMs;
  if (diffMs <= 0) return "Expired";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m left`;
}

async function fetchExpiringFiles(userId: string) {
  const adminClient = createAdminClient();
  const currentMs = Date.now();
  const thresholdTime = new Date(currentMs + 72 * 60 * 60 * 1000).toISOString();
  const now = new Date(currentMs).toISOString();

  // Query user files expiring within 72 hours
  // STRICT PRIVACY: internal R2 keys are strictly omitted from select
  const { data: expiringFiles } = await adminClient
    .from("files")
    .select("id, sanitized_name, byte_size, mime_type, status, expires_at, created_at")
    .eq("user_id", userId)
    .not("expires_at", "is", null)
    .lte("expires_at", thresholdTime)
    .gt("expires_at", now)
    .in("status", ["ACTIVE", "EXPIRING"])
    .order("expires_at", { ascending: true });

  return { files: expiringFiles || [], currentMs };
}

export default async function ExpiringPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login?next=/expiring");
  }

  const profile = await getUserProfile(user.id);
  if (!profile) {
    redirect("/login");
  }

  if (profile.status !== "approved") {
    redirect("/access-gate");
  }

  const { files, currentMs } = await fetchExpiringFiles(user.id);

  return (
    <div className="space-y-6 max-w-5xl w-full mx-auto">
      {/* Page Header */}
      <div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-xs font-medium mb-1.5">
          <AlertTriangle className="w-3 h-3" />
          <span>Notice</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          Expiring Soon
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Files scheduled to be automatically deleted in the next 3 days. Download them now if you need to keep them.
        </p>
      </div>

      {files.length === 0 ? (
        <div className="p-10 text-center rounded-2xl border border-border bg-card shadow-2xs text-muted-foreground">
          <Clock className="w-9 h-9 mx-auto mb-2.5 opacity-30 text-emerald-500" />
          <p className="text-sm font-medium text-foreground">No files expiring soon</p>
          <p className="text-xs mt-0.5">All your files have more than 3 days remaining or are permanent.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden">
          <div className="divide-y divide-border">
            {files.map((file) => (
              <div
                key={file.id}
                className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/40 transition"
              >
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground truncate max-w-sm sm:max-w-md">
                      {file.sanitized_name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span>{formatBytes(file.byte_size)}</span>
                      <span>&bull;</span>
                      <span className="font-mono text-amber-600 dark:text-amber-400 font-medium">
                        {formatRemainingTime(file.expires_at!, currentMs)}
                      </span>
                      <span>&bull;</span>
                      <span>Expires: {new Date(file.expires_at!).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <Link
                  href="/files"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-xs font-medium text-foreground transition self-end sm:self-center shrink-0"
                >
                  <span>View in Files</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
