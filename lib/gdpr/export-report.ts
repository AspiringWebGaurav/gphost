/**
 * GDPR Data Portability & Access Dossier Generator
 * Implements GDPR Article 15 (Right of Access) & Article 20 (Right to Data Portability).
 * Produces structured, byte-accurate, standalone HTML and JSON dossiers.
 */

export interface ExportDataPayload {
  exportMetadata: {
    generatedAt: string;
    legalBasis: string;
    version: string;
    userId: string;
    userEmail: string;
  };
  accountProfile: {
    id: string;
    email: string;
    fullName: string | null;
    avatarUrl: string | null;
    role: string;
    status: string;
    quotaBytes: number;
    storageUsedBytes: number;
    reservedBytes: number;
    canCreatePermanent: boolean;
    createdAt: string;
    updatedAt: string | null;
  };
  lifecyclePolicies: {
    ephemeralFilesRetention: string;
    singleUseFilesRetention: string;
    telemetryAndDownloadLogsRetention: string;
    auditLogsRetention: string;
    erasurePolicy: string;
  };
  storageFootprint: {
    totalUsedBytes: number;
    quotaBytes: number;
    quotaPercent: number;
    activeFilesCount: number;
    activeFilesBytes: number;
    expiredFilesCount: number;
    expiredFilesBytes: number;
    lifetimeFilesCount: number;
    lifetimeFilesBytes: number;
    byCategory: {
      imagesBytes: number;
      videosBytes: number;
      audioBytes: number;
      documentsBytes: number;
      archivesAndCodeBytes: number;
      otherBytes: number;
    };
  };
  files: Array<{
    id: string;
    filename: string;
    sanitizedName: string;
    byteSize: number;
    formattedSize: string;
    mimeType: string;
    status: string;
    expiryPreset: string | null;
    expiresAt: string | null;
    createdAt: string;
  }>;
  shareLinks: Array<{
    id: string;
    fileId: string;
    slug: string;
    isActive: boolean;
    expiresAt: string | null;
    maxDownloads: number | null;
    downloadCount: number;
    isPasswordProtected: boolean;
    isSingleUse: boolean;
    onePerMember: boolean;
    burnAfterPreview: boolean;
    directDownload: boolean;
    recipientNote: string | null;
    createdAt: string;
  }>;
  downloadActivity: Array<{
    id: string;
    fileId: string;
    shareLinkId: string | null;
    eventType: string;
    countryCode: string | null;
    city: string | null;
    referrer: string | null;
    createdAt: string;
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    details: Record<string, unknown> | null;
    createdAt: string;
  }>;
  apiKeys: Array<{
    id: string;
    name: string;
    keyPrefix: string;
    isActive: boolean;
    lastUsedAt: string | null;
    createdAt: string;
  }>;
}

