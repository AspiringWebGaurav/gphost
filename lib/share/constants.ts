export const RESERVED_SLUGS = new Set([
  "api",
  "f",
  "admin",
  "login",
  "auth",
  "download",
  "share",
  "settings",
  "terms",
  "privacy",
  "dashboard",
  "files",
  "upload",
  "access-gate",
  "help",
  "docs",
  "about",
  "site",
  "raw",
  "status",
  "app",
  "public",
  "static",
  "favicon",
  "robots",
  "sitemap",
]);

export interface ShareDomainConfig {
  protocol: string;
  host: string;
  path: string;
  isLocal: boolean;
  fullBaseUrl: string;
}

/**
 * Returns dynamic domain configuration for share links:
 * - If XURL is selected: xurl.eu.cc vanity shortlink
 * - If XURL is NOT selected:
 *   - Localhost environment: matches the current local origin (e.g. localhost:3000/f/)
 *   - Production / legacy environment: gphost.eu.cc/f/ (or active domain)
 */
export function getShareDomainConfig(shortenWithXurl: boolean): ShareDomainConfig {
  if (shortenWithXurl) {
    return {
      protocol: "https://",
      host: "xurl.eu.cc",
      path: "/",
      isLocal: false,
      fullBaseUrl: "https://xurl.eu.cc/",
    };
  }

  const isBrowser = typeof window !== "undefined";
  const hostname = isBrowser ? window.location.hostname : "";
  const host = isBrowser ? window.location.host : "gphost.eu.cc";
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".localhost");

  if (isLocal) {
    const protocol = isBrowser && window.location.protocol ? `${window.location.protocol}//` : "http://";
    return {
      protocol,
      host, // e.g. "localhost:3000"
      path: "/f/",
      isLocal: true,
      fullBaseUrl: `${protocol}${host}/f/`,
    };
  }

  // Legacy / production GPHost link
  return {
    protocol: "https://",
    host: "gphost.eu.cc",
    path: "/f/",
    isLocal: false,
    fullBaseUrl: "https://gphost.eu.cc/f/",
  };
}
