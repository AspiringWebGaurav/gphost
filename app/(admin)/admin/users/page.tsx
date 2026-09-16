import { requireAdminUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { UserManager, AdminUserProfile } from "@/components/admin/user-manager";
import { Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const { user } = await requireAdminUser();
  const adminClient = createAdminClient();
  const ownerEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const isOwner = Boolean(ownerEmail && user.email?.toLowerCase() === ownerEmail);

  // Fetch all profiles
  const { data: profiles, error } = await adminClient
    .from("profiles")
    .select("id, email, full_name, avatar_url, role, status, quota_bytes, storage_used_bytes, reserved_bytes, can_create_permanent, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load profiles for admin:", error);
  }

  const initialUsers: AdminUserProfile[] = (profiles || []).map((p) => ({
    id: p.id,
    email: p.email,
    full_name: p.full_name,
    avatar_url: p.avatar_url,
    role: p.role as "user" | "admin",
    status: p.status as "pending" | "approved" | "rejected" | "revoked",
    quota_bytes: Number(p.quota_bytes),
    storage_used_bytes: Number(p.storage_used_bytes),
    reserved_bytes: Number(p.reserved_bytes),
    can_create_permanent: Boolean(p.can_create_permanent),
    created_at: p.created_at,
  }));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 text-xs font-semibold uppercase tracking-wider mb-1">
          <Users className="w-3.5 h-3.5" />
          <span>User Administration</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Users &amp; Quotas
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Manage user accounts, adjust storage quotas, toggle permanent link permissions, and administer system roles.
        </p>
      </div>

      <UserManager
        initialUsers={initialUsers}
        currentUserId={user.id}
        isOwner={isOwner}
        ownerEmail={ownerEmail}
      />
    </div>
  );
}
