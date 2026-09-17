/**
 * Browser-side Zero-Trust End-to-End Encryption (AES-GCM 256-bit).
 * Powered natively by the browser Web Crypto API (SubtleCrypto).
 *
 * Security Model:
 * 1. Plaintext files are encrypted in the client browser before upload.
 * 2. The encryption key is derived client-side and placed ONLY in the URL hash fragment:
 *    https://gphost.app/f/[slug]#key=[base64Key]
 * 3. Per RFC 3986, URL hash fragments are NEVER transmitted in HTTP request headers.
 * 4. Neither Vercel serverless, Supabase, nor Cloudflare R2 ever sees the key or plaintext.
 * 5. 0 bytes Vercel CPU, 0 bytes Vercel memory.
 */

export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generates an exportable 256-bit AES-GCM CryptoKey.
 */
export async function generateE2EKey(): Promise<{ key: CryptoKey; base64Key: string }> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error("Web Crypto API is not available in this environment.");
  }

  const key = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const rawKeyBuffer = await window.crypto.subtle.exportKey("raw", key);
  const base64Key = arrayBufferToBase64Url(rawKeyBuffer);

  return { key, base64Key };
}

/**
 * Imports a 256-bit AES-GCM CryptoKey from URL-safe base64.
 */
export async function importE2EKey(base64Key: string): Promise<CryptoKey> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error("Web Crypto API is not available in this environment.");
  }

  const rawKeyBuffer = base64UrlToArrayBuffer(base64Key);
  return window.crypto.subtle.importKey(
    "raw",
    rawKeyBuffer,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts an ArrayBuffer with AES-GCM 256-bit.
 * Prepends a cryptographically secure 12-byte IV to the output buffer.
 * Output layout: [12-byte IV] + [Ciphertext + 16-byte Auth Tag].
 */
export async function encryptBuffer(
  plaintextBuffer: ArrayBuffer,
  key: CryptoKey
): Promise<ArrayBuffer> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintextBuffer
  );

  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);

  return combined.buffer;
}

/**
 * Decrypts an AES-GCM buffer using the prepended 12-byte IV.
 */
export async function decryptBuffer(
  encryptedBuffer: ArrayBuffer,
  key: CryptoKey
): Promise<ArrayBuffer> {
  if (encryptedBuffer.byteLength < 28) {
    throw new Error("Ciphertext too short to be a valid AES-GCM payload.");
  }

  const iv = new Uint8Array(encryptedBuffer.slice(0, 12));
  const ciphertext = encryptedBuffer.slice(12);

  return window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
}

/**
 * Extracts any E2E decryption key embedded in the URL hash fragment (#key=...).
 */
export function extractE2EKeyFromHash(): string | null {
  if (typeof window === "undefined" || !window.location.hash) {
    return null;
  }

  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  return params.get("key") || null;
}
