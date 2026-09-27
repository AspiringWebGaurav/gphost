import crypto from "crypto";

/**
 * High-Security File Guard for GPHosting.
 * Defends against:
 * 1. Malicious executable binaries (Windows PE/EXE/DLL, Linux ELF, macOS Mach-O).
 * 2. Server-side webshells (.php, .phtml, .asp, .aspx, .jsp, .cgi).
 * 3. Script injection (.bat, .cmd, .vbs, .ps1, .sh).
 * 4. Stored Cross-Site Scripting (XSS) via SVG or HTML vectors.
 * 5. Double-extension masquerade attacks (e.g. invoice.pdf.exe).
 * 6. Cryptographic payload tampering (SHA-256 verification).
 */

// Extensions strictly prohibited from direct upload
const BLOCKED_EXTENSIONS = new Set([
  // Windows executables & libraries
  ".exe",
  ".dll",
  ".com",
  ".scr",
  ".pif",
  ".cpl",
  ".msi",
  ".msp",
  ".mst",
  ".sys",
  ".drv",
  // Shell & batch scripts
  ".bat",
  ".cmd",
  ".vbs",
  ".vbe",
  ".wsf",
  ".wsh",
  ".ps1",
  ".ps1xml",
  ".ps2",
  ".psc1",
  ".psc2",
  ".sh",
  ".bash",
  ".zsh",
  // Server-side scripts & webshells
  ".php",
  ".php3",
  ".php4",
  ".php5",
  ".phtml",
  ".phps",
  ".shtml",
  ".asp",
  ".aspx",
  ".cer",
  ".asa",
  ".asax",
  ".jsp",
  ".jspx",
  ".jsw",
  ".jsv",
  ".jspf",
  ".cgi",
  ".pl",
  // Registry & system control
  ".reg",
  ".lnk",
  ".inf",
  ".ins",
  ".scf",
  ".gadget",
  ".hta",
]);

// Binary magic byte signatures to detect spoofed file types
const MAGIC_SIGNATURES = {
  // Windows Portable Executable (PE / MZ)
  WINDOWS_PE: [0x4d, 0x5a],
  // Linux Executable and Linkable Format (ELF)
  LINUX_ELF: [0x7f, 0x45, 0x4c, 0x46],
  // macOS Mach-O 32/64 bit
  MACHO_32: [0xfe, 0xed, 0xfa, 0xce],
  MACHO_64: [0xfe, 0xed, 0xfa, 0xcf],
  MACHO_FAT: [0xca, 0xfe, 0xba, 0xbe],
  MACHO_REVERSE_64: [0xcf, 0xfa, 0xed, 0xfe],
  // Standard Image Magic Bytes
  PNG: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  JPEG: [0xff, 0xd8, 0xff],
  GIF: [0x47, 0x49, 0x46, 0x38],
  PDF: [0x25, 0x50, 0x44, 0x46], // %PDF
};

function matchesMagicBytes(buffer: Buffer, magic: number[]): boolean {
  if (buffer.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (buffer[i] !== magic[i]) return false;
  }
  return true;
}

export interface SecurityCheckResult {
  safe: boolean;
  reason?: string;
  normalizedMime: string;
}

/**
 * Validates a file's security posture before saving to storage.
 */
