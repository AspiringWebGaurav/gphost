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
};

export default nextConfig;
