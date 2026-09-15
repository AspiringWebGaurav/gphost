import { requireAdminUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { RequestsManager, AccessRequestItem } from "@/components/admin/requests-manager";
import { UserCheck } from "lucide-react";

export const dynamic = "force-dynamic";


export default async function AdminRequestsPage() {
  await requireAdminUser();
  const adminClient = createAdminClient();

  // Fetch access requests joined with profiles
  const { data: requests, error } = await adminClient
    .from("access_requests")
    .select(`
      id,
      user_id,
      status,
      created_at,
      reason,
      reviewed_at,
      rejection_reason,
      profiles:user_id (email, full_name)
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load access requests:", error);
  }

  interface RawAccessRequestDb {
    id: string;
    user_id: string;
    status: string;
    created_at: string;
    reason: string | null;
    reviewed_at: string | null;
    rejection_reason: string | null;
    profiles?: { email: string; full_name: string | null } | null;
  }

  const initialRequests: AccessRequestItem[] = (
    (requests as unknown as RawAccessRequestDb[]) || []
  ).map((r: RawAccessRequestDb) => {
    const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return {
      id: r.id,
      user_id: r.user_id,
      email: profile?.email || "Unknown",
      full_name: profile?.full_name || null,
      status: r.status as "pending" | "approved" | "rejected",
      requested_at: r.created_at || new Date().toISOString(),
      notes: r.reason || null,
      reviewed_at: r.reviewed_at,
      rejection_reason: r.rejection_reason,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-purple-400 text-xs font-semibold uppercase tracking-wider mb-1">
          <UserCheck className="w-3.5 h-3.5" />
          <span>Access Control</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Access Request Queue
        </h1>
        <p className="text-xs text-neutral-400 mt-1">
          Review and approve pending user onboarding requests. Decisions trigger atomic status transitions and audit logs.
        </p>
      </div>

      <RequestsManager initialRequests={initialRequests} />
    </div>
  );
}
