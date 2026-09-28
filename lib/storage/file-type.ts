/**
 * Human-friendly file type formatter.
 * Converts raw internal MIME types (e.g. application/vnd.openxmlformats-officedocument.wordprocessingml.document)
 * and file extensions into clean, executive labels like "Word Document", "PDF Document", or "PNG Image".
 * Prevents exposing raw backend MIME types, storage paths, or internal technical strings to the user.
 */

export function getFriendlyFileType(mimeType?: string | null, filename?: string): string {
  const cleanFilename = (filename || "").trim();
  const ext = cleanFilename.includes(".") ? cleanFilename.split(".").pop()?.toUpperCase() : "";
  const lowerMime = (mimeType || "").toLowerCase();

  // Word Documents
  if (
    ext === "DOC" ||
    ext === "DOCX" ||
    lowerMime.includes("wordprocessingml") ||
    lowerMime.includes("msword") ||
    lowerMime.includes("opendocument.text")
  ) {
    return "Word Document";
  }

  // Excel / Spreadsheets
  if (
    ext === "XLS" ||
    ext === "XLSX" ||
    lowerMime.includes("spreadsheetml") ||
    lowerMime.includes("ms-excel")
  ) {
    return "Excel Spreadsheet";
  }

  // PowerPoint Presentations
  if (
    ext === "PPT" ||
    ext === "PPTX" ||
    lowerMime.includes("presentationml") ||
    lowerMime.includes("ms-powerpoint")
  ) {
    return "Presentation";
  }

  // PDF
  if (ext === "PDF" || lowerMime.includes("pdf")) {
    return "PDF Document";
  }

  // Images
  if (
    lowerMime.startsWith("image/") ||
    ["PNG", "JPG", "JPEG", "WEBP", "GIF", "SVG", "ICO", "BMP", "TIFF", "AVIF"].includes(ext || "")
  ) {
    return ext ? `${ext} Image` : "Image";
  }

  // Videos
  if (
    lowerMime.startsWith("video/") ||
    ["MP4", "MKV", "WEBM", "MOV", "AVI", "WMV", "FLV", "M4V"].includes(ext || "")
  ) {
    return ext ? `${ext} Video` : "Video";
  }

  // Audio
  if (
    lowerMime.startsWith("audio/") ||
    ["MP3", "WAV", "OGG", "M4A", "FLAC", "AAC", "WMA"].includes(ext || "")
  ) {
    return ext ? `${ext} Audio` : "Audio";
  }

  // Archives & Compressed Packages
  if (
    lowerMime.includes("zip") ||
    lowerMime.includes("tar") ||
    lowerMime.includes("compressed") ||
    ["ZIP", "TAR", "GZ", "7Z", "RAR", "BZ2", "XZ"].includes(ext || "")
  ) {
    return ext ? `${ext} Archive` : "Compressed Archive";
  }

  // HTML / Webpages
  if (ext === "HTML" || ext === "HTM" || lowerMime.includes("text/html")) {
    return "HTML Document";
  }

  // Data / Code / Text
  if (ext === "CSV" || lowerMime.includes("csv")) {
    return "CSV Spreadsheet";
  }
  if (ext === "JSON" || lowerMime.includes("json")) {
    return "JSON Data";
  }
  if (ext === "MD" || lowerMime.includes("markdown")) {
    return "Markdown File";
  }
  if (ext === "TXT" || lowerMime.startsWith("text/plain")) {
    return "Text Document";
  }

  // Any other known extension (e.g. APK, EXE, DMG, ISO)
  if (ext && ext.length <= 6 && /^[A-Z0-9]+$/.test(ext)) {
    return `${ext} File`;
  }

  // If MIME type has a simple subtype (e.g. application/xml -> XML File)
  if (lowerMime && !lowerMime.includes("vnd.") && !lowerMime.includes("octet-stream")) {
    const sub = lowerMime.split("/")[1]?.toUpperCase();
    if (sub && sub.length <= 6 && /^[A-Z0-9]+$/.test(sub)) {
      return `${sub} File`;
    }
  }

  return "Document";
}
