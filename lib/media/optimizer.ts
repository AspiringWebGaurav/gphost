/**
 * Client-Side In-Browser Media Optimizer & Format Converter.
 *
 * Runs 100% inside the user's browser using HTMLCanvasElement / OffscreenCanvas.
 * - 0 bytes Vercel CPU
 * - 0 bytes Vercel bandwidth
 * - Strips EXIF geolocation and camera metadata automatically
 * - Converts heavy PNG/JPEG images into modern, optimized WebP format
 */

export interface ImageOptimizationOptions {
  quality?: number; // 0.1 to 1.0 (default: 0.82)
  maxWidth?: number; // default: 2560
  maxHeight?: number; // default: 2560
  outputFormat?: "image/webp" | "image/jpeg";
}

export interface OptimizationResult {
  file: File;
  originalSize: number;
  optimizedSize: number;
  savingsPercent: number;
  previewUrl: string;
  width: number;
  height: number;
}

const SUPPORTED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/bmp",
  "image/webp",
]);

export function isOptimizableImage(file: File): boolean {
  if (!file || !file.type) return false;
  return SUPPORTED_MIME_TYPES.has(file.type.toLowerCase());
}

/**
 * Optimizes an image file in the browser, resizing if larger than max dimensions,
 * stripping EXIF data, and compressing to WebP format.
 */
export async function optimizeImageInBrowser(
  file: File,
  options: ImageOptimizationOptions = {}
): Promise<OptimizationResult> {
  const {
    quality = 0.82,
    maxWidth = 2560,
    maxHeight = 2560,
    outputFormat = "image/webp",
  } = options;

  if (!isOptimizableImage(file)) {
    throw new Error("Unsupported image format for optimization.");
  }

  return new Promise((resolve, reject) => {
    const originalSize = file.size;
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let targetWidth = img.naturalWidth || img.width;
      let targetHeight = img.naturalHeight || img.height;

      // Scale down proportionally if larger than maximum dimension
      if (targetWidth > maxWidth || targetHeight > maxHeight) {
        const ratio = Math.min(maxWidth / targetWidth, maxHeight / targetHeight);
        targetWidth = Math.round(targetWidth * ratio);
        targetHeight = Math.round(targetHeight * ratio);
      }

      // Create canvas for rendering and metadata stripping
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext("2d", { alpha: true });
      if (!ctx) {
        reject(new Error("Unable to obtain 2D canvas context."));
        return;
      }

      // High quality image smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      // Convert to modern WebP blob
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to encode image to WebP format."));
            return;
          }

          // If optimized file is somehow larger than original, keep original
          if (blob.size >= originalSize && file.type === "image/webp") {
            const previewUrl = URL.createObjectURL(file);
            resolve({
              file,
              originalSize,
              optimizedSize: originalSize,
              savingsPercent: 0,
              previewUrl,
              width: targetWidth,
              height: targetHeight,
            });
            return;
          }

          // Construct clean file name with .webp extension
          const originalName = file.name;
          const dotIndex = originalName.lastIndexOf(".");
          const baseName = dotIndex !== -1 ? originalName.slice(0, dotIndex) : originalName;
          const extension = outputFormat === "image/webp" ? ".webp" : ".jpg";
          const newFileName = `${baseName}${extension}`;

          const optimizedFile = new File([blob], newFileName, {
            type: outputFormat,
            lastModified: Date.now(),
          });

          const optimizedSize = optimizedFile.size;
          const savings = Math.max(0, originalSize - optimizedSize);
          const savingsPercent = Math.round((savings / originalSize) * 100);
          const previewUrl = URL.createObjectURL(blob);

          resolve({
            file: optimizedFile,
            originalSize,
            optimizedSize,
            savingsPercent,
            previewUrl,
            width: targetWidth,
            height: targetHeight,
          });
        },
        outputFormat,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to decode image file."));
    };

    img.src = objectUrl;
  });
}
