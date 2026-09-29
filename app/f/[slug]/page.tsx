import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPublicShareMetadata, getPreviewType } from "@/lib/storage/share";
import { createPresignedPreviewUrl } from "@/lib/storage/r2";
import { DownloadCard } from "@/components/share/download-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandLogo } from "@/components/ui/brand-logo";
import { AlertCircle, Clock, Ban, Flame } from "lucide-react";
import { redis } from "@/lib/redis/client";
import { formatTimeElapsedSinceExpiry, formatExpiryTimestamp } from "@/lib/storage/expiry";

import { cache } from "react";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

interface PublicFileRecord {
  id: string;
  sanitized_name: string;
  r2_key: string;
  byte_size: number;
  mime_type: string;
  status: string;
  expires_at: string | null;
  is_password_protected?: boolean;
}

interface PublicShareRecord {
  id: string;
  slug: string;
  is_active: boolean;
  is_single_use: boolean;
  one_per_member?: boolean;
  burn_after_preview?: boolean;
  first_previewed_at?: string | null;
  preview_count?: number | null;
  direct_download?: boolean;
  disable_preview?: boolean;
  recipient_note?: string | null;
  password_hint?: string | null;
  expires_at: string | null;
  max_downloads: number | null;
  download_count: number;
  password_hash?: string | null;
  file: PublicFileRecord | PublicFileRecord[] | null;
}

/**
 * Cached public share link resolver:
 * Deduplicates queries across generateMetadata and PublicSharePage within the same render pass,
 * halving Supabase database overhead on every public file link visit.
 */
