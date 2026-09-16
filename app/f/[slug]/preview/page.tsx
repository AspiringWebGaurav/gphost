import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPreviewType } from "@/lib/storage/share";
import { createPresignedPreviewUrl } from "@/lib/storage/r2";
import { getUnlockCookieName, verifyUnlockToken } from "@/lib/security/unlock-token";
import { FilePreviewViewer } from "@/components/share/file-preview-viewer";
import Link from "next/link";
import { AlertCircle, Lock, ArrowLeft, Clock, Ban } from "lucide-react";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!slug) {
    return {
      title: "File Preview — GPHosting",
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
  const filename = file?.sanitized_name || "File";

  return {
    title: `Preview ${filename} — GPHosting`,
    description: `Interactive in-browser preview for ${filename}`,
    robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  };
}

export default async function PublicPreviewPage({ params }: PageProps) {
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
        expires_at
      )
    `)
    .eq("slug", slug)
    .single();

  if (!share || !share.file) {
    notFound();
  }

  const file = Array.isArray(share.file) ? share.file[0] : share.file;
  if (!file) {
    notFound();
  }

  // Check Expiration
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const isShareExpired = share.expires_at && new Date(share.expires_at).getTime() <= now;
  const isFileExpired = file.expires_at && new Date(file.expires_at).getTime() <= now;
  if (isShareExpired || isFileExpired) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full p-6 rounded-3xl border border-border bg-card text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Link Expired</h1>
          <p className="text-xs text-muted-foreground">
            This share link has expired and its preview is no longer accessible.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-foreground text-background text-xs font-semibold hover:opacity-90 transition"
          >
            Go to GPHosting
          </Link>
        </div>
      </div>
    );
  }

  // Check Download Limit
  if (share.max_downloads !== null && share.download_count >= share.max_downloads) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full p-6 rounded-3xl border border-border bg-card text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
            <Ban className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Download Limit Reached</h1>
          <p className="text-xs text-muted-foreground">
            This share link has reached its maximum download limit.
          </p>
        </div>
      </div>
    );
  }

  // Check Active Status
  if (!share.is_active || file.status !== "ACTIVE") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full p-6 rounded-3xl border border-border bg-card text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">File Unavailable</h1>
          <p className="text-xs text-muted-foreground">
            This share link has been revoked or the file is no longer active.
          </p>
        </div>
      </div>
    );
  }

  // Check Preview Type
  const previewType = getPreviewType(file.mime_type, file.sanitized_name);
  if (!previewType) {
    // If not previewable, redirect to download page
    redirect(`/f/${slug}`);
  }

  // Check Password Protection
  if (share.password_hash) {
    const cookieStore = await cookies();
    const cookieName = getUnlockCookieName(slug);
    const unlockCookie = cookieStore.get(cookieName)?.value;

    const isUnlocked = unlockCookie ? verifyUnlockToken(unlockCookie, slug, file.id) : false;

    if (!isUnlocked) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full p-6 rounded-3xl border border-border bg-card text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">Password Protected</h1>
            <p className="text-xs text-muted-foreground">
              Please unlock this file on the main share page before previewing.
            </p>
            <div className="pt-2">
              <Link
                href={`/f/${slug}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition shadow-md shadow-blue-600/20"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Go to Unlock Page</span>
              </Link>
            </div>
          </div>
        </div>
      );
    }
  }

  // Generate Presigned Preview URL (10 min expiration, inline disposition)
  const previewUrl = await createPresignedPreviewUrl(
    file.r2_key,
    file.sanitized_name,
    600,
    file.mime_type
  );

  return (
    <FilePreviewViewer
      slug={slug}
      filename={file.sanitized_name}
      byteSize={file.byte_size}
      mimeType={file.mime_type}
      previewType={previewType}
      previewUrl={previewUrl}
      expiresAt={share.expires_at || file.expires_at}
      isSingleUse={Boolean(share.is_single_use)}
    />
  );
}
