import type { NextConfig } from "next";
import os from "os";

// Detect local network IPv4 addresses (e.g. 192.168.x.x, 10.x.x.x) for local mobile testing
const localIps: string[] = [];
try {
  const nets = os.networkInterfaces();
  for (const netList of Object.values(nets)) {
    if (!netList) continue;
    for (const net of netList) {
      if (net.family === "IPv4" && !net.internal) {
        localIps.push(net.address);
      }
    }
  }
} catch {
  // Fallback if network interfaces cannot be enumerated
}

const nextConfig: NextConfig = {
  agentRules: false,
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.0.154",
    ...localIps,
    "192.168.*.*",
    "10.*.*.*",
    "172.16.*.*",
  ],
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "*.r2.cloudflarestorage.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*\\.(ico|png|jpg|jpeg|svg|webp|woff|woff2|ttf|eot|css|js)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/:path*/opengraph-image",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
          },
        ],
      },
      {
        source: "/opengraph-image",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
          },
        ],
      },
      {
        source: "/(icon|apple-icon)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, s-maxage=31536000, immutable",
          },
        ],
      },
      {
        source: "/(manifest.webmanifest|robots.txt|sitemap.xml)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/(terms|privacy|acceptable-use|acceptance-of-use|how-it-works|developers|docs)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
