"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Globe,
  ArrowLeft,
  Sparkles,
  Zap,
  Clock,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { HtmlHostModal } from "@/components/dashboard/html-host-modal";

export default function StandaloneSiteHostPage() {
  const [showHostModal, setShowHostModal] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased transition-colors duration-200">
      {/* Header */}
      <header className="h-16 border-b border-border/80 bg-background/80 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-50">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to GPHost</span>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
            GP-Sites Engine
          </span>
        </div>
      </header>

      {/* Hero Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto py-12 sm:py-16 px-6 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/25 text-xs font-semibold mb-5 animate-in fade-in duration-200">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Drop-and-Host Static Web Previews</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground max-w-3xl leading-tight sm:leading-tight mb-4">
          Host Any HTML File Instantly with Your Own Domain &amp; Custom Slug
        </h1>

        <p className="text-sm sm:text-base text-muted-foreground max-w-2xl leading-relaxed mb-8">
          Upload single-page HTML portfolios, design mockups, dashboards, or project reports. Instantly get a live URL at <code className="font-mono text-cyan-600 dark:text-cyan-400 font-semibold">/site/[your-slug]</code> with isolated sandboxing and automatic zero-stale lifecycle cleanup.
        </p>

        {/* Primary Launch Action Button */}
        <div className="flex flex-col sm:flex-row items-center gap-3 mb-16 w-full max-w-md justify-center">
          <button
            type="button"
            onClick={() => setShowHostModal(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 h-13 rounded-2xl bg-gradient-to-r from-cyan-600 via-teal-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-cyan-600/20 hover:shadow-cyan-600/30 transition-all cursor-pointer active:scale-[0.98]"
          >
            <Globe className="w-4 h-4" />
            <span>Host an HTML Page Now</span>
          </button>
        </div>

        {/* 3 Pillars Feature Grid */}
        <div className="grid gap-5 sm:grid-cols-3 text-left w-full">
          <div className="p-6 rounded-2xl bg-card border border-border space-y-2.5">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 flex items-center justify-center">
              <Globe className="w-5 h-5" />
            </div>
            <h2 className="font-bold text-sm text-foreground">Attached Domain &amp; Custom Slug</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Pick your exact vanity slug. Your link is instantly live as <code className="font-mono text-foreground font-semibold">https://[domain]/site/[slug]</code> with zero DNS configuration.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-card border border-border space-y-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <h2 className="font-bold text-sm text-foreground">Direct R2 Edge Streaming</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Consumes 0 bytes of Vercel bandwidth! Your webpage streams straight from Cloudflare R2 worldwide edge storage with sub-millisecond latency.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-card border border-border space-y-2.5">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <h2 className="font-bold text-sm text-foreground">Zero Stale Records Guarantee</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Set auto-expiration from 1 hour to 90 days. When the lease elapses, storage and database records are completely scrubbed clean.
            </p>
          </div>
        </div>
      </main>

      {/* Dedicated HTML Host Modal */}
      <HtmlHostModal
        isOpen={showHostModal}
        onClose={() => setShowHostModal(false)}
      />

      {/* Footer */}
      <footer className="border-t border-border py-8 px-6 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} GPHosting. GP-Sites Static Web Engine.
      </footer>
    </div>
  );
}
