"use client";

import React, { useState } from "react";
import {
  UserCheck,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  X,
  Search,
} from "lucide-react";

export interface AccessRequestItem {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  notes: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
}

interface RequestsManagerProps {
  initialRequests: AccessRequestItem[];
}

export function RequestsManager({ initialRequests }: RequestsManagerProps) {
  const [requests, setRequests] = useState<AccessRequestItem[]>(initialRequests);
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");
  const [searchTerm, setSearchTerm] = useState("");

  // Rejection modal
  const [rejectingItem, setRejectingItem] = useState<AccessRequestItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const historyRequests = requests.filter((r) => r.status !== "pending");

  const currentList = (activeTab === "pending" ? pendingRequests : historyRequests).filter(
    (r) =>
      r.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.full_name && r.full_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleApprove = async (req: AccessRequestItem) => {
    setIsProcessing(req.id);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/requests/${req.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to approve access request");
      }

      setRequests((prev) =>
        prev.map((r) =>
          r.id === req.id
            ? { ...r, status: "approved", reviewed_at: new Date().toISOString() }
            : r
        )
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setIsProcessing(null);
    }
  };

  const submitReject = async () => {
    if (!rejectingItem) return;
    setIsProcessing(rejectingItem.id);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/requests/${rejectingItem.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          rejection_reason: rejectionReason || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to reject access request");
      }

      setRequests((prev) =>
        prev.map((r) =>
          r.id === rejectingItem.id
            ? {
                ...r,
                status: "rejected",
                reviewed_at: new Date().toISOString(),
                rejection_reason: rejectionReason || null,
              }
            : r
        )
      );
      setRejectingItem(null);
      setRejectionReason("");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Rejection failed");
    } finally {
      setIsProcessing(null);
    }
  };

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Tabs and Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-xl border border-neutral-800 text-xs">
          <button
            onClick={() => setActiveTab("pending")}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition flex items-center gap-2 ${
              activeTab === "pending"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pending Review</span>
            {pendingRequests.length > 0 && (
              <span className="bg-purple-800/80 px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                {pendingRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition flex items-center gap-2 ${
              activeTab === "history"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Decision History</span>
            <span className="text-neutral-500 text-[10px] font-mono">
              ({historyRequests.length})
            </span>
          </button>
        </div>

        <div className="relative max-w-xs w-full">
          <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search email or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-purple-500"
          />
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-950/40 text-neutral-400 font-semibold">
                <th className="px-4 py-3">Applicant</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Requested At</th>
                <th className="px-4 py-3">Notes / Purpose</th>
                {activeTab === "history" && <th className="px-4 py-3">Reviewed At</th>}
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
              {currentList.length === 0 ? (
                <tr>
                  <td
                    colSpan={activeTab === "history" ? 6 : 5}
                    className="text-center py-10 text-neutral-500"
                  >
                    {activeTab === "pending"
                      ? "No pending access requests awaiting review."
                      : "No access request history found."}
                  </td>
                </tr>
              ) : (
                currentList.map((req) => (
                  <tr key={req.id} className="hover:bg-neutral-800/30 transition">
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-white">
                          {req.full_name || "Unnamed"}
                        </div>
                        <div className="text-[11px] text-neutral-500 font-mono">
                          {req.email}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      {req.status === "pending" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Clock className="w-3 h-3" />
                          Pending
                        </span>
                      )}
                      {req.status === "approved" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle className="w-3 h-3" />
                          Approved
                        </span>
                      )}
                      {req.status === "rejected" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                          <XCircle className="w-3 h-3" />
                          Rejected
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-neutral-400 text-[11px] font-mono">
                      {new Date(req.requested_at).toLocaleString()}
                    </td>

                    <td className="px-4 py-3 text-neutral-400 max-w-xs truncate text-[11px]">
                      {req.notes || (
                        <span className="text-neutral-600 italic">No notes</span>
                      )}
                      {req.rejection_reason && (
                        <div className="text-[10px] text-red-400 mt-0.5">
                          Reason: {req.rejection_reason}
                        </div>
                      )}
                    </td>

                    {activeTab === "history" && (
                      <td className="px-4 py-3 text-neutral-500 text-[11px] font-mono">
                        {req.reviewed_at
                          ? new Date(req.reviewed_at).toLocaleString()
                          : "—"}
                      </td>
                    )}

                    <td className="px-4 py-3 text-right">
                      {req.status === "pending" ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleApprove(req)}
                            disabled={isProcessing === req.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[11px] transition disabled:opacity-50"
                          >
                            {isProcessing === req.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <CheckCircle className="w-3 h-3" />
                            )}
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={() => {
                              setRejectingItem(req);
                              setRejectionReason("");
                            }}
                            disabled={isProcessing === req.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-red-950/60 hover:text-red-400 text-neutral-300 font-medium text-[11px] transition disabled:opacity-50"
                          >
                            <XCircle className="w-3 h-3" />
                            <span>Reject</span>
                          </button>
                        </div>
                      ) : (
                        <span className="text-neutral-600 text-[11px] italic">
                          Decided
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject Modal */}
      {rejectingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-semibold text-white">
                  Reject Access Request
                </h3>
              </div>
              <button
                onClick={() => setRejectingItem(null)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-neutral-300">
              Are you sure you want to reject access for{" "}
              <strong className="text-white">{rejectingItem.email}</strong>?
            </p>

            <div className="space-y-1.5">
              <label className="text-neutral-400 font-medium">
                Rejection Reason (Optional)
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this request was not approved..."
                rows={3}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-2.5 text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-purple-500 resize-none text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
              <button
                onClick={() => setRejectingItem(null)}
                disabled={isProcessing === rejectingItem.id}
                className="px-3.5 py-1.5 rounded-xl text-neutral-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={submitReject}
                disabled={isProcessing === rejectingItem.id}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium transition disabled:opacity-50"
              >
                {isProcessing === rejectingItem.id && (
                  <Loader2 className="w-3 h-3 animate-spin" />
                )}
                <span>Confirm Rejection</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
