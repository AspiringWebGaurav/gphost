"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  BookOpen,
  Key,
  Terminal,
  Copy,
  Check,
  ArrowLeft,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  Laptop,
  Code2,
  HelpCircle,
  Search,
  Share2,
  Lock,
  ArrowRight,
  Upload,
  Files,
  Settings,
  Clock,
  Eye,
  Shield,
  ChevronRight,
  Layers,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandLogo } from "@/components/ui/brand-logo";

interface DocTopic {
  id: string;
  title: string;
  badge?: string;
  icon: React.ElementType;
}

interface DocGroup {
  groupTitle: string;
  items: DocTopic[];
}

const DOC_GROUPS: DocGroup[] = [
  {
    groupTitle: "Getting Started",
    items: [
      { id: "welcome", title: "What is GPHost?", badge: "Overview", icon: Sparkles },
      { id: "dashboard-tour", title: "Dashboard & Navigation", icon: Layers },
    ],
  },
  {
    groupTitle: "Uploading & Files",
    items: [
      { id: "uploading-files", title: "How to Upload Files", badge: "Drag & Drop", icon: Upload },
      { id: "managing-files", title: "Managing & Previewing Files", icon: Files },
      { id: "expiring-files", title: "Expiring & Auto-Delete", icon: Clock },
    ],
  },
  {
    groupTitle: "Sharing & Privacy",
    items: [
      { id: "sharing-links", title: "Creating Share Links", icon: Share2 },
      { id: "password-protection", title: "Password Protecting Files", badge: "Security", icon: Lock },
      { id: "link-types", title: "Permanent vs Standard Links", icon: Shield },
    ],
  },
  {
    groupTitle: "Developer API & Terminal",
    items: [
      { id: "api-overview", title: "What is the API Key?", badge: "Analogy", icon: Key },
      { id: "create-api-key", title: "Creating & Masking Keys", icon: Key },
      { id: "terminal-curl", title: "1-Line Terminal Upload", badge: "cURL", icon: Terminal },
      { id: "windows-guide", title: "Windows (CMD & PowerShell)", icon: Laptop },
      { id: "python-upload", title: "Python in 5 Lines", badge: "Code", icon: Code2 },
      { id: "key-safety", title: "Revoking & Key Safety", icon: ShieldCheck },
    ],
  },
  {
    groupTitle: "Account & FAQ",
    items: [
      { id: "account-settings", title: "Profile & Storage Quota", icon: Settings },
      { id: "faq", title: "Frequently Asked Questions", badge: "FAQ", icon: HelpCircle },
    ],
  },
];

const ALL_TOPICS = DOC_GROUPS.flatMap((g) => g.items);

