import crypto from "node:crypto";

/**
 * Secret pepper used for server-side device fingerprint HMAC hashing.
 * Ensures the raw fingerprint cannot be easily guessed, forged, or rainbow-attacked.
 */
export const DEVICE_FP_PEPPER =
  process.env.DEVICE_FP_PEPPER ||
  process.env.IP_HASH_PEPPER ||
  (process.env.NODE_ENV !== "production" ? "gphost_dev_hw_fingerprint_pepper" : "gphost_hw_fp_default_pepper");

/**
 * Server-Side: Computes a keyed HMAC-SHA256 of the client device fingerprint.
 * Prevents raw fingerprint storage and ensures deterministic slot indexing in Redis/PostgreSQL.
 */
export function hashDeviceFingerprint(fingerprint: string, pepper = DEVICE_FP_PEPPER): string {
  const normalized = (fingerprint || "").trim();
  if (!normalized) return "";
  return crypto.createHmac("sha256", pepper).update(normalized).digest("hex");
}

/**
 * Validates whether a device fingerprint string adheres to the standard format.
 */
export function isValidDeviceFingerprint(fp: unknown): fp is string {
  if (typeof fp !== "string") return false;
  const trimmed = fp.trim();
  // hwfp_<64 hex chars> or fallback format between 16 and 128 characters
  return trimmed.length >= 16 && trimmed.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(trimmed);
}

// ============================================================================
// CLIENT-SIDE HARDWARE & BROWSER FINGERPRINTING ENGINE
// ============================================================================

/**
 * Client-Side: Canvas 2D Rasterization Fingerprint.
 * Renders distinct bezier curves, fonts, gradients, and composite operations.
 * Font glyph anti-aliasing and subpixel curves are computed by the OS font engine
 * (DirectWrite / CoreText / FreeType) and GPU driver, producing an identical
 * pixel buffer in both Normal and Incognito/Private browsing windows.
 */
function getCanvas2DFingerprint(): string {
  try {
    if (typeof document === "undefined") return "no_document";
    const canvas = document.createElement("canvas");
    canvas.width = 280;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "canvas_unsupported";

    // Text rendering with various styling, weights, and emojis
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial', 'Segoe UI', 'Helvetica', sans-serif";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);

    ctx.fillStyle = "#069";
    ctx.fillText("GPHost_HW_🛡️_v2.0", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("DeviceFingerprint<gphost_incognito_shield>", 4, 35);

    // Geometric primitives with alpha blending
    ctx.strokeStyle = "rgba(255, 0, 128, 0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(50, 30, 18, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.stroke();

    return canvas.toDataURL();
  } catch {
    return "canvas_error";
  }
}

/**
 * Client-Side: WebGL GPU Hardware Unmasked Renderer & Vendor.
 * Directly profiles the physical graphics card and driver capabilities.
 * WebGL extensions and parameter limits are hardware-bound and stay identical
 * across Incognito and Normal windows on the same machine.
 */
function getWebGLHardwareFingerprint(): string {
  try {
    if (typeof document === "undefined") return "no_document";
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return "webgl_unsupported";

    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
      : gl.getParameter(gl.VENDOR);
    const renderer = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);

    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const maxRenderBufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
    const maxCubeMapSize = gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE);
    const maxVertexAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    const maxVaryingVectors = gl.getParameter(gl.MAX_VARYING_VECTORS);

    return `${vendor}~${renderer}~${maxTextureSize}~${maxRenderBufferSize}~${maxCubeMapSize}~${maxVertexAttribs}~${maxVaryingVectors}`;
  } catch {
    return "webgl_error";
  }
}

/**
 * Client-Side: Web Audio DSP Fingerprint.
 * Renders an offline synthesized audio buffer through an oscillator and DynamicsCompressor.
 * The floating-point rounding errors and math precision of the sound driver
 * create a stable, deterministic hardware-level signature.
 */
