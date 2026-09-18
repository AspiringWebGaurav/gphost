# GPHosting (gphost)

<div align="center">

![GPHosting Banner](https://img.shields.io/badge/GPHosting-Ephemeral%20Direct--Transit%20Cloud-3b82f6?style=for-the-badge&logo=icloud&logoColor=white)

**A high-throughput, privacy-first ephemeral file transit and raw CDN hosting platform built with Next.js 16 (Turbopack), Cloudflare R2, Supabase, and Upstash Redis.**

[![Node.js](https://img.shields.io/badge/Node.js-24.x_LTS-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.3.5-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.8-blue?style=flat-square&logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-purple?style=flat-square)](public/manifest.webmanifest)
[![Status](https://img.shields.io/badge/Release-v3.0_Production-emerald?style=flat-square)]()
[![Effective Date](https://img.shields.io/badge/Effective-September_18%2C_2026-indigo?style=flat-square)]()
[![License](https://img.shields.io/badge/License-Source--Available-amber.svg?style=flat-square)](LICENSE)

[Live Platform](https://gphost.eu.cc) • [Core Capabilities](#-core-capabilities) • [System Architecture](#-system-architecture) • [Developer API](#-developer-api--terminal-uploads) • [Getting Started](#-getting-started) • [Legal & Governance](#-legal-terms--governance)

</div>

---

## ⚡ Core Capabilities

- 🚀 **Direct Browser-to-Storage Transfers**:
  - High-throughput direct uploads straight to Cloudflare R2 global storage via presigned AWS S3-compatible leases.
  - Multi-part chunked streaming supporting files up to **1 GB** with **zero server bandwidth or CPU memory saturation**.
  - Non-blocking client upload coordinator with live progress indicators, SHA-256 integrity verification, and automatic network retries.

- 🔐 **Zero-Knowledge Client-Side Encryption**:
  - AES-GCM 256 hardware-accelerated encryption executed strictly inside the user's browser using the native Web Crypto API before bytes leave the device.
  - Symmetric decryption key resides **strictly in the URL hash fragment** (`#key=...`). Under RFC 3986, browsers never transmit hash fragments over HTTP, ensuring GPHosting servers have zero knowledge of keys.
  - Optional PBKDF2 / Argon2id cryptographic password protection.

- ⏱️ **Smart Ephemeral Lifecycle & Autonomous Destruction**:
  - **Burn on Preview**: First viewing opens an automated 60-second destruction window; once expired, the file and share links are permanently purged.
  - **Single-Use Claim**: Objects are irrevocably deleted from Cloudflare R2 immediately upon first completed download stream.
  - **Download Ceilings**: Set explicit download counters (e.g., 5 or 25 claims) triggering automated lifecycle purging upon reaching limits.
  - **Configurable TTL**: Flexible policies (`1h`, `24h`, `7d`, `30d`, `90d`, or permanent for authorized users) continuously swept by native Supabase triggers.

- 🌐 **Direct Raw & CDN Asset Hosting (`/raw/[slug]`)**:
  - Direct HTTP 307 temporary redirects to Cloudflare global edge storage with standard 1-hour CDN caching (`Cache-Control: public, max-age=3600`).
  - Tailored for open-source GitHub README images, developer portfolio media, and static markdown documentation embeds.

- 🔗 **Adaptive Link Sharing & XURL Engine**:
  - Dynamic origin resolution: automatically serves local share routes (`http://localhost:3000/f/...`) during local testing and production routes (`https://gphost.eu.cc/f/...`) when deployed.
  - Integrated `xurl.eu.cc` shortlink generation engine with automated circuit-broken fallbacks.

- 💻 **Developer REST API & Headless Automation**:
  - Programmatic upload route at `/api/v1/upload` with Bearer token authentication (`gp_live_...`).
  - One-click API key management console with instant generation, SHA-256 hashed database storage, and copyable `curl` recipes.

- 🛡️ **Defense-in-Depth Security & Rate Limiting**:
  - Sliding-window rate limiters powered by Upstash Redis with fail-open circuit breakers.
  - Cloudflare Turnstile privacy-first bot mitigation (zero tracking cookies or behavioral profiling).
  - Invite PIN-gated registration access (`onboarding_pins`) and administrator approval queue.
  - Strict Content-Security-Policy (CSP) headers and sandboxed attachment downloads.

- 📱 **Full 360° Branding & Progressive Web App (PWA)**:
  - Vector geometric vault identity emblem across all touchpoints.
  - Complete multi-resolution favicon suite, high-DPI Apple Touch Icons, and Android maskable icons.
  - Installable PWA manifest with standalone display configuration and automated OpenGraph social cards.

- 🎛️ **Storage Admission Coordinator**:
  - Real-time quota reservation preventing concurrent over-allocation.
  - Default 5 GB capacity with administrator overrides and instant release upon file expiration.

---

## 🏗️ System Architecture

```mermaid
graph TD
    Client[Browser / Client Device] -->|1. Request Presigned Lease| NextAPI[Next.js API Routes]
    NextAPI -->|2. Check Quota & Rate Limit| Redis[(Upstash Redis Cache)]
    NextAPI -->|3. Verify Permissions & Reserve Quota| DB[(Supabase PostgreSQL)]
    NextAPI -->|4. Issue Presigned S3 Lease| StorageSDK[Cloudflare R2 SDK]
    NextAPI -->|5. Return Upload Token & Part URLs| Client
    Client -->|6. Direct Multipart Stream (Zero Proxy)| R2Bucket[(Cloudflare R2 Storage)]
    Client -->|7. Seal & Activate Share Record| NextAPI
    NextAPI -->|8. Commit Record & Update Quota| DB
    NextAPI -.->|Async Sweeper / DB Triggers| Purge[Irreversible Object Purge]
```

---

## 🛠️ Tech Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Runtime** | [Node.js 24.x LTS](https://nodejs.org/) | Contemporary Active LTS runtime matching Vercel production engines |
| **Framework** | [Next.js 16.3.5](https://nextjs.org/) | App Router, Turbopack, dynamic & static route optimization |
| **Frontend** | [React 19.2.8](https://react.dev/) | Modern concurrent UI with React Server Components |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) | PostCSS engine, dark/light theme tokens, fluid responsive layout |
| **Database & Auth** | [Supabase](https://supabase.com/) | PostgreSQL with Row Level Security (RLS), Google OAuth (PKCE) |
| **Object Storage** | [Cloudflare R2](https://developers.cloudflare.com/r2/) | S3-compatible zero-egress bucket with global edge distribution |
| **Cache & Limiting** | [Upstash Redis](https://upstash.com/) | Serverless sliding-window rate limiters with fail-open circuit breakers |
| **Bot Mitigation** | [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) | Privacy-preserving browser verification |
| **Shortlinks** | [XURL Client](https://xurl.eu.cc) | Compact URL shortening service with edge fallback |
| **Hosting** | [Vercel](https://vercel.com/) | Edge & Serverless functions (100% Hobby & Pro plan compatible) |

---

## 💻 Developer API & Terminal Uploads

Approved users can generate a Developer API Key in the dashboard and upload files headlessly:

```bash
# Upload a file via terminal using your Developer API Key
curl -X POST "https://gphost.eu.cc/api/v1/upload" \
  -H "Authorization: Bearer gp_live_YOUR_KEY_HERE" \
  -F "file=@screenshot.png"
```

**JSON Response:**
```json
{
  "success": true,
  "file": {
    "id": "c1f7a28e-...",
    "name": "screenshot.png",
    "size": 154820,
    "shareUrl": "https://gphost.eu.cc/f/abc12345",
    "rawUrl": "https://gphost.eu.cc/raw/abc12345",
    "expiresAt": "2026-09-25T12:00:00.000Z"
  }
}
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js 24.x LTS** (`node -v` should report `v24.x.x`)
- Package manager: `npm`, `pnpm`, or `bun`
- A Cloudflare account with an R2 bucket (`gphosting-files`)
- A Supabase project with PostgreSQL & Auth
- An Upstash Redis instance (for production rate limiting)

### 1. Clone the repository
```bash
git clone https://github.com/AspiringWebGaurav/gphost.git
cd gphost
```

### 2. Install dependencies
```bash
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env.local` and populate your credentials:
```bash
cp .env.example .env.local
```
*(Refer to [`.env.example`](.env.example) for documented environment variables).*

### 4. Database Schema
Execute the migration scripts located in `supabase/migrations/` inside your Supabase SQL Editor to establish tables, triggers, and Row Level Security policies.

### 5. Launch Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📜 Available Scripts

| Command | Action |
| :--- | :--- |
| `npm run dev` | Starts the Next.js Turbopack development server |
| `npm run build` | Compiles an optimized production build |
| `npm run start` | Runs the compiled production server |
| `npm run lint` | Checks codebase against ESLint rules |
| `npm run typecheck` | Validates TypeScript types across the project (`tsc --noEmit`) |
| `npm run test:e2e` | Executes Playwright end-to-end browser test suites |
| `npm run benchmark` | Benchmarks API latency, presigned lease negotiation, and throughput |
| `npm run test:cors` | Verifies Cloudflare R2 CORS headers and S3 presigned URL permissions |
| `npm run clean` | Cleans Next.js build caches and temporary compile artifacts |
| `npm run total-clean` | Deep clean including `node_modules` and lockfiles |

---

## ⚖️ Legal Terms & Governance

- **Original Inception Date**: September 14, 2026 (v1.0.0)
- **Last Revised & Effective**: September 18, 2026 (v3.0.0 Production Hardened)
- **Terms of Service**: [app/terms/page.tsx](app/terms/page.tsx) ([https://gphost.eu.cc/terms](https://gphost.eu.cc/terms))
- **Privacy Policy**: [app/privacy/page.tsx](app/privacy/page.tsx) ([https://gphost.eu.cc/privacy](https://gphost.eu.cc/privacy))
- **Source-Available License**: Review [LICENSE](LICENSE) for research, audit, and educational permissions. Commercial re-hosting or SaaS exploitation without permission is strictly prohibited.

---

<div align="center">
  <sub>&copy; 2026 GPHosting. Ephemeral, Direct-Transit &amp; Zero-Knowledge.</sub>
</div>
