"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Archive,
  File,
  Folder,
  Download,
  Loader2,
  Search,
} from "lucide-react";
import { inspectZipArchive, extractZipEntry, type ZipEntry } from "@/lib/storage/zip-inspector";

interface ZipViewerModalProps {
  filename: string;
  fileSource: File | string; // File object or direct download URL
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function ZipViewerModal({ filename, fileSource, onClose }: ZipViewerModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<ZipEntry[]>([]);
  const [totalUncompressedBytes, setTotalUncompressedBytes] = useState(0);
  const [rawBuffer, setRawBuffer] = useState<ArrayBuffer | null>(null);
  const [downloadingEntry, setDownloadingEntry] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadZip() {
      setLoading(true);
      setError(null);

      try {
        let buffer: ArrayBuffer;
        if (typeof fileSource === "string") {
          const res = await fetch(fileSource);
          if (!res.ok) throw new Error("Failed to fetch archive from storage.");
          buffer = await res.arrayBuffer();
        } else {
          buffer = await fileSource.arrayBuffer();
        }

        if (cancelled) return;
        setRawBuffer(buffer);

        const result = await inspectZipArchive(buffer);
        if (cancelled) return;

        setEntries(result.entries);
        setTotalUncompressedBytes(result.totalUncompressedBytes);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to parse ZIP archive.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadZip();
    return () => {
      cancelled = true;
    };
  }, [fileSource]);

  const handleExtractSingle = async (entry: ZipEntry) => {
    if (!rawBuffer || entry.isDirectory) return;
    setDownloadingEntry(entry.filename);

    try {
      const blob = await extractZipEntry(rawBuffer, entry);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Download only the basename of the entry
      const simpleName = entry.filename.split("/").filter(Boolean).pop() || "extracted_file";
      a.download = simpleName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert(`Extraction failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setDownloadingEntry(null);
    }
  };

  const filteredEntries = entries.filter((entry) =>
    entry.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-muted/20 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Archive className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate max-w-sm sm:max-w-md" title={filename}>
                {filename}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                In-Browser ZIP Explorer &bull; Client-Side Decompression
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content area */}
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
            <p className="text-xs">Inspecting archive structure in browser...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs text-rose-500">
            <p className="font-semibold mb-1">Could not read archive</p>
            <p className="text-muted-foreground">{error}</p>
          </div>
        ) : (
          <>
            {/* Meta bar & Search */}
            <div className="px-4 py-2.5 bg-muted/10 border-b border-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 text-xs shrink-0">
              <div className="flex items-center gap-3 text-muted-foreground">
                <span>
                  <strong className="text-foreground">{entries.filter((e) => !e.isDirectory).length}</strong> files
                </span>
                <span>&bull;</span>
                <span>
                  Uncompressed: <strong className="text-foreground">{formatBytes(totalUncompressedBytes)}</strong>
                </span>
              </div>

              <div className="relative flex-1 sm:max-w-xs">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Filter files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                />
              </div>
            </div>

            {/* Entry list */}
            <div className="flex-1 overflow-y-auto divide-y divide-border/40 p-2">
              {filteredEntries.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground">
                  No files matching search criteria.
                </div>
              ) : (
                filteredEntries.map((entry, idx) => (
                  <div
                    key={`${entry.filename}-${idx}`}
                    className="flex items-center justify-between py-2 px-2.5 hover:bg-muted/40 rounded-lg transition-colors text-xs group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-3">
                      {entry.isDirectory ? (
                        <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                      ) : (
                        <File className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-foreground" />
                      )}
                      <span
                        className={`truncate font-mono ${
                          entry.isDirectory ? "text-muted-foreground font-semibold" : "text-foreground"
                        }`}
                        title={entry.filename}
                      >
                        {entry.filename}
                      </span>
                    </div>

                    {!entry.isDirectory && (
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {formatBytes(entry.uncompressedSize)}
                        </span>
                        <button
                          onClick={() => handleExtractSingle(entry)}
                          disabled={downloadingEntry === entry.filename}
                          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/80 transition cursor-pointer disabled:opacity-50"
                          title="Extract and download this single file"
                        >
                          {downloadingEntry === entry.filename ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="p-3 border-t border-border bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground shrink-0">
          <span>Files are parsed client-side without streaming through the server.</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg border border-border text-foreground hover:bg-muted transition text-xs font-medium cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
