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
} from "lucide-react";

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
  const [expiryPreset, setExpiryPreset] = useState<"24h" | "7d" | "30d" | "90d" | "never">("30d");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successFile, setSuccessFile] = useState<{ id: string; filename: string; size: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const isCancelledRef = useRef<boolean>(false);

  const handleFileChange = (file: File) => {
    setErrorMsg(null);
    setSuccessFile(null);
    setProgress(0);

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
        setStatusText("Uploading directly to R2...");
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhrRef.current = xhr;

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 90);
              setProgress(pct);
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
        setStatusText("Uploading multipart chunks to R2...");
        const totalParts = Math.ceil(selectedFile.size / MULTIPART_PART_SIZE);
        const uploadedParts: { partNumber: number; eTag: string }[] = [];

        for (let i = 1; i <= totalParts; i++) {
          if (isCancelledRef.current) {
            throw new Error("Upload cancelled");
          }

          const start = (i - 1) * MULTIPART_PART_SIZE;
          const end = Math.min(start + MULTIPART_PART_SIZE, selectedFile.size);
          const chunk = selectedFile.slice(start, end);

          setStatusText(`Signing part ${i} of ${totalParts}...`);
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

          const pct = Math.round((i / totalParts) * 85);
          setProgress(pct);
        }

        // Finalize Multipart Parts
        setStatusText("Assembling multipart upload on R2...");
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
      setStatusText("Upload complete and verified!");
      setSuccessFile({
        id: fileId,
        filename: completedData.file.sanitized_name || selectedFile.name,
        size: completedData.file.byte_size || selectedFile.size,
      });
      setSelectedFile(null);

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

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
            {/* Expiry Selector */}
            <div className="flex items-center gap-1.5 bg-muted/40 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <select
                value={expiryPreset}
                onChange={(e) =>
                  setExpiryPreset(
                    e.target.value as "24h" | "7d" | "30d" | "90d" | "never"
                  )
                }
                className="bg-transparent border-none focus:outline-none text-xs text-foreground cursor-pointer"
              >
                <option value="24h" className="bg-card text-foreground">
                  Expires in 24 Hours
                </option>
                <option value="7d" className="bg-card text-foreground">
                  Expires in 7 Days
                </option>
                <option value="30d" className="bg-card text-foreground">
                  Expires in 30 Days (Default)
                </option>
                <option value="90d" className="bg-card text-foreground">
                  Expires in 90 Days
                </option>
                {(isAdmin || canCreatePermanent) && (
                  <option value="never" className="bg-card text-purple-600 dark:text-purple-300">
                    Never Expire (Permanent)
                  </option>
                )}
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
        <div className="p-4 rounded-xl bg-card border border-blue-500/30 space-y-3 shadow-sm">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{statusText}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-foreground">{progress}%</span>
              <button
                onClick={cancelUpload}
                className="text-muted-foreground hover:text-red-500 transition-colors"
                title="Cancel Upload"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
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
