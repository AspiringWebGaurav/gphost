import { ImageResponse } from "next/og";

export const alt = "GPHosting — Fast, Simple & Private File Sharing";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#070a12",
          backgroundImage:
            "radial-gradient(circle at 50% 18%, rgba(99, 102, 241, 0.28) 0%, transparent 60%), radial-gradient(circle at 85% 85%, rgba(6, 182, 212, 0.16) 0%, transparent 50%)",
          color: "white",
          fontFamily: "sans-serif",
          padding: "40px 60px",
        }}
      >
        {/* Brand Icon */}
        <div
          style={{
            width: 112,
            height: 112,
            borderRadius: 30,
            background: "linear-gradient(135deg, #2563eb 0%, #6366f1 50%, #06b6d4 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 20px 50px rgba(37, 99, 235, 0.5)",
            marginBottom: 28,
          }}
        >
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 68,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            marginBottom: 16,
            background: "linear-gradient(180deg, #ffffff 0%, #cbd5e1 100%)",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          GPHosting
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 28,
            color: "#94a3b8",
            textAlign: "center",
            maxWidth: 780,
            lineHeight: 1.4,
            marginBottom: 44,
          }}
        >
          Fast, Simple &amp; Private Ephemeral File Sharing
        </div>

        {/* Feature Badges */}
        <div style={{ display: "flex", gap: 16 }}>
          {[
            "Direct Cloudflare R2",
            "Argon2id Vaults",
            "Self-Destructing Links",
            "Zero-Knowledge",
          ].map((feature) => (
            <div
              key={feature}
              style={{
                fontSize: 16,
                fontWeight: 600,
                padding: "10px 24px",
                borderRadius: 9999,
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.14)",
                color: "#f1f5f9",
              }}
            >
              {feature}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
