"use client";

import React, { useState } from "react";
import {
  Activity,
  Filter,
  Search,
  ChevronDown,
  ChevronRight,
  Shield,
  FileBox,
  KeyRound,
  Globe,
} from "lucide-react";

export interface AuditLogItem {
  id: string;
  actor_id: string | null;
  actor_email: string;
  actor_name: string | null;
  event_type: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_hash: string | null;
  created_at: string;
}

interface AuditLogsViewerProps {
  initialLogs: AuditLogItem[];
}

function getEventBadge(eventType: string) {
  if (eventType.startsWith("ADMIN_USER")) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
        <Shield className="w-3 h-3" />
        {eventType}
      </span>
    );
  }
  if (eventType.startsWith("ADMIN_FILE")) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
        <FileBox className="w-3 h-3" />
        {eventType}
      </span>
    );
  }
  if (eventType.startsWith("ADMIN_PIN")) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
        <KeyRound className="w-3 h-3" />
        {eventType}
      </span>
    );
  }
  if (eventType.includes("XURL")) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
        <Globe className="w-3 h-3" />
        {eventType}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-muted text-muted-foreground border border-border">
      <Activity className="w-3 h-3" />
      {eventType}
    </span>
  );
}

export function AuditLogsViewer({ initialLogs }: AuditLogsViewerProps) {
  const [logs] = useState<AuditLogItem[]>(initialLogs);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.event_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.actor_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.resource_id && log.resource_id.includes(searchTerm));
    const matchesType = typeFilter === "all" || log.event_type === typeFilter;
    return matchesSearch && matchesType;
  });

  const eventTypes = Array.from(new Set(logs.map((l) => l.event_type)));

  return (
    <div className="space-y-6">
      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search event type, actor email, resource ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-card border border-border rounded-xl px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-transparent border-none text-xs text-foreground focus:outline-none cursor-pointer"
          >
            <option value="all" className="bg-popover text-popover-foreground">All Event Types</option>
            {eventTypes.map((t) => (
              <option key={t} value={t} className="bg-popover text-popover-foreground">
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold">
                <th className="w-8 px-3 py-3"></th>
                <th className="px-4 py-3">Event Type</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Resource</th>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3 text-right">IP Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-foreground">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-muted-foreground">
                    No audit records matching criteria.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isExpanded = expandedIds.has(log.id);

                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        onClick={() => toggleExpand(log.id)}
                        className="hover:bg-muted/40 cursor-pointer transition select-none"
                      >
                        <td className="px-3 py-3 text-muted-foreground">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-primary" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {getEventBadge(log.event_type)}
                        </td>

                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">
                            {log.actor_email}
                          </div>
                          {log.actor_name && (
                            <div className="text-[11px] text-muted-foreground">
                              {log.actor_name}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 font-mono text-[11px]">
                          <span className="text-foreground">
                            {log.resource_type}
                          </span>
                          {log.resource_id && (
                            <span className="text-muted-foreground ml-1.5 truncate max-w-[120px] inline-block align-bottom">
                              ({log.resource_id.slice(0, 8)}...)
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
                        </td>

                        <td className="px-4 py-3 text-right font-mono text-[11px] text-muted-foreground">
                          {log.ip_hash ? `${log.ip_hash.slice(0, 10)}...` : "—"}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-muted/20 border-b border-border">
                          <td colSpan={6} className="p-4">
                            <div className="bg-background rounded-xl p-3 border border-border space-y-2">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-semibold text-foreground">
                                  Audit Metadata Payload
                                </span>
                                <span className="font-mono text-muted-foreground">
                                  Log ID: {log.id}
                                </span>
                              </div>
                              <pre className="text-[11px] font-mono text-foreground overflow-x-auto p-2.5 bg-muted/40 rounded-lg border border-border">
                                {JSON.stringify(log.metadata, null, 2)}
                              </pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
