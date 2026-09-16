"use client";

import React, { useState, useRef, useCallback } from "react";
import {
  UploadCloud,
  File as FileIcon,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  Zap,
} from "lucide-react";
import { EXPIRY_OPTIONS, type ExpiryPreset } from "@/lib/storage/expiry";
import { storageEvents } from "@/lib/storage/events";

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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successFile, setSuccessFile] = useState<{ id: string; filename: string; size: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const startTimeRef = useRef<number>(0);

  const handleFileChange = (file: File) => {
    setErrorMsg(null);
    setSuccessFile(null);
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

  const startUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setProgress(0);
    setUploadedBytes(0);
    setUploadSpeed("");
    setEtaSeconds(null);
    setErrorMsg(null);
    setSuccessFile(null);
    setStatusText("Reserving quota and initiating upload...");
    isCancelledRef.current = false;

    try {
      const mimeType = selectedFile.type || "application/octet-stream";

      // 1. Initiate Upload Route
      const initRes = await fetch("/api/files/initiate-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: selectedFile.name,
          byte_size: selectedFile.size,
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
          xhr.send(selectedFile);
        });
      } else {
        // Multipart Upload Flow (>= 100 MB)
        setStatusText("Preparing multipart chunks for Cloudflare R2...");
        startTimeRef.current = Date.now();
        setUploadedBytes(0);
        setUploadSpeed("");
        setEtaSeconds(null);

        const totalParts = Math.ceil(selectedFile.size / MULTIPART_PART_SIZE);
        const uploadedParts: { partNumber: number; eTag: string }[] = [];

        for (let i = 1; i <= totalParts; i++) {
          if (isCancelledRef.current) {
            throw new Error("Upload cancelled");
          }

          const start = (i - 1) * MULTIPART_PART_SIZE;
          const end = Math.min(start + MULTIPART_PART_SIZE, selectedFile.size);
          const chunk = selectedFile.slice(start, end);

          setStatusText(`Uploading chunk ${i} of ${totalParts} to R2 edge...`);
          const signRes = await fetch("/api/files/multipart/sign-part", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileId,
              uploadId: initData.uploadId,
              partNumber: i,
            }),
          });

          if (!signRes.ok) {
            const errData = await signRes.json().catch(() => ({}));
            throw new Error(errData.error || `Failed to sign part ${i}`);
          }

          const { presignedUrl } = await signRes.json();

          let uploadPartRes: Response;
          try {
            uploadPartRes = await fetch(presignedUrl, {
              method: "PUT",
              body: chunk,
            });
          } catch {
            throw new Error(
              `Network error during direct upload to R2 (CORS not configured on this bucket). Please add a CORS policy in your Cloudflare R2 bucket settings.`
            );
          }

          if (!uploadPartRes.ok) {
            throw new Error(`Failed to upload part ${i} to R2 (HTTP ${uploadPartRes.status})`);
          }

          const rawEtag = uploadPartRes.headers.get("ETag");
          if (!rawEtag) {
            throw new Error(`Storage provider missing ETag for part ${i}`);
          }

          uploadedParts.push({
            partNumber: i,
            eTag: rawEtag.replace(/^"|"$/g, ""),
          });

          const currentUploaded = end;
          setUploadedBytes(currentUploaded);
          const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
          if (elapsedSec > 0.4) {
            const speed = currentUploaded / elapsedSec;
            setUploadSpeed(`${formatBytes(speed)}/s`);
            const remainingBytes = Math.max(0, selectedFile.size - currentUploaded);
            const eta = speed > 0 ? Math.ceil(remainingBytes / speed) : 0;
            setEtaSeconds(eta);
          }

          const pct = Math.round((i / totalParts) * 88);
          setProgress(pct);
        }

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
      setUploadedBytes(selectedFile.size);
      setEtaSeconds(0);
      setStatusText("Upload complete and verified!");
      setSuccessFile({
        id: fileId,
        filename: completedData.file.sanitized_name || selectedFile.name,
        size: completedData.file.byte_size || selectedFile.size,
      });
      setSelectedFile(null);

      const fileSize = completedData.file.byte_size || selectedFile.size;
      storageEvents.emit("file:lifecycle", {
        fileId,
        filename: completedData.file.sanitized_name || selectedFile.name,
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
      {/* Dropzone container */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl transition-all duration-200 cursor-pointer flex flex-col items-center justify-center text-center ${
          compact ? "p-5" : "p-8"
        } ${
          isDragOver
            ? "border-blue-500 bg-blue-500/10 scale-[1.005]"
            : "border-border hover:border-border/80 bg-card hover:bg-muted/40"
        } ${uploading ? "pointer-events-none opacity-80" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
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
            compact ? "w-10 h-10 mb-2.5" : "w-14 h-14 mb-4"
          } rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 dark:text-blue-400 shadow-sm shadow-blue-500/5`}
        >
          <UploadCloud className={compact ? "w-5 h-5" : "w-7 h-7"} />
        </div>

        <h3 className={`${compact ? "text-sm" : "text-base"} font-semibold text-foreground mb-1`}>
          {isDragOver ? "Drop file to upload" : "Drag and drop your file here, or browse"}
        </h3>
        <p className="text-xs text-muted-foreground max-w-sm">
          Maximum single-file size: 1 GB. Fast direct upload.
        </p>
      </div>

      {/* Selected File Details & Controls */}
      {selectedFile && !uploading && (
        <div className="p-4 rounded-xl bg-card border border-border shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
              <FileIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate max-w-xs sm:max-w-md">
                {selectedFile.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatBytes(selectedFile.size)} •{" "}
                {selectedFile.size >= MULTIPART_THRESHOLD ? "Multipart" : "Direct Upload"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto justify-between sm:justify-end">
            {/* Expiry Selector */}
            <div className="flex items-center gap-1.5 bg-muted/40 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <select
                value={expiryPreset}
                onChange={(e) => setExpiryPreset(e.target.value as ExpiryPreset)}
                className="bg-transparent border-none focus:outline-none text-xs text-foreground cursor-pointer"
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

            <button
              onClick={() => setSelectedFile(null)}
              className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Clear
            </button>

            <button
              onClick={startUpload}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm shadow-blue-600/20 transition-all cursor-pointer"
            >
              Upload
            </button>
          </div>
        </div>
      )}

      {/* Uploading In-Progress Status Bar */}
      {uploading && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-card via-card to-card/90 border border-blue-500/30 p-4 sm:p-5 shadow-lg shadow-blue-500/5 backdrop-blur-sm space-y-3.5 transition-all">
          {/* Subtle ambient corner glow */}
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

          {/* Ultra-Crisp Multi-Layer Shimmer Progress Bar */}
          <div className="relative w-full h-2.5 sm:h-3 rounded-full bg-muted/60 dark:bg-zinc-800/80 p-0.5 border border-border/70 dark:border-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)] overflow-hidden">
            <div
              className="relative h-full rounded-full bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400 transition-all duration-300 ease-out shadow-[0_0_12px_rgba(59,130,246,0.5)] overflow-hidden"
              style={{ width: `${Math.max(2, progress)}%` }}
            >
              {/* Animated Glossy Shimmer Beam */}
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent animate-progress-shimmer" />
              {/* Glowing Tip */}
              <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-white rounded-full shadow-[0_0_6px_#fff]" />
            </div>
          </div>

          {/* Bottom Telemetry Bar: Bytes transferred + Speed + ETA */}
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

      {/* Error Banner */}
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

      {/* Success Notification */}
      {successFile && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-3 text-emerald-600 dark:text-emerald-400 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              <strong>{successFile.filename}</strong> ({formatBytes(successFile.size)}) successfully uploaded.
            </span>
          </div>
          <button
            onClick={() => setSuccessFile(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