export function formatBytes(bytes: number): string {
  if (bytes === -1) return "Unlimited";
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Escapes HTML characters to prevent XSS in rendered audit dossiers
 */
function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generates an offline, standalone, beautifully styled HTML dossier
 * conforming to GDPR Articles 15 and 20.
 */
export function generateGdprHtmlReport(data: ExportDataPayload): string {
  const p = data.accountProfile;
  const s = data.storageFootprint;
  const m = data.exportMetadata;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GDPR Data Portability Dossier - ${escapeHtml(p.email)}</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: #111827;
      --card-border: #1f2937;
      --text-main: #f9fafb;
      --text-muted: #9ca3af;
      --primary: #3b82f6;
      --primary-glow: rgba(59, 130, 246, 0.15);
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --code-bg: #1e293b;
      --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f8fafc;
        --card-bg: #ffffff;
        --card-border: #e2e8f0;
        --text-main: #0f172a;
        --text-muted: #64748b;
        --code-bg: #f1f5f9;
      }
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: var(--font-family);
      background-color: var(--bg);
      color: var(--text-main);
      line-height: 1.5;
      padding: 2rem 1rem;
    }
    .container {
      max-width: 1100px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .header-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 1rem;
      padding: 2rem;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 1.5rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-primary {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }
    .badge-success {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
    }
    .kpi-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.85rem;
      padding: 1.25rem;
    }
    .kpi-label {
      font-size: 0.8rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.35rem;
    }
    .kpi-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text-main);
    }
    .section-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 1rem;
      padding: 1.5rem;
    }
    .section-title {
      font-size: 1.15rem;
      font-weight: 700;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 0.75rem;
    }
    .policy-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1rem;
    }
    .policy-item {
      background: var(--code-bg);
      padding: 1rem;
      border-radius: 0.75rem;
      border: 1px solid var(--card-border);
    }
    .policy-title {
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
      color: #60a5fa;
    }
    .policy-desc {
      font-size: 0.8rem;
      color: var(--text-muted);
      line-height: 1.4;
    }
    .table-container {
      overflow-x: auto;
      margin-top: 0.5rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.825rem;
    }
    th {
      padding: 0.75rem 1rem;
      background: var(--code-bg);
      color: var(--text-muted);
      font-weight: 600;
      border-bottom: 1px solid var(--card-border);
    }
    td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--card-border);
    }
    tr:last-child td {
      border-bottom: none;
    }
    .progress-bar-container {
      width: 100%;
      height: 8px;
      background: var(--card-border);
      border-radius: 9999px;
      overflow: hidden;
      margin: 0.75rem 0;
    }
    .progress-bar {
      height: 100%;
      background: var(--primary);
      border-radius: 9999px;
    }
    .action-btn {
      padding: 0.6rem 1.2rem;
      background: var(--primary);
      color: #ffffff;
      border: none;
      border-radius: 0.5rem;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      text-decoration: none;
    }
    .action-btn:hover {
      opacity: 0.9;
    }
    @media print {
      body {
        background: #ffffff;
        color: #000000;
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
      .header-card, .section-card, .kpi-card {
        border: 1px solid #ccc;
        box-shadow: none;
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header Card -->
    <div class="header-card">
      <div>
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
          <h1 style="font-size: 1.5rem; font-weight: 800;">GDPR Personal Data Dossier</h1>
          <span class="badge badge-success">Article 15 &amp; 20 Compliant</span>
        </div>
        <p style="color: var(--text-muted); font-size: 0.85rem;">
          Official data portability report generated for <strong>${escapeHtml(p.email)}</strong> on ${new Date(m.generatedAt).toUTCString()}.
        </p>
        <p style="color: var(--text-muted); font-size: 0.75rem; margin-top: 0.25rem;">
          Tenant ID: <code style="background: var(--code-bg); padding: 2px 4px; border-radius: 4px;">${escapeHtml(m.userId)}</code> | Platform Version: ${escapeHtml(m.version)}
        </p>
      </div>
      <div class="no-print">
        <button onclick="window.print()" class="action-btn">
          Print / Save as PDF
        </button>
      </div>
    </div>

    <!-- Storage Footprint KPI Cards -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Current Storage Used</div>
        <div class="kpi-value">${formatBytes(s.totalUsedBytes)}</div>
        <div class="progress-bar-container">
          <div class="progress-bar" style="width: ${Math.min(100, Math.max(2, s.quotaPercent))}%;"></div>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">
          ${formatBytes(s.totalUsedBytes)} of ${formatBytes(s.quotaBytes)} quota (${s.quotaPercent}% utilized)
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Active Files Stored</div>
        <div class="kpi-value">${s.activeFilesCount}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
          Footprint: ${formatBytes(s.activeFilesBytes)}
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Expired / Purged Files</div>
        <div class="kpi-value">${s.expiredFilesCount}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
          Reclaimed Quota: ${formatBytes(s.expiredFilesBytes)}
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Lifetime Uploads</div>
        <div class="kpi-value">${s.lifetimeFilesCount}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
          Total Volume: ${formatBytes(s.lifetimeFilesBytes)}
        </div>
      </div>
    </div>

    <!-- Storage Category Breakdown -->
    <div class="section-card">
      <div class="section-title">Byte-Level Storage Distribution by Category</div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; text-align: center;">
        <div style="background: var(--code-bg); padding: 0.75rem; border-radius: 0.5rem;">
          <div style="font-size: 0.75rem; color: var(--text-muted);">Images</div>
          <div style="font-weight: 700; margin-top: 0.25rem;">${formatBytes(s.byCategory.imagesBytes)}</div>
        </div>
        <div style="background: var(--code-bg); padding: 0.75rem; border-radius: 0.5rem;">
          <div style="font-size: 0.75rem; color: var(--text-muted);">Videos</div>
          <div style="font-weight: 700; margin-top: 0.25rem;">${formatBytes(s.byCategory.videosBytes)}</div>
        </div>
        <div style="background: var(--code-bg); padding: 0.75rem; border-radius: 0.5rem;">
          <div style="font-size: 0.75rem; color: var(--text-muted);">Audio</div>
          <div style="font-weight: 700; margin-top: 0.25rem;">${formatBytes(s.byCategory.audioBytes)}</div>
        </div>
        <div style="background: var(--code-bg); padding: 0.75rem; border-radius: 0.5rem;">
          <div style="font-size: 0.75rem; color: var(--text-muted);">Documents</div>
          <div style="font-weight: 700; margin-top: 0.25rem;">${formatBytes(s.byCategory.documentsBytes)}</div>
        </div>
        <div style="background: var(--code-bg); padding: 0.75rem; border-radius: 0.5rem;">
          <div style="font-size: 0.75rem; color: var(--text-muted);">Code &amp; Archives</div>
          <div style="font-weight: 700; margin-top: 0.25rem;">${formatBytes(s.byCategory.archivesAndCodeBytes)}</div>
        </div>
        <div style="background: var(--code-bg); padding: 0.75rem; border-radius: 0.5rem;">
          <div style="font-size: 0.75rem; color: var(--text-muted);">Other Formats</div>
          <div style="font-weight: 700; margin-top: 0.25rem;">${formatBytes(s.byCategory.otherBytes)}</div>
        </div>
      </div>
    </div>

    <!-- Data Retention Lifecycle Policies -->
    <div class="section-card">
      <div class="section-title">Data Lifecycle &amp; Retention Policies</div>
      <div class="policy-list">
        <div class="policy-item">
          <div class="policy-title">Ephemeral &amp; Standard Files</div>
          <div class="policy-desc">${escapeHtml(data.lifecyclePolicies.ephemeralFilesRetention)}</div>
        </div>
        <div class="policy-item">
          <div class="policy-title">Single-Use Link Purging</div>
          <div class="policy-desc">${escapeHtml(data.lifecyclePolicies.singleUseFilesRetention)}</div>
        </div>
        <div class="policy-item">
          <div class="policy-title">Telemetry &amp; Download Logs</div>
          <div class="policy-desc">${escapeHtml(data.lifecyclePolicies.telemetryAndDownloadLogsRetention)}</div>
        </div>
        <div class="policy-item">
          <div class="policy-title">Audit Trail Retention</div>
          <div class="policy-desc">${escapeHtml(data.lifecyclePolicies.auditLogsRetention)}</div>
        </div>
        <div class="policy-item" style="grid-column: 1 / -1;">
          <div class="policy-title">Right to Erasure (Article 17)</div>
          <div class="policy-desc">${escapeHtml(data.lifecyclePolicies.erasurePolicy)}</div>
        </div>
      </div>
    </div>

    <!-- Files Inventory Table -->
    <div class="section-card">
      <div class="section-title">Files Inventory (${data.files.length} Records)</div>
      ${data.files.length === 0 ? '<p style="color: var(--text-muted); font-size: 0.85rem;">No files uploaded.</p>' : `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>File Name</th>
              <th>Size</th>
              <th>MIME Type</th>
              <th>Status</th>
              <th>Uploaded At</th>
              <th>Expires At</th>
            </tr>
          </thead>
          <tbody>
            ${data.files.map((f) => `
              <tr>
                <td style="font-weight: 600;">${escapeHtml(f.sanitizedName)}</td>
                <td style="font-family: monospace;">${escapeHtml(f.formattedSize)}</td>
                <td style="color: var(--text-muted);">${escapeHtml(f.mimeType)}</td>
                <td>
                  <span class="badge ${f.status === 'ACTIVE' ? 'badge-success' : 'badge-primary'}">
                    ${escapeHtml(f.status)}
                  </span>
                </td>
                <td>${new Date(f.createdAt).toLocaleDateString()}</td>
                <td>${f.expiresAt ? new Date(f.expiresAt).toLocaleDateString() : 'Permanent'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      `}
    </div>

    <!-- Share Links Generated -->
    <div class="section-card">
      <div class="section-title">Share Links Generated (${data.shareLinks.length} Records)</div>
      ${data.shareLinks.length === 0 ? '<p style="color: var(--text-muted); font-size: 0.85rem;">No share links generated.</p>' : `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Slug / Identifier</th>
              <th>Status</th>
              <th>Downloads</th>
              <th>Security Options</th>
              <th>Created At</th>
              <th>Expires At</th>
            </tr>
          </thead>
          <tbody>
            ${data.shareLinks.map((l) => `
              <tr>
                <td style="font-family: monospace; font-weight: 600;">${escapeHtml(l.slug)}</td>
                <td>
                  <span class="badge ${l.isActive ? 'badge-success' : 'badge-primary'}">
                    ${l.isActive ? 'Active' : 'Expired / Closed'}
                  </span>
                </td>
                <td>${l.downloadCount} ${l.maxDownloads ? `/ ${l.maxDownloads}` : ''}</td>
                <td style="font-size: 0.75rem; color: var(--text-muted);">
                  ${[
                    l.isPasswordProtected ? 'Password Protected' : null,
                    l.isSingleUse ? 'Single-Use' : null,
                    l.burnAfterPreview ? 'Burn After View' : null,
                    l.directDownload ? 'Direct Download' : null,
                  ].filter(Boolean).join(', ') || 'Standard Public'}
                </td>
                <td>${new Date(l.createdAt).toLocaleDateString()}</td>
                <td>${l.expiresAt ? new Date(l.expiresAt).toLocaleDateString() : 'Permanent'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      `}
    </div>

    <!-- Download Activity & Telemetry -->
    <div class="section-card">
      <div class="section-title">Download &amp; Telemetry Events (${data.downloadActivity.length} Events, 90-Day Rolling Window)</div>
      ${data.downloadActivity.length === 0 ? '<p style="color: var(--text-muted); font-size: 0.85rem;">No download events recorded in active window.</p>' : `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Event Type</th>
              <th>Edge Location</th>
              <th>Referrer</th>
            </tr>
          </thead>
          <tbody>
            ${data.downloadActivity.slice(0, 50).map((ev) => `
              <tr>
                <td>${new Date(ev.createdAt).toLocaleString()}</td>
                <td style="font-weight: 600; text-transform: uppercase; font-size: 0.75rem;">${escapeHtml(ev.eventType)}</td>
                <td>${escapeHtml(ev.city || 'Edge')}${ev.countryCode ? ` (${escapeHtml(ev.countryCode)})` : ''}</td>
                <td style="color: var(--text-muted); font-size: 0.75rem;">${escapeHtml(ev.referrer || 'Direct')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      `}
    </div>

    <!-- Audit Trail -->
    <div class="section-card">
      <div class="section-title">Account Action Audit Trail (${data.auditLogs.length} Events)</div>
      ${data.auditLogs.length === 0 ? '<p style="color: var(--text-muted); font-size: 0.85rem;">No recent audit logs.</p>' : `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>Event Summary</th>
            </tr>
          </thead>
          <tbody>
            ${data.auditLogs.slice(0, 50).map((a) => `
              <tr>
                <td>${new Date(a.createdAt).toLocaleString()}</td>
                <td style="font-family: monospace; font-weight: 600; color: #60a5fa;">${escapeHtml(a.action)}</td>
                <td style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(JSON.stringify(a.details || {}))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      `}
    </div>

    <!-- Developer API Keys -->
    <div class="section-card">
      <div class="section-title">Developer API Keys (${data.apiKeys.length} Keys)</div>
      ${data.apiKeys.length === 0 ? '<p style="color: var(--text-muted); font-size: 0.85rem;">No API keys configured.</p>' : `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Key Name</th>
              <th>Key Prefix</th>
              <th>Status</th>
              <th>Last Used</th>
              <th>Created At</th>
            </tr>
          </thead>
          <tbody>
            ${data.apiKeys.map((k) => `
              <tr>
                <td style="font-weight: 600;">${escapeHtml(k.name)}</td>
                <td style="font-family: monospace;">${escapeHtml(k.keyPrefix)}••••</td>
                <td>
                  <span class="badge ${k.isActive ? 'badge-success' : 'badge-primary'}">
                    ${k.isActive ? 'Active' : 'Revoked'}
                  </span>
                </td>
                <td>${k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never'}</td>
                <td>${new Date(k.createdAt).toLocaleDateString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      `}
    </div>

    <!-- Footer -->
    <div style="text-align: center; color: var(--text-muted); font-size: 0.75rem; padding: 1rem 0;">
      GPHost Data Portability Engine &bull; Compliant with GDPR Article 15 &amp; 20 &bull; Generated on ${new Date().toISOString()}
    </div>
  </div>
</body>
</html>`;
}
