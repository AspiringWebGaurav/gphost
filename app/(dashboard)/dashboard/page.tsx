import { redirect } from "next/navigation";
import { getAuthenticatedUser, getUserProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserMaxFiles } from "@/lib/storage/user-limits";
import { DashboardContent } from "@/components/dashboard/dashboard-content";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login?next=/dashboard");
  }

  const profile = await getUserProfile(user.id);
  if (!profile) {
    redirect("/login");
  }

  if (profile.status !== "approved") {
    redirect("/access-gate");
  }

  // Fetch user file limits and approval context
  const maxFiles = await getUserMaxFiles(user.id);

  // Fetch initial files for server rendering
  const adminClient = createAdminClient();
  const nowIso = new Date().toISOString();

  // Reconcile any past-due files to EXPIRED before rendering
  await Promise.all([
    adminClient
      .from("files")
      .update({ status: "EXPIRED", updated_at: nowIso })
      .eq("user_id", user.id)
      .in("status", ["ACTIVE", "EXPIRING"])
      .not("expires_at", "is", null)
      .lte("expires_at", nowIso),
    adminClient
      .from("share_links")
      .update({ is_active: false, updated_at: nowIso })
      .eq("user_id", user.id)
      .eq("is_active", true)
      .not("expires_at", "is", null)
      .lte("expires_at", nowIso),
  ]);

  const [
    { data: filesRaw, count: totalFilesCount },
    { data: shareLinks, count: activeLinksCount },
    { data: approvedRequest },
  ] = await Promise.all([
    adminClient
      .from("files")
      .select(
        `id, sanitized_name, byte_size, mime_type, status, expires_at, created_at,
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
      .limit(10),
    adminClient
      .from("share_links")
      .select("id, download_count", { count: "exact" })
      .eq("user_id", user.id)
      .eq("is_active", true),
    adminClient
      .from("access_requests")
      .select("reviewed_at, rejection_reason")
      .eq("user_id", user.id)
      .eq("status", "approved")
      .order("reviewed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  interface DbShareLink {
    id: string;
    slug: string;
    is_active: boolean;
    expires_at: string | null;
  }

  interface DbFileItem {
    id: string;
    sanitized_name: string;
    byte_size: number;
    mime_type: string;
    status: string;
    expires_at: string | null;
    created_at: string;
    share_links?: DbShareLink | DbShareLink[] | null;
  }

  const formattedFiles = ((filesRaw as unknown as DbFileItem[]) || []).map((f) => {
    const rawShareLinks: DbShareLink[] = Array.isArray(f.share_links)
      ? f.share_links
      : f.share_links
      ? [f.share_links]
      : [];
    const activeShare = rawShareLinks.find((s) => s.is_active) || rawShareLinks[0];
    const shareSlug = activeShare?.slug || null;
    return {
      id: f.id,
      sanitized_name: f.sanitized_name,
      byte_size: f.byte_size,
      mime_type: f.mime_type,
      status: f.status,
      expires_at: f.expires_at,
      created_at: f.created_at,
      share_slug: shareSlug,
      is_site: f.mime_type === "text/html" || Boolean(shareSlug),
    };
  });

  const totalDownloads = (shareLinks || []).reduce(
    (sum, link) => sum + (Number(link.download_count) || 0),
    0
  );

  const configuredAdminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const isOwnerOrAdmin =
    profile.role === "admin" ||
    Boolean(configuredAdminEmail && profile.email.toLowerCase() === configuredAdminEmail);

  const welcomeInfo =
    !isOwnerOrAdmin && approvedRequest
      ? {
          userId: user.id,
          userName: profile.full_name || profile.email.split("@")[0],
          userEmail: profile.email,
          maxFiles: maxFiles && maxFiles > 0 ? maxFiles : null,
          quotaBytes: profile.quota_bytes,
          approvedAt: approvedRequest.reviewed_at || null,
          approvalNote: approvedRequest.rejection_reason || null,
        }
      : undefined;

  return (
    <DashboardContent
      initialFiles={formattedFiles}
      welcomeInfo={welcomeInfo}
      stats={{
        totalFiles: totalFilesCount ?? formattedFiles.length,
        activeLinks: activeLinksCount ?? (shareLinks ? shareLinks.length : 0),
        totalDownloads,
      }}
      profile={{
        full_name: profile.full_name,
        email: profile.email,
        role: profile.role,
        quota_bytes: profile.quota_bytes,
        storage_used_bytes: profile.storage_used_bytes,
        reserved_bytes: profile.reserved_bytes,
        can_create_permanent: profile.can_create_permanent,
        max_files: maxFiles,
      }}
    />
  );
}
