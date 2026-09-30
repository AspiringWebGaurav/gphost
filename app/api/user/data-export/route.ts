import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { dataExportRatelimit } from "@/lib/redis/ratelimit";
import {
  ExportDataPayload,
  formatBytes,
  generateGdprHtmlReport,
  generateGdprReadmeText,
} from "@/lib/gdpr/export-report";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // 1. Authorize User
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Strict Rate Limiting (5 requests per hour)
  const rateLimitResult = await dataExportRatelimit.limit(`export:${user.id}`);
  if (!rateLimitResult.success) {
    const retrySec = Math.max(1, Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
    return NextResponse.json(
      {
        error: `Rate limit exceeded. GDPR data exports are limited to 5 requests per hour. Please wait ${retrySec}s before exporting again.`,
        retryAfterSeconds: retrySec,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retrySec),
          "X-RateLimit-Limit": String(rateLimitResult.limit),
          "X-RateLimit-Remaining": String(rateLimitResult.remaining),
          "X-RateLimit-Reset": String(rateLimitResult.reset),
        },
      }
    );
  }

  const adminClient = createAdminClient();

  // 3. Fetch User Profile
  const { data: profile } = await adminClient
    .from("profiles")
    .select(
      "id, email, full_name, avatar_url, role, status, quota_bytes, storage_used_bytes, reserved_bytes, can_create_permanent, created_at, updated_at"
    )
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // 4. Fetch All User Files (Byte-accurate inventory)
  const { data: files } = await adminClient
    .from("files")
    .select(
      "id, filename, sanitized_name, byte_size, mime_type, status, expiry_preset, expires_at, created_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const safeFiles = files || [];
  const fileIds = safeFiles.map((f) => f.id);

  // Calculate Storage Footprint & Categorized Breakdown
  let activeBytes = 0;
  let activeCount = 0;
  let expiredBytes = 0;
  let expiredCount = 0;
  let totalUploadedBytes = 0;

  const categories = {
    imagesBytes: 0,
    videosBytes: 0,
    audioBytes: 0,
    documentsBytes: 0,
    archivesAndCodeBytes: 0,
    otherBytes: 0,
  };

  for (const f of safeFiles) {
    const b = f.byte_size || 0;
    totalUploadedBytes += b;

    if (f.status === "ACTIVE" || f.status === "EXPIRING") {
      activeBytes += b;
      activeCount++;
    } else {
      expiredBytes += b;
      expiredCount++;
    }

    const mime = (f.mime_type || "").toLowerCase();
    if (mime.startsWith("image/")) {
      categories.imagesBytes += b;
    } else if (mime.startsWith("video/")) {
      categories.videosBytes += b;
    } else if (mime.startsWith("audio/")) {
      categories.audioBytes += b;
    } else if (
      mime.includes("pdf") ||
      mime.startsWith("text/") ||
      mime.includes("document") ||
      mime.includes("word") ||
      mime.includes("sheet") ||
      mime.includes("presentation")
    ) {
      categories.documentsBytes += b;
    } else if (
      mime.includes("zip") ||
      mime.includes("tar") ||
      mime.includes("gzip") ||
      mime.includes("json") ||
      mime.includes("javascript") ||
      mime.includes("html")
    ) {
      categories.archivesAndCodeBytes += b;
    } else {
      categories.otherBytes += b;
    }
  }

  const quota = profile.quota_bytes || 0;
  const used = profile.storage_used_bytes || activeBytes;
  const quotaPercent = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;

  // 5. Fetch Share Links Associated with User's Files
  let shareLinks: Array<{
    id: string;
    file_id: string;
    slug: string;
    is_active: boolean;
    expires_at: string | null;
    max_downloads: number | null;
    download_count: number;
    is_password_protected: boolean;
    is_single_use: boolean;
    one_per_member: boolean;
    burn_after_preview: boolean;
    direct_download: boolean;
    recipient_note: string | null;
    created_at: string;
  }> = [];

  if (fileIds.length > 0) {
    const { data: shares } = await adminClient
      .from("share_links")
      .select(
        "id, file_id, slug, is_active, expires_at, max_downloads, download_count, is_password_protected, is_single_use, one_per_member, burn_after_preview, direct_download, recipient_note, created_at"
      )
      .in("file_id", fileIds)
      .order("created_at", { ascending: false });

    shareLinks = shares || [];
  }

  // 6. Fetch Telemetry & Download Activity (90-Day Rolling Window)
  let downloadActivity: Array<{
    id: string;
    file_id: string;
    share_link_id: string | null;
    event_type: string;
    country_code: string | null;
    city: string | null;
    referrer: string | null;
    created_at: string;
  }> = [];

  if (fileIds.length > 0) {
    const { data: events } = await adminClient
      .from("file_events")
      .select("id, file_id, share_link_id, event_type, country_code, city, referrer, created_at")
      .in("file_id", fileIds)
      .order("created_at", { ascending: false })
      .limit(100);

    downloadActivity = events || [];
  }

  // 7. Fetch User Audit Activity Trail
  const { data: rawAuditLogs } = await adminClient
    .from("audit_logs")
    .select("id, action, details, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  // 8. Fetch Developer API Keys
  const { data: rawApiKeys } = await adminClient
    .from("user_api_keys")
    .select("id, name, key_prefix, is_active, last_used_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // 9. Construct GDPR Portability Payload
  const payload: ExportDataPayload = {
    exportMetadata: {
      generatedAt: new Date().toISOString(),
      legalBasis: "GDPR Article 15 (Right of Access) & Article 20 (Right to Data Portability)",
      version: "3.2.0-GDPR",
      userId: user.id,
      userEmail: profile.email,
    },
    accountProfile: {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      avatarUrl: profile.avatar_url,
      role: profile.role,
      status: profile.status,
      quotaBytes: profile.quota_bytes,
      storageUsedBytes: used,
      reservedBytes: profile.reserved_bytes || 0,
      canCreatePermanent: profile.can_create_permanent || false,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    },
    lifecyclePolicies: {
      ephemeralFilesRetention:
        "Standard files are automatically scheduled for permanent physical destruction upon reaching their configured TTL (1 hour to 90 days). Once expired, R2 objects are purged, database records transition to PURGED, and user quota is restored immediately.",
      singleUseFilesRetention:
        "Single-use delivery links are destroyed immediately after their one-time download lease (50 seconds) expires. Both the physical file and link records are wiped.",
      telemetryAndDownloadLogsRetention:
        "Telemetry and download activity logs are strictly retained on a 90-day rolling retention cycle. Records older than 90 days are purged automatically by the background lifecycle sweeper.",
      auditLogsRetention:
        "Security audit logs and access event records are retained on a rolling 90-day lifecycle for security compliance and transparency, after which they are purged.",
      erasurePolicy:
        "Under GDPR Article 17 (Right to Erasure), requesting account termination physically wipes all stored files from Cloudflare R2, all share links, all API keys, all logs, and your profile data with zero unpurged ghost artifacts.",
    },
    storageFootprint: {
      totalUsedBytes: used,
      quotaBytes: quota,
      quotaPercent,
      activeFilesCount: activeCount,
      activeFilesBytes: activeBytes,
      expiredFilesCount: expiredCount,
      expiredFilesBytes: expiredBytes,
      lifetimeFilesCount: safeFiles.length,
      lifetimeFilesBytes: totalUploadedBytes,
      byCategory: categories,
    },
    files: safeFiles.map((f) => ({
      id: f.id,
      filename: f.filename,
      sanitizedName: f.sanitized_name,
      byteSize: f.byte_size || 0,
      formattedSize: formatBytes(f.byte_size || 0),
      mimeType: f.mime_type || "application/octet-stream",
      status: f.status,
      expiryPreset: f.expiry_preset,
      expiresAt: f.expires_at,
      createdAt: f.created_at,
    })),
    shareLinks: shareLinks.map((l) => ({
      id: l.id,
      fileId: l.file_id,
      slug: l.slug,
      isActive: l.is_active,
      expiresAt: l.expires_at,
      maxDownloads: l.max_downloads,
      downloadCount: l.download_count,
      isPasswordProtected: l.is_password_protected,
      isSingleUse: l.is_single_use,
      onePerMember: l.one_per_member,
      burnAfterPreview: l.burn_after_preview,
      directDownload: l.direct_download,
      recipientNote: l.recipient_note,
      createdAt: l.created_at,
    })),
    downloadActivity: downloadActivity.map((ev) => ({
      id: ev.id,
      fileId: ev.file_id,
      shareLinkId: ev.share_link_id,
      eventType: ev.event_type,
      countryCode: ev.country_code,
      city: ev.city,
      referrer: ev.referrer,
      createdAt: ev.created_at,
    })),
    auditLogs: (rawAuditLogs || []).map((a) => ({
      id: a.id,
      action: a.action,
      details: a.details,
      createdAt: a.created_at,
    })),
    apiKeys: (rawApiKeys || []).map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.key_prefix,
      isActive: k.is_active,
      lastUsedAt: k.last_used_at,
      createdAt: k.created_at,
    })),
  };

  // 10. Compute Authoritative SHA-256 Checksum for Scrutiny and Integrity Verification
  const canonicalPayload = JSON.stringify({
    exportMetadata: payload.exportMetadata,
    accountProfile: payload.accountProfile,
    lifecyclePolicies: payload.lifecyclePolicies,
    storageFootprint: payload.storageFootprint,
    files: payload.files,
    shareLinks: payload.shareLinks,
    downloadActivity: payload.downloadActivity,
    auditLogs: payload.auditLogs,
    apiKeys: payload.apiKeys,
  });
  const sha256Checksum = crypto.createHash("sha256").update(canonicalPayload).digest("hex");

  payload.integrity = {
    algorithm: "SHA-256",
    sha256Hash: sha256Checksum,
    verifiedAt: new Date().toISOString(),
    architect: "Gaurav",
    portfolioUrl: "https://gauravpatil.site",
    serviceUrl: "https://gphost.eu.cc",
    license: "GDPR Article 20 - Personal Data Portability & Unrestricted Ownership",
  };

  // 11. Record an Audit Event for GDPR Data Export
  const format = (req.nextUrl.searchParams.get("format") || "json").toLowerCase();
  try {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null;

    await adminClient.from("audit_logs").insert({
      user_id: user.id,
      action: "gdpr_data_export",
      details: {
        format,
        file_count: safeFiles.length,
        share_count: shareLinks.length,
        sha256: sha256Checksum,
      },
      ip_address: clientIp,
    });
  } catch (auditErr) {
    console.warn("Could not log GDPR data export audit event:", auditErr);
  }

  // 12. Format Output: HTML, Plain Text License, or Raw JSON
  const dateStr = new Date().toISOString().slice(0, 10);
  const cleanEmail = profile.email.replace(/[^a-zA-Z0-9_-]/g, "_");

  // Format: Plain Text README / Manifest / License
  if (format === "txt" || format === "readme" || format === "license") {
    const readmeText = generateGdprReadmeText(payload);
    return new Response(readmeText, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="gphost-data-license-and-checksum-${cleanEmail}-${dateStr}.txt"`,
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "X-RateLimit-Limit": String(rateLimitResult.limit),
        "X-RateLimit-Remaining": String(rateLimitResult.remaining),
        "X-SHA256-Checksum": sha256Checksum,
      },
    });
  }

  // Format: Visual HTML Report
  if (format === "html") {
    const html = generateGdprHtmlReport(payload);
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="gphost-gdpr-data-export-${cleanEmail}-${dateStr}.html"`,
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "X-RateLimit-Limit": String(rateLimitResult.limit),
        "X-RateLimit-Remaining": String(rateLimitResult.remaining),
        "X-SHA256-Checksum": sha256Checksum,
      },
    });
  }

  // Format: Raw JSON with embedded integrity seal
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="gphost-gdpr-data-export-${cleanEmail}-${dateStr}.json"`,
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
      "X-RateLimit-Limit": String(rateLimitResult.limit),
      "X-RateLimit-Remaining": String(rateLimitResult.remaining),
      "X-SHA256-Checksum": sha256Checksum,
    },
  });
}
