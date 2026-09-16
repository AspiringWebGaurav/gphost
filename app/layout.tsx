import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { RouteLoader } from "@/components/ui/route-loader";
import { SwitchyyFastSync } from "@/components/switchyy-fast-sync";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#070a12" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://gphost.eu.cc"),
  title: {
    default: "GPHosting — Fast, Simple & Private File Sharing",
    template: "%s | GPHosting",
  },
  description: "Share files simply and securely. Direct encrypted uploads, password protection, and self-destructing links.",
  applicationName: "GPHosting",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/apple-touch-icon-precomposed.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      {
        rel: "mask-icon",
        url: "/safari-pinned-tab.svg",
        color: "#4f46e5",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "GPHosting",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://gphost.eu.cc",
    siteName: "GPHosting",
    title: "GPHosting — Fast, Simple & Private File Sharing",
    description: "Share files simply and securely. Direct encrypted uploads, password protection, and self-destructing links.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "GPHosting — Private File Sharing",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "GPHosting — Fast, Simple & Private File Sharing",
    description: "Share files simply and securely. Direct encrypted uploads, password protection, and self-destructing links.",
    images: ["/og-image.png"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") ?? undefined;

  const switchyyProjectId = process.env.NEXT_PUBLIC_SWITCHYY_PROJECT_ID;
  const switchyyPublicKey = process.env.NEXT_PUBLIC_SWITCHYY_PUBLIC_KEY;
  const isSwitchyyEnabled = Boolean(switchyyProjectId && switchyyPublicKey);

  // Request-scoped cache buster using dynamic CSP nonce so Switchyy's edge serves the exact live mode state on high priority
  const cacheBuster = nonce ? encodeURIComponent(nonce) : "";
  const switchyySrc = isSwitchyyEnabled
    ? `https://switchyy.eu.cc/switchy.js?key=${switchyyPublicKey}&project=${switchyyProjectId}${cacheBuster ? `&_t=${cacheBuster}` : ""}`
    : "";

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('gphost-theme');var d=s?s==='dark'||(s==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches):false;if(d){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`,
          }}
        />
        {/* Pre-clear any stale 5-minute Switchyy session cache to guarantee immediate mode reflection */}
        {isSwitchyyEnabled && switchyyProjectId && (
          <script
            nonce={nonce}
            dangerouslySetInnerHTML={{
              __html: `(function(){try{sessionStorage.removeItem('switchy_config_${switchyyProjectId}');}catch(e){}})();`,
            }}
          />
        )}
        {isSwitchyyEnabled && (
          <>
            <link
              rel="preload"
              href="https://switchyy.eu.cc/switchy_layouts/glass.js"
              as="script"
              nonce={nonce}
            />
            <Script
              src={switchyySrc}
              strategy="beforeInteractive"
              nonce={nonce}
            />
          </>
        )}
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground selection:bg-blue-500/20 selection:text-blue-500">
        <RouteLoader />
        <ThemeProvider defaultTheme="light" storageKey="gphost-theme">
          {children}
        </ThemeProvider>
        {/* Real-time high-priority Switchyy mode monitor */}
        {isSwitchyyEnabled && switchyyProjectId && switchyyPublicKey && (
          <SwitchyyFastSync
            projectId={switchyyProjectId}
            publicKey={switchyyPublicKey}
          />
        )}
      </body>
    </html>
  );
}