export function DocsView() {
  const [activeId, setActiveId] = useState<string>("welcome");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  const navRef = useRef<HTMLElement | null>(null);
  const isManualClickRef = useRef<boolean>(false);

  // Synchronized scroll listener: highlights active topic and smoothly scrolls the left index in tandem with page scroll
  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        ticking = false;
        if (isManualClickRef.current) return;

        const scrollY = window.pageYOffset || document.documentElement.scrollTop || window.scrollY || 0;
        const windowHeight = window.innerHeight;
        const docScrollHeight = document.documentElement.scrollHeight;
        const maxDocScroll = Math.max(0, docScrollHeight - windowHeight);
        
        // Robust bottom detection (accounts for zoom, padding, browser chrome, mobile address bars)
        const isNearBottom = maxDocScroll > 0 && (scrollY >= maxDocScroll - 160);

        let currentActive = ALL_TOPICS[0].id;

        if (isNearBottom) {
          const lastTopic = ALL_TOPICS[ALL_TOPICS.length - 1];
          if (lastTopic) currentActive = lastTopic.id;
        } else if (scrollY < 80) {
          currentActive = ALL_TOPICS[0].id;
        } else {
          // Robust viewport bounding client rect check
          const triggerLine = Math.min(260, windowHeight * 0.35);
          for (let i = ALL_TOPICS.length - 1; i >= 0; i--) {
            const el = document.getElementById(ALL_TOPICS[i].id);
            if (el) {
              const rect = el.getBoundingClientRect();
              if (rect.top <= triggerLine) {
                currentActive = ALL_TOPICS[i].id;
                break;
              }
            }
          }
        }

        setActiveId(currentActive);

        // Synchronize Left Index Scroll Position
        if (window.innerWidth >= 1024 && navRef.current) {
          const nav = navRef.current;
          const maxNavScroll = nav.scrollHeight - nav.clientHeight;

          if (maxNavScroll > 0) {
            if (isNearBottom || currentActive === "faq") {
              // At page bottom: scroll index all the way to the bottom
              nav.scrollTop = maxNavScroll;
            } else if (scrollY < 80 || currentActive === "welcome") {
              // At page top: scroll index to the top
              nav.scrollTop = 0;
            } else {
              // Calculate centering for the active topic
              const activeEl = nav.querySelector<HTMLElement>(`[data-topic-id="${currentActive}"]`);
              if (activeEl) {
                const navRect = nav.getBoundingClientRect();
                const activeRect = activeEl.getBoundingClientRect();
                const currentRelTop = activeRect.top - navRect.top;
                const desiredRelTop = (nav.clientHeight - activeEl.clientHeight) / 2;
                const centerTargetScroll = Math.max(0, Math.min(maxNavScroll, nav.scrollTop + (currentRelTop - desiredRelTop)));

                // Also calculate proportional scroll progress through the documentation
                const progress = maxDocScroll > 0 ? Math.min(1, Math.max(0, scrollY / maxDocScroll)) : 0;
                const propScroll = progress * maxNavScroll;

                // Blend: 70% active item centering + 30% proportional progress
                const finalScroll = Math.max(0, Math.min(maxNavScroll, (centerTargetScroll * 0.7) + (propScroll * 0.3)));
                nav.scrollTop = finalScroll;
              } else {
                const progress = maxDocScroll > 0 ? Math.min(1, Math.max(0, scrollY / maxDocScroll)) : 0;
                nav.scrollTop = progress * maxNavScroll;
              }
            }
          }
        }
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  const handleSidebarWheel = (e: React.WheelEvent) => {
    if (navRef.current) {
      const nav = navRef.current;
      const canScrollDown = e.deltaY > 0 && nav.scrollTop + nav.clientHeight < nav.scrollHeight - 1;
      const canScrollUp = e.deltaY < 0 && nav.scrollTop > 1;
      if (canScrollDown || canScrollUp) {
        nav.scrollTop += e.deltaY;
      }
    }
  };

  const copyCode = (snippet: string, key: string) => {
    navigator.clipboard.writeText(snippet);
    setCopiedSnippet(key);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return DOC_GROUPS;
    const q = searchQuery.toLowerCase();
    return DOC_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter(
        (i) => i.title.toLowerCase().includes(q) || g.groupTitle.toLowerCase().includes(q)
      ),
    })).filter((g) => g.items.length > 0);
  }, [searchQuery]);

  const curlCode = `curl -H "Authorization: Bearer gp_live_YOUR_KEY" \\
  -F "file=@photo.jpg" \\
  https://gphost.app/api/v1/upload`;

  const powershellCode = `curl.exe -H "Authorization: Bearer gp_live_YOUR_KEY" \`
  -F "file=@homework.pdf" \`
  https://gphost.app/api/v1/upload`;

  const pythonCode = `import requests

API_KEY = "gp_live_YOUR_KEY"
URL = "https://gphost.app/api/v1/upload"

with open("homework.pdf", "rb") as f:
    headers = {"Authorization": f"Bearer {API_KEY}"}
    files = {"file": f}
    response = requests.post(URL, headers=headers, files=files)

data = response.json()
print("Link to share:", data["file"]["url"])`;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased selection:bg-blue-500/20 selection:text-blue-500">
      {/* Top GitHub Docs Style Navbar */}
      <header className="h-16 border-b border-border bg-background/80 backdrop-blur-xl sticky top-0 z-50 px-4 sm:px-8 flex items-center justify-between transition-colors">
        <div className="flex items-center gap-3 sm:gap-4">
          <BrandLogo size="sm" href="/" subtitle="Docs" />
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground pl-3 border-l border-border">
            <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
            <span>/</span>
            <span className="text-foreground font-semibold">User &amp; Developer Guide</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-border bg-card/60 hover:bg-muted text-xs font-semibold text-foreground transition cursor-pointer shadow-2xs"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-blue-500" />
            <span>Dashboard</span>
          </Link>

          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition cursor-pointer shadow-xs active:scale-[0.98]"
          >
            <Key className="w-3.5 h-3.5" />
            <span>Settings &amp; Keys</span>
          </Link>

          <ThemeToggle />
        </div>
      </header>

      {/* Main Two-Column GitHub Docs Layout */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col lg:flex-row gap-8 items-start">
        {/* ========================================================================= */}
        {/* LEFT COLUMN: GitHub Docs Index / Categorized Sidebar */}
        {/* ========================================================================= */}
        <aside
          onWheel={handleSidebarWheel}
          className="w-full lg:w-72 shrink-0 lg:sticky lg:top-24 space-y-4"
        >
          <div className="p-4 rounded-2xl bg-card border border-border shadow-xs flex flex-col max-h-[calc(100vh-7rem)] space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-border shrink-0">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <BookOpen className="w-4 h-4 text-blue-500" />
                <span>GPHost Documentation</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                Guide
              </span>
            </div>

            {/* Search Filter */}
            <div className="relative shrink-0">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search topics & guides..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Categorized Topic Groups */}
            <nav
              ref={navRef}
              className="space-y-4 flex-1 min-h-0 overflow-y-auto pr-1 docs-nav-scrollbar overscroll-contain"
            >
              {filteredGroups.map((group) => (
                <div key={group.groupTitle} className="space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 pt-1">
                    {group.groupTitle}
                  </div>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeId === item.id;
                    return (
                      <a
                        key={item.id}
                        href={`#${item.id}`}
                        data-topic-id={item.id}
                        onClick={(e) => {
                          e.preventDefault();
                          isManualClickRef.current = true;
                          const target = document.getElementById(item.id);
                          if (target) {
                            const headerOffset = 90;
                            const elementPosition = target.getBoundingClientRect().top;
                            const offsetPosition = elementPosition + (window.pageYOffset || document.documentElement.scrollTop || 0) - headerOffset;
                            window.scrollTo({
                              top: offsetPosition,
                              behavior: "smooth",
                            });
                            setActiveId(item.id);
                            if (navRef.current) {
                              const maxNavScroll = navRef.current.scrollHeight - navRef.current.clientHeight;
                              if (maxNavScroll > 0) {
                                if (item.id === "faq") {
                                  navRef.current.scrollTo({
                                    top: maxNavScroll,
                                    behavior: "smooth",
                                  });
                                } else if (item.id === "welcome") {
                                  navRef.current.scrollTo({
                                    top: 0,
                                    behavior: "smooth",
                                  });
                                } else {
                                  const activeEl = navRef.current.querySelector<HTMLElement>(`[data-topic-id="${item.id}"]`);
                                  if (activeEl) {
                                    const navRect = navRef.current.getBoundingClientRect();
                                    const activeRect = activeEl.getBoundingClientRect();
                                    const currentRelTop = activeRect.top - navRect.top;
                                    const desiredRelTop = (navRef.current.clientHeight - activeEl.clientHeight) / 2;
                                    const targetScroll = Math.max(0, Math.min(maxNavScroll, navRef.current.scrollTop + (currentRelTop - desiredRelTop)));
                                    navRef.current.scrollTo({
                                      top: targetScroll,
                                      behavior: "smooth",
                                    });
                                  }
                                }
                              }
                            }
                            setTimeout(() => {
                              isManualClickRef.current = false;
                            }, 800);
                          }
                        }}
                        className={`flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-150 ${
                          isActive
                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold border-l-[3px] border-blue-600 dark:border-blue-400 pl-2.5"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-blue-500" : "text-muted-foreground"}`} />
                          <span className="truncate">{item.title}</span>
                        </div>
                        {item.badge && (
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-bold shrink-0 ${
                              isActive
                                ? "bg-blue-500/20 text-blue-600 dark:text-blue-300"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </a>
                    );
                  })}
                </div>
              ))}
            </nav>

            {/* Quick Link Card */}
            <div className="pt-2 border-t border-border shrink-0">
              <Link
                href="/upload"
                className="w-full p-2.5 rounded-xl bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/20 flex items-center justify-between text-xs font-bold text-blue-600 dark:text-blue-400 transition"
              >
                <div className="flex items-center gap-2">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Start Uploading</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </aside>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: Crisp Documentation Reading Pane */}
        {/* ========================================================================= */}
        <main className="flex-1 min-w-0 max-w-4xl space-y-12">
          {/* Welcome Banner */}
          <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-card to-muted/40 border border-border shadow-xs space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Complete User &amp; Developer Guide</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              GPHost Documentation &amp; Help Center
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Everything you need to know about GPHost — how to upload files in seconds, password-protect links,
              set expiration timers, use developer API keys, and organize your storage in simple, easy-to-read English.
            </p>
          </div>

          {/* ======================================================================= */}
          {/* SECTION 1: What is GPHost? */}
          {/* ======================================================================= */}
          <section id="welcome" className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">
                1
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                What is GPHost? (The 1-Minute Overview)
              </h2>
            </div>

            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              <strong className="text-foreground font-semibold">GPHost</strong> is a private, lightning-fast file hosting platform.
              Whether you need to share school homework, photos, videos, game files, or code projects,
              GPHost lets you upload files and instantly get clean, shareable links.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-xl bg-card border border-border space-y-1.5">
                <div className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Fast &amp; Direct</div>
                <div className="text-sm font-bold text-foreground">1-Click Uploads</div>
                <p className="text-xs text-muted-foreground">Drop any file to get a short link immediately. No ads, no popups.</p>
              </div>
              <div className="p-4 rounded-xl bg-card border border-border space-y-1.5">
                <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Privacy First</div>
                <div className="text-sm font-bold text-foreground">Password Protected</div>
                <p className="text-xs text-muted-foreground">Lock your file with a secret passcode so only the right person can open it.</p>
              </div>
              <div className="p-4 rounded-xl bg-card border border-border space-y-1.5">
                <div className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">Self-Cleaning</div>
                <div className="text-sm font-bold text-foreground">Auto-Expiring Links</div>
                <p className="text-xs text-muted-foreground">Set your link to disappear after 1 hour, 1 day, or 30 days automatically.</p>
              </div>
            </div>
          </section>

          {/* ======================================================================= */}
          {/* SECTION 2: Dashboard Tour */}
          {/* ======================================================================= */}
          <section id="dashboard-tour" className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">
                2
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                Dashboard Tour &amp; Navigation
              </h2>
            </div>

            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              When you log into your console, the left navigation bar gives you easy access to everything:
            </p>

            <div className="space-y-2.5">
              <div className="p-3.5 rounded-xl bg-card border border-border flex items-center gap-3">
                <Layers className="w-5 h-5 text-blue-500 shrink-0" />
                <div>
                  <strong className="text-sm font-bold text-foreground">Overview: </strong>
                  <span className="text-xs text-muted-foreground">Your account homepage showing quick stats, total files stored, and storage used.</span>
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-card border border-border flex items-center gap-3">
                <Upload className="w-5 h-5 text-emerald-500 shrink-0" />
                <div>
                  <strong className="text-sm font-bold text-foreground">Upload: </strong>
                  <span className="text-xs text-muted-foreground">The dedicated upload station where you can drag and drop multiple files at once.</span>
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-card border border-border flex items-center gap-3">
                <Files className="w-5 h-5 text-purple-500 shrink-0" />
                <div>
                  <strong className="text-sm font-bold text-foreground">Files: </strong>
                  <span className="text-xs text-muted-foreground">View your complete file catalog, preview images/videos, copy sharing links, or delete files.</span>
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-card border border-border flex items-center gap-3">
                <Share2 className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <strong className="text-sm font-bold text-foreground">Links: </strong>
                  <span className="text-xs text-muted-foreground">Manage active sharing links, view download counts, or change passwords on existing links.</span>
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-card border border-border flex items-center gap-3">
                <Clock className="w-5 h-5 text-rose-500 shrink-0" />
                <div>
                  <strong className="text-sm font-bold text-foreground">Expiring: </strong>
                  <span className="text-xs text-muted-foreground">Track files scheduled to auto-delete soon so you never exceed your storage space.</span>
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-card border border-border flex items-center gap-3">
                <Settings className="w-5 h-5 text-blue-500 shrink-0" />
                <div>
                  <strong className="text-sm font-bold text-foreground">Settings: </strong>
                  <span className="text-xs text-muted-foreground">Change your display name, view your storage quota, and generate Developer API keys.</span>
                </div>
              </div>
            </div>
          </section>

          {/* ======================================================================= */}
          {/* SECTION 3: Uploading Files */}
          {/* ======================================================================= */}
          <section id="uploading-files" className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm">
                3
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                How to Upload Files (Drag &amp; Drop)
              </h2>
            </div>

            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Uploading on GPHost is as simple as dropping a file onto your screen:
            </p>

            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-card border border-border flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
                <div className="space-y-1">
                  <div className="text-sm font-bold text-foreground">Go to the Upload Tab</div>
                  <p className="text-xs text-muted-foreground">Click <strong className="text-foreground">Upload</strong> in the left sidebar or the top navigation bar.</p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-card border border-border flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
                <div className="space-y-1">
                  <div className="text-sm font-bold text-foreground">Drag and Drop Your File</div>
                  <p className="text-xs text-muted-foreground">
                    Drag pictures, documents, videos, or archives right into the box, or click the box to browse your computer.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-card border border-border flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</div>
                <div className="space-y-1">
                  <div className="text-sm font-bold text-foreground">Choose Password or Expiry (Optional)</div>
                  <p className="text-xs text-muted-foreground">
                    If you want extra protection, type a secret password or pick how many days the file should stay online before auto-deleting.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs sm:text-sm text-foreground/90 space-y-1">
              <strong className="font-bold text-blue-700 dark:text-blue-300">💡 Supported Files: </strong>
              <span>Images (PNG, JPG, SVG, GIF, WebP), PDFs, Word &amp; PowerPoint files, MP4 videos, MP3 audio, ZIP files, code files, and text.</span>
            </div>
          </section>

          {/* ======================================================================= */}
          {/* SECTION 4: Managing & Previewing Files */}
          {/* ======================================================================= */}
          <section id="managing-files" className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-sm">
                4
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                Managing &amp; Previewing Files
              </h2>
            </div>

            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              On the <Link href="/files" className="text-blue-500 font-semibold underline">Files</Link> page, you have full control over your stored items:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="p-4 rounded-xl bg-card border border-border space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Eye className="w-4 h-4 text-blue-500" />
                  <span>Instant Preview</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Click on any photo, video, or PDF to preview it directly inside your browser without needing to download it.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-card border border-border space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Share2 className="w-4 h-4 text-emerald-500" />
                  <span>1-Click Copy Link</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Click the link icon beside any file to copy the direct URL to your clipboard. Paste it into WhatsApp, Discord, or email.
                </p>
              </div>
            </div>
          </section>

          {/* ======================================================================= */}
          {/* SECTION 5: Expiring & Auto-Delete */}
          {/* ======================================================================= */}
          <section id="expiring-files" className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-sm">
                5
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                Expiring Links &amp; Auto-Cleanup
              </h2>
            </div>

            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Nobody likes clutter. If you share a draft or a quick screenshot with a friend, you probably don&apos;t need it taking up space 6 months later.
            </p>

            <div className="p-4 rounded-xl bg-card border border-border space-y-2">
              <h4 className="text-sm font-bold text-foreground">How Expiring Works:</h4>
              <ul className="space-y-2 text-xs sm:text-sm text-muted-foreground list-disc pl-5">
                <li>When uploading, you can set the file to expire after <strong className="text-foreground">1 hour, 1 day, 7 days, or 30 days</strong>.</li>
                <li>When the countdown finishes, the link stops working and the file is permanently wiped clean.</li>
                <li>This ensures your private data never stays floating on the web forever!</li>
              </ul>
            </div>
          </section>

          {/* ======================================================================= */}
          {/* SECTION 6: Password Protection */}
          {/* ======================================================================= */}
          <section id="password-protection" className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-sm">
                6
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                Password Protecting Your Files
              </h2>
            </div>

            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Want to send confidential documents, grades, or personal photos? You can lock your file with a password:
            </p>

            <div className="p-4 rounded-xl bg-card border border-border space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Lock className="w-4 h-4 text-amber-500" />
                <span>How the Receiver Experiences It:</span>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                When someone clicks your link, they will see a secure lock screen asking for the passcode.
                They cannot download or view the file until they type the password you gave them!
              </p>
            </div>
          </section>

          {/* ======================================================================= */}
          {/* SECTION 7: Permanent vs Standard Links */}
          {/* ======================================================================= */}
          <section id="link-types" className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">
                7
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                Permanent vs Standard Links
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="p-4 rounded-xl bg-card border border-border space-y-2">
                <div className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Standard Accounts</div>
                <div className="text-sm font-bold text-foreground">Up to 90 Days</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Files stay online for up to 90 days. Ideal for day-to-day file sharing, homework, and sending materials to friends.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Approved Accounts</div>
                <div className="text-sm font-bold text-foreground">Never Expire (Permanent)</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Your files remain live permanently! Perfect for website images, portfolio downloads, and long-term project archives.
                </p>
              </div>
            </div>
          </section>

          {/* ======================================================================= */}
          {/* SECTION 8: Developer API & Terminal Upload */}
          {/* ======================================================================= */}
          <section id="api-overview" className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">
                8
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                Developer API: What is an API Key?
              </h2>
            </div>

            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              If you code, run automated tests, or prefer using your terminal, you don&apos;t have to open a web browser to upload.
              An <strong className="text-foreground font-semibold">API Key</strong> is like your secret digital VIP badge.
              When your computer sends a file with this badge, GPHost verifies it and saves it into your account immediately.
            </p>

            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs sm:text-sm text-foreground/90 space-y-1">
              <strong className="font-bold text-blue-700 dark:text-blue-300">🔑 The Brass Key Analogy: </strong>
              <span>Instead of typing your Google password each time, your computer shows your API key (starting with <code>gp_live_...</code>). That&apos;s all it takes!</span>
            </div>
          </section>

          {/* ======================================================================= */}
          {/* SECTION 9: Creating & Masking Keys */}
          {/* ======================================================================= */}
          <section id="create-api-key" className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-sm">
                9
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                Creating &amp; Masking API Keys
              </h2>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              Head to <Link href="/settings" className="text-blue-500 font-semibold underline">Settings</Link> to create your key:
            </p>

            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-card border border-border flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
                <div>
                  <div className="text-sm font-bold text-foreground">Click &quot;+ New API Key&quot;</div>
                  <p className="text-xs text-muted-foreground">Type a nickname (e.g., <em>&quot;MacBook CLI&quot;</em> or <em>&quot;School PC&quot;</em>).</p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-card border border-border flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
                <div>
                  <div className="text-sm font-bold text-foreground">Masked with Asterisks for Privacy</div>
                  <p className="text-xs text-muted-foreground">
                    When generated, your key is masked: <code className="font-mono bg-muted px-1.5 py-0.5 rounded">gp_live_********************</code>.
                    Click <strong className="text-foreground">Reveal</strong> to see it, or click <strong className="text-foreground">Copy Key</strong> to copy the raw unmasked secret directly.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-card border border-border flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</div>
                <div>
                  <div className="text-sm font-bold text-foreground">Expanded View for Many Keys</div>
                  <p className="text-xs text-muted-foreground">
                    Have 10 or 20+ keys? Click <strong className="text-foreground">Expand View</strong> to open a searchable modal where you can review, copy prefixes, or revoke keys cleanly.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ======================================================================= */}
          {/* SECTION 10: 1-Line Terminal Upload */}
          {/* ======================================================================= */}
          <section id="terminal-curl" className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">
                10
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                1-Line Terminal Upload (cURL)
              </h2>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              Open your computer terminal and paste this single command:
            </p>

            <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
              <div className="px-4 py-2 bg-muted/40 border-b border-border flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">Terminal Command</span>
                <button
                  onClick={() => copyCode(curlCode, "curl")}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground bg-background border border-border transition cursor-pointer"
                >
                  {copiedSnippet === "curl" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSnippet === "curl" ? "Copied!" : "Copy Command"}</span>
                </button>
              </div>
              <pre className="p-4 bg-background font-mono text-xs sm:text-sm text-foreground overflow-x-auto leading-relaxed select-all">
                {curlCode}
              </pre>
            </div>
          </section>

          {/* ======================================================================= */}
          {/* SECTION 11: Windows Guide */}
          {/* ======================================================================= */}
          <section id="windows-guide" className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">
                11
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                For Windows (PowerShell &amp; Command Prompt)
              </h2>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
              <div className="px-4 py-2 bg-muted/40 border-b border-border flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">Windows PowerShell</span>
                <button
                  onClick={() => copyCode(powershellCode, "powershell")}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground bg-background border border-border transition cursor-pointer"
                >
                  {copiedSnippet === "powershell" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSnippet === "powershell" ? "Copied!" : "Copy"}</span>
                </button>
              </div>
              <pre className="p-4 bg-background font-mono text-xs sm:text-sm text-foreground overflow-x-auto leading-relaxed select-all">
                {powershellCode}
              </pre>
            </div>
          </section>

          {/* ======================================================================= */}
          {/* SECTION 12: Python in 5 Lines */}
          {/* ======================================================================= */}
          <section id="python-upload" className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm">
                12
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                Python in 5 Lines (Automated Uploads)
              </h2>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
              <div className="px-4 py-2 bg-muted/40 border-b border-border flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">upload.py</span>
                <button
                  onClick={() => copyCode(pythonCode, "python")}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground bg-background border border-border transition cursor-pointer"
                >
                  {copiedSnippet === "python" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSnippet === "python" ? "Copied!" : "Copy Script"}</span>
                </button>
              </div>
              <pre className="p-4 bg-background font-mono text-xs sm:text-sm text-foreground overflow-x-auto leading-relaxed select-all">
                {pythonCode}
              </pre>
            </div>
          </section>

          {/* ======================================================================= */}
          {/* SECTION 13: Key Safety & Revoking */}
          {/* ======================================================================= */}
          <section id="key-safety" className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-sm">
                13
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                Revoking &amp; Key Safety Rules
              </h2>
            </div>

            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-card border border-border flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-bold text-foreground">Keep it Private Like an ATM PIN</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Never share your raw key on public Discord servers or commit it to GitHub.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-card border border-border flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-bold text-foreground">Revoke in 1 Click if Leaked</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    If someone saw your key, go to <Link href="/settings" className="text-blue-500 font-semibold underline">Settings</Link> and click the trash can icon. It is deleted immediately.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ======================================================================= */}
          {/* SECTION 14: Profile & Storage Quotas */}
          {/* ======================================================================= */}
          <section id="account-settings" className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">
                14
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                Profile &amp; Storage Quotas
              </h2>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              In your Settings page, you can customize your experience:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="p-4 rounded-xl bg-card border border-border space-y-1.5">
                <div className="text-sm font-bold text-foreground">Display Name</div>
                <p className="text-xs text-muted-foreground">Type your name or nickname and click Save. It appears when sharing files.</p>
              </div>

              <div className="p-4 rounded-xl bg-card border border-border space-y-1.5">
                <div className="text-sm font-bold text-foreground">Storage Bar</div>
                <p className="text-xs text-muted-foreground">The bottom of your sidebar tracks your storage in real time so you never run out of room.</p>
              </div>
            </div>
          </section>

          {/* ======================================================================= */}
          {/* SECTION 15: FAQ */}
          {/* ======================================================================= */}
          <section id="faq" className="space-y-4 pt-4 border-t border-border pb-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">
                15
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                Frequently Asked Questions (FAQ)
              </h2>
            </div>

            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-card border border-border space-y-1.5">
                <div className="text-sm font-bold text-foreground">Is GPHost free to use?</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Yes! All standard file hosting and terminal upload features are completely free.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-card border border-border space-y-1.5">
                <div className="text-sm font-bold text-foreground">Can anyone see my uploaded files without a link?</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  No. Your files are private to your account. Nobody can view or download a file unless you share the exact link with them.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-card border border-border space-y-1.5">
                <div className="text-sm font-bold text-foreground">Can I delete a file after sharing it?</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Yes, at any time! Just go to the <Link href="/files" className="text-blue-500 font-semibold underline">Files</Link> tab and click Delete. The link will immediately stop working.
                </p>
              </div>
            </div>

            {/* Bottom Action Box */}
            <div className="p-6 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex flex-col sm:flex-row items-center justify-between gap-4 mt-8">
              <div className="space-y-1 text-center sm:text-left">
                <h3 className="text-base font-bold text-foreground">Ready to start using GPHost?</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Go to your dashboard or upload your first file right now.
                </p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <Link
                  href="/dashboard"
                  className="px-4 py-2 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs sm:text-sm font-semibold transition"
                >
                  Dashboard
                </Link>
                <Link
                  href="/upload"
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold transition shadow-xs cursor-pointer"
                >
                  <span>Upload File</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
