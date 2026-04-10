import React, { useCallback, useEffect, useState } from "react";
import {
  GitBranch,
  GitMerge,
  X,
  FilePlus,
  FileEdit,
  FileX,
  FileQuestion,
  ArrowRight,
  ChevronDown,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";

import type { WorktreeInfo, WorktreeFileStatus } from "../../store/worktreeStore";
import { useWorktreeStore } from "../../store/worktreeStore";
import { sendOrThrow } from "../../services/ipcClient";

type WorktreeDetailDialogProps = {
  worktree: WorktreeInfo;
  onClose: () => void;
};

/* ── Status badge for a single file ── */

const STATUS_CONFIG: Record<
  WorktreeFileStatus["status"],
  { label: string; color: string; bg: string; Icon: React.ElementType }
> = {
  added: { label: "Added", color: "#16A34A", bg: "#f0fdf4", Icon: FilePlus },
  modified: { label: "Modified", color: "#ca8a04", bg: "#fefce8", Icon: FileEdit },
  deleted: { label: "Deleted", color: "#dc2626", bg: "#fef2f2", Icon: FileX },
  renamed: { label: "Renamed", color: "#7c3aed", bg: "#f5f3ff", Icon: ArrowRight },
  copied: { label: "Copied", color: "#0284c7", bg: "#f0f9ff", Icon: FilePlus },
  untracked: { label: "Untracked", color: "#6b7280", bg: "#f9fafb", Icon: FileQuestion },
};

function FileStatusBadge({ status }: { status: WorktreeFileStatus["status"] }): React.ReactElement {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        fontWeight: 600,
        color: cfg.color,
        background: cfg.bg,
        padding: "2px 8px",
        borderRadius: 4,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      <cfg.Icon size={10} strokeWidth={2} />
      {cfg.label}
    </span>
  );
}

/* ── Main dialog ── */

