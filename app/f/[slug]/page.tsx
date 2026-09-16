import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPublicShareMetadata, getPreviewType } from "@/lib/storage/share";
import { createPresignedPreviewUrl } from "@/lib/storage/r2";
import { DownloadCard } from "@/components/share/download-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandLogo } from "@/components/ui/brand-logo";
import { AlertCircle, Clock, Ban, Flame } from "lucide-react";

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
        r2_key,
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
          title="Transfer Expired"
          description="This ephemeral download link has passed its expiration window. In accordance with zero-retention policies, storage objects on Cloudflare R2 have been automatically purged."
          badgeText="Lifecycle: Expired & Purged"
          badgeColor="amber"
          lifecycleDetails={[
            "Time-to-Live (TTL) window has elapsed",
            "Cloudflare R2 object storage scrubbed",
            "Zero residual server logs or copies retained",
          ]}
        />
      </PublicShareLayout>
    );
  }

  if (share.max_downloads !== null && share.download_count >= share.max_downloads) {
    const isSingleUseBurn = Boolean(share.is_single_use);
    return (
      <PublicShareLayout>
        <StatusCard
          icon={
            isSingleUseBurn ? (
              <Flame className="w-12 h-12 text-rose-500" />
            ) : (
              <Ban className="w-12 h-12 text-rose-500" />
            )
          }
          title={isSingleUseBurn ? "Single-Use Link Burned" : "Download Limit Reached"}
          description={
            isSingleUseBurn
              ? "This single-use file has already been downloaded. As per security policies, the file and link self-destructed immediately upon claim."
              : `This transfer link has reached its maximum quota of ${share.max_downloads} downloads. Direct access is permanently closed.`
          }
          badgeText={isSingleUseBurn ? "Lifecycle: Burned on Claim" : "Lifecycle: Quota Exhausted"}
          badgeColor="rose"
          lifecycleDetails={
            isSingleUseBurn
              ? [
                  "1-time download slot was claimed",
                  "Ephemeral link automatically self-destructed",
                  "Storage scrubbed permanently",
                ]
              : [
                  `Reached quota ceiling (${share.download_count}/${share.max_downloads} claimed)`,
                  "Direct access permanently revoked",
                  "Storage scheduled for automatic cleanup",
                ]
          }
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
          description="This share link has been revoked by the owner or the file is no longer active in storage."
          badgeText="Lifecycle: Revoked by Sender"
          badgeColor="neutral"
          lifecycleDetails={[
            "Access manually revoked by file creator",
            "Signed presigned claims disabled",
            "File deactivated",
          ]}
        />
      </PublicShareLayout>
    );
  }

  const publicMetadata = formatPublicShareMetadata(file, share);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

  // Generate initial preview URL if file is an image or PDF and not password protected
  const previewType = getPreviewType(file.mime_type, file.sanitized_name);
  let initialPreviewUrl: string | null = null;

  if (previewType && !share.password_hash && file.r2_key) {
    try {
      initialPreviewUrl = await createPresignedPreviewUrl(
        file.r2_key,
        file.sanitized_name,
        600,
        file.mime_type
      );
    } catch (err) {
      console.error("Failed to generate initial preview URL:", err);
    }
  }

  return (
    <PublicShareLayout>
      <DownloadCard
        slug={slug}
        metadata={publicMetadata}
        isSingleUse={Boolean(share.is_single_use)}
        siteKey={siteKey}
        initialPreviewUrl={initialPreviewUrl}
        initialPreviewType={previewType}
      />
    </PublicShareLayout>
  );
}

function PublicShareLayout({ children }: { children: React.ReactNode }) {
  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-dvh lg:h-dvh w-screen bg-background text-foreground flex flex-col antialiased selection:bg-blue-500/20 selection:text-blue-500 relative overflow-x-hidden">
      {/* Subtle ambient lighting */}
      <div
        className="pointer-events-none fixed -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-blue-500/5 dark:bg-blue-500/10 blur-[140px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-purple-500/5 dark:bg-purple-500/10 blur-[140px]"
        aria-hidden="true"
      />

      {/* Minimal Top Header Bar */}
      <header className="h-12 sm:h-14 w-full px-4 sm:px-8 flex items-center justify-between border-b border-border/40 shrink-0 z-30">
        <BrandLogo size="sm" />

        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </header>

      {/* Main Edge-to-Edge Viewport Content */}
      <main className="flex-1 w-full flex flex-col overflow-y-auto lg:overflow-hidden relative z-10">
        {children}
      </main>

      {/* Unified Centralized Bottom Footer */}
      <footer className="h-10 sm:h-11 w-full px-3 sm:px-6 border-t border-border/40 flex items-center justify-center gap-2 sm:gap-5 text-[11px] sm:text-xs text-muted-foreground shrink-0 z-20 whitespace-nowrap">
        <span className="shrink-0">&copy; {currentYear} GPHosting</span>
        <span className="text-muted-foreground/30 shrink-0">•</span>
        <Link href="/" className="hover:text-foreground transition-colors cursor-pointer shrink-0">
          Website
        </Link>
        <span className="text-muted-foreground/30 shrink-0">•</span>
        <Link href="/terms" className="hover:text-foreground transition-colors cursor-pointer shrink-0">
          <span className="sm:hidden">Terms</span>
          <span className="hidden sm:inline">Terms &amp; Conditions</span>
        </Link>
        <span className="text-muted-foreground/30 shrink-0">•</span>
        <Link href="/privacy" className="hover:text-foreground transition-colors cursor-pointer shrink-0">
          <span className="sm:hidden">Privacy</span>
          <span className="hidden sm:inline">Privacy Policy</span>
        </Link>
      </footer>
    </div>
  );
}

function StatusCard({
  icon,
  title,
  description,
  badgeText,
  badgeColor,
  lifecycleDetails,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badgeText: string;
  badgeColor: "rose" | "amber" | "neutral";
  lifecycleDetails?: string[];
}) {
  const badgeClasses = {
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    neutral: "bg-muted text-muted-foreground border-border",
  }[badgeColor];

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full space-y-4">
        <div className="flex justify-center">{icon}</div>
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${badgeClasses}`}>
          {badgeText}
        </span>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>

        {lifecycleDetails && lifecycleDetails.length > 0 && (
          <div className="text-left p-3.5 rounded-xl bg-muted/40 border border-border/60 text-xs space-y-1.5">
            <p className="font-semibold text-foreground text-[11px] uppercase tracking-wider">
              Lifecycle Breakdown
            </p>
            <ul className="space-y-1 text-muted-foreground text-[11px]">
              {lifecycleDetails.map((detail, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-blue-500 shrink-0">•</span>
                  <span>{detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Upload a File
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-muted/70 hover:bg-muted text-foreground text-xs font-semibold transition-colors cursor-pointer"
          >
            Return to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
