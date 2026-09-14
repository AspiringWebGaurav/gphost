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
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
        <Shield className="w-3 h-3" />
        {eventType}
      </span>
    );
  }
  if (eventType.startsWith("ADMIN_FILE")) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
        <FileBox className="w-3 h-3" />
        {eventType}
      </span>
    );
  }
  if (eventType.startsWith("ADMIN_PIN")) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <KeyRound className="w-3 h-3" />
        {eventType}
      </span>
    );
  }
  if (eventType.includes("XURL")) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
        <Globe className="w-3 h-3" />
        {eventType}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-neutral-800 text-neutral-300">
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
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search event type, actor email, resource ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-neutral-400">
          <Filter className="w-3.5 h-3.5 text-neutral-500" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-transparent border-none text-xs text-neutral-300 focus:outline-none cursor-pointer"
          >
            <option value="all" className="bg-neutral-900">All Event Types</option>
            {eventTypes.map((t) => (
              <option key={t} value={t} className="bg-neutral-900">
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-950/40 text-neutral-400 font-semibold">
                <th className="w-8 px-3 py-3"></th>
                <th className="px-4 py-3">Event Type</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Resource</th>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3 text-right">IP Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-neutral-500">
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
                        className="hover:bg-neutral-800/30 cursor-pointer transition select-none"
                      >
                        <td className="px-3 py-3 text-neutral-500">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-purple-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {getEventBadge(log.event_type)}
                        </td>

                        <td className="px-4 py-3">
                          <div className="font-medium text-white">
                            {log.actor_email}
                          </div>
                          {log.actor_name && (
                            <div className="text-[11px] text-neutral-500">
                              {log.actor_name}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 font-mono text-[11px]">
                          <span className="text-neutral-400">
                            {log.resource_type}
                          </span>
                          {log.resource_id && (
                            <span className="text-neutral-500 ml-1.5 truncate max-w-[120px] inline-block align-bottom">
                              ({log.resource_id.slice(0, 8)}...)
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 font-mono text-[11px] text-neutral-400">
                          {new Date(log.created_at).toLocaleString()}
                        </td>

                        <td className="px-4 py-3 text-right font-mono text-[11px] text-neutral-500">
                          {log.ip_hash ? `${log.ip_hash.slice(0, 10)}...` : "—"}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-neutral-950/60 border-b border-neutral-800/80">
                          <td colSpan={6} className="p-4">
                            <div className="bg-neutral-950 rounded-xl p-3 border border-neutral-800/80 space-y-2">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-semibold text-neutral-400">
                                  Audit Metadata Payload
                                </span>
                                <span className="font-mono text-neutral-600">
                                  Log ID: {log.id}
                                </span>
                              </div>
                              <pre className="text-[11px] font-mono text-neutral-300 overflow-x-auto p-2 bg-neutral-900/80 rounded-lg border border-neutral-800">
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
