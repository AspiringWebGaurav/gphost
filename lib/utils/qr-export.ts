/**
 * Utility functions for exporting and downloading QR codes rendered via SVG
 * in PNG (high-resolution with canvas) or vector SVG format, and copying to clipboard.
 */

export interface QrExportOptions {
  filename?: string;
  title?: string;
  subtitle?: string;
  size?: number;
}

/**
 * Downloads an SVG QR code element as a high-resolution PNG image with clean margins and branding.
 */
export async function downloadQrCodePng(
  svgElement: SVGElement | string,
  options: QrExportOptions = {}
): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const svg =
    typeof svgElement === "string"
      ? (document.getElementById(svgElement) as SVGElement | null)
      : svgElement;

  if (!svg) {
    console.error("downloadQrCodePng: SVG element not found");
    return false;
  }

  const filename = options.filename || "gphost-qr-code";
  const cleanFilename = filename.endsWith(".png") ? filename : `${filename}.png`;
  const title = options.title;
  const subtitle = options.subtitle;

  try {
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.crossOrigin = "anonymous";

    return await new Promise<boolean>((resolve) => {
      img.onload = () => {
        const qrSize = options.size || 512;
        const padding = 36;
        const headerHeight = title ? 44 : 0;
        const footerHeight = 36;
        const canvasWidth = qrSize + padding * 2;
        const canvasHeight = qrSize + padding * 2 + headerHeight + footerHeight;

        const canvas = document.createElement("canvas");
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(false);
          return;
        }

        // 1. Crisp white background with rounded inner card feel
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // 2. Optional Header Title
        let currentY = padding;
        if (title) {
          ctx.fillStyle = "#0f172a";
          ctx.font = "bold 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
          ctx.textAlign = "center";
          // Truncate long title
          const maxTitleChars = 34;
          const displayTitle = title.length > maxTitleChars ? `${title.slice(0, maxTitleChars)}...` : title;
          ctx.fillText(displayTitle, canvasWidth / 2, currentY + 16);

          if (subtitle) {
            ctx.fillStyle = "#64748b";
            ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
            ctx.fillText(subtitle, canvasWidth / 2, currentY + 34);
          }
          currentY += headerHeight;
        }

        // 3. Render QR Code
        ctx.drawImage(img, padding, currentY, qrSize, qrSize);

        // 4. Subtle Footer Branding
        const footerY = currentY + qrSize + 22;
        ctx.fillStyle = "#94a3b8";
        ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Scan with camera or QR reader • GPHost", canvasWidth / 2, footerY);

        URL.revokeObjectURL(url);

        canvas.toBlob((blob) => {
          if (!blob) {
            resolve(false);
            return;
          }
          const downloadLink = document.createElement("a");
          downloadLink.download = cleanFilename;
          downloadLink.href = URL.createObjectURL(blob);
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
          setTimeout(() => URL.revokeObjectURL(downloadLink.href), 1000);
          resolve(true);
        }, "image/png");
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(false);
      };

      img.src = url;
    });
  } catch (err) {
    console.error("Failed to export QR PNG:", err);
    return false;
  }
}

/**
 * Downloads an SVG QR code as a clean standalone vector SVG file.
 */
export function downloadQrCodeSvg(
  svgElement: SVGElement | string,
  filename: string = "gphost-qr-code.svg"
): boolean {
  if (typeof window === "undefined") return false;

  const svg =
    typeof svgElement === "string"
      ? (document.getElementById(svgElement) as SVGElement | null)
      : svgElement;

  if (!svg) {
    console.error("downloadQrCodeSvg: SVG element not found");
    return false;
  }

  const cleanFilename = filename.endsWith(".svg") ? filename : `${filename}.svg`;

  try {
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const downloadLink = document.createElement("a");
    downloadLink.download = cleanFilename;
    downloadLink.href = URL.createObjectURL(blob);
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    setTimeout(() => URL.revokeObjectURL(downloadLink.href), 1000);
    return true;
  } catch (err) {
    console.error("Failed to export QR SVG:", err);
    return false;
  }
}

/**
 * Copies the QR code PNG image directly to system clipboard for instant pasting.
 */
export async function copyQrCodeImage(
  svgElement: SVGElement | string
): Promise<boolean> {
  if (typeof window === "undefined" || !navigator.clipboard?.write) return false;

  const svg =
    typeof svgElement === "string"
      ? (document.getElementById(svgElement) as SVGElement | null)
      : svgElement;

  if (!svg) return false;

  try {
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.crossOrigin = "anonymous";

    return await new Promise<boolean>((resolve) => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 512;
        const padding = 28;
        canvas.width = size + padding * 2;
        canvas.height = size + padding * 2;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(false);
          return;
        }

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, padding, padding, size, size);
        URL.revokeObjectURL(url);

        canvas.toBlob(async (blob) => {
          if (!blob) {
            resolve(false);
            return;
          }
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ "image/png": blob }),
            ]);
            resolve(true);
          } catch {
            resolve(false);
          }
        }, "image/png");
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(false);
      };

      img.src = url;
    });
  } catch {
    return false;
  }
}
