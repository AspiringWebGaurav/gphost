# GPHost (gphost.eu.cc)

<div align="center">

```
   ██████╗ ██████╗ ██╗  ██╗ ██████╗ ███████╗████████╗
  ██╔════╝ ██╔══██╗██║  ██║██╔═══██╗██╔════╝╚══██╔══╝
  ██║  ███╗██████╔╝███████║██║   ██║███████╗   ██║   
  ██║   ██║██╔═══╝ ██╔══██║██║   ██║╚════██║   ██║   
  ╚██████╔╝██║     ██║  ██║╚██████╔╝███████║   ██║   
   ╚═════╝ ╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚══════╝   ╚═╝   
```

### High-Throughput Direct-Transit Cloud & Ephemeral Zero-Knowledge Storage

[![Production](https://img.shields.io/badge/Status-Production%20Hardened-emerald?style=for-the-badge&logo=vercel&logoColor=white)](https://gphost.eu.cc)
[![Next.js](https://img.shields.io/badge/Next.js-16.3.5%20(Turbopack)-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.8-61dafb?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Cloudflare R2](https://img.shields.io/badge/Storage-Cloudflare%20R2%20(Zero%20Egress)-f38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/r2/)
[![Supabase](https://img.shields.io/badge/Database-Supabase%20PostgreSQL-3ecf8e?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![Upstash Redis](https://img.shields.io/badge/Rate%20Limit-Upstash%20Redis-00e9a3?style=for-the-badge&logo=redis&logoColor=white)](https://upstash.com/)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind%20CSS%20v4-38bdf8?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

[**Live Platform (gphost.eu.cc)**](https://gphost.eu.cc) • [**Architecture**](#-system-architecture) • [**Core Features**](#-core-capabilities) • [**Delivery Lifecycles**](#-ephemeral-delivery-modes) • [**Developer API**](#-developer-api--terminal-uploads) • [**Quickstart**](#-getting-started) • [**Security Model**](#-security--cryptographic-model)

</div>

---

## ⚡ Executive Overview

**GPHost** is an enterprise-engineered file transit and raw asset delivery platform. Designed around direct-to-object edge streaming and zero-knowledge client cryptographic primitives, GPHost eliminates intermediate server bottlenecks, bandwidth saturation, and plain-text exposure.

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                                   THE THREE PILLARS                                       │
├──────────────────────────┬─────────────────────────────┬──────────────────────────────────┤
│   🚀 Direct S3 Transit   │   🔐 Zero-Knowledge Crypto  │   ⏱️ Autonomous Ephemerality     │
│  Browser streams chunks  │  AES-GCM-256 via Web Crypto │  Burn-on-open (60s), single-use  │
│ directly to Cloudflare   │   keys stay in URL hash     │  claims, download caps & atomic  │
│  R2 edge. Zero proxy,    │ fragments (#key=...). Never │   PostgreSQL quota reclamation.  │
│ zero server CPU strain.  │  transmitted to the server. │  Zero persistent digital traces. │
└──────────────────────────┴─────────────────────────────┴──────────────────────────────────┘
```

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph ClientLayer["Client Layer (Browser / CLI)"]
        User["Client Device / Web Browser"]
    end

    subgraph AppGateway["Application Gateway (Next.js 16 Turbopack)"]
        API["Next.js Route Handlers & Server Actions"]
        Auth["Supabase Auth Engine (PKCE Session)"]
    end

    subgraph StorageInfra["Infrastructure & Edge Fabric"]
        Redis[("Upstash Redis (Sliding Rate Limiter)")]
        DB[("Supabase PostgreSQL (RLS & Quotas)")]
        R2[("Cloudflare R2 (S3 Global Object Store)")]
        XURL["XURL Edge Shortener (xurl.eu.cc)"]
    end

    User -->|"1. Request Presigned Upload Lease"| API
    API -->|"2. Check Sliding-Window Limits"| Redis
    API -->|"3. Atomic Quota Reservation via RPC"| DB
    API -->|"4. Issue S3 Multipart Presigned URLs"| R2
    API -->|"5. Return Part URLs & Signed Token"| User
    User -->|"6. Direct Multipart Stream (Zero Proxy)"| R2
    User -->|"7. Seal & Finalize Upload Record"| API
    API -->|"8. Commit Metadata & Activate Link"| DB
    API -.->|"Optional Custom Vanity Sync"| XURL
    DB -.->|"Autonomous Lifecycle Purge"| R2
```

---

## 💎 Core Capabilities

### 1. Zero-Proxy Direct-to-Storage Transfers
- **True Direct S3 Streaming**: Client browsers upload directly to **Cloudflare R2** edge buckets using presigned AWS S3 multi-part leases.
- **High-Throughput Chunking**: Supports multi-part parallel uploads up to **1 GB** without consuming server RAM, disk space, or ingress/egress bandwidth.
- **Resilient Upload Coordinator**: In-browser client coordinator with automatic chunk retries, SHA-256 chunk validation, and real-time speed/progress metrics.

### 2. Zero-Knowledge Client-Side Encryption
- **Native Hardware Crypto**: Client-side **AES-GCM 256-bit** encryption executed via native `window.crypto.subtle` before bytes leave memory.
- **Hash-Fragment Secrecy**: The cryptographic key resides strictly in the URL hash fragment (`#key=...`). Under **RFC 3986**, browsers never send hash fragments to the server in HTTP request headers.
- **Zero Plaintext Visibility**: The GPHost backend, database, and storage layer only ever touch ciphertext.

### 3. Smart Ephemeral Lifecycles & Autonomous Destruction
- **Burn-on-Open**: First viewing initiates an automated 60-second self-destruct sequence. Once expired, the file and all associated links are irreversibly purged.
- **Single-Use Claims**: The object is permanently wiped from Cloudflare R2 the instant the first recipient completes their download stream.
- **Configurable TTL Windows**: Retention policies ranging from `1 hour`, `24 hours`, `7 days`, `30 days`, to `90 days` (or permanent for approved accounts).
- **Atomic Quota Reclamation**: Custom PostgreSQL stored procedures automatically reclaim owner storage quota the moment a file expires or is purged.

### 4. Direct Raw CDN Asset Delivery (`/raw/[slug]`)
- **Direct Edge Redirects**: HTTP 307 temporary redirects with `Cache-Control: public, max-age=3600` directly to Cloudflare edge storage.
- **Optimized for Developers**: Seamless media embedding in GitHub READMEs, markdown documentation, portfolios, and static websites.

### 5. Adaptive Link Sharing & XURL Engine
- **Intelligent Origin Detection**: Automatically produces `http://localhost:3000/f/...` during local staging and `https://gphost.eu.cc/f/...` in production.
- **Live XURL Integration**: One-click branded vanity shortlinks via `xurl.eu.cc` with plan entitlement verification, live health probing, and custom slug claiming.

### 6. Defense-in-Depth Security
- **Sliding-Window Limiting**: Upstash Redis token bucket limiters with fail-open circuit breakers.
- **Cloudflare Turnstile**: Cookie-free, privacy-preserving human verification on public forms.
- **Sandboxed Delivery**: Strict Content Security Policy (CSP), anti-executable MIME sniffing guards, and isolated attachment headers.
- **Invite-Gated Access**: Controlled registration gated by cryptographic onboarding PINs and admin review queues.

---

## 📦 Ephemeral Delivery Modes

| Delivery Mode | Lifecycle Behavior | Primary Use Case |
| :--- | :--- | :--- |
| **Standard Share** | Closes when configured TTL expires (`1h` to `90d`) | Team reviews, collaborative drafts, temporary assets |
| **🔥 Burn on Open** | Destroys file **60s** after recipient first opens page | Highly confidential credentials, keys, one-time memos |
| **🛡️ Single-Use Link** | Irrevocably deleted upon **1 successful download** | Software license keys, sensitive signed contracts |
| **⚡ Direct Download** | Bypasses preview page; triggers instant download stream | Automated CI/CD pipelines, curl scripts, direct links |
| **👁️ Force Download** | Suppresses in-browser previewers; forces file download | Audio/video files where browser streaming is disallowed |
| **🌐 Raw CDN Embed** | Direct edge redirect (`/raw/[slug]`) with 1h CDN cache | GitHub README images, markdown documentation assets |

---

## 💻 Developer API & SaaS Platform Capabilities

GPHost is a developer-first SaaS platform designed for high-performance file transit, hierarchical storage management, and automated software release distribution. Authenticated developers and CI/CD pipelines can use API Keys (`gp_live_...`) to perform full programmatic operations across the entire platform.

### 1. API Key Authentication & Programmatic Key Management

All API requests accept your API key via the `Authorization` header:

```bash
Authorization: Bearer gp_live_YOUR_API_KEY
```

API key holders can also programmatically list, generate, and revoke keys:

```bash
# List all active API keys
curl -H "Authorization: Bearer gp_live_YOUR_API_KEY" \
  "https://gphost.eu.cc/api/user/api-keys"

# Generate a new API key with specific permissions
curl -X POST "https://gphost.eu.cc/api/user/api-keys" \
  -H "Authorization: Bearer gp_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "CI/CD Deployment Runner", "permissions": ["*"]}'

# Revoke an API key
curl -X DELETE "https://gphost.eu.cc/api/user/api-keys" \
  -H "Authorization: Bearer gp_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"keyId": "KEY_UUID"}'
```

---

### 2. Hierarchical Nested Folders API (`/api/v1/folders`)

API holders enjoy unconstrained hierarchical folder management with unlimited nesting, automatic ancestor creation, atomic moves/renames, and recursive deletion:

```bash
# 1. Create a nested folder structure (creates missing parents automatically)
curl -X POST "https://gphost.eu.cc/api/v1/folders" \
  -H "Authorization: Bearer gp_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"path": "projects/backend/releases/v1"}'

# 2. List immediate contents of a folder (subfolders, files, breadcrumbs, counts)
curl -H "Authorization: Bearer gp_live_YOUR_API_KEY" \
  "https://gphost.eu.cc/api/v1/folders?path=projects/backend"

# 3. Retrieve the full recursive folder hierarchy tree
curl -H "Authorization: Bearer gp_live_YOUR_API_KEY" \
  "https://gphost.eu.cc/api/v1/folders?tree=true"

# 4. Rename a folder (atomically cascades across all child paths & storage keys)
curl -X PATCH "https://gphost.eu.cc/api/v1/folders" \
  -H "Authorization: Bearer gp_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"path": "projects/backend/releases/v1", "newName": "v1-stable"}'

# 5. Move a folder to a new parent location
curl -X PATCH "https://gphost.eu.cc/api/v1/folders" \
  -H "Authorization: Bearer gp_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"path": "projects/backend/releases/v1-stable", "destinationParent": "archive/2026"}'

# 6. Delete a folder hierarchy (recursively removes files, frees storage quota)
curl -X DELETE "https://gphost.eu.cc/api/v1/folders?path=archive/2026&recursive=true" \
  -H "Authorization: Bearer gp_live_YOUR_API_KEY"
```

---

### 3. Multi-App Software Release Distribution Engine (`/api/v1/releases/[appId]`)

GPHost provides a production-grade software distribution pipeline for **any desktop or mobile application** (Tauri, Electron, Flutter, Go, Rust, etc.) with native Tauri v2 autoupdater support, cryptographic Minisign Ed25519 verification, and atomic releases:

```bash
# 1. Publish a new release with Minisign Ed25519 signature
curl -X POST "https://gphost.eu.cc/api/v1/releases/my-desktop-app/publish" \
  -H "Authorization: Bearer gp_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.2.0",
    "binaryFileId": "BINARY_FILE_UUID",
    "signature": "untrusted comment: signature...\n...",
    "notes": "Feature release v1.2.0 with improved syncing"
  }'

# 2. Query live release manifest (Tauri v2 updater compliant format)
curl "https://gphost.eu.cc/api/v1/releases/my-desktop-app/latest"

# 3. Query complete release version history and active status
curl -H "Authorization: Bearer gp_live_YOUR_API_KEY" \
  "https://gphost.eu.cc/api/v1/releases/my-desktop-app/history"

# 4. Download version-specific binary (direct edge redirect to Cloudflare R2)
curl -L "https://gphost.eu.cc/api/v1/releases/my-desktop-app/download/1.2.0" -o app-setup.exe

# 5. Instant atomic rollback to previous version
curl -X POST "https://gphost.eu.cc/api/v1/releases/my-desktop-app/rollback" \
  -H "Authorization: Bearer gp_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"targetVersion": "1.1.9"}'

# 6. Automated multi-layer stale binary storage purge
curl -X POST "https://gphost.eu.cc/api/v1/releases/my-desktop-app/purge-stale" \
  -H "Authorization: Bearer gp_live_YOUR_API_KEY"
```

---

### 4. Direct & Chunked Multipart File Uploads (`/api/v1/upload`)

Upload files directly into custom folders, specify exact R2 keys, or create private assets without generating public share links:

```bash
# Upload a file directly into a nested folder
curl -X POST "https://gphost.eu.cc/api/v1/upload" \
  -H "Authorization: Bearer gp_live_YOUR_API_KEY" \
  -F "file=@document.pdf" \
  -F "folder=projects/backend/docs" \
  -F "expiryPreset=30d"

# Upload directly to an exact custom R2 key (private, without public share link)
curl -X POST "https://gphost.eu.cc/api/v1/upload" \
  -H "Authorization: Bearer gp_live_YOUR_API_KEY" \
  -F "file=@build-artifact.tar.gz" \
  -F "customKey=artifacts/2026/build-104.tar.gz" \
  -F "noShareLink=true" \
  -F "overwrite=true"
```

#### Upload Parameters Reference

| Parameter | Type | Mode | Description |
| :--- | :--- | :--- | :--- |
| `file` | `File` | Multipart | Binary payload (up to 4.5 MB direct; > 4.5 MB via multipart lease) |
| `folder` | `string` | Form / JSON | Target hierarchical folder path (e.g. `projects/backend`, `backups`) |
| `customKey` | `string` | Form / JSON | Explicit R2 object key (e.g. `artifacts/2026/build-104.tar.gz`) |
| `noShareLink` | `boolean` | Form / JSON | If `true`, creates private object without `/f/{slug}` share link |
| `overwrite` | `boolean` | Form / JSON | If `true`, replaces existing files with matching custom key |
| `expiryPreset` | `string` | Form / JSON | Retention duration: `1h`, `24h`, `7d`, `30d`, `90d`, or `never` |
| `slug` | `string` | Form / JSON | Vanity custom public download slug |
| `isPermanent` | `boolean` | Form / JSON | Marks file as non-expiring permanent asset |

---

### 5. Atomic Zero-Downtime Binary Replacement (`/api/v1/replace`)

Replace an existing file or vanity download link atomically without breaking downstream download URLs:

```bash
# Mode A: Direct replacement (payloads <= 4.5 MB)
curl -X POST "https://gphost.eu.cc/api/v1/replace" \
  -H "Authorization: Bearer gp_live_YOUR_API_KEY" \
  -F "target=my-app" \
  -F "file=@app-setup-v1.0.1.exe" \
  -F "delete_previous=true"

# Mode B: Two-phase presigned replacement (payloads up to 1 GB)
# Phase 1: Request presigned stage lease
curl -X POST "https://gphost.eu.cc/api/v1/replace" \
  -H "Authorization: Bearer gp_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"target": "my-app", "filename": "app-setup-v1.0.1.exe", "byteSize": 52428800}'

# Phase 2: Upload binary bytes directly to the returned S3 uploadUrl
# Phase 3: Finalize atomic pointer switch
curl -X POST "https://gphost.eu.cc/api/v1/replace" \
  -H "Authorization: Bearer gp_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "complete", "stageToken": "<STAGE_TOKEN>", "delete_previous": true}'
```

---

### 6. Storage Reconciliation & Self-Auditing (`/api/storage/reconcile`)

Trigger physical Cloudflare R2 bucket scans to synchronize PostgreSQL file records with raw S3 storage:

```bash
curl -X POST "https://gphost.eu.cc/api/storage/reconcile" \
  -H "Authorization: Bearer gp_live_YOUR_API_KEY"
```

---

### 7. Programmatic Node.js / TypeScript SDK Example

```typescript
import { readFileSync } from "fs";

interface GPHostUploadResponse {
  success: boolean;
  file: {
    id: string;
    filename: string;
    byte_size: number;
    url: string;
    raw_url?: string;
  };
}

async function uploadToGPHost(filePath: string, folder: string, apiKey: string): Promise<GPHostUploadResponse> {
  const fileBytes = readFileSync(filePath);
  const formData = new FormData();
  formData.append("file", new Blob([fileBytes]), filePath.split("/").pop()!);
  formData.append("folder", folder);

  const res = await fetch("https://gphost.eu.cc/api/v1/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Upload failed with HTTP ${res.status}`);
  }

  return res.json();
}
```


---

## 🛠️ Technology Stack

```
Runtime & Framework ──► Node.js 24.x LTS  │  Next.js 16.3.5 (Turbopack)  │  React 19.2.8
Styling & UI Engine  ──► Tailwind CSS v4   │  Lucide Icons               │  Base UI
Database & Security  ──► Supabase PostgreSQL (RLS)  │  Upstash Redis     │  Cloudflare Turnstile
Edge Storage Layer   ──► Cloudflare R2 (S3-Compatible Zero Egress)       │  AWS S3 Request Presigner
Shortlink Service    ──► XURL REST API Integration (xurl.eu.cc)
Deployment Target    ──► Vercel Serverless & Edge Compute Fabric
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `24.x LTS` recommended (`node -v` >= 20.x)
- **Package Manager**: `npm`, `pnpm`, or `bun`
- **Cloudflare Account**: R2 Bucket configured with CORS
- **Supabase Account**: PostgreSQL instance with Auth enabled
- **Upstash Redis**: Serverless Redis instance for rate limiting

### 1. Clone & Install

```bash
git clone https://github.com/AspiringWebGaurav/gphost.git
cd gphost
npm install
```

### 2. Configure Environment

Create `.env.local` by copying the documented template:

```bash
cp .env.example .env.local
```

Configure your environment variables:

| Variable | Description |
| :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | Application root URL (`http://localhost:3000` or production domain) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API Gateway URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anonymous client key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role administrative key (backend only) |
| `R2_ACCOUNT_ID` | Cloudflare account identifier |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 S3-compatible API token access key |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 S3-compatible API token secret key |
| `R2_BUCKET_NAME` | Target Cloudflare R2 bucket name |
| `R2_PUBLIC_DOMAIN` | *(Optional)* Cloudflare R2 custom domain for direct CDN delivery |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint for rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST authorization token |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile bot verification site key |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret verification key |
| `XURL_API_KEY` | *(Optional)* Branded shortlink integration key |

### 3. Database Migrations

Apply the migration scripts in sequential order inside the Supabase SQL Editor:
```
supabase/migrations/
  ├── 001_initial_schema.sql
  ├── 002_storage_quotas_and_triggers.sql
  └── ...
```

### 4. Run Development Server

```bash
npm run dev
```

Visit [`http://localhost:3000`](http://localhost:3000) to inspect the local environment.

---

## 📜 Available Operational Scripts

```bash
# Development & Production
npm run dev          # Start Next.js Turbopack development server
npm run build        # Build optimized production bundle
npm run start        # Launch production server locally

# Quality Assurance & Testing
npm run typecheck    # Validate TypeScript types (tsc --noEmit)
npm run lint         # Run ESLint validation
npm run test:e2e     # Run Playwright end-to-end test suite
npm run test:cors    # Validate Cloudflare R2 CORS headers & S3 presigner
npm run benchmark    # Benchmark API presigning latency and throughput

# Maintenance & Clean
npm run clean        # Clean Next.js build cache and temporary artifacts
npm run total-clean  # Deep clean including node_modules and lockfiles
```

---

## 🔒 Security & Cryptographic Model

1. **Zero-Knowledge Guarantee**: When client encryption is enabled, file bytes are encrypted locally using AES-GCM 256. The decryption key exists solely in the URL fragment (`https://gphost.eu.cc/f/<slug>#key=<secret>`). Because browsers do not transmit fragments across the wire (RFC 3986 §3.5), the server never possesses the decryption key.
2. **Race-Condition-Resistant Quotas**: Storage reservations utilize PostgreSQL transactions (`FOR UPDATE` locking and stored procedures) to guarantee user quotas cannot be exceeded via concurrent uploads.
3. **Fail-Open Circuit Breakers**: Upstash Redis rate limiters feature fail-open fault tolerance, ensuring network interruptions in auxiliary services never bring down core file transit.
4. **Sandboxed Rendering**: File previews enforce restrictive Content Security Policies, sandboxed iframe execution, and strict `Content-Disposition: attachment` fallbacks for executable file types.

---

## ⚖️ Governance & Terms

- **Inception**: September 2026
- **Terms of Service**: [https://gphost.eu.cc/terms](https://gphost.eu.cc/terms)
- **Privacy Policy**: [https://gphost.eu.cc/privacy](https://gphost.eu.cc/privacy)
- **License**: Source-available under the terms of the [LICENSE](LICENSE) file. Free for research, audit, and educational inspection. Unauthorized commercial SaaS re-branding is prohibited.

<div align="center">
  <sub>&copy; 2026 GPHost. Ephemeral Direct-Transit &amp; Zero-Knowledge Cloud.</sub>
</div>