export function validateUploadSecurity(
  filename: string,
  buffer?: Buffer,
  declaredMime?: string
): SecurityCheckResult {
  const cleanName = (filename || "").toLowerCase().trim();

  // 1. Prohibit empty or hidden names
  if (!cleanName || cleanName === "." || cleanName.startsWith("..")) {
    return {
      safe: false,
      reason: "Invalid filename: name cannot be empty or relative navigation path.",
      normalizedMime: "application/octet-stream",
    };
  }

  // 2. Extract and check file extension
  const lastDot = cleanName.lastIndexOf(".");
  const ext = lastDot >= 0 ? cleanName.slice(lastDot) : "";

  if (ext && BLOCKED_EXTENSIONS.has(ext)) {
    return {
      safe: false,
      reason: `Blocked dangerous file type (${ext}). Executable binaries, system scripts, and webshells are prohibited to prevent malware distribution.`,
      normalizedMime: "application/octet-stream",
    };
  }

  // 3. Double-extension attack prevention (e.g. invoice.pdf.exe or safe.jpg.php)
  const parts = cleanName.split(".");
  if (parts.length > 2) {
    for (let i = 1; i < parts.length; i++) {
      const subExt = `.${parts[i]}`;
      if (BLOCKED_EXTENSIONS.has(subExt)) {
        return {
          safe: false,
          reason: `Dangerous disguised extension detected (${subExt}). Double-extension masquerading is blocked for security.`,
          normalizedMime: "application/octet-stream",
        };
      }
    }
  }

  // 4. Binary Inspection (if buffer is present in direct upload)
  if (buffer && buffer.length > 0) {
    // Check for Windows Executable
    if (matchesMagicBytes(buffer, MAGIC_SIGNATURES.WINDOWS_PE)) {
      return {
        safe: false,
        reason: "Executable Windows binary (PE/EXE/DLL) detected in payload. Upload rejected.",
        normalizedMime: "application/octet-stream",
      };
    }

    // Check for Linux Executable
    if (matchesMagicBytes(buffer, MAGIC_SIGNATURES.LINUX_ELF)) {
      return {
        safe: false,
        reason: "Executable Linux binary (ELF) detected in payload. Upload rejected.",
        normalizedMime: "application/octet-stream",
      };
    }

    // Check for macOS Executable
    if (
      matchesMagicBytes(buffer, MAGIC_SIGNATURES.MACHO_32) ||
      matchesMagicBytes(buffer, MAGIC_SIGNATURES.MACHO_64) ||
      matchesMagicBytes(buffer, MAGIC_SIGNATURES.MACHO_FAT) ||
      matchesMagicBytes(buffer, MAGIC_SIGNATURES.MACHO_REVERSE_64)
    ) {
      return {
        safe: false,
        reason: "Executable macOS binary (Mach-O) detected in payload. Upload rejected.",
        normalizedMime: "application/octet-stream",
      };
    }

    // Check for Shebang shell scripts (#!)
    const firstChunk = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("utf8");
    if (/^#!\s*\/(bin|usr)\//i.test(firstChunk)) {
      return {
        safe: false,
        reason: "Executable shell script header (shebang) detected in payload. Upload rejected.",
        normalizedMime: "application/octet-stream",
      };
    }

    // Check for PHP or Webshell tags
    if (/(<\?php|<\?=|language\s*=\s*["']php["'])/i.test(firstChunk)) {
      return {
        safe: false,
        reason: "Server-side script tag (PHP webshell) detected in file content. Upload rejected.",
        normalizedMime: "application/octet-stream",
      };
    }

    // Check SVG files for Stored Cross-Site Scripting (XSS) vectors
    if (ext === ".svg" || declaredMime?.includes("image/svg+xml")) {
      const svgContent = buffer.subarray(0, Math.min(buffer.length, 65536)).toString("utf8").toLowerCase();
      const dangerousPatterns = [
        "<script",
        "javascript:",
        "onload=",
        "onerror=",
        "onclick=",
        "onmouseover=",
        "<iframe",
        "<embed",
        "<object",
      ];

      for (const pattern of dangerousPatterns) {
        if (svgContent.includes(pattern)) {
          return {
            safe: false,
            reason: `Malicious active script vector (${pattern}) detected in SVG document. Stored XSS prevented.`,
            normalizedMime: "image/svg+xml",
          };
        }
      }
    }
  }

  // 5. Authoritative MIME Normalization
  let normalizedMime = (declaredMime || "application/octet-stream").toLowerCase().trim();

  // Enforce correct MIME based on verified extensions
  if (ext === ".png") normalizedMime = "image/png";
  else if (ext === ".jpg" || ext === ".jpeg") normalizedMime = "image/jpeg";
  else if (ext === ".gif") normalizedMime = "image/gif";
  else if (ext === ".webp") normalizedMime = "image/webp";
  else if (ext === ".svg") normalizedMime = "image/svg+xml";
  else if (ext === ".pdf") normalizedMime = "application/pdf";
  else if (ext === ".json") normalizedMime = "application/json";
  else if (ext === ".txt") normalizedMime = "text/plain; charset=utf-8";
  else if (ext === ".zip") normalizedMime = "application/zip";
  else if (ext === ".mp4") normalizedMime = "video/mp4";
  else if (ext === ".mp3") normalizedMime = "audio/mpeg";

  return {
    safe: true,
    normalizedMime,
  };
}

/**
 * Computes and authoritatively verifies cryptographic SHA-256 integrity.
 * Protects against in-transit data corruption, interception, and MITM tampering.
 */
export function verifyContentIntegrity(
  buffer: Buffer,
  clientProvidedSha256?: string | null
): {
  sha256: string;
  verified: boolean;
  mismatch: boolean;
} {
  const computedSha256 = crypto.createHash("sha256").update(buffer).digest("hex");

  if (!clientProvidedSha256 || typeof clientProvidedSha256 !== "string") {
    return {
      sha256: computedSha256,
      verified: true,
      mismatch: false,
    };
  }

  // Normalize client checksum (e.g. from "sha-256=abcdef..." or raw hex)
  let cleanClientHash = clientProvidedSha256.trim().toLowerCase();
  if (cleanClientHash.startsWith("sha-256=")) {
    cleanClientHash = cleanClientHash.replace("sha-256=", "").trim();
  } else if (cleanClientHash.startsWith("sha256=")) {
    cleanClientHash = cleanClientHash.replace("sha256=", "").trim();
  }

  // Timing-safe constant-time comparison
  const mismatch = !safeCompareHex(computedSha256, cleanClientHash);

  return {
    sha256: computedSha256,
    verified: !mismatch,
    mismatch,
  };
}

function safeCompareHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Returns strict enterprise security headers for the CLI API response.
 */
export function getSecurityHeaders(sha256?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Robots-Tag": "noindex, nofollow",
  };

  if (sha256) {
    headers["X-Checksum-SHA256"] = sha256;
    headers["ETag"] = `"${sha256}"`;
  }

  return headers;
}
