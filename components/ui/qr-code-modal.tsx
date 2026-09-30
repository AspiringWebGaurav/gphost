"use client";

import React, { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  X,
  Download,
  Copy,
  Check,
  ExternalLink,
  QrCode,
  Image as ImageIcon,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import {
  downloadQrCodePng,
  downloadQrCodeSvg,
  copyQrCodeImage,
} from "@/lib/utils/qr-export";

export interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  title: string;
  subtitle?: string;
  filename?: string;
}

export function QrCodeModal({
  isOpen,
  onClose,
  url,
  title,
  subtitle,
  filename,
}: QrCodeModalProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [isDownloadingPng, setIsDownloadingPng] = useState(false);
  const [isDownloadingSvg, setIsDownloadingSvg] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !url) return null;

  const safeFilename = filename || "gphost-qr";
  const cleanBaseName = safeFilename
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_");

  const handleCopyLink = () => {
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyImage = async () => {
    if (!svgRef.current) return;
    const success = await copyQrCodeImage(svgRef.current);
    if (success) {
      setCopiedImage(true);
      setTimeout(() => setCopiedImage(false), 2500);
    }
  };

  const handleDownloadPng = async () => {
    if (!svgRef.current) return;
    setIsDownloadingPng(true);
    try {
      await downloadQrCodePng(svgRef.current, {
        filename: `QR-${cleanBaseName}.png`,
        title: title || "GPHost Share Link",
        subtitle: subtitle,
        size: 512,
      });
    } finally {
      setIsDownloadingPng(false);
    }
  };

  const handleDownloadSvg = () => {
    if (!svgRef.current) return;
    setIsDownloadingSvg(true);
    try {
      downloadQrCodeSvg(svgRef.current, `QR-${cleanBaseName}.svg`);
    } finally {
      setTimeout(() => setIsDownloadingSvg(false), 500);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md max-h-[90vh] bg-card border border-border rounded-2xl shadow-2xl overflow-y-auto modal-scrollbar overscroll-contain animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/70 bg-muted/20">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/25 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <QrCode className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-foreground truncate">
                {title || "Scan QR Code"}
              </h3>
              {subtitle && (
                <p className="text-[11px] text-muted-foreground truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex flex-col items-center space-y-4">
          {/* Centered QR Card */}
          <div className="p-3 bg-white rounded-2xl border-2 border-neutral-200 shadow-md flex items-center justify-center">
            <QRCodeSVG
              ref={svgRef}
              value={url}
              size={200}
              level="H"
              includeMargin={false}
              className="w-[180px] h-[180px] sm:w-[200px] sm:h-[200px]"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
            <span>Point camera to scan or share</span>
          </div>

          {/* URL Box */}
          <div className="w-full flex items-center gap-2 p-2 rounded-xl bg-muted/40 border border-border">
            <span className="flex-1 min-w-0 font-mono text-[11px] text-foreground truncate px-1">
              {url}
            </span>
            <button
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-medium transition cursor-pointer shrink-0"
              title="Copy URL"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3 h-3 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[11px]">Copy</span>
                </>
              )}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer shrink-0"
              title="Open URL in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Download Action Strip */}
          <div className="w-full grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
            <button
              onClick={handleDownloadPng}
              disabled={isDownloadingPng}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
              title="Download high-resolution PNG image"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isDownloadingPng ? "Saving..." : "PNG Image"}</span>
            </button>

            <button
              onClick={handleDownloadSvg}
              disabled={isDownloadingSvg}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-border bg-background hover:bg-muted text-foreground text-xs font-semibold transition cursor-pointer disabled:opacity-50"
              title="Download vector SVG format"
            >
              <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{isDownloadingSvg ? "Saving..." : "SVG Vector"}</span>
            </button>

            <button
              onClick={handleCopyImage}
              className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-border bg-background hover:bg-muted text-foreground text-xs font-semibold transition cursor-pointer"
              title="Copy QR image to clipboard for instant pasting"
            >
              {copiedImage ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Copy Image</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
