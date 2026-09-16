import { redirect } from "next/navigation";
import { getAuthenticatedUser, getUserProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { LinksTable, ShareLinkItem } from "@/components/dashboard/links-table";
import { Link as LinkIcon } from "lucide-react";

export const dynamic = "force-dynamic";

interface RawShareLinkRow {
  id: string;
  slug: string;
  max_downloads: number | null;
  download_count: number;
  is_single_use: boolean;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  password_hash?: string | null;
  files:
    | {
        id: string;
        sanitized_name: string;
        byte_size: number;
        user_id: string;
        status: string;
        expires_at: string | null;
      }
    | {
        id: string;
        sanitized_name: string;
        byte_size: number;
        user_id: string;
        status: string;
        expires_at: string | null;
      }[];
  xurl_mappings?:
    | { xurl_short_url: string; status: string }
    | { xurl_short_url: string; status: string }[];
}

async function fetchActiveShareLinks(userId: string): Promise<ShareLinkItem[]> {
  const adminClient = createAdminClient();
  const now = Date.now();

  // Query user's share links with target file metadata and xurl mappings
  // Strictly enforce that the target file is ACTIVE and link is active
  const { data: rawLinks } = await adminClient
    .from("share_links")
    .select(
      `id, slug, max_downloads, download_count, is_single_use, is_active, expires_at, created_at, password_hash,
       files!inner(id, sanitized_name, byte_size, user_id, status, expires_at),
       xurl_mappings(xurl_short_url, status)`
    )
    .eq("files.user_id", userId)
    .eq("files.status", "ACTIVE")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const allRows = (rawLinks as unknown as RawShareLinkRow[] | null) || [];
  const staleLinkIds: string[] = [];

  const activeRows = allRows.filter((l) => {
    const file = Array.isArray(l.files) ? l.files[0] : l.files;
    if (!file || file.status !== "ACTIVE") {
      staleLinkIds.push(l.id);
      return false;
    }

    // Target file expired
    if (file.expires_at && new Date(file.expires_at).getTime() <= now) {
      staleLinkIds.push(l.id);
      return false;
    }

    // Share link expired
    if (l.expires_at && new Date(l.expires_at).getTime() <= now) {
      staleLinkIds.push(l.id);
      return false;
    }

    // Single-use or max downloads exhausted
    if (l.max_downloads !== null && l.download_count >= l.max_downloads) {
      staleLinkIds.push(l.id);
      return false;
    }

    return true;
  });

  // Proactively deactivate any stale or expired links discovered
  if (staleLinkIds.length > 0) {
    adminClient
      .from("share_links")
      .update({ is_active: false })
      .in("id", staleLinkIds)
      .then(() => {});
  }

  return activeRows.map((l: RawShareLinkRow) => {
    const file = Array.isArray(l.files) ? l.files[0] : l.files;
    const xurl = Array.isArray(l.xurl_mappings) ? l.xurl_mappings[0] : l.xurl_mappings;
    return {
      id: l.id,
      slug: l.slug,
      file_name: file?.sanitized_name || "Unknown",
      byte_size: file?.byte_size || 0,
      download_count: l.download_count,
      max_downloads: l.max_downloads,
      is_single_use: l.is_single_use,
      is_password_protected: Boolean(l.password_hash),
      is_active: l.is_active,
      expires_at: l.expires_at,
      created_at: l.created_at,
      xurl_short_url: xurl?.status === "active" ? xurl.xurl_short_url : null,
      xurl_status: xurl?.status || null,
    };
  });
}

export default async function LinksPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login?next=/links");
  }

  const profile = await getUserProfile(user.id);
  if (!profile) {
    redirect("/login");
  }

  if (profile.status !== "approved") {
    redirect("/access-gate");
  }

  const formattedLinks = await fetchActiveShareLinks(user.id);

  return (
    <div className="space-y-6 max-w-6xl w-full mx-auto">
      <div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs font-medium mb-1.5">
          <LinkIcon className="w-3 h-3" />
          <span>Share Links</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          Active Share Links
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          View, copy, or delete links you&apos;ve created to share your files.
        </p>
      </div>

      <LinksTable initialLinks={formattedLinks} />
    </div>
  );
}
