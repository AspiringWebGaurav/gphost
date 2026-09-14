import type { Metadata } from "next";
import { headers } from "next/headers";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://gphost.eu.cc"),
  title: "GPHosting — Fast, Simple & Private File Sharing",
  description: "Share files simply and securely. Direct uploads, password protection, and self-destructing links.",
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
        {switchyyProjectId && switchyyPublicKey && (
          <Script
            src="https://switchyy.eu.cc/switchy.js"
            data-project-id={switchyyProjectId}
            data-public-key={switchyyPublicKey}
            strategy="beforeInteractive"
            nonce={nonce}
          />
        )}
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground selection:bg-blue-500/20 selection:text-blue-500">
        <ThemeProvider defaultTheme="light" storageKey="gphost-theme">
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
