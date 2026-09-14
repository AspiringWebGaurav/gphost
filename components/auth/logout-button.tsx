"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface LogoutButtonProps {
  className?: string;
  variant?: "outline" | "ghost" | "default";
}

export function LogoutButton({ className, variant = "ghost" }: LogoutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    try {
      setLoading(true);
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } catch {
      router.push("/login");
      router.refresh();
    }
  };

  const baseStyle =
    variant === "outline"
      ? "border border-border bg-background hover:bg-muted text-foreground"
      : variant === "default"
      ? "bg-foreground text-background hover:opacity-90"
      : "hover:bg-muted text-muted-foreground hover:text-foreground";

  return (
    <button
      type="button"
      id="logout-btn"
      onClick={handleLogout}
      disabled={loading}
      className={`py-2 px-3 rounded-xl text-xs font-medium inline-flex items-center gap-2 transition-colors disabled:opacity-50 ${baseStyle} ${className || ""}`}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <LogOut className="w-3.5 h-3.5" />
      )}
      <span>Sign out</span>
    </button>
  );
}
