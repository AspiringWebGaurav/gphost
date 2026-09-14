import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://gphost.eu.cc";

  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy", "/terms", "/developers", "/f/"],
      disallow: [
        "/admin/",
        "/(admin)/",
        "/dashboard/",
        "/(dashboard)/",
        "/api/",
        "/auth/",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
