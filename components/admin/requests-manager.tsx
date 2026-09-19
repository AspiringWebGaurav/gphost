"use client";

import React, { useState, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  X,
  Search,
  KeyRound,
  HardDrive,
  FileBox,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  UserCheck,
  Ban,
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

function generateRandomPin(): string {
  if (typeof window !== "undefined" && window.crypto) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return (1000 + (array[0] % 9000)).toString();
  }
  return "5839";
}

const emptySubscribe = () => () => {};
function useIsMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export function RequestsManager({
  initialRequests,
}: RequestsManagerProps) {
  const mounted = useIsMounted();
  const [requests, setRequests] = useState<AccessRequestItem[]>(initialRequests);
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");
  const [searchTerm, setSearchTerm] = useState("");

  // Approval & Issue PIN modal state
  const [approvingItem, setApprovingItem] = useState<AccessRequestItem | null>(null);
  const [fileLimitPreset, setFileLimitPreset] = useState<string>("5");
  const [customFileLimit, setCustomFileLimit] = useState<number>(5);
  const [quotaPreset, setQuotaPreset] = useState<string>("5gb");
  const [expiryHours, setExpiryHours] = useState<number>(168); // 7 days default
  const [generatedPin, setGeneratedPin] = useState<string>("7294");

  // Revealed Plaintext PIN Modal (after successful approval)
  const [revealedPin, setRevealedPin] = useState<{
    pin: string;
    applicantEmail: string;
    applicantName: string | null;
    maxFiles: number | null;
    quotaBytes: number | null;
    expiresAt: string | null;
  } | null>(null);
  const [copiedPinOnly, setCopiedPinOnly] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Rejection modal state
  const [rejectingItem, setRejectingItem] = useState<AccessRequestItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!isProcessing) {
          setApprovingItem(null);
          setRejectingItem(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isProcessing]);

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const historyRequests = requests.filter((r) => r.status !== "pending");

  const currentList = (activeTab === "pending" ? pendingRequests : historyRequests).filter(
    (r) =>
      r.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.full_name && r.full_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const regeneratePin = () => {
    setGeneratedPin(generateRandomPin());
  };

  const computeQuotaBytes = (): number | null => {
    switch (quotaPreset) {
      case "100mb":
        return 100 * 1024 * 1024;
      case "500mb":
        return 500 * 1024 * 1024;
      case "1gb":
        return 1024 * 1024 * 1024;
      case "5gb":
        return 5 * 1024 * 1024 * 1024;
      case "10gb":
        return 10 * 1024 * 1024 * 1024;
      case "unlimited":
        return -1;
      default:
        return 5 * 1024 * 1024 * 1024;
    }
  };

  const computeMaxFiles = (): number | null => {
    if (fileLimitPreset === "unlimited") return null;
    if (fileLimitPreset === "custom") return Math.max(1, Math.floor(customFileLimit));
    const parsed = parseInt(fileLimitPreset, 10);
    return isNaN(parsed) ? null : parsed;
  };

  const handleOpenApproveModal = (req: AccessRequestItem) => {
    setErrorMsg(null);
    setApprovingItem(req);
    setGeneratedPin(generateRandomPin());
  };

  const submitApprovalWithPin = async () => {
    if (!approvingItem) return;
    if (generatedPin.length !== 4) {
      setErrorMsg("Please provide a valid 4-digit PIN.");
      return;
    }

    setIsProcessing(approvingItem.id);
    setErrorMsg(null);

    try {
      const maxFiles = computeMaxFiles();
      const quotaBytes = computeQuotaBytes();
      const pinExpiresAt =
        expiryHours > 0
          ? new Date(Date.now() + expiryHours * 3600 * 1000).toISOString()
          : null;

      const res = await fetch(`/api/admin/requests/${approvingItem.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          issue_pin: true,
          pin: generatedPin,
          max_files: maxFiles,
          quota_bytes: quotaBytes,
          pin_expires_at: pinExpiresAt,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to approve request and issue PIN");
      }

      const issuedPin = data.pin?.plaintextPin || generatedPin;
      const appliedMaxFiles = data.pin?.max_files !== undefined ? data.pin.max_files : maxFiles;
      const appliedQuota = data.pin?.quota_bytes !== undefined ? data.pin.quota_bytes : quotaBytes;

      // Update local request state
      setRequests((prev) =>
        prev.map((r) =>
          r.id === approvingItem.id
            ? {
                ...r,
                status: "approved",
                reviewed_at: new Date().toISOString(),
                rejection_reason: `PIN Issued: ${issuedPin} | Limit: ${
                  appliedMaxFiles ? appliedMaxFiles + " files" : "Unlimited"
                }`,
              }
            : r
        )
      );

      // Show revealed PIN card modal with complete metadata
      setRevealedPin({
        pin: issuedPin,
        applicantEmail: approvingItem.email,
        applicantName: approvingItem.full_name,
        maxFiles: appliedMaxFiles,
        quotaBytes: appliedQuota,
        expiresAt: pinExpiresAt,
      });

      setSuccessToast(`Access approved and PIN ${issuedPin} successfully generated for ${approvingItem.email}!`);
      setApprovingItem(null);
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
        throw new Error(data.message || data.error || "Failed to reject access request");
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
      setSuccessToast(`Access request from ${rejectingItem.email} rejected.`);
      setRejectingItem(null);
      setRejectionReason("");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Rejection failed");
    } finally {
      setIsProcessing(null);
    }
  };

  const handleRevokeApprovedRequest = async (req: AccessRequestItem) => {
    if (!confirm(`Are you sure you want to revoke access for ${req.email}? The user will be immediately logged out and their account deactivated.`)) {
      return;
    }

    setIsProcessing(req.id);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/requests/${req.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "revoke",
          rejection_reason: "Access revoked by administrator",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || "Failed to revoke access");
      }

      setRequests((prev) =>
        prev.map((r) =>
          r.id === req.id
            ? {
                ...r,
                status: "rejected",
                reviewed_at: new Date().toISOString(),
                rejection_reason: "Access revoked by administrator",
              }
            : r
        )
      );
      setSuccessToast(`Access for ${req.email} has been revoked. User session terminated.`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to revoke access");
    } finally {
      setIsProcessing(null);
    }
  };

  const handleCopyPinOnly = () => {
    if (!revealedPin) return;
    navigator.clipboard.writeText(revealedPin.pin);
    setCopiedPinOnly(true);
    setTimeout(() => setCopiedPinOnly(false), 2000);
  };

  const handleCopyInvitation = () => {
    if (!revealedPin) return;
    const quotaLabel = revealedPin.quotaBytes === -1 ? "Unlimited" : revealedPin.quotaBytes ? `${Math.round(revealedPin.quotaBytes / (1024 * 1024 * 1024))} GB` : "5 GB";
    const filesLabel = revealedPin.maxFiles ? `${revealedPin.maxFiles} files` : "Unlimited files";
    const activationUrl = typeof window !== "undefined" ? `${window.location.origin}/access-gate` : "https://gphost.eu.cc/access-gate";
    const greeting = revealedPin.applicantName ? `Hi ${revealedPin.applicantName}!` : "Hi!";
    const text = `${greeting} Your GPHosting access request has been approved.\n\n🔑 Your 4-Digit Onboarding PIN: ${revealedPin.pin}\n📦 Access Allocation: ${filesLabel} • ${quotaLabel} storage\n\nEnter your PIN at: ${activationUrl} to activate your encrypted vault!`;
    navigator.clipboard.writeText(text);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 flex items-center gap-2 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Success Toast Banner */}
      {successToast && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center justify-between text-xs animate-in fade-in">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{successToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessToast(null)}
            className="text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Tabs and Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("pending")}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition flex items-center gap-2 cursor-pointer ${
              activeTab === "pending"
                ? "bg-purple-600 text-white shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pending Review</span>
            {pendingRequests.length > 0 && (
              <span className="bg-purple-700 dark:bg-purple-800 text-white px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                {pendingRequests.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition flex items-center gap-2 cursor-pointer ${
              activeTab === "history"
                ? "bg-purple-600 text-white shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Decision History</span>
            <span className="text-muted-foreground text-[10px] font-mono">
              ({historyRequests.length})
            </span>
          </button>
        </div>

        <div className="relative max-w-xs w-full">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search email or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-background border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 transition"
          />
        </div>
      </div>

      {/* Requests Container: Responsive Cards on Mobile (< md), Full Table on Desktop (md+) */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xs">
        {/* MOBILE CARDS VIEW (< md) */}
        <div className="md:hidden divide-y divide-border">
          {currentList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">
              {activeTab === "pending"
                ? "No pending access requests awaiting review."
                : "No access request history found."}
            </div>
          ) : (
            currentList.map((req) => (
              <div key={req.id} className="p-4 space-y-3">
                {/* Header: Name, Email & Status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground text-xs truncate">
                      {req.full_name || "Unnamed Applicant"}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate font-mono">
                      {req.email}
                    </div>
                  </div>

                  <div className="shrink-0">
                    {req.status === "pending" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                        <Clock className="w-3 h-3" />
                        Pending
                      </span>
                    )}
                    {req.status === "approved" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                        <CheckCircle className="w-3 h-3" />
                        Approved
                      </span>
                    )}
                    {req.status === "rejected" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20">
                        <XCircle className="w-3 h-3" />
                        Rejected
                      </span>
                    )}
                  </div>
                </div>

                {/* Details box */}
                <div className="p-2.5 rounded-xl bg-muted/30 border border-border/60 text-[11px] space-y-1">
                  <div className="text-muted-foreground">
                    <span className="text-muted-foreground/80">Requested: </span>
                    <span className="font-mono text-foreground">
                      {new Date(req.requested_at).toLocaleString()}
                    </span>
                  </div>

                  {req.notes && (
                    <div className="text-foreground pt-0.5">
                      <span className="text-muted-foreground text-[10px] uppercase font-semibold block">Notes:</span>
                      <p className="mt-0.5 leading-snug">{req.notes}</p>
                    </div>
                  )}

                  {activeTab === "history" && req.rejection_reason && (
                    <div className="pt-1">
                      <span className="text-muted-foreground text-[10px] uppercase font-semibold block">Decision / PIN:</span>
                      <span className="font-mono text-purple-700 dark:text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 font-semibold inline-block mt-0.5">
                        {req.rejection_reason}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                {req.status === "pending" && (
                  <div className="flex items-center justify-end gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setRejectingItem(req);
                        setRejectionReason("");
                      }}
                      disabled={isProcessing === req.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-muted hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 text-muted-foreground font-medium text-xs transition border border-border cursor-pointer disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleOpenApproveModal(req);
                      }}
                      disabled={isProcessing === req.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-[0.98] text-white font-semibold text-xs transition shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Approve &amp; Issue PIN</span>
                    </button>
                  </div>
                )}

                {req.status === "approved" && (
                  <div className="flex items-center justify-end pt-0.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRevokeApprovedRequest(req);
                      }}
                      disabled={isProcessing === req.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 active:scale-[0.98] text-rose-600 dark:text-rose-400 font-medium text-xs transition border border-rose-500/20 cursor-pointer disabled:opacity-50 shadow-2xs"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Revoke Access</span>
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* DESKTOP TABLE VIEW (hidden on mobile, block on md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                <th className="px-4 py-3">Applicant</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Requested At</th>
                <th className="px-4 py-3">Notes / Purpose</th>
                {activeTab === "history" && <th className="px-4 py-3">Review Decision &amp; PIN</th>}
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-muted-foreground">
              {currentList.length === 0 ? (
                <tr>
                  <td
                    colSpan={activeTab === "history" ? 6 : 5}
                    className="text-center py-10 text-muted-foreground"
                  >
                    {activeTab === "pending"
                      ? "No pending access requests awaiting review."
                      : "No access request history found."}
                  </td>
                </tr>
              ) : (
                currentList.map((req) => (
                  <tr key={req.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-foreground">
                          {req.full_name || "Unnamed"}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {req.email}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      {req.status === "pending" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                          <Clock className="w-3 h-3" />
                          Pending
                        </span>
                      )}
                      {req.status === "approved" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                          <CheckCircle className="w-3 h-3" />
                          Approved
                        </span>
                      )}
                      {req.status === "rejected" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20">
                          <XCircle className="w-3 h-3" />
                          Rejected
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-muted-foreground text-[11px] font-mono">
                      {new Date(req.requested_at).toLocaleString()}
                    </td>

                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate text-[11px]">
                      {req.notes ? (
                        <span className="text-foreground font-medium">{req.notes}</span>
                      ) : (
                        <span className="text-muted-foreground/60 italic">No notes provided</span>
                      )}
                    </td>

                    {activeTab === "history" && (
                      <td className="px-4 py-3 text-[11px]">
                        {req.rejection_reason ? (
                          <div className="space-y-0.5">
                            <span className="font-mono text-purple-700 dark:text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 font-semibold inline-block">
                              {req.rejection_reason}
                            </span>
                            {req.reviewed_at && (
                              <div className="text-[10px] text-muted-foreground font-mono">
                                Reviewed: {new Date(req.reviewed_at).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        ) : req.reviewed_at ? (
                          <span className="text-muted-foreground font-mono">
                            {new Date(req.reviewed_at).toLocaleString()}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}

                    <td className="px-4 py-3 text-right">
                      {req.status === "pending" ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleOpenApproveModal(req);
                            }}
                            disabled={isProcessing === req.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-[0.98] text-white font-semibold text-[11px] transition shadow-xs cursor-pointer disabled:opacity-50"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>Approve &amp; Issue PIN</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setRejectingItem(req);
                              setRejectionReason("");
                            }}
                            disabled={isProcessing === req.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-muted hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 text-muted-foreground font-medium text-[11px] transition border border-border cursor-pointer disabled:opacity-50"
                          >
                            <XCircle className="w-3 h-3" />
                            <span>Reject</span>
                          </button>
                        </div>
                      ) : req.status === "approved" ? (
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleRevokeApprovedRequest(req);
                            }}
                            disabled={isProcessing === req.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 active:scale-[0.98] text-rose-600 dark:text-rose-400 font-medium text-[11px] transition border border-rose-500/20 cursor-pointer disabled:opacity-50 shadow-2xs"
                          >
                            <Ban className="w-3 h-3" />
                            <span>Revoke Access</span>
                          </button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/60 text-[11px] italic">
                          {req.status === "rejected" ? "Rejected" : "Completed"}
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

      {/* APPROVE & ISSUE PIN MODAL (PORTALED DIRECTLY TO BODY) */}
      {mounted && approvingItem && createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isProcessing) {
              setApprovingItem(null);
            }
          }}
        >
          <div 
            className="bg-card border border-border text-card-foreground rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Approve Request &amp; Issue PIN
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Configure file access limits and generate 4-digit onboarding credentials.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setApprovingItem(null)}
                disabled={Boolean(isProcessing)}
                className="text-muted-foreground hover:text-foreground cursor-pointer p-1 rounded-lg hover:bg-muted transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 flex items-center gap-2 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Applicant Summary */}
            <div className="p-3 rounded-xl bg-muted/40 border border-border/70 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Applicant:</span>
                <span className="font-semibold text-foreground">{approvingItem.email}</span>
              </div>
              {approvingItem.notes && (
                <div className="flex items-start justify-between gap-2 pt-1 border-t border-border/40">
                  <span className="text-muted-foreground shrink-0">Purpose:</span>
                  <span className="text-foreground text-right italic font-normal">{approvingItem.notes}</span>
                </div>
              )}
            </div>

            {/* Config: File Access Limit */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <FileBox className="w-3.5 h-3.5 text-purple-500" />
                  <span>How many files can this user access/upload?</span>
                </label>
                <span className="text-[11px] font-mono text-purple-600 dark:text-purple-400 font-semibold">
                  {fileLimitPreset === "unlimited" ? "Unlimited Files" : `${computeMaxFiles()} files max`}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs">
                {[
                  { label: "1 File", val: "1" },
                  { label: "3 Files", val: "3" },
                  { label: "5 Files", val: "5" },
                  { label: "10 Files", val: "10" },
                  { label: "25 Files", val: "25" },
                  { label: "50 Files", val: "50" },
                  { label: "Unlimited", val: "unlimited" },
                  { label: "Custom", val: "custom" },
                ].map((opt) => (
                  <button
                    key={opt.val}
                    type="button"
                    disabled={Boolean(isProcessing)}
                    onClick={() => setFileLimitPreset(opt.val)}
                    className={`py-2 px-2 rounded-xl text-xs font-medium border transition cursor-pointer text-center ${
                      fileLimitPreset === opt.val
                        ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                        : "bg-background border-border text-foreground hover:bg-muted"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {fileLimitPreset === "custom" && (
                <div className="pt-2">
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    disabled={Boolean(isProcessing)}
                    value={customFileLimit}
                    onChange={(e) => setCustomFileLimit(parseInt(e.target.value, 10) || 1)}
                    placeholder="Enter maximum file count..."
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                  />
                </div>
              )}
            </div>

            {/* Config: Storage Quota */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-blue-500" />
                <span>Storage Quota Allocation</span>
              </label>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  { label: "500 MB", val: "500mb" },
                  { label: "1 GB", val: "1gb" },
                  { label: "5 GB (Std)", val: "5gb" },
                  { label: "10 GB", val: "10gb" },
                  { label: "100 MB", val: "100mb" },
                  { label: "Unlimited", val: "unlimited" },
                ].map((opt) => (
                  <button
                    key={opt.val}
                    type="button"
                    disabled={Boolean(isProcessing)}
                    onClick={() => setQuotaPreset(opt.val)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-medium border transition cursor-pointer text-center ${
                      quotaPreset === opt.val
                        ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                        : "bg-background border-border text-foreground hover:bg-muted"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Config: PIN Code & Expiration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                  <span>Generated 4-Digit PIN</span>
                  <button
                    type="button"
                    onClick={regeneratePin}
                    disabled={Boolean(isProcessing)}
                    className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" /> Regenerate
                  </button>
                </label>
                <input
                  type="text"
                  maxLength={4}
                  disabled={Boolean(isProcessing)}
                  value={generatedPin}
                  onChange={(e) => setGeneratedPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="w-full font-mono text-center text-lg tracking-widest font-bold bg-background border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  PIN Expiration
                </label>
                <select
                  value={expiryHours}
                  disabled={Boolean(isProcessing)}
                  onChange={(e) => setExpiryHours(parseInt(e.target.value, 10))}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30 cursor-pointer"
                >
                  <option value={24}>Expires in 24 Hours</option>
                  <option value={168}>Expires in 7 Days (Default)</option>
                  <option value={720}>Expires in 30 Days</option>
                  <option value={0}>Never Expires</option>
                </select>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setApprovingItem(null)}
                disabled={Boolean(isProcessing)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitApprovalWithPin}
                disabled={Boolean(isProcessing) || generatedPin.length !== 4}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isProcessing === approvingItem.id ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Issuing PIN &amp; Granting Access...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Confirm &amp; Issue PIN</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* REVEALED PIN SUCCESS CARD (PORTALED DIRECTLY TO BODY WITH RICH UI/UX) */}
      {mounted && revealedPin && createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setRevealedPin(null);
            }
          }}
        >
          <div 
            className="bg-card border border-border text-card-foreground rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-5 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Animated Header Badge */}
            <div className="relative mx-auto w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-7 h-7" />
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[9px] font-bold">
                ✓
              </div>
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 mb-1.5">
                <Sparkles className="w-3 h-3" />
                <span>Fast-Track Access Granted</span>
              </div>
              <h3 className="text-lg font-bold text-foreground tracking-tight">
                Request Approved &amp; PIN Issued!
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Onboarding credentials created for <strong className="text-foreground">{revealedPin.applicantEmail}</strong>
              </p>
            </div>

            {/* Big PIN Display Card */}
            <div className="p-5 rounded-2xl bg-purple-500/10 border border-purple-500/30 space-y-3 relative group">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                <span>Invitation PIN</span>
                <span className="text-[10px] lowercase text-muted-foreground font-normal">one-time activation</span>
              </div>
              
              <div className="flex items-center justify-center gap-3">
                <div className="text-4xl sm:text-5xl font-mono font-extrabold tracking-widest text-purple-600 dark:text-purple-400 select-all">
                  {revealedPin.pin}
                </div>
                <button
                  type="button"
                  onClick={handleCopyPinOnly}
                  title="Copy 4-digit PIN only"
                  className="p-2 rounded-xl bg-purple-600/10 hover:bg-purple-600/20 text-purple-600 dark:text-purple-400 transition cursor-pointer"
                >
                  {copiedPinOnly ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              {/* Limit Badges */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px]">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-background/80 text-foreground font-medium border border-border/80 shadow-2xs">
                  <FileBox className="w-3.5 h-3.5 text-purple-500" />
                  <span>{revealedPin.maxFiles ? `${revealedPin.maxFiles} Active Files` : "Unlimited Files"}</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-background/80 text-foreground font-medium border border-border/80 shadow-2xs">
                  <HardDrive className="w-3.5 h-3.5 text-blue-500" />
                  <span>{revealedPin.quotaBytes === -1 ? "Unlimited Storage" : revealedPin.quotaBytes ? `${Math.round(revealedPin.quotaBytes / (1024 * 1024 * 1024))} GB Storage` : "5 GB Storage"}</span>
                </span>
              </div>
            </div>

            {/* Direct Activation Gate URL */}
            <div className="p-2.5 rounded-xl bg-muted/50 border border-border text-left text-[11px] flex items-center justify-between gap-2">
              <div className="truncate">
                <span className="text-muted-foreground block text-[10px]">Activation Gate URL:</span>
                <span suppressHydrationWarning className="font-mono text-foreground font-medium">
                  {typeof window !== "undefined" ? `${window.location.origin}/access-gate` : "https://gphost.eu.cc/access-gate"}
                </span>
              </div>
              <a
                href="/access-gate"
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs shrink-0 flex items-center gap-1"
              >
                <span>Open</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleCopyInvitation}
                className="w-full h-11 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition shadow-sm cursor-pointer"
              >
                {copiedInvite ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    <span>Invitation Message Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Full Invitation &amp; Instructions</span>
                  </>
                )}
              </button>
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyPinOnly}
                  className="flex-1 h-9 rounded-xl border border-border bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  {copiedPinOnly ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedPinOnly ? "PIN Copied!" : "Copy PIN Only"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRevealedPin(null);
                    setActiveTab("history");
                  }}
                  className="flex-1 h-9 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold transition cursor-pointer"
                >
                  Done &amp; View History
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* REJECTION MODAL (PORTALED DIRECTLY TO BODY) */}
      {mounted && rejectingItem && createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isProcessing) {
              setRejectingItem(null);
            }
          }}
        >
          <div 
            className="bg-card border border-border text-card-foreground rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                <h3 className="text-sm font-semibold text-foreground">
                  Reject Access Request
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRejectingItem(null)}
                className="text-muted-foreground hover:text-foreground cursor-pointer p-1 rounded-lg hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-muted-foreground">
              Are you sure you want to reject access for{" "}
              <strong className="text-foreground">{rejectingItem.email}</strong>?
            </p>

            <div className="space-y-1.5">
              <label className="text-muted-foreground font-medium">
                Rejection Reason (Optional)
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this request was not approved..."
                rows={3}
                className="w-full bg-background border border-border rounded-xl p-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 resize-none text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setRejectingItem(null)}
                disabled={isProcessing === rejectingItem.id}
                className="px-3.5 py-1.5 rounded-xl text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReject}
                disabled={isProcessing === rejectingItem.id}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium transition cursor-pointer disabled:opacity-50"
              >
                {isProcessing === rejectingItem.id && (
                  <Loader2 className="w-3 h-3 animate-spin" />
                )}
                <span>Confirm Rejection</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
