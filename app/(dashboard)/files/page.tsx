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
  const isPremium =
    isAdmin ||
    profile.can_create_permanent ||
    profile.quota_bytes === -1 ||
    profile.quota_bytes > 5368709120;
  const adminClient = createAdminClient();

  // Initial Server-Side Query (Page 1, pageSize 20)
  // STRICT PRIVACY: r2_key, r2_upload_id, r2_etag are strictly omitted from select
  const { data: initialFilesRaw, count } = await adminClient
    .from("files")
    .select(
      `id, filename, sanitized_name, byte_size, mime_type, status, expiry_preset, expires_at, created_at,
       share_links (
         id,
         slug,
         is_active,
         expires_at
       )`,
      { count: "exact" }
    )
    .eq("user_id", user.id)
    .in("status", ["ACTIVE", "EXPIRING", "EXPIRED"])
    .order("created_at", { ascending: false })
    .range(0, 19);

  interface DbShareLink {
    id: string;
    slug: string;
    is_active: boolean;
    expires_at: string | null;
  }

  interface DbFileItem {
    id: string;
    filename: string;
    sanitized_name: string;
    byte_size: number;
    mime_type: string;
    status: string;
    expiry_preset?: string;
    expires_at: string | null;
    created_at: string;
    share_links?: DbShareLink | DbShareLink[] | null;
  }

  const initialFiles: SafeFileItem[] = ((initialFilesRaw as unknown as DbFileItem[]) || []).map((f) => {
    const rawShareLinks: DbShareLink[] = Array.isArray(f.share_links)
      ? f.share_links
      : f.share_links
      ? [f.share_links]
      : [];
    const activeShare = rawShareLinks.find((s) => s.is_active) || rawShareLinks[0];
    const shareSlug = activeShare?.slug || null;
    return {
      id: f.id,
      filename: f.filename,
      sanitized_name: f.sanitized_name,
      byte_size: f.byte_size,
      mime_type: f.mime_type,
      status: f.status,
      expiry_preset: f.expiry_preset,
      expires_at: f.expires_at,
      created_at: f.created_at,
      share_slug: shareSlug,
      is_site: f.mime_type === "text/html" || Boolean(shareSlug),
    };
  });

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
        initialFiles={initialFiles}
        initialTotalCount={totalCount}
        initialTotalPages={totalPages}
        canCreatePermanent={profile.can_create_permanent || isAdmin}
        isPremium={isPremium}
      />
    </div>
  );
}
