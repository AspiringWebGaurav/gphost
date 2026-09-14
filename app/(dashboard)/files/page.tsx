import { redirect } from "next/navigation";
import { getAuthenticatedUser, getUserProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { FileManager, SafeFileItem } from "@/components/dashboard/file-manager";
import { Files } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FilesPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login?next=/files");
  }

  const profile = await getUserProfile(user.id);
  if (!profile) {
    redirect("/login");
  }

  if (profile.status !== "approved") {
    redirect("/access-gate");
  }

  const isAdmin = profile.role === "admin";
  const adminClient = createAdminClient();

  // Initial Server-Side Query (Page 1, pageSize 20)
  // STRICT PRIVACY: r2_key, r2_upload_id, r2_etag are strictly omitted from select
  const { data: initialFiles, count } = await adminClient
    .from("files")
    .select(
      "id, filename, sanitized_name, byte_size, mime_type, status, expiry_preset, expires_at, created_at",
      { count: "exact" }
    )
    .eq("user_id", user.id)
    .not("status", "in", '("DELETE_PENDING","DELETE_FAILED","PURGED")')
    .order("created_at", { ascending: false })
    .range(0, 19);

  const totalCount = count || 0;
  const totalPages = Math.ceil(totalCount / 20);

  return (
    <div className="space-y-6 max-w-6xl w-full mx-auto">
      {/* Page Header */}
      <div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs font-medium mb-1.5">
          <Files className="w-3 h-3" />
          <span>Your Files</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          File Manager
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          View, search, and manage all your uploaded files in one place.
        </p>
      </div>

      <FileManager
        initialFiles={(initialFiles as SafeFileItem[]) || []}
        initialTotalCount={totalCount}
        initialTotalPages={totalPages}
        canCreatePermanent={profile.can_create_permanent || isAdmin}
      />
    </div>
  );
}
