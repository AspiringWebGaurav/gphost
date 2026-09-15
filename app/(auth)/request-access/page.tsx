import { redirect } from "next/navigation";
import { getAuthenticatedUser, getUserProfile } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function RequestAccessPage() {
  const user = await getAuthenticatedUser();
  if (user) {
    const profile = await getUserProfile(user.id);
    if (profile?.status === "approved") {
      redirect("/dashboard");
    }
    redirect("/access-gate?tab=request");
  }

  // If not authenticated, route to login page with request access modal active
  redirect("/login?mode=request");
}