export function WorktreeDetailDialog({
  worktree,
  onClose,
}: WorktreeDetailDialogProps): React.ReactElement {
  const {
    fetchWorktreeStatus,
    mergeWorktree,
    isStatusLoading,
    isMerging,
    mergeResult,
    clearMergeResult,
    statusCache,
  } = useWorktreeStore();

  const status = statusCache[worktree.worktreePath] ?? null;

  // Branch picker state
  const [branches, setBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>("");
  const [targetBranch, setTargetBranch] = useState<string>("");
  const [showBranchPicker, setShowBranchPicker] = useState(false);

  // Load status + branches on mount
  useEffect(() => {
    fetchWorktreeStatus(worktree.repoPath, worktree.worktreePath);
    clearMergeResult();

    // Fetch local branches
    sendOrThrow({ type: "worktree:branches", repoPath: worktree.repoPath })
      .then((resp) => {
        setBranches(resp.branches);
        setCurrentBranch(resp.current);
        // Default target: the current branch of the main repo
        setTargetBranch(resp.current);
      })
      .catch(() => {
        // ignore — branches will just be empty
      });
  }, [worktree.worktreePath, worktree.repoPath, fetchWorktreeStatus, clearMergeResult]);

  const handleMerge = useCallback(() => {
    if (!targetBranch || isMerging) return;
    mergeWorktree(worktree.repoPath, worktree.worktreePath, worktree.branch, targetBranch);
  }, [targetBranch, isMerging, mergeWorktree, worktree]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  const createdDate = new Date(worktree.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.35)",
          zIndex: 9998,
        }}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-label="Worktree details"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "#fff",
          borderRadius: 12,
          boxShadow:
            "0 16px 48px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.08)",
          width: 540,
          maxWidth: "90vw",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          zIndex: 9999,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px 12px",
            borderBottom: "1px solid #e5e2da",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <GitBranch size={16} color="#C15F3C" strokeWidth={2} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "#2c2c2c" }}>
              {worktree.name}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 24,
              height: 24,
              borderRadius: 4,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "#9a958c",
            }}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        {/* Meta info */}
        <div
          style={{
            padding: "12px 20px",
            borderBottom: "1px solid #f0ede8",
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            fontSize: 12,
            color: "#6b6560",
            flexShrink: 0,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <GitBranch size={12} strokeWidth={1.5} color="#C15F3C" />
            {worktree.branch}
          </span>
          <span style={{ color: "#9a958c" }}>Created {createdDate}</span>
          {status && (
            <span style={{ color: "#9a958c" }}>
              {status.ahead > 0 && `${status.ahead} ahead`}
              {status.ahead > 0 && status.behind > 0 && " · "}
              {status.behind > 0 && `${status.behind} behind`}
              {status.ahead === 0 && status.behind === 0 && "Up to date"}
            </span>
          )}
        </div>

        {/* Changed files list */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 20px",
            minHeight: 100,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#9a958c",
              marginBottom: 10,
            }}
          >
            Changed files
            {status && ` (${status.files.length})`}
          </div>

          {isStatusLoading && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "#9a958c",
                fontSize: 12,
                padding: "16px 0",
              }}
            >
              <Loader2 size={14} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
              Loading file status…
            </div>
          )}

          {!isStatusLoading && status && status.files.length === 0 && (
            <div style={{ color: "#9a958c", fontSize: 12, padding: "16px 0" }}>
              No changed files in this worktree.
            </div>
          )}

          {!isStatusLoading && status && status.files.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {status.files.map((file) => (
                <div
                  key={file.path}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    background: "#faf9f5",
                    borderRadius: 6,
                    border: "1px solid #f0ede8",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: "#2c2c2c",
                      fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                      minWidth: 0,
                    }}
                    title={file.path}
                  >
                    {file.path}
                  </span>
                  <div style={{ flexShrink: 0, marginLeft: 12 }}>
                    <FileStatusBadge status={file.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Merge section */}
        <div
          style={{
            borderTop: "1px solid #e5e2da",
            padding: "14px 20px 16px",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#9a958c",
              marginBottom: 10,
            }}
          >
            <GitMerge size={11} strokeWidth={2} style={{ marginRight: 4, verticalAlign: "middle" }} />
            Local merge (no push)
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                flex: 1,
                fontSize: 12,
                color: "#4a4540",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ fontWeight: 500 }}>{worktree.branch}</span>
              <ArrowRight size={12} strokeWidth={1.5} color="#9a958c" />

              {/* Target branch picker */}
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setShowBranchPicker(!showBranchPicker)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "5px 10px",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "#2c2c2c",
                    background: "#faf9f5",
                    border: "1px solid #e5e2da",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {targetBranch || "Select branch"}
                  <ChevronDown size={12} strokeWidth={1.5} />
                </button>

                {showBranchPicker && branches.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "100%",
                      left: 0,
                      marginBottom: 4,
                      background: "#fff",
                      border: "1px solid #e5e2da",
                      borderRadius: 8,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                      maxHeight: 180,
                      overflowY: "auto",
                      zIndex: 10,
                      minWidth: 160,
                    }}
                  >
                    {branches
                      .filter((b) => b !== worktree.branch)
                      .map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => {
                            setTargetBranch(b);
                            setShowBranchPicker(false);
                          }}
                          style={{
                            display: "block",
                            width: "100%",
                            padding: "8px 12px",
                            fontSize: 12,
                            color: b === targetBranch ? "#C15F3C" : "#2c2c2c",
                            fontWeight: b === targetBranch ? 600 : 400,
                            background: b === targetBranch ? "#faf5f2" : "transparent",
                            border: "none",
                            textAlign: "left",
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                          onMouseEnter={(e) => {
                            if (b !== targetBranch) e.currentTarget.style.background = "#faf9f5";
                          }}
                          onMouseLeave={(e) => {
                            if (b !== targetBranch) e.currentTarget.style.background = "transparent";
                          }}
                        >
                          {b}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleMerge}
              disabled={!targetBranch || isMerging}
              style={{
                padding: "7px 16px",
                fontSize: 12,
                fontWeight: 600,
                color: "#fff",
                background: !targetBranch || isMerging ? "#c4c1ba" : "#C15F3C",
                border: "none",
                borderRadius: 6,
                cursor: !targetBranch || isMerging ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                transition: "background 0.15s",
              }}
            >
              {isMerging ? (
                <>
                  <Loader2 size={12} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
                  Merging…
                </>
              ) : (
                <>
                  <GitMerge size={12} strokeWidth={2} />
                  Merge
                </>
              )}
            </button>
          </div>

          {/* Merge result */}
          {mergeResult && (
            <div
              style={{
                marginTop: 10,
                padding: "8px 12px",
                fontSize: 12,
                borderRadius: 6,
                display: "flex",
                alignItems: "flex-start",
                gap: 6,
                background: mergeResult.success ? "#f0fdf4" : "#fef2f2",
                color: mergeResult.success ? "#16A34A" : "#dc2626",
                border: `1px solid ${mergeResult.success ? "#bbf7d0" : "#fecaca"}`,
              }}
            >
              {mergeResult.success ? (
                <Check size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
              ) : (
                <AlertCircle size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
              )}
              <span style={{ lineHeight: 1.4 }}>{mergeResult.message}</span>
            </div>
          )}
        </div>
      </div>

      {/* Spinner animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
