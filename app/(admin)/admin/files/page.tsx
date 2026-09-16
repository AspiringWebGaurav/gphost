import { requireAdminUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminFileAudit, AdminFileItem } from "@/components/admin/admin-file-audit";
import { FileBox } from "lucide-react";

export const dynamic = "force-dynamic";

interface RawAdminFileJoin {
  id: string;
  sanitized_name: string;
  byte_size: number;
  mime_type: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  profiles?: { email: string } | null;
  share_links?: { id: string; is_active: boolean }[] | null;
}

export default async function AdminFilesPage() {
  await requireAdminUser();
  const adminClient = createAdminClient();

  // Fetch all files joined with profiles for owner email and share links count
  const { data: files, error } = await adminClient
    .from("files")
    .select(`
      id,
      sanitized_name,
      byte_size,
      mime_type,
      status,
      created_at,
      expires_at,
      profiles:user_id (email),
      share_links (id, is_active)
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load admin files:", error);
  }

  const initialFiles: AdminFileItem[] = ((files as unknown as RawAdminFileJoin[]) || []).map(
    (f: RawAdminFileJoin) => {
      const activeShares = (f.share_links || []).filter((s) => s.is_active).length;
      return {
        id: f.id,
        sanitized_name: f.sanitized_name,
        byte_size: Number(f.byte_size),
        mime_type: f.mime_type,
        status: f.status,
        created_at: f.created_at,
        expires_at: f.expires_at,
        owner_email: f.profiles?.email || "Unknown",
        active_shares_count: activeShares,
      };
    }
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 text-xs font-semibold uppercase tracking-wider mb-1">
          <FileBox className="w-3.5 h-3.5" />
          <span>Storage Inspection</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Global File Audit
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Cross-user storage audit and compliance management. Internal storage keys are strictly stripped for zero-trust privacy.
        </p>
      </div>

      <AdminFileAudit initialFiles={initialFiles} />
    </div>
  );
}
