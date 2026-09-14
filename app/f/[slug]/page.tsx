import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPublicShareMetadata } from "@/lib/storage/share";
import { DownloadCard } from "@/components/share/download-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Layers, AlertCircle, Clock, Ban } from "lucide-react";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!slug) {
    return {
      title: "Download File — GPHosting",
      robots: { index: false, follow: false, noarchive: true, nosnippet: true },
    };
  }

  const adminClient = createAdminClient();
  const { data: share } = await adminClient
    .from("share_links")
    .select(`
      id,
      file:files (
        sanitized_name
      )
    `)
    .eq("slug", slug)
    .single();

  const file = Array.isArray(share?.file) ? share.file[0] : share?.file;
  if (!file) {
    return {
      title: "File Not Found — GPHosting",
      robots: { index: false, follow: false, noarchive: true, nosnippet: true },
    };
  }

  const title = `Download ${file.sanitized_name} — GPHosting`;
  const description = "Secure, high-speed direct ephemeral file transfer powered by GPHosting.";

  return {
    title,
    description,
    robots: {
      index: false,
      follow: false,
      noarchive: true,
      nosnippet: true,
    },
    openGraph: {
      title,
      description,
      siteName: "GPHosting",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function PublicSharePage({ params }: PageProps) {
  const { slug } = await params;
  if (!slug || slug.length > 64) {
    notFound();
  }

  const adminClient = createAdminClient();
  const { data: share } = await adminClient
    .from("share_links")
    .select(`
      id,
      slug,
      is_active,
      is_single_use,
      expires_at,
      max_downloads,
      download_count,
      password_hash,
      file:files (
        id,
        sanitized_name,
        byte_size,
        mime_type,
        status,
        expires_at,
        is_password_protected
      )
    `)
    .eq("slug", slug)
    .single();

  if (!share || !share.file) {
    return (
      <PublicShareLayout>
        <StatusCard
          icon={<AlertCircle className="w-12 h-12 text-rose-500" />}
          title="Share Link Not Found"
          description="The link you requested does not exist or may have been deleted by the owner."
          badgeText="404 Not Found"
          badgeColor="rose"
        />
      </PublicShareLayout>
    );
  }

  const file = Array.isArray(share.file) ? share.file[0] : share.file;
  if (!file) {
    return (
      <PublicShareLayout>
        <StatusCard
          icon={<AlertCircle className="w-12 h-12 text-rose-500" />}
          title="File Not Found"
          description="The file associated with this link is no longer present in storage."
          badgeText="404 Not Found"
          badgeColor="rose"
        />
      </PublicShareLayout>
    );
  }

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const isShareExpired = share.expires_at && new Date(share.expires_at).getTime() <= now;
  const isFileExpired = file.expires_at && new Date(file.expires_at).getTime() <= now;

  if (isShareExpired || isFileExpired) {
    return (
      <PublicShareLayout>
        <StatusCard
          icon={<Clock className="w-12 h-12 text-amber-500" />}
          title="Link Expired"
          description="This download link has passed its expiration window and is no longer accessible."
          badgeText="Expired"
          badgeColor="amber"
        />
      </PublicShareLayout>
    );
  }

  if (share.max_downloads !== null && share.download_count >= share.max_downloads) {
    return (
      <PublicShareLayout>
        <StatusCard
          icon={<Ban className="w-12 h-12 text-rose-500" />}
          title="Download Limit Reached"
          description="This link has already reached its maximum allowed number of downloads."
          badgeText="Exhausted"
          badgeColor="rose"
        />
      </PublicShareLayout>
    );
  }

  if (!share.is_active || file.status !== "ACTIVE") {
    return (
      <PublicShareLayout>
        <StatusCard
          icon={<Ban className="w-12 h-12 text-neutral-500" />}
          title="File Unavailable"
          description="This share link has been revoked or the file is no longer active."
          badgeText="Unavailable"
          badgeColor="neutral"
        />
      </PublicShareLayout>
    );
  }

  const publicMetadata = formatPublicShareMetadata(file, share);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

  return (
    <PublicShareLayout>
      <DownloadCard
        slug={slug}
        metadata={publicMetadata}
        isSingleUse={Boolean(share.is_single_use)}
        siteKey={siteKey}
      />
    </PublicShareLayout>
  );
}

function PublicShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased transition-colors duration-200">
      {/* Header */}
      <header className="h-16 border-b border-border bg-background/80 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
            <Layers className="w-4 h-4" />
          </div>
          <span className="font-bold tracking-tight text-foreground text-base">GPHosting</span>
          <span className="text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            Shared File
          </span>
        </div>
        <ThemeToggle />
      </header>

      {/* Center Content */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        {children}
      </main>
    </div>
  );
}

function StatusCard({
  icon,
  title,
  description,
  badgeText,
  badgeColor,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badgeText: string;
  badgeColor: "rose" | "amber" | "neutral";
}) {
  const badgeClasses = {
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    neutral: "bg-muted text-muted-foreground border-border",
  }[badgeColor];

  return (
    <div className="w-full max-w-md mx-auto rounded-2xl bg-card border border-border shadow-xl backdrop-blur-xl p-8 text-center space-y-4">
      <div className="flex justify-center">{icon}</div>
      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold border ${badgeClasses}`}>
        {badgeText}
      </span>
      <h1 className="text-xl font-bold text-foreground tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