const getPublicShare = cache(async (slug: string): Promise<PublicShareRecord | null> => {
  const adminClient = createAdminClient();

  const { data: shareWithBurn, error: shareErr } = await adminClient
    .from("share_links")
    .select(`
      id,
      slug,
      is_active,
      is_single_use,
      one_per_member,
      burn_after_preview,
      first_previewed_at,
      preview_count,
      direct_download,
      disable_preview,
      recipient_note,
      password_hint,
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

  let share: PublicShareRecord | null = null;

  if (
    shareErr &&
    (shareErr.code === "PGRST204" ||
      shareErr.code === "42703" ||
      shareErr.message?.includes("one_per_member") ||
      shareErr.message?.includes("burn_after_preview") ||
      shareErr.message?.includes("direct_download") ||
      shareErr.message?.includes("disable_preview") ||
      shareErr.message?.includes("recipient_note") ||
      shareErr.message?.includes("password_hint"))
  ) {
    const { data: fallbackShare } = await adminClient
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

    share = fallbackShare
      ? {
          ...fallbackShare,
          one_per_member: false,
          burn_after_preview: false,
          first_previewed_at: null,
          preview_count: 0,
          direct_download: false,
          disable_preview: false,
          recipient_note: null,
          password_hint: null,
        }
      : null;
  } else if (shareWithBurn) {
    share = {
      ...shareWithBurn,
      one_per_member: Boolean(shareWithBurn.one_per_member === true),
      burn_after_preview: Boolean(shareWithBurn.burn_after_preview === true),
      direct_download: Boolean(shareWithBurn.direct_download === true),
      disable_preview: Boolean(shareWithBurn.disable_preview === true),
      recipient_note: shareWithBurn.recipient_note || null,
      password_hint: shareWithBurn.password_hint || null,
    };
  }

  // If enhancements are in Redis, check Redis for cached values (including one_per_member)
  if (share) {
    try {
      const cached = await redis.get<{
        one_per_member?: boolean;
        burn_after_preview?: boolean;
        direct_download?: boolean;
        disable_preview?: boolean;
        recipient_note?: string | null;
        password_hint?: string | null;
      }>(`share_enhancements:${slug}`);
      if (cached) {
        if (typeof cached.one_per_member === "boolean") share.one_per_member = cached.one_per_member;
        if (typeof cached.burn_after_preview === "boolean") share.burn_after_preview = cached.burn_after_preview;
        if (typeof cached.direct_download === "boolean") share.direct_download = cached.direct_download;
        if (typeof cached.disable_preview === "boolean") share.disable_preview = cached.disable_preview;
        if (cached.recipient_note !== undefined) share.recipient_note = cached.recipient_note;
        if (cached.password_hint !== undefined) share.password_hint = cached.password_hint;
      }
    } catch {
      // Non-blocking Redis fallback
    }
  }

  return share;
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!slug) {
    return {
      title: "Download File — GPHosting",
      robots: { index: false, follow: false, noarchive: true, nosnippet: true },
    };
  }

  const share = await getPublicShare(slug);
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

  const share = await getPublicShare(slug);

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
  const shareExpTime = share.expires_at ? new Date(share.expires_at).getTime() : Infinity;
  const fileExpTime = file.expires_at ? new Date(file.expires_at).getTime() : Infinity;
  const earliestExpTime = Math.min(shareExpTime, fileExpTime);
  const isExpired = (earliestExpTime !== Infinity && earliestExpTime <= now) || file.status === "EXPIRED";

  if (isExpired) {
    const expiryIso = earliestExpTime !== Infinity
      ? new Date(earliestExpTime).toISOString()
      : (share.expires_at || file.expires_at || new Date(now).toISOString());
    const elapsedAgo = formatTimeElapsedSinceExpiry(expiryIso, now);
    const formattedUtc = formatExpiryTimestamp(expiryIso);

    return (
      <PublicShareLayout>
        <StatusCard
          icon={<Clock className="w-12 h-12 text-amber-500" />}
          title={`Link Expired (${elapsedAgo})`}
          description={`This link expired ${elapsedAgo} at ${formattedUtc}. To protect privacy, the file has been safely and permanently deleted.`}
          badgeText={`Expired ${elapsedAgo}`}
          badgeColor="amber"
          lifecycleDetails={[
            `Expired at: ${formattedUtc}`,
            "The sharing time limit has finished",
            "File permanently deleted from servers",
            "No copies or backups saved",
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
          title={isSingleUseBurn ? "1-Time Link Used" : "Download Limit Reached"}
          description={
            isSingleUseBurn
              ? "This 1-time file has already been downloaded. To protect privacy, the file and link were deleted immediately after downloading."
              : `This link has reached its maximum limit of ${share.max_downloads} downloads and is now permanently closed.`
          }
          badgeText={isSingleUseBurn ? "1-Time Download Used" : "Download Limit Reached"}
          badgeColor="rose"
          lifecycleDetails={
            isSingleUseBurn
              ? [
                  "File was downloaded once",
                  "Link and file were permanently deleted",
                  "No copies or backups saved",
                ]
              : [
                  `Limit reached: ${share.download_count} of ${share.max_downloads} downloads used`,
                  "Link permanently closed",
                  "File deleted from servers",
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
          title="Link Unavailable"
          description="This link has been turned off by the person who sent it, or the file is no longer available."
          badgeText="Disabled by Sender"
          badgeColor="neutral"
          lifecycleDetails={[
            "The sender turned off this link",
            "Download link disabled",
            "File is no longer accessible",
          ]}
        />
      </PublicShareLayout>
    );
  }

  const publicMetadata = formatPublicShareMetadata(file, share);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

  // Direct Download Mode: If direct download is enabled and not password protected, 302-redirect immediately to /raw/[slug]
  if (share.direct_download && !share.password_hash) {
    redirect(`/raw/${slug}`);
  }

  // Generate initial preview URL if file is an image or PDF, preview is not disabled, and not password protected
  const previewType = share.disable_preview ? null : getPreviewType(file.mime_type, file.sanitized_name);
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
        isSingleUse={Boolean(share.is_single_use === true)}
        onePerMember={Boolean(share.one_per_member === true)}
        siteKey={siteKey}
        initialPreviewUrl={initialPreviewUrl}
        initialPreviewType={previewType}
        directDownload={Boolean(share.direct_download === true)}
        disablePreview={Boolean(share.disable_preview === true)}
        recipientNote={share.recipient_note || null}
        passwordHint={share.password_hint || null}
      />
    </PublicShareLayout>
  );
}

function PublicShareLayout({ children }: { children: React.ReactNode }) {
  const currentYear = new Date().getFullYear();

  return (
    <div className="h-dvh max-h-dvh w-full max-w-full bg-background text-foreground flex flex-col antialiased selection:bg-blue-500/20 selection:text-blue-500 relative overflow-hidden">
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
      <header className="h-11 sm:h-14 w-full px-3.5 sm:px-8 flex items-center justify-between border-b border-border/40 shrink-0 z-30">
        <BrandLogo size="sm" />

        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </header>

      {/* Main Edge-to-Edge Viewport Content - Strict One-View, Zero Vertical Scroll */}
      <main className="flex-1 w-full flex flex-col overflow-hidden relative z-10 min-h-0">
        {children}
      </main>

      {/* Unified Centralized Bottom Footer */}
      <footer className="h-8 sm:h-10 w-full px-3 sm:px-6 border-t border-border/40 flex items-center justify-center gap-2 sm:gap-5 text-[10px] sm:text-xs text-muted-foreground shrink-0 z-20 whitespace-nowrap">
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
    <div className="h-full w-full flex flex-col items-center justify-center p-4 sm:p-6 text-center overflow-hidden">
      <div className="max-w-md w-full space-y-2.5 sm:space-y-4 my-auto">
        <div className="flex justify-center scale-90 sm:scale-100">{icon}</div>
        <span className={`inline-block px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[11px] sm:text-xs font-semibold border ${badgeClasses}`}>
          {badgeText}
        </span>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight leading-tight">{title}</h1>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-3 sm:line-clamp-none">{description}</p>

        {lifecycleDetails && lifecycleDetails.length > 0 && (
          <div className="text-left p-2.5 sm:p-3.5 rounded-xl bg-muted/40 border border-border/60 text-xs space-y-1">
            <p className="font-semibold text-foreground text-[10px] sm:text-[11px] uppercase tracking-wider">
              What Happened
            </p>
            <ul className="space-y-0.5 sm:space-y-1 text-muted-foreground text-[10px] sm:text-[11px]">
              {lifecycleDetails.slice(0, 3).map((detail, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-blue-500 shrink-0">•</span>
                  <span className="truncate sm:whitespace-normal">{detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-1 sm:pt-2 flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Upload a File
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-muted/70 hover:bg-muted text-foreground text-xs font-semibold transition-colors cursor-pointer"
          >
            Return to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
