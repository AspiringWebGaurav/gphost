import { redirect } from "next/navigation";
import { getAuthenticatedUser, getUserProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
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

  // Fetch initial files for server rendering
  const adminClient = createAdminClient();
  const { data: files } = await adminClient
    .from("files")
    .select("id, sanitized_name, byte_size, mime_type, status, expires_at, created_at")
    .eq("user_id", user.id)
    .not("status", "in", '("DELETE_PENDING","DELETE_FAILED","PURGED")')
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <DashboardContent
      initialFiles={files || []}
      profile={{
        full_name: profile.full_name,
        email: profile.email,
        role: profile.role,
        quota_bytes: profile.quota_bytes,
        storage_used_bytes: profile.storage_used_bytes,
        reserved_bytes: profile.reserved_bytes,
        can_create_permanent: profile.can_create_permanent,
      }}
    />
  );
}
