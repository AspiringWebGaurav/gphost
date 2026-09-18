"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  UploadCloud,
  File as FileIcon,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  Zap,
  ShieldCheck,
  Copy,
  Check,
  Share2,
  Activity,
  Files,
  RotateCw,
} from "lucide-react";
import { EXPIRY_OPTIONS, type ExpiryPreset } from "@/lib/storage/expiry";
import { storageEvents } from "@/lib/storage/events";
import { generateE2EKey, encryptBuffer } from "@/lib/crypto/e2e";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ExpiryStatusBadge } from "@/components/ui/expiry-status-badge";
import { FileAnalyticsModal } from "@/components/dashboard/file-analytics-modal";
import { ShareModal, type FileItem } from "@/components/dashboard/share-modal";

interface UploadZoneProps {
  canCreatePermanent: boolean;
  isAdmin: boolean;
  onUploadSuccess?: () => void;
  compact?: boolean;
}

const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100 MB
const MULTIPART_PART_SIZE = 10 * 1024 * 1024; // 10 MB

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function UploadZone({ canCreatePermanent, isAdmin, onUploadSuccess, compact = false }: UploadZoneProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [expiryPreset, setExpiryPreset] = useState<ExpiryPreset>("30d");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState<number>(0);
  const [uploadSpeed, setUploadSpeed] = useState<string>("");
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [statusText, setStatusText] = useState<string>("");
  const [copiedKey, setCopiedKey] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [enableZeroTrust, setEnableZeroTrust] = useState<boolean>(false);
  const [successFile, setSuccessFile] = useState<{
    id: string;
    filename: string;
    size: number;
    mimeType?: string;
    expiresAt: string | null;
    e2eKeyFragment?: string;
  } | null>(null);
  const [shareFile, setShareFile] = useState<FileItem | null>(null);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileControlsRef = useRef<HTMLDivElement>(null);
  const successHubRef = useRef<HTMLDivElement>(null);
  const progressCardRef = useRef<HTMLDivElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const startTimeRef = useRef<number>(0);

  // Auto-scroll on mobile/desktop when file is selected so expire time & upload button are immediately in view
  useEffect(() => {
    if (selectedFile) {
      const timer = setTimeout(() => {
        fileControlsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedFile]);

  // Auto-scroll when upload is in-progress
  useEffect(() => {
    if (uploading) {
      const timer = setTimeout(() => {
        progressCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [uploading]);

  // Auto-scroll when upload completes
  useEffect(() => {
    if (successFile) {
      const timer = setTimeout(() => {
        successHubRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [successFile]);

  const handleFileChange = (file: File) => {
    setErrorMsg(null);
    setSuccessFile(null);
    setShareFile(null);
    setProgress(0);
    setUploadedBytes(0);
    setUploadSpeed("");
    setEtaSeconds(null);

    if (file.size > 1073741824) {
      setErrorMsg("File exceeds the maximum allowed size of 1 GB.");
      return;
    }

    setSelectedFile(file);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  }, []);

  const cancelUpload = () => {
    isCancelledRef.current = true;
    if (xhrRef.current) {
      xhrRef.current.abort();
    }
    setUploading(false);
    setStatusText("Upload cancelled");
  };

  // Unmount cleanup
  useEffect(() => {
    return () => {
      isCancelledRef.current = true;
      if (xhrRef.current) {
        xhrRef.current.abort();
      }
    };
  }, []);

  const startUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setProgress(0);
    setUploadedBytes(0);
    setUploadSpeed("");
    setEtaSeconds(null);
    setErrorMsg(null);
    setSuccessFile(null);
    setShareFile(null);
    setStatusText("Reserving quota and initiating upload...");
    isCancelledRef.current = false;

    try {
      let fileToUpload: File = selectedFile;
      let e2eKeyFragment: string | undefined;

      if (enableZeroTrust) {
        setStatusText("Encrypting file locally with zero-trust AES-GCM 256...");
        const { key, base64Key } = await generateE2EKey();
        const fileBuffer = await selectedFile.arrayBuffer();
        const encryptedBuffer = await encryptBuffer(fileBuffer, key);
        e2eKeyFragment = `#key=${base64Key}`;
        fileToUpload = new File([encryptedBuffer], selectedFile.name, {
          type: "application/octet-stream",
        });
      }

      const mimeType = fileToUpload.type || "application/octet-stream";

      // 1. Initiate Upload Route
      const initRes = await fetch("/api/files/initiate-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: fileToUpload.name,
          byte_size: fileToUpload.size,
          mime_type: mimeType,
          expiry_preset: expiryPreset,
        }),
      });

      if (!initRes.ok) {
        const data = await initRes.json().catch(() => ({}));
        throw new Error(data.message || data.error || "Failed to initiate upload");
      }

      const initData = await initRes.json();
      const { fileId, uploadType } = initData;

      if (uploadType === "single") {
        // Direct Single-Part Upload via XMLHttpRequest
        setStatusText("Uploading directly to Cloudflare R2 edge...");
        startTimeRef.current = Date.now();
        setUploadedBytes(0);
        setUploadSpeed("");
        setEtaSeconds(null);

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhrRef.current = xhr;

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.min(95, Math.round((e.loaded / e.total) * 92));
              setProgress(pct);
              setUploadedBytes(e.loaded);

              const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
              if (elapsedSec > 0.25) {
                const speed = e.loaded / elapsedSec;
                setUploadSpeed(`${formatBytes(speed)}/s`);
                const remainingBytes = Math.max(0, e.total - e.loaded);
                const eta = speed > 0 ? Math.ceil(remainingBytes / speed) : 0;
                setEtaSeconds(eta);
              }
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Storage provider rejected upload (HTTP ${xhr.status})`));
            }
          };

          xhr.onerror = () => {
            reject(
              new Error(
                "Network error during direct upload to R2 (CORS not configured on this bucket). Please add a CORS policy in your Cloudflare R2 bucket settings."
              )
            );
          };
          xhr.onabort = () => reject(new Error("Upload cancelled"));

          xhr.open("PUT", initData.presignedUrl, true);
          xhr.setRequestHeader("Content-Type", mimeType);
          xhr.send(fileToUpload);
        });
      } else {
        // Multipart Upload Flow (>= 100 MB)
        setStatusText("Preparing multipart chunks for Cloudflare R2...");
        startTimeRef.current = Date.now();
        setUploadedBytes(0);
        setUploadSpeed("");
        setEtaSeconds(null);

        const CONCURRENCY = 3;
        const totalParts = Math.ceil(fileToUpload.size / MULTIPART_PART_SIZE);
        const uploadedParts: { partNumber: number; eTag: string }[] = new Array(totalParts);
        let completedPartsCount = 0;
        let bytesUploadedCumulative = 0;

        const queue = Array.from({ length: totalParts }, (_, idx) => idx + 1);

        const uploadWorker = async () => {
          while (queue.length > 0) {
            if (isCancelledRef.current) {
              throw new Error("Upload cancelled");
            }

            const partNumber = queue.shift()!;
            const start = (partNumber - 1) * MULTIPART_PART_SIZE;
            const end = Math.min(start + MULTIPART_PART_SIZE, fileToUpload.size);
            const chunk = fileToUpload.slice(start, end);
            const chunkSize = end - start;

            let attempts = 0;
            let partSuccess = false;
            let lastErr: Error | null = null;

            while (attempts < 2 && !partSuccess) {
              if (isCancelledRef.current) throw new Error("Upload cancelled");
              attempts++;
              try {
                const signRes = await fetch("/api/files/multipart/sign-part", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    fileId,
                    uploadId: initData.uploadId,
                    partNumber,
                  }),
                });

                if (!signRes.ok) {
                  const errData = await signRes.json().catch(() => ({}));
                  throw new Error(errData.error || `Failed to sign part ${partNumber}`);
                }

                const { presignedUrl } = await signRes.json();

                const uploadPartRes = await fetch(presignedUrl, {
                  method: "PUT",
                  body: chunk,
                });

                if (!uploadPartRes.ok) {
                  throw new Error(`Failed to upload part ${partNumber} (HTTP ${uploadPartRes.status})`);
                }

                const rawEtag = uploadPartRes.headers.get("ETag");
                if (!rawEtag) {
                  throw new Error(`Storage provider missing ETag for part ${partNumber}`);
                }

                uploadedParts[partNumber - 1] = {
                  partNumber,
                  eTag: rawEtag.replace(/^"|"$/g, ""),
                };

                partSuccess = true;
              } catch (err: unknown) {
                lastErr = err instanceof Error ? err : new Error(`Failed part ${partNumber}`);
                if (attempts >= 2) throw lastErr;
                await new Promise((r) => setTimeout(r, 200));
              }
            }

            completedPartsCount++;
            bytesUploadedCumulative += chunkSize;
            setUploadedBytes(bytesUploadedCumulative);

            const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
            if (elapsedSec > 0.25) {
              const speed = bytesUploadedCumulative / elapsedSec;
              setUploadSpeed(`${formatBytes(speed)}/s`);
              const remainingBytes = Math.max(0, fileToUpload.size - bytesUploadedCumulative);
              const eta = speed > 0 ? Math.ceil(remainingBytes / speed) : 0;
              setEtaSeconds(eta);
            }

            const pct = Math.round((completedPartsCount / totalParts) * 90);
            setProgress(pct);
            setStatusText(
              `Uploading parts in parallel (${completedPartsCount}/${totalParts} complete)...`
            );
          }
        };

        const workers = Array.from(
          { length: Math.min(CONCURRENCY, totalParts) },
          () => uploadWorker()
        );

        await Promise.all(workers);

        // Finalize Multipart Parts
        setStatusText("Assembling and verifying multipart chunks on R2...");
        const compPartsRes = await fetch("/api/files/multipart/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId,
            uploadId: initData.uploadId,
            parts: uploadedParts,
          }),
        });

        if (!compPartsRes.ok) {
          const errData = await compPartsRes.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to finalize multipart upload");
        }
      }

      // Authoritative Server Verification via HeadObject
      setStatusText("Verifying storage integrity and committing quota...");
      setProgress(95);

      const completeRes = await fetch("/api/files/complete-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      });

      if (!completeRes.ok) {
        const compErr = await completeRes.json().catch(() => ({}));
        throw new Error(compErr.message || compErr.error || "Verification failed");
      }

      const completedData = await completeRes.json();
      setProgress(100);
      setUploadedBytes(fileToUpload.size);
      setEtaSeconds(0);
      setStatusText("Upload complete and verified!");
      setSuccessFile({
        id: fileId,
        filename: completedData.file.sanitized_name || fileToUpload.name,
        size: completedData.file.byte_size || fileToUpload.size,
        mimeType: completedData.file.mime_type || mimeType,
        expiresAt: completedData.file.expires_at || null,
        e2eKeyFragment,
      });
      setSelectedFile(null);

      const fileSize = completedData.file.byte_size || fileToUpload.size;
      storageEvents.emit("file:lifecycle", {
        fileId,
        filename: completedData.file.sanitized_name || fileToUpload.name,
        size: fileSize,
        action: "created",
      });

      if (onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (err: unknown) {
      if (!isCancelledRef.current) {
        setErrorMsg(err instanceof Error ? err.message : "Upload encountered an error");
      }
    } finally {
      setUploading(false);
      xhrRef.current = null;
    }
  };

  return (
    <div className={`w-full ${compact ? "space-y-3" : "space-y-4"}`}>
      {/* 1. Dropzone container (Full size when empty; collapsed into slim banner when file is selected; hidden when upload is completed) */}
      {!successFile && !uploading && (
        !selectedFile ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl transition-all duration-200 cursor-pointer flex flex-col items-center justify-center text-center ${
              compact ? "p-5" : "p-6 sm:p-8"
            } ${
              isDragOver
                ? "border-blue-500 bg-blue-500/10 scale-[1.005]"
                : "border-border hover:border-border/80 bg-card hover:bg-muted/40"
            } ${uploading ? "pointer-events-none opacity-80" : ""}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              data-testid="file-upload-input"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileChange(e.target.files[0]);
                }
              }}
              disabled={uploading}
            />

            <div
              className={`${
                compact ? "w-10 h-10 mb-2.5" : "w-12 sm:w-14 h-12 sm:h-14 mb-3 sm:mb-4"
              } rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 dark:text-blue-400 shadow-sm shadow-blue-500/5`}
            >
              <UploadCloud className={compact ? "w-5 h-5" : "w-6 sm:w-7 h-6 sm:h-7"} />
            </div>

            <h3 className={`${compact ? "text-sm" : "text-sm sm:text-base"} font-semibold text-foreground mb-1`}>
              {isDragOver ? "Drop file to upload" : "Drag and drop your file here, or browse"}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              Maximum single-file size: 1 GB. Fast direct upload.
            </p>
          </div>
        ) : (
          /* Sleek collapsed trigger banner when file is chosen */
          <div
            onClick={() => !uploading && fileInputRef.current?.click()}
            className="p-2.5 sm:p-3 rounded-xl border border-dashed border-border/80 bg-muted/25 hover:bg-muted/40 flex items-center justify-between gap-2 text-xs text-muted-foreground transition cursor-pointer"
          >
            <input
              ref={fileInputRef}
              type="file"
              data-testid="file-upload-input"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileChange(e.target.files[0]);
                }
              }}
              disabled={uploading}
            />
            <div className="flex items-center gap-2 truncate">
              <UploadCloud className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="truncate">File ready to upload. Click to choose a different file.</span>
            </div>
            <span className="text-blue-600 dark:text-blue-400 font-semibold shrink-0 hover:underline flex items-center gap-1">
              <RotateCw className="w-3 h-3" />
              <span>Change</span>
            </span>
          </div>
        )
      )}

      {/* 2. Selected File Details & Controls (Hero on Mobile & Desktop) */}
      {selectedFile && !uploading && (
        <div
          ref={fileControlsRef}
          data-testid="selected-file-controls"
          className="p-3.5 sm:p-4 rounded-xl bg-card border border-border shadow-xs flex flex-col gap-3 transition-all animate-in fade-in slide-in-from-top-2 duration-200"
        >
          {/* Top row: File info and Clear action */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 overflow-hidden min-w-0">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0">
                <FileIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate max-w-[200px] xs:max-w-xs sm:max-w-md">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{formatBytes(selectedFile.size)}</span> •{" "}
                  <span className="text-[11px] text-muted-foreground/90">
                    {selectedFile.size >= MULTIPART_THRESHOLD ? "Multipart Chunking" : "Direct Edge Upload"}
                  </span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedFile(null)}
              className="p-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
              title="Clear selected file"
              aria-label="Clear selected file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Middle row: Expiration setting & Zero-trust option */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 border-t border-border/60">
            {/* Expiry Selector */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5 shrink-0">
                <Clock className="w-3.5 h-3.5 text-blue-500" />
                <span>Expires:</span>
              </label>
              <div className="flex-1 sm:flex-initial flex items-center bg-muted/40 hover:bg-muted/60 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground transition-colors">
                <select
                  value={expiryPreset}
                  onChange={(e) => setExpiryPreset(e.target.value as ExpiryPreset)}
                  className="bg-transparent border-none focus:outline-none text-xs text-foreground cursor-pointer w-full"
                  aria-label="File expiration preset"
                >
                  {EXPIRY_OPTIONS.map((opt) => {
                    if (opt.requiresPerm && !isAdmin && !canCreatePermanent) {
                      return null;
                    }
                    return (
                      <option
                        key={opt.value}
                        value={opt.value}
                        className={`bg-card text-foreground ${
                          opt.value === "never" ? "text-purple-600 dark:text-purple-300 font-medium" : ""
                        }`}
                      >
                        {opt.label}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Zero-Trust E2E Toggle */}
            <div
              className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-all border shrink-0 ${
                enableZeroTrust
                  ? "bg-emerald-500/10 border-emerald-500/35 text-emerald-700 dark:text-emerald-300 shadow-xs"
                  : "bg-muted/40 hover:bg-muted/70 border-border text-foreground"
              }`}
            >
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableZeroTrust}
                  onChange={(e) => setEnableZeroTrust(e.target.checked)}
                  className="rounded border-border text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer accent-emerald-600"
                />
                <ShieldCheck
                  className={`w-3.5 h-3.5 transition-colors ${
                    enableZeroTrust ? "text-emerald-500" : "text-muted-foreground"
                  }`}
                />
                <span className={enableZeroTrust ? "font-semibold text-emerald-700 dark:text-emerald-300" : "text-foreground"}>
                  <span>End-to-End </span>Encrypt
                </span>
              </label>
              <InfoTooltip
                variant="emerald"
                title="End-to-End (Zero-Trust) Encryption"
                content="Encrypts file directly in your browser before upload with AES-GCM 256. Decryption key is placed only in your link (#key=...) and is never stored on servers."
              />
            </div>
          </div>

          {/* Bottom row: Primary Action Buttons */}
          <div className="flex items-center gap-2 pt-1 border-t border-border/60">
            <button
              type="button"
              onClick={() => setSelectedFile(null)}
              className="px-3.5 py-2 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={startUpload}
              data-testid="upload-button-trigger"
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-sm shadow-blue-600/20 active:scale-[0.99] transition-all cursor-pointer"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Upload File Now</span>
            </button>
          </div>

          {/* Zero-Trust Info banner when active */}
          {enableZeroTrust && (
            <div className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-900 dark:text-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed text-muted-foreground">
                Zero-knowledge active. File is encrypted locally before transmission. The decryption key will be attached to your share link.
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Uploading In-Progress Status Bar */}
      {uploading && (
        <div
          ref={progressCardRef}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-card via-card to-card/90 border border-blue-500/30 p-4 sm:p-5 shadow-lg shadow-blue-500/5 backdrop-blur-sm space-y-3.5 transition-all"
        >
          <div className="absolute -top-12 -right-12 w-36 h-36 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

          {/* Header Row: Stage description + Percentage + Cancel */}
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/25 flex items-center justify-center text-blue-500 dark:text-blue-400 shrink-0 shadow-xs">
                <UploadCloud className="w-4 h-4 animate-pulse" />
                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate flex items-center gap-1.5">
                  <span className="truncate">{selectedFile?.name || "Uploading file..."}</span>
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                    ({formatBytes(selectedFile?.size || 0)})
                  </span>
                </p>
                <div className="flex items-center gap-1.5 text-[11px] text-blue-600 dark:text-blue-400 font-medium mt-0.5">
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                  <span className="truncate">{statusText}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <div className="flex items-baseline gap-0.5 px-2.5 py-1 rounded-md bg-blue-500/10 border border-blue-500/25 shadow-xs">
                <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                  {progress}
                </span>
                <span className="text-[10px] text-blue-600/70 dark:text-blue-400/70 font-bold">%</span>
              </div>
              <button
                type="button"
                onClick={cancelUpload}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all cursor-pointer"
                title="Cancel Upload"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Crisp Multi-Layer Shimmer Progress Bar */}
          <div className="relative w-full h-2.5 sm:h-3 rounded-full bg-muted/60 dark:bg-zinc-800/80 p-0.5 border border-border/70 dark:border-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)] overflow-hidden">
            <div
              className="relative h-full rounded-full bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400 transition-all duration-300 ease-out shadow-[0_0_12px_rgba(59,130,246,0.5)] overflow-hidden"
              style={{ width: `${Math.max(2, progress)}%` }}
            >
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent animate-progress-shimmer" />
              <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-white rounded-full shadow-[0_0_6px_#fff]" />
            </div>
          </div>

          {/* Telemetry Bar */}
          <div className="flex flex-wrap items-center justify-between gap-y-1.5 text-[11px] font-mono text-muted-foreground pt-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-foreground font-semibold">{formatBytes(uploadedBytes)}</span>
              <span>/</span>
              <span>{formatBytes(selectedFile?.size || 0)}</span>
            </div>

            <div className="flex items-center gap-3">
              {uploadSpeed && (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                  <Zap className="w-3 h-3 text-emerald-500 fill-emerald-500/30" />
                  <span>{uploadSpeed}</span>
                </span>
              )}
              {etaSeconds !== null && etaSeconds > 0 && progress < 100 ? (
                <span className="text-muted-foreground">
                  ~{etaSeconds < 60 ? `${etaSeconds}s` : `${Math.ceil(etaSeconds / 60)}m`} left
                </span>
              ) : progress === 100 ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Synced</span>
                </span>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* 4. Error Banner */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-600 dark:text-red-400 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-red-600 dark:text-red-300">Upload Failed</p>
            <p className="mt-0.5 text-muted-foreground">{errorMsg}</p>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 5. Post-Upload Action Hub: Clean, Simple, and Integrated with ShareModal */}
      {successFile && (
        <div
          ref={successHubRef}
          data-testid="post-upload-hub"
          className="p-4 sm:p-5 rounded-2xl bg-card border border-emerald-500/30 shadow-lg space-y-4 animate-in fade-in duration-200"
        >
          {/* Header Row: Success Status & Live Expiry Timer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-border/70">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-foreground truncate" data-testid="upload-success-title">
                  Upload Complete &amp; Verified
                </h4>
                <p className="text-[11px] text-muted-foreground truncate">
                  Direct transfer verified and committed to storage
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
              <ExpiryStatusBadge expiresAt={successFile.expiresAt} size="sm" />
              <button
                type="button"
                onClick={() => {
                  setSuccessFile(null);
                  setShareFile(null);
                }}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                aria-label="Dismiss and upload another"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Uploaded File Details Strip with Clean 'Share with Options' Button */}
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                <FileIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-foreground truncate max-w-xs sm:max-w-md">
                  {successFile.filename}
                </p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  {formatBytes(successFile.size)} • {successFile.mimeType || "Asset"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-stretch sm:self-auto">
              <button
                type="button"
                data-testid="post-upload-share-options-btn"
                onClick={() =>
                  setShareFile({
                    id: successFile.id,
                    sanitized_name: successFile.filename,
                    byte_size: successFile.size,
                    mime_type: successFile.mimeType || "application/octet-stream",
                    status: "ACTIVE",
                    expires_at: successFile.expiresAt,
                    created_at: new Date().toISOString(),
                  })
                }
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share with Options</span>
              </button>
            </div>
          </div>

          {/* Zero-Trust Key Display if enabled */}
          {successFile.e2eKeyFragment && (
            <div className="p-4 rounded-xl bg-card border border-emerald-500/30 dark:border-emerald-500/40 shadow-xs space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-foreground text-xs">
                      <span>Zero-Trust AES-GCM 256 Encryption Active</span>
                      <InfoTooltip
                        variant="emerald"
                        title="What is Zero-Trust Encryption?"
                        content="Your file was encrypted inside your web browser before uploading. The decryption key exists only on your device and was NEVER sent across the internet to our servers. Even GPHosting and Cloudflare cannot view your file content."
                      />
                    </div>
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      Encrypted in-browser • Server holds 0 unencrypted bytes
                    </span>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  E2E Zero-Knowledge
                </span>
              </div>

              <p className="text-muted-foreground text-xs leading-relaxed">
                To share this file, recipients must have the secret decryption key. Append this fragment to your share link URL or copy it directly:
              </p>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-foreground flex items-center gap-1">
                    Secret Decryption Key Fragment
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">Web Crypto API</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={successFile.e2eKeyFragment}
                    className="flex-1 px-3 py-2 rounded-xl bg-muted/50 border border-border font-mono text-xs text-foreground select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(successFile.e2eKeyFragment || "");
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 2000);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs shrink-0"
                  >
                    {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey ? "Copied" : "Copy Key Fragment"}</span>
                  </button>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-amber-500/8 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <span>
                  <strong>Keep this key safe.</strong> Because this is true zero-trust, we do not store your key. If lost, the file cannot be decrypted or recovered by anyone.
                </span>
              </div>
            </div>
          )}

          {/* Action Row: Next Logical Steps */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-border/70">
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="post-upload-analytics-btn"
                onClick={() => setShowAnalyticsModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-medium border border-border transition-colors cursor-pointer"
              >
                <Activity className="w-3.5 h-3.5 text-purple-500" />
                <span>View Analytics</span>
              </button>

              <Link
                href="/files"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-medium border border-border transition-colors cursor-pointer"
              >
                <Files className="w-3.5 h-3.5 text-blue-500" />
                <span>View in Files</span>
              </Link>
            </div>

            <button
              type="button"
              onClick={() => {
                setSuccessFile(null);
                setShareFile(null);
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 text-xs font-semibold transition cursor-pointer"
            >
              <span>+ Upload Another File</span>
            </button>
          </div>
        </div>
      )}

      {/* Share Modal Dialog with Full Options (Clean, consistent, un-bloated) */}
      {shareFile && (
        <ShareModal
          file={shareFile}
          isOpen={Boolean(shareFile)}
          onClose={() => setShareFile(null)}
          isPremium={isAdmin || canCreatePermanent}
        />
      )}

      {/* Analytics Modal from Post-Upload */}
      {showAnalyticsModal && successFile && (
        <FileAnalyticsModal
          fileId={successFile.id}
          filename={successFile.filename}
          onClose={() => setShowAnalyticsModal(false)}
        />
      )}
    </div>
  );
}
