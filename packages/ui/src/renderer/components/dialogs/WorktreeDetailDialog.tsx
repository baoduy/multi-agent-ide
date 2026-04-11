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

import { colors } from "../../utils/colors";
import type { WorktreeInfo, WorktreeFileStatus } from "../../store/worktreeStore";
import { useWorktreeStore } from "../../store/worktreeStore";
import { sendOrThrow } from "../../services/ipcClient";
import { BaseDialog } from "../common/BaseDialog";

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

type WorktreeDetailDialogProps = {
  worktree: WorktreeInfo;
  onClose: () => void;
};

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

    sendOrThrow({ type: "worktree:branches", repoPath: worktree.repoPath })
      .then((resp) => {
        setBranches(resp.branches);
        setCurrentBranch(resp.current);
        setTargetBranch(resp.current);
      })
      .catch(() => {});
  }, [worktree.worktreePath, worktree.repoPath, fetchWorktreeStatus, clearMergeResult]);

  const handleMerge = useCallback(() => {
    if (!targetBranch || isMerging) return;
    mergeWorktree(worktree.repoPath, worktree.worktreePath, worktree.branch, targetBranch);
  }, [targetBranch, isMerging, mergeWorktree, worktree]);

  const createdDate = new Date(worktree.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <BaseDialog
      title={worktree.name}
      icon={<GitBranch size={16} color={colors.primary} strokeWidth={2} />}
      width={540}
      scrollable
      onClose={onClose}
    >
      {/* Meta info */}
      <div
        style={{
          marginTop: -4,
          marginBottom: 12,
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          fontSize: 12,
          color: colors.textSecondary,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <GitBranch size={12} strokeWidth={1.5} color={colors.primary} />
          {worktree.branch}
        </span>
        <span style={{ color: colors.textTertiary }}>Created {createdDate}</span>
        {status && (
          <span style={{ color: colors.textTertiary }}>
            {status.ahead > 0 && `${status.ahead} ahead`}
            {status.ahead > 0 && status.behind > 0 && " · "}
            {status.behind > 0 && `${status.behind} behind`}
            {status.ahead === 0 && status.behind === 0 && "Up to date"}
          </span>
        )}
      </div>

      {/* Changed files list */}
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: colors.textTertiary,
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
              color: colors.textTertiary,
              fontSize: 12,
              padding: "16px 0",
            }}
          >
            <Loader2 size={14} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
            Loading file status…
          </div>
        )}

        {!isStatusLoading && status && status.files.length === 0 && (
          <div style={{ color: colors.textTertiary, fontSize: 12, padding: "16px 0" }}>
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
                  background: colors.bgSurface,
                  borderRadius: 6,
                  border: `1px solid ${colors.borderLight}`,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: colors.text,
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
          borderTop: `1px solid ${colors.border}`,
          padding: "14px 0 0",
          marginTop: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: colors.textTertiary,
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
              color: colors.textMuted,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ fontWeight: 500 }}>{worktree.branch}</span>
            <ArrowRight size={12} strokeWidth={1.5} color={colors.textTertiary} />

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
                  color: colors.text,
                  background: colors.bgSurface,
                  border: `1px solid ${colors.border}`,
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
                    background: colors.dialogBg,
                    border: `1px solid ${colors.border}`,
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
                          color: b === targetBranch ? colors.primary : colors.text,
                          fontWeight: b === targetBranch ? 600 : 400,
                          background: b === targetBranch ? "#faf5f2" : "transparent",
                          border: "none",
                          textAlign: "left",
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                        onMouseEnter={(e) => {
                          if (b !== targetBranch) e.currentTarget.style.background = colors.bgSurface;
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
              background: !targetBranch || isMerging ? "#c4c1ba" : colors.primary,
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
              color: mergeResult.success ? colors.success : colors.errorDark,
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
    </BaseDialog>
  );
}
