import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Globe, ArrowLeft, ExternalLink, Lock } from "lucide-react";
import { ExpiryStatusBadge } from "@/components/ui/expiry-status-badge";

export const dynamic = "force-dynamic";

function isRecordExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

interface SitePreviewPageProps {
  params: Promise<{ slug: string }>;
}

export default async function SitePreviewPage({ params }: SitePreviewPageProps) {
  const { slug } = await params;
  if (!slug) notFound();

  const adminClient = createAdminClient();

  // Fetch share link and attached file
  const { data: shareLink, error: shareErr } = await adminClient
    .from("share_links")
    .select(`
      id,
      slug,
      is_active,
      expires_at,
      password_hash,
      files!inner (
        id,
        sanitized_name,
        mime_type,
        byte_size,
        status,
        expires_at
      )
    `)
    .eq("slug", slug)
    .single();

  if (shareErr || !shareLink || !shareLink.files) {
    notFound();
  }

  // Typecast files
  const file = Array.isArray(shareLink.files) ? shareLink.files[0] : shareLink.files;
  if (!file) notFound();

  // Check if expired
  const fileExpired = isRecordExpired(file.expires_at);
  const linkExpired = isRecordExpired(shareLink.expires_at);
  const isExpired = fileExpired || linkExpired || !shareLink.is_active || file.status === "EXPIRED";

  if (isExpired) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 mb-4">
          <Lock className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-foreground mb-2">Hosted Site Has Expired</h1>
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          This hosted webpage has reached its expiration timestamp and has been safely dismantled.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition shadow-xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to GPHost</span>
        </Link>
      </div>
    );
  }

  const rawUrl = `/raw/${slug}`;

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      {/* Top Banner Control Bar */}
      <header className="h-12 border-b border-border bg-card/90 backdrop-blur-md px-3 sm:px-4 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href="/"
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition shrink-0"
            title="Home"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Globe className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-semibold text-foreground truncate max-w-[140px] sm:max-w-xs" title={file.sanitized_name}>
              {file.sanitized_name}
            </span>
            <span className="hidden md:inline-flex px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
              GP-Sites Live
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:block">
            <ExpiryStatusBadge expiresAt={file.expires_at} status={file.status} size="xs" />
          </div>

          <a
            href={rawUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-foreground hover:bg-muted text-xs font-medium transition cursor-pointer"
            title="Open in new window"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Direct View</span>
          </a>
        </div>
      </header>

      {/* Sandboxed Hosted Site Preview Frame */}
      <main className="flex-1 w-full relative bg-white dark:bg-zinc-950">
        <iframe
          src={rawUrl}
          title={file.sanitized_name}
          sandbox="allow-scripts allow-forms allow-modals allow-same-origin allow-popups"
          className="w-full h-full border-0 absolute inset-0 bg-white"
        />
      </main>
    </div>
  );
}
