"use client";

import React, { useState } from "react";
import { Globe2 } from "lucide-react";

interface WorldMapProps {
  countries: { country: string; count: number }[];
}

// Major country centroids and coordinates on an 800x400 SVG canvas
interface CountryNode {
  code: string;
  name: string;
  x: number;
  y: number;
  region: string;
}

const COUNTRY_NODES: CountryNode[] = [
  { code: "US", name: "United States", x: 180, y: 140, region: "North America" },
  { code: "CA", name: "Canada", x: 190, y: 90, region: "North America" },
  { code: "MX", name: "Mexico", x: 170, y: 180, region: "North America" },
  { code: "BR", name: "Brazil", x: 280, y: 260, region: "South America" },
  { code: "AR", name: "Argentina", x: 260, y: 320, region: "South America" },
  { code: "GB", name: "United Kingdom", x: 380, y: 110, region: "Europe" },
  { code: "DE", name: "Germany", x: 410, y: 115, region: "Europe" },
  { code: "FR", name: "France", x: 395, y: 130, region: "Europe" },
  { code: "NL", name: "Netherlands", x: 405, y: 110, region: "Europe" },
  { code: "IT", name: "Italy", x: 420, y: 145, region: "Europe" },
  { code: "ES", name: "Spain", x: 375, y: 150, region: "Europe" },
  { code: "SE", name: "Sweden", x: 425, y: 80, region: "Europe" },
  { code: "PL", name: "Poland", x: 435, y: 115, region: "Europe" },
  { code: "UA", name: "Ukraine", x: 465, y: 120, region: "Europe" },
  { code: "IN", name: "India", x: 550, y: 195, region: "Asia" },
  { code: "CN", name: "China", x: 620, y: 160, region: "Asia" },
  { code: "JP", name: "Japan", x: 695, y: 155, region: "Asia" },
  { code: "SG", name: "Singapore", x: 605, y: 235, region: "Asia" },
  { code: "KR", name: "South Korea", x: 665, y: 155, region: "Asia" },
  { code: "ID", name: "Indonesia", x: 635, y: 250, region: "Asia" },
  { code: "AU", name: "Australia", x: 680, y: 300, region: "Oceania" },
  { code: "NZ", name: "New Zealand", x: 740, y: 340, region: "Oceania" },
  { code: "ZA", name: "South Africa", x: 435, y: 290, region: "Africa" },
  { code: "NG", name: "Nigeria", x: 390, y: 210, region: "Africa" },
  { code: "EG", name: "Egypt", x: 445, y: 165, region: "Africa" },
  { code: "AE", name: "United Arab Emirates", x: 485, y: 180, region: "Middle East" },
  { code: "SA", name: "Saudi Arabia", x: 465, y: 185, region: "Middle East" },
];

