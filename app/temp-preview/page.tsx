"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Globe,
  ArrowLeft,
  ExternalLink,
  Smartphone,
  Tablet,
  Monitor,
  Columns,
  Eye,
  RefreshCw,
  Clock,
  Sparkles,
  ShieldCheck,
  Zap,
} from "lucide-react";

type ViewMode = "hosted-shell" | "raw-direct" | "split-compare";
type DeviceMode = "responsive" | "desktop" | "tablet" | "mobile";

export default function TempPreviewComparePage() {
  const [viewMode, setViewMode] = useState<ViewMode>("hosted-shell");
  const [deviceMode, setDeviceMode] = useState<DeviceMode>("responsive");
  const [iframeKey, setIframeKey] = useState<number>(0);

  const rawUrl = "/temp-preview/raw";

  const getDeviceWidthClass = () => {
    switch (deviceMode) {
      case "mobile":
        return "w-[390px] h-[844px] shadow-2xl rounded-3xl border-4 border-slate-700 overflow-hidden";
      case "tablet":
        return "w-[768px] h-[1024px] shadow-2xl rounded-2xl border-4 border-slate-700 overflow-hidden";
      case "desktop":
        return "w-[1280px] h-[800px] shadow-2xl rounded-xl border border-slate-700 overflow-hidden";
      default:
        return "w-full h-full";
    }
  };

  const handleRefresh = () => {
    setIframeKey((prev) => prev + 1);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden selection:bg-indigo-500 selection:text-white">
      {/* Studio Top Control Bar */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur-xl px-4 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Return to GPHost Home"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                HTML Hosting Preview Studio
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Local vs Live
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Center: View Modes & Device Selectors */}
        <div className="flex items-center gap-3">
          {/* Mode Switcher */}
          <div className="hidden sm:flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-medium">
            <button
              onClick={() => setViewMode("hosted-shell")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                viewMode === "hosted-shell"
                  ? "bg-indigo-600 text-white shadow-xs font-semibold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Hosted Shell (/site/slug)</span>
            </button>

            <button
              onClick={() => setViewMode("raw-direct")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                viewMode === "raw-direct"
                  ? "bg-indigo-600 text-white shadow-xs font-semibold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Raw Direct View (/raw/slug)</span>
            </button>

            <button
              onClick={() => setViewMode("split-compare")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                viewMode === "split-compare"
                  ? "bg-indigo-600 text-white shadow-xs font-semibold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Side-by-Side Compare</span>
            </button>
          </div>

          {/* Device Frame Switcher */}
          <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 text-slate-400">
            <button
              onClick={() => setDeviceMode("responsive")}
              className={`p-1.5 rounded-lg transition ${
                deviceMode === "responsive" ? "bg-slate-800 text-white" : "hover:text-white"
              }`}
              title="Full Responsive (100%)"
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setDeviceMode("desktop")}
              className={`p-1.5 rounded-lg transition ${
                deviceMode === "desktop" ? "bg-slate-800 text-white" : "hover:text-white"
              }`}
              title="Desktop 1280px"
            >
              <Monitor className="w-3.5 h-3.5 text-indigo-400" />
            </button>
            <button
              onClick={() => setDeviceMode("tablet")}
              className={`p-1.5 rounded-lg transition ${
                deviceMode === "tablet" ? "bg-slate-800 text-white" : "hover:text-white"
              }`}
              title="Tablet 768px (iPad)"
            >
              <Tablet className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setDeviceMode("mobile")}
              className={`p-1.5 rounded-lg transition ${
                deviceMode === "mobile" ? "bg-slate-800 text-white" : "hover:text-white"
              }`}
              title="Mobile 390px (iPhone)"
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Reload Frame"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <a
            href={rawUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Open Standalone</span>
          </a>
        </div>
      </header>

      {/* Main Preview Area */}
      <main className="flex-1 w-full relative overflow-auto bg-slate-900/50 flex items-center justify-center p-4">
        {/* ============================================================ */}
        {/* VIEW 1: HOSTED SHELL SIMULATION (/site/[slug])               */}
        {/* ============================================================ */}
        {viewMode === "hosted-shell" && (
          <div className={`transition-all duration-300 flex flex-col ${getDeviceWidthClass()}`}>
            {/* The exact top banner rendered in app/site/[slug]/page.tsx */}
            <div className="h-11 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md px-3 flex items-center justify-between shrink-0 z-20">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-5 h-5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <Globe className="w-3 h-3" />
                </div>
                <span className="text-xs font-semibold text-slate-200 truncate">
                  index.html
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  GP-Sites Live
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                  <Clock className="w-3 h-3 text-indigo-400" />
                  Expires in 30 Days
                </span>

                <a
                  href={rawUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 text-xs transition"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Direct View</span>
                </a>
              </div>
            </div>

            {/* Sandboxed iframe */}
            <div className="flex-1 w-full relative bg-slate-950">
              <iframe
                key={iframeKey}
                src={rawUrl}
                title="GP-Sites Shell Preview"
                sandbox="allow-scripts allow-forms allow-modals allow-same-origin allow-popups"
                className="w-full h-full border-0 absolute inset-0 bg-slate-950"
              />
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* VIEW 2: RAW DIRECT VIEW (/raw/[slug])                         */}
        {/* ============================================================ */}
        {viewMode === "raw-direct" && (
          <div className={`transition-all duration-300 relative ${getDeviceWidthClass()}`}>
            <iframe
              key={iframeKey}
              src={rawUrl}
              title="Raw Direct Preview"
              className="w-full h-full border-0 bg-slate-950"
            />
          </div>
        )}

        {/* ============================================================ */}
        {/* VIEW 3: SPLIT COMPARISON (SIDE-BY-SIDE)                      */}
        {/* ============================================================ */}
        {viewMode === "split-compare" && (
          <div className="w-full h-full grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Column: Direct Local File */}
            <div className="flex flex-col h-full rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-xl">
              <div className="h-10 px-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  1. Direct Raw Rendering (/raw/custom-slug)
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Full-screen HTML</span>
              </div>
              <div className="flex-1 relative">
                <iframe
                  key={`split-raw-${iframeKey}`}
                  src={rawUrl}
                  title="Direct Raw"
                  className="w-full h-full border-0 absolute inset-0 bg-slate-950"
                />
              </div>
            </div>

            {/* Right Column: Sandboxed GP-Sites Shell */}
            <div className="flex flex-col h-full rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-xl">
              <div className="h-10 px-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  2. Hosted GP-Sites Shell (/site/custom-slug)
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Sandboxed Navigation</span>
              </div>
              
              {/* Nested GP-Sites Top Bar */}
              <div className="h-9 border-b border-slate-800 bg-slate-900/60 px-3 flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                  <Globe className="w-3 h-3 text-emerald-400" />
                  <span>index.html</span>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">LIVE</span>
                </div>
                <span className="text-[10px] text-indigo-400">Expires in 30d</span>
              </div>

              <div className="flex-1 relative">
                <iframe
                  key={`split-shell-${iframeKey}`}
                  src={rawUrl}
                  title="Hosted Shell"
                  sandbox="allow-scripts allow-forms allow-modals allow-same-origin allow-popups"
                  className="w-full h-full border-0 absolute inset-0 bg-slate-950"
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Mini Bottom Status Bar */}
      <footer className="h-7 border-t border-slate-800/80 bg-slate-950 px-4 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
        <div className="flex items-center gap-4">
          <span>Source: <code className="text-indigo-400 font-mono">temp-test/index.html</code></span>
          <span>Target Vanity Route: <code className="text-emerald-400 font-mono">/site/[your-slug]</code></span>
        </div>
        <div className="flex items-center gap-3">
          <span>Device: <strong className="text-white capitalize">{deviceMode}</strong></span>
          <span>View: <strong className="text-white capitalize">{viewMode.replace("-", " ")}</strong></span>
        </div>
      </footer>
    </div>
  );
}
