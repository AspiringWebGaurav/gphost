"use client";

import React, { useState, useMemo } from "react";
import { Globe2, Layers, MapPin, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import {
  WORLD_MAP_PATHS,
  COUNTRY_CENTROIDS,
  getCountryCentroid,
} from "./world-map-data";

interface WorldMapProps {
  countries: { country: string; count: number }[];
  onSelectCountry?: (code: string) => void;
  selectedCountry?: string | null;
}

// Convert ISO2 to emoji flag
function getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return "🌐";
  const code = countryCode.toUpperCase();
  const first = code.charCodeAt(0) + 127397;
  const second = code.charCodeAt(1) + 127397;
  try {
    return String.fromCodePoint(first, second);
  } catch {
    return "🌐";
  }
}

export function WorldMap({
  countries,
  onSelectCountry,
  selectedCountry,
}: WorldMapProps) {
  const [hoveredCountry, setHoveredCountry] = useState<{
    code: string;
    name: string;
    count: number;
    pct: number;
    x: number;
    y: number;
  } | null>(null);

  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [viewMode, setViewMode] = useState<"map" | "grid">("map");

  // Build count lookup and statistics
  const { countMap, maxCount, totalDownloads, activeList } = useMemo(() => {
    const map = new Map<string, number>();
    let max = 1;
    let total = 0;

    for (const c of countries) {
      const code = (c.country || "XX").toUpperCase().trim();
      const count = Number(c.count) || 0;
      map.set(code, (map.get(code) || 0) + count);
      total += count;
      if (count > max) max = count;
    }

    const list = Array.from(map.entries())
      .map(([code, count]) => {
        const centroid = getCountryCentroid(code);
        return {
          code,
          name: centroid ? centroid.name : code === "XX" ? "Unknown Edge / VPN" : code,
          count,
          pct: total > 0 ? Math.round((count / total) * 100) : 0,
          centroid,
        };
      })
      .sort((a, b) => b.count - a.count);

    return { countMap: map, maxCount: max, totalDownloads: total, activeList: list };
  }, [countries]);

  return (
    <div className="w-full rounded-2xl border border-border bg-card/80 p-4 space-y-3 relative overflow-hidden shadow-xs">
      {/* Header bar with statistics and toggles */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-500/20 shadow-2xs">
            <Globe2 className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs sm:text-sm text-foreground">Global Visitor Reach</span>
              <span className="px-2 py-0.2 rounded-full text-[10px] font-mono font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {activeList.length} {activeList.length === 1 ? "country" : "countries"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Geographic edge distribution of downloads, API calls, and streaming requests.
            </p>
          </div>
        </div>

        {/* View Controls */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto text-xs">
          <div className="flex items-center bg-muted/50 rounded-lg p-0.5 border border-border">
            <button
              type="button"
              onClick={() => setViewMode("map")}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer flex items-center gap-1 ${
                viewMode === "map"
                  ? "bg-background text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Globe2 className="w-3 h-3" />
              <span>Vector Map</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer flex items-center gap-1 ${
                viewMode === "grid"
                  ? "bg-background text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>List ({activeList.length})</span>
            </button>
          </div>

          {viewMode === "map" && (
            <div className="hidden sm:flex items-center bg-muted/40 rounded-lg p-0.5 border border-border text-muted-foreground">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(2, z + 0.25))}
                title="Zoom in"
                className="p-1 hover:text-foreground hover:bg-background rounded transition cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(1, z - 0.25))}
                title="Zoom out"
                className="p-1 hover:text-foreground hover:bg-background rounded transition cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              {zoomLevel !== 1 && (
                <button
                  type="button"
                  onClick={() => setZoomLevel(1)}
                  title="Reset zoom"
                  className="p-1 hover:text-foreground hover:bg-background rounded transition cursor-pointer text-blue-500"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {viewMode === "map" ? (
        /* Vector World Map Canvas */
        <div className="relative w-full aspect-[2000/857] max-h-[380px] bg-muted/20 dark:bg-zinc-950/60 rounded-xl border border-border/80 overflow-hidden flex items-center justify-center">
          {/* Subtle grid mesh */}
          <div
            className="absolute inset-0 opacity-[0.08] dark:opacity-[0.14] pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />

          <div
            className="w-full h-full transition-transform duration-300 ease-out origin-center"
            style={{ transform: `scale(${zoomLevel})` }}
          >
            <svg
              viewBox="0 0 2000 857"
              className="w-full h-full select-none"
              onMouseLeave={() => setHoveredCountry(null)}
            >
              {/* World Continents & Country Borders */}
              <g className="transition-all duration-300">
                {WORLD_MAP_PATHS.map((path, idx) => {
                  const count = path.code ? countMap.get(path.code) || 0 : 0;
                  const hasActivity = count > 0;
                  const isSelected = selectedCountry && path.code === selectedCountry;

                  return (
                    <path
                      key={idx}
                      d={path.d}
                      className={`transition-colors duration-200 cursor-pointer ${
                        isSelected
                          ? "fill-blue-500/50 stroke-blue-500 stroke-[1.5]"
                          : hasActivity
                          ? "fill-blue-500/25 dark:fill-blue-500/35 stroke-blue-500/70 hover:fill-blue-500/40 stroke-[0.8]"
                          : "fill-foreground/[0.05] dark:fill-foreground/[0.07] stroke-foreground/[0.12] dark:stroke-foreground/[0.15] hover:fill-foreground/[0.12] stroke-[0.3]"
                      }`}
                      onMouseEnter={(e) => {
                        if (path.code) {
                          const centroid = getCountryCentroid(path.code);
                          if (centroid) {
                            setHoveredCountry({
                              code: path.code,
                              name: path.name || centroid.name,
                              count,
                              pct: totalDownloads > 0 ? Math.round((count / totalDownloads) * 100) : 0,
                              x: centroid.x,
                              y: centroid.y,
                            });
                          }
                        }
                      }}
                      onClick={() => {
                        if (path.code && onSelectCountry) {
                          onSelectCountry(path.code);
                        }
                      }}
                    />
                  );
                })}
              </g>

              {/* Data Radar Pins for Active Countries ONLY */}
              {activeList.map((item) => {
                if (!item.centroid) return null;
                const { x, y } = item.centroid;
                const intensity = Math.min(1, Math.max(0.3, item.count / maxCount));
                const radius = Math.min(22, Math.max(9, 9 + (item.count / maxCount) * 12));
                const isSelected = selectedCountry === item.code;

                return (
                  <g
                    key={item.code}
                    className="cursor-pointer group"
                    onClick={() => onSelectCountry && onSelectCountry(item.code)}
                    onMouseEnter={() =>
                      setHoveredCountry({
                        code: item.code,
                        name: item.name,
                        count: item.count,
                        pct: item.pct,
                        x,
                        y,
                      })
                    }
                  >
                    {/* Animated Radar Pulse Wave */}
                    <circle
                      cx={x}
                      cy={y}
                      r={radius + 8}
                      className="fill-blue-500/20 dark:fill-blue-400/25 animate-ping opacity-75"
                    />

                    {/* Outer Glow Ring */}
                    <circle
                      cx={x}
                      cy={y}
                      r={radius + 3}
                      className={`fill-blue-500/20 stroke-blue-500/60 transition-all ${
                        isSelected ? "stroke-[2] fill-blue-500/35" : "stroke-[1]"
                      }`}
                    />

                    {/* Core Solid Node */}
                    <circle
                      cx={x}
                      cy={y}
                      r={radius}
                      className="fill-blue-600 dark:fill-blue-500 stroke-background stroke-2 shadow-xl group-hover:scale-115 transition-transform"
                      style={{ fillOpacity: 0.85 + intensity * 0.15 }}
                    />

                    {/* Active Country ISO Code Badge */}
                    <text
                      x={x}
                      y={y + 3.5}
                      textAnchor="middle"
                      className="text-[9.5px] font-bold font-mono fill-white select-none pointer-events-none drop-shadow-sm"
                    >
                      {item.code}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Rich Tooltip Overlay */}
          {hoveredCountry && (
            <div
              className="absolute z-30 pointer-events-none px-3 py-2 rounded-xl bg-card/95 border border-border shadow-xl backdrop-blur-md text-xs animate-in fade-in zoom-in-95 duration-100 min-w-[130px]"
              style={{
                left: `${Math.max(10, Math.min(90, (hoveredCountry.x / 2000) * 100))}%`,
                top: `${Math.max(12, Math.min(88, (hoveredCountry.y / 857) * 100))}%`,
                transform: "translate(-50%, -125%)",
              }}
            >
              <div className="flex items-center gap-2 font-bold text-foreground">
                <span className="text-base leading-none">
                  {getCountryFlag(hoveredCountry.code)}
                </span>
                <span className="truncate">{hoveredCountry.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground ml-auto">
                  ({hoveredCountry.code})
                </span>
              </div>

              <div className="mt-1 pt-1 border-t border-border/60 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Requests / Downloads:</span>
                <strong className="text-blue-600 dark:text-blue-400 font-mono font-bold">
                  {hoveredCountry.count} ({hoveredCountry.pct}%)
                </strong>
              </div>
            </div>
          )}

          {/* Empty State Banner if no geo visits */}
          {activeList.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-background/50 backdrop-blur-[2px] text-center space-y-1">
              <MapPin className="w-5 h-5 text-muted-foreground animate-bounce" />
              <p className="text-xs font-semibold text-foreground">No Visitor Locations Detected Yet</p>
              <p className="text-[11px] text-muted-foreground max-w-sm">
                As soon as users download or view files through Cloudflare edge nodes, requests will plot here automatically.
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Alternative Tabular Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto p-1">
          {activeList.length === 0 ? (
            <div className="col-span-full py-8 text-center text-xs text-muted-foreground">
              No geographical events recorded yet.
            </div>
          ) : (
            activeList.map((item) => {
              const isSelected = selectedCountry === item.code;
              return (
                <div
                  key={item.code}
                  onClick={() => onSelectCountry && onSelectCountry(item.code)}
                  className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 ${
                    isSelected
                      ? "bg-blue-500/10 border-blue-500/30 text-foreground"
                      : "bg-muted/20 hover:bg-muted/40 border-border text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg leading-none shrink-0">
                      {getCountryFlag(item.code)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate leading-tight">
                        {item.name}
                      </p>
                      <p className="text-[10px] font-mono text-muted-foreground">
                        {item.code}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                      {item.count}
                    </span>
                    <span className="block text-[9px] text-muted-foreground font-mono">
                      {item.pct}%
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Legend & Summary Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-muted-foreground pt-1 border-t border-border/50">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-2xs" />
            <span>Pulsing Pin: Active Edge Nodes</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500/30 border border-blue-500/60" />
            <span>Country Territory</span>
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono">
          <span>Density:</span>
          <span className="text-[10px]">1</span>
          <span className="w-14 h-1.5 rounded-full bg-gradient-to-r from-blue-500/30 via-blue-500/60 to-blue-500" />
          <span className="text-[10px]">{maxCount} hits</span>
        </div>
      </div>
    </div>
  );
}
