import { requireAdminUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuditLogsViewer, AuditLogItem } from "@/components/admin/audit-logs-viewer";
import { Activity } from "lucide-react";

export const dynamic = "force-dynamic";

interface RawActivityRow {
  id: string;
  actor_id: string | null;
  event_type: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_hash: string | null;
  created_at: string;
  profiles?: { email: string; full_name: string | null } | null;
}

export default async function AdminActivityPage() {
  await requireAdminUser();
  const adminClient = createAdminClient();

  // Fetch recent audit logs joined with profiles for actor info
  const { data: logs, error } = await adminClient
    .from("audit_logs")
    .select(`
      id,
      actor_id,
      event_type,
      resource_type,
      resource_id,
      metadata,
      ip_hash,
      created_at,
      profiles:actor_id (email, full_name)
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Failed to load audit logs:", error);
  }

  const initialLogs: AuditLogItem[] = ((logs as unknown as RawActivityRow[]) || []).map((l: RawActivityRow) => {
    const profile = Array.isArray(l.profiles) ? l.profiles[0] : l.profiles;
    return {
      id: l.id,
      actor_id: l.actor_id,
      actor_email: profile?.email || "System / Service",
      actor_name: profile?.full_name || null,
      event_type: l.event_type,
      resource_type: l.resource_type,
      resource_id: l.resource_id,
      metadata: l.metadata,
      ip_hash: l.ip_hash,
      created_at: l.created_at,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider mb-1">
          <Activity className="w-3.5 h-3.5" />
          <span>Security & Compliance</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          System Audit Logs
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Immutable audit record of all administrative mutations, quota updates, PIN operations, and access decisions.
        </p>
      </div>

      <AuditLogsViewer initialLogs={initialLogs} />
    </div>
  );
}