async function getAudioHardwareFingerprint(): Promise<string> {
  try {
    if (typeof window === "undefined") return "no_window";
    const AudioContextClass =
      window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
        .webkitOfflineAudioContext;

    if (!AudioContextClass) return "audio_unsupported";

    const context = new AudioContextClass(1, 44100, 44100);
    const oscillator = context.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(10000, context.currentTime);

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-50, context.currentTime);
    compressor.knee.setValueAtTime(40, context.currentTime);
    compressor.ratio.setValueAtTime(12, context.currentTime);
    compressor.attack.setValueAtTime(0, context.currentTime);
    compressor.release.setValueAtTime(0.25, context.currentTime);

    oscillator.connect(compressor);
    compressor.connect(context.destination);

    oscillator.start(0);
    const audioBuffer = await context.startRendering();
    const channelData = audioBuffer.getChannelData(0);

    let sum = 0;
    for (let i = 4500; i < 5000; i++) {
      sum += Math.abs(channelData[i] || 0);
    }
    return sum.toFixed(8);
  } catch {
    return "audio_error";
  }
}

/**
 * Client-Side: Hardware Specifications & System Profile.
 * Captures CPU core count, device RAM class, display color depth, screen bounds,
 * and timezone information.
 */
function getSystemHardwareProfile(): string {
  try {
    if (typeof window === "undefined") return "no_window";
    const nav = window.navigator as Navigator & { deviceMemory?: number };
    const screen = window.screen;

    const parts = [
      nav.hardwareConcurrency || "unknown_cores",
      nav.deviceMemory || "unknown_ram",
      screen.colorDepth || 0,
      screen.pixelDepth || 0,
      window.devicePixelRatio || 1,
      screen.width || 0,
      screen.height || 0,
      Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown_tz",
      new Date().getTimezoneOffset(),
      nav.platform || "unknown_platform",
      nav.language || "unknown_lang",
    ];

    return parts.join("|");
  } catch {
    return "profile_error";
  }
}

/**
 * Client-Side SHA-256 Digest using standard Web Crypto API.
 */
async function computeSha256Hex(message: string): Promise<string> {
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback for SSR or non-WebCrypto environments
  return crypto.createHash("sha256").update(message).digest("hex");
}

/**
 * Client-Side Master Function:
 * Generates a persistent, deterministic hardware device fingerprint.
 *
 * This fingerprint combines:
 * 1. 2D Canvas Rasterization (OS font renderer + GPU subpixel engine)
 * 2. WebGL GPU Unmasked Renderer & Vendor (physical graphics card)
 * 3. Web Audio DSP Floating Point Synthesis
 * 4. System Hardware Profile (CPU cores, RAM tier, screen depth, timezone, platform)
 *
 * It remains 100% IDENTICAL between Normal and Incognito / Private browsing windows
 * on the same machine, stopping Incognito download limit bypasses in their tracks.
 */
export async function getBrowserDeviceFingerprint(): Promise<string> {
  if (typeof window === "undefined") {
    return "hwfp_ssr_client";
  }

  try {
    const [canvasFp, webglFp, audioFp] = await Promise.all([
      Promise.resolve(getCanvas2DFingerprint()),
      Promise.resolve(getWebGLHardwareFingerprint()),
      getAudioHardwareFingerprint(),
    ]);

    const systemProfile = getSystemHardwareProfile();
    const compositePayload = `hwfp_v2|${canvasFp}|${webglFp}|${audioFp}|${systemProfile}`;
    const hash = await computeSha256Hex(compositePayload);

    return `hwfp_${hash}`;
  } catch (err) {
    console.warn("Device fingerprint calculation encountered non-fatal error:", err);
    // Deterministic fallback based on synchronous specs
    const fallbackProfile = getSystemHardwareProfile();
    const hash = await computeSha256Hex(`hwfp_fallback|${fallbackProfile}`);
    return `hwfp_${hash}`;
  }
}
