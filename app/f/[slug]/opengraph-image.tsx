import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";

export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const adminClient = createAdminClient();

  let fileName = "Shared File";
  let fileSize = "";
  let isProtected = false;
  let isSingleUse = false;
  let mimeType = "File";

  if (slug) {
    try {
      const { data } = await adminClient
        .from("share_links")
        .select(`
          is_password_protected,
          is_single_use,
          password_hash,
          file:files (
            sanitized_name,
            byte_size,
            mime_type,
            status
          )
        `)
        .eq("slug", slug)
        .maybeSingle();

      if (data) {
        isProtected = Boolean(data.is_password_protected || data.password_hash);
        isSingleUse = Boolean(data.is_single_use);
        const fileObj = (data as Record<string, unknown>).file || (data as Record<string, unknown>).files;
        const f = Array.isArray(fileObj) ? fileObj[0] : fileObj;
        if (f && typeof f === "object") {
          const rec = f as Record<string, unknown>;
          fileName = (rec.sanitized_name as string) || "Shared File";
          fileSize = formatBytes((rec.byte_size as number) || 0);
          mimeType = (rec.mime_type as string) || "File";
        }
      }
    } catch {
      // Fallback to default branding if lookup fails
    }
  }

  // Display truncated name if too long
  const displayName = fileName.length > 55 ? `${fileName.slice(0, 52)}...` : fileName;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#070a12",
          backgroundImage:
            "radial-gradient(circle at 15% 15%, rgba(37, 99, 235, 0.35) 0%, transparent 55%), radial-gradient(circle at 85% 85%, rgba(6, 182, 212, 0.22) 0%, transparent 50%), radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.15) 0%, transparent 65%)",
          color: "white",
          fontFamily: "sans-serif",
          padding: "54px 64px",
        }}
      >
        {/* Top Header: Brand & Creator Tag */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* Logo Symbol */}
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: "linear-gradient(135deg, #2563eb 0%, #6366f1 50%, #06b6d4 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 8px 24px rgba(37, 99, 235, 0.4)",
              }}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                style={{
                  fontSize: 26,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  color: "#ffffff",
                }}
              >
                GPHost
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#60a5fa",
                  letterSpacing: "0.02em",
                }}
              >
                Built by Gaurav for Developers
              </span>
            </div>
          </div>

          {/* Mode Pill */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 18px",
              borderRadius: 9999,
              background: isProtected
                ? "rgba(245, 158, 11, 0.15)"
                : isSingleUse
                ? "rgba(168, 85, 247, 0.15)"
                : "rgba(37, 99, 235, 0.15)",
              border: isProtected
                ? "1px solid rgba(245, 158, 11, 0.4)"
                : isSingleUse
                ? "1px solid rgba(168, 85, 247, 0.4)"
                : "1px solid rgba(37, 99, 235, 0.4)",
              color: isProtected ? "#fbbf24" : isSingleUse ? "#c084fc" : "#93c5fd",
              fontSize: 14,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {isProtected
              ? "🔒 Password Protected"
              : isSingleUse
              ? "⚡ Single-Use Transfer"
              : "🚀 Direct High-Speed Transfer"}
          </div>
        </div>

        {/* Center: File Card Presentation */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background: "rgba(17, 24, 39, 0.75)",
            border: "1.5px solid rgba(255, 255, 255, 0.12)",
            borderRadius: 24,
            padding: "36px 42px",
            boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.7)",
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "#94a3b8",
              marginBottom: 12,
            }}
          >
            Secure File Package
          </div>

          <div
            style={{
              fontSize: 44,
              fontWeight: 800,
              lineHeight: 1.2,
              color: "#ffffff",
              marginBottom: 20,
              wordBreak: "break-word",
            }}
          >
            {displayName}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {fileSize && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "6px 16px",
                  borderRadius: 10,
                  background: "rgba(37, 99, 235, 0.25)",
                  border: "1px solid rgba(96, 165, 250, 0.4)",
                  color: "#ffffff",
                  fontSize: 18,
                  fontWeight: 800,
                  fontFamily: "monospace",
                }}
              >
                {fileSize}
              </div>
            )}

            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "#94a3b8",
              }}
            >
              {mimeType}
            </div>
          </div>
        </div>

        {/* Bottom Bar: Trust & Feature Badges */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            paddingTop: 22,
          }}
        >
          <div style={{ display: "flex", gap: 24, fontSize: 14, color: "#cbd5e1", fontWeight: 600 }}>
            <span>⚡ High-Speed Edge CDN</span>
            <span>🔒 Direct Encrypted Upload</span>
            <span>🛡️ Zero Tracking &amp; No Ads</span>
          </div>

          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#60a5fa",
              letterSpacing: "0.02em",
            }}
          >
            gphost.eu.cc
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
      },
    }
  );
}

// Cache generated OG images at Vercel Global Edge CDN for 24 hours (zero CPU / function re-invocation)
export const revalidate = 86400;
