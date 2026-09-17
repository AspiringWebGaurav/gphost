import { downloadZip } from "client-zip";

export interface BundleZipFile {
  id: string;
  name: string;
  size: number;
}

/**
 * Downloads multiple files and packages them into a ZIP archive directly
 * within the user's browser using client-side Web Streams.
 *
 * Performance & Infrastructure Advantages:
 * - 0 MB Vercel Serverless Function Memory.
 * - 0 ms Vercel Serverless Function CPU Execution timeout.
 * - Files stream in parallel directly from Cloudflare R2 edge presigned URLs.
 */
export async function downloadFilesAsZip(
  files: BundleZipFile[],
  zipName: string = `gphost-bundle-${new Date().toISOString().slice(0, 10)}.zip`,
  onProgress?: (status: { current: number; total: number; filename: string }) => void
): Promise<void> {
  if (files.length === 0) return;

  const fileEntries: { name: string; input: Response | ReadableStream | ArrayBuffer; size: number }[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (onProgress) {
      onProgress({
        current: i + 1,
        total: files.length,
        filename: file.name,
      });
    }

    // 1. Fetch short-lived presigned R2 download URL
    const res = await fetch(`/api/files/${file.id}/download`);
    if (!res.ok) {
      throw new Error(`Failed to authorize download for ${file.name}`);
    }

    const { downloadUrl } = await res.json();

    // 2. Fetch the file content stream from Cloudflare R2
    const fileRes = await fetch(downloadUrl);
    if (!fileRes.ok || !fileRes.body) {
      throw new Error(`Failed to stream ${file.name} from Cloudflare R2`);
    }

    fileEntries.push({
      name: file.name,
      input: fileRes,
      size: file.size,
    });
  }

  // 3. Generate streaming ZIP blob
  const zipBlob = await downloadZip(fileEntries).blob();

  // 4. Trigger download in browser
  const objectUrl = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}