export function WorldMap({ countries }: WorldMapProps) {
  const [hoveredNode, setHoveredNode] = useState<{
    code: string;
    name: string;
    count: number;
    x: number;
    y: number;
  } | null>(null);

  // Map country counts by uppercase ISO code
  const countMap = new Map<string, number>();
  let maxCount = 1;

  for (const c of countries) {
    const code = c.country.toUpperCase();
    countMap.set(code, (countMap.get(code) || 0) + c.count);
    if (c.count > maxCount) maxCount = c.count;
  }

  const activeCountriesCount = Array.from(countMap.keys()).length;
  const totalDownloads = Array.from(countMap.values()).reduce((a, b) => a + b, 0);

  return (
    <div className="w-full rounded-2xl border border-border bg-card/60 p-3.5 space-y-2 relative overflow-hidden">
      {/* Title / Summary */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Globe2 className="w-4 h-4 text-blue-500" />
          <span className="font-semibold text-foreground">Global Download Reach</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
          <span>
            <strong className="text-foreground">{activeCountriesCount}</strong> countries
          </span>
          <span>&bull;</span>
          <span>
            <strong className="text-foreground">{totalDownloads}</strong> total events
          </span>
        </div>
      </div>

      {/* SVG Map Canvas */}
      <div className="relative w-full aspect-[2/1] bg-muted/20 dark:bg-zinc-950/40 rounded-xl border border-border/60 overflow-hidden flex items-center justify-center">
        {/* Subtle grid background */}
        <div
          className="absolute inset-0 opacity-[0.15] dark:opacity-[0.25]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "20px 20px",
          }}
        />

        <svg
          viewBox="0 0 800 400"
          className="w-full h-full select-none"
          onMouseLeave={() => setHoveredNode(null)}
        >
          {/* World map stylized continent outlines */}
          <g className="fill-muted/40 stroke-border/80 stroke-[1]">
            {/* North America */}
            <path d="M 120 70 Q 200 60 250 100 Q 230 160 170 190 Q 130 160 120 70 Z" />
            {/* South America */}
            <path d="M 230 200 Q 300 230 280 300 Q 250 360 240 330 Q 210 250 230 200 Z" />
            {/* Europe */}
            <path d="M 370 80 Q 450 70 470 120 Q 420 160 360 140 Q 350 100 370 80 Z" />
            {/* Africa */}
            <path d="M 370 160 Q 470 160 480 230 Q 440 320 400 300 Q 350 220 370 160 Z" />
            {/* Asia */}
            <path d="M 480 80 Q 680 70 710 160 Q 640 240 520 200 Q 480 140 480 80 Z" />
            {/* Australia */}
            <path d="M 640 270 Q 720 260 720 320 Q 660 350 630 310 Q 630 280 640 270 Z" />
          </g>

          {/* Data Nodes for active download locations */}
          {COUNTRY_NODES.map((node) => {
            const count = countMap.get(node.code) || 0;
            const hasActivity = count > 0;
            const intensity = hasActivity ? Math.min(1, Math.max(0.3, count / maxCount)) : 0;
            const radius = hasActivity ? Math.min(14, Math.max(5, 5 + (count / maxCount) * 8)) : 3;

            return (
              <g
                key={node.code}
                className="cursor-pointer transition-all duration-200"
                onMouseEnter={() =>
                  setHoveredNode({
                    code: node.code,
                    name: node.name,
                    count,
                    x: node.x,
                    y: node.y,
                  })
                }
              >
                {/* Outer pulse ring for high activity */}
                {hasActivity && count >= 2 && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={radius + 4}
                    className="fill-blue-500/20 animate-ping opacity-60"
                  />
                )}

                {/* Main node circle */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={radius}
                  className={`transition-all duration-300 ${
                    hasActivity
                      ? "fill-blue-500 stroke-background stroke-2 shadow-md hover:fill-blue-400 hover:scale-125"
                      : "fill-muted-foreground/30 hover:fill-muted-foreground/60"
                  }`}
                  style={hasActivity ? { fillOpacity: 0.6 + intensity * 0.4 } : {}}
                />

                {/* Country Code Label on Active Nodes */}
                {hasActivity && (
                  <text
                    x={node.x}
                    y={node.y - radius - 3}
                    textAnchor="middle"
                    className="text-[9px] font-mono font-bold fill-foreground select-none pointer-events-none"
                  >
                    {node.code}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredNode && (
          <div
            className="absolute z-20 pointer-events-none px-2.5 py-1.5 rounded-lg bg-card/95 border border-border shadow-lg text-[11px] backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
            style={{
              left: `${(hoveredNode.x / 800) * 100}%`,
              top: `${(hoveredNode.y / 400) * 100}%`,
              transform: "translate(-50%, -125%)",
            }}
          >
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              <span>{hoveredNode.name}</span>
              <span className="font-mono text-muted-foreground">({hoveredNode.code})</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {hoveredNode.count > 0 ? (
                <span className="text-blue-600 dark:text-blue-400 font-medium">
                  {hoveredNode.count} download{hoveredNode.count === 1 ? "" : "s"}
                </span>
              ) : (
                <span>No recorded downloads</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Map Legend */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1 pt-1">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          Active Download Density
        </span>
        <span className="flex items-center gap-1 font-mono">
          <span>Low</span>
          <span className="w-12 h-1.5 rounded-full bg-gradient-to-r from-blue-500/30 to-blue-500" />
          <span>High ({maxCount})</span>
        </span>
      </div>
    </div>
  );
}
