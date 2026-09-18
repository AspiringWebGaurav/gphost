/**
 * Client-Side In-Browser ZIP Archive Inspector & Extractor.
 *
 * 100% Native TypeScript / Web Standards (DataView + Compression Streams API).
 * - 0 external npm dependencies
 * - 0 bytes Vercel CPU / bandwidth
 * - Inspects central directory records and extracts files directly in the browser
 */

export interface ZipEntry {
  filename: string;
  compressedSize: number;
  uncompressedSize: number;
  isDirectory: boolean;
  compressionMethod: number; // 0 = store, 8 = deflate
  localHeaderOffset: number;
}

export interface ZipInspectionResult {
  totalFiles: number;
  totalUncompressedBytes: number;
  entries: ZipEntry[];
}

/**
 * Parses the Central Directory of a ZIP file to list all contained files and folders.
 */
export async function inspectZipArchive(fileOrBuffer: File | ArrayBuffer): Promise<ZipInspectionResult> {
  const buffer = fileOrBuffer instanceof File ? await fileOrBuffer.arrayBuffer() : fileOrBuffer;
  const view = new DataView(buffer);
  const length = buffer.byteLength;

  if (length < 22) {
    throw new Error("Invalid ZIP file: file too small.");
  }

  // 1. Locate the End of Central Directory (EOCD) signature: 0x06054b50 ("PK\x05\x06")
  let eocdOffset = -1;
  const maxSearch = Math.min(length, 65557); // 22 bytes EOCD + max comment 65535 bytes

  for (let i = length - 22; i >= length - maxSearch; i--) {
    if (
      view.getUint32(i, true) === 0x06054b50
    ) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error("End of Central Directory record not found. Not a valid ZIP file.");
  }

  const centralDirSize = view.getUint32(eocdOffset + 12, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  if (centralDirOffset + centralDirSize > length) {
    throw new Error("Corrupt ZIP central directory offset.");
  }

  // 2. Parse Central Directory entries
  const entries: ZipEntry[] = [];
  let offset = centralDirOffset;
  let totalUncompressedBytes = 0;

  while (offset < centralDirOffset + centralDirSize) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x02014b50) {
      break; // Not a central directory file header ("PK\x01\x02")
    }

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const filenameLength = view.getUint16(offset + 28, true);
    const extraFieldLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    const filenameBytes = new Uint8Array(buffer, offset + 46, filenameLength);
    const filename = new TextDecoder("utf-8").decode(filenameBytes);

    const isDirectory = filename.endsWith("/") || (compressedSize === 0 && uncompressedSize === 0 && filename.endsWith("/"));

    entries.push({
      filename,
      compressedSize,
      uncompressedSize,
      isDirectory,
      compressionMethod,
      localHeaderOffset,
    });

    if (!isDirectory) {
      totalUncompressedBytes += uncompressedSize;
    }

    offset += 46 + filenameLength + extraFieldLength + commentLength;
  }

  return {
    totalFiles: entries.filter((e) => !e.isDirectory).length,
    totalUncompressedBytes,
    entries,
  };
}

/**
 * Extracts a single file entry from a ZIP buffer into a downloadable Blob.
 * Supports Store (method 0) and Deflate (method 8 via native DecompressionStream).
 */
export async function extractZipEntry(
  fileOrBuffer: File | ArrayBuffer,
  entry: ZipEntry
): Promise<Blob> {
  const buffer = fileOrBuffer instanceof File ? await fileOrBuffer.arrayBuffer() : fileOrBuffer;
  const view = new DataView(buffer);

  const localOffset = entry.localHeaderOffset;
  const sig = view.getUint32(localOffset, true);
  if (sig !== 0x04034b50) {
    throw new Error("Invalid local file header in ZIP.");
  }

  const nameLen = view.getUint16(localOffset + 26, true);
  const extraLen = view.getUint16(localOffset + 28, true);
  const dataStart = localOffset + 30 + nameLen + extraLen;

  const compressedData = new Uint8Array(buffer, dataStart, entry.compressedSize);

  if (entry.compressionMethod === 0) {
    // Uncompressed (Stored)
    return new Blob([compressedData]);
  } else if (entry.compressionMethod === 8) {
    // Deflate compression - decompress natively via browser stream
    if (typeof DecompressionStream !== "undefined") {
      const ds = new DecompressionStream("deflate-raw");
      const stream = new Response(compressedData).body?.pipeThrough(ds);
      if (!stream) throw new Error("Failed to initialize DecompressionStream.");
      const decompressedArrayBuffer = await new Response(stream).arrayBuffer();
      return new Blob([decompressedArrayBuffer]);
    } else {
      throw new Error("DecompressionStream is not supported in this browser.");
    }
  } else {
    throw new Error(`Unsupported compression method: ${entry.compressionMethod}`);
  }
}
