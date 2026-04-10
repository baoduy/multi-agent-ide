import React, { useCallback, useEffect, useState } from "react";
import {
  GitBranch,
  GitMerge,
  FilePlus,
  FileEdit,
  FileX,
  FileQuestion,
  ArrowRight,
  ChevronDown,
  Check,
  AlertCircle,
  Loader2,
  Trash2,
  FolderOpen,
} from "lucide-react";

import type { WorktreeInfo, WorktreeFileStatus } from "../../store/worktreeStore";
import { useWorktreeStore } from "../../store/worktreeStore";
import { sendOrThrow } from "../../services/ipcClient";

type WorktreeInlinePanelProps = {
  worktree: WorktreeInfo;
  /** Called when user clicks a changed file — opens it in a new tab. */
  onOpenFile?: (filePath: string) => void;
  /** Called after the worktree is deleted so the parent can clean up selection state. */
  onDeleted?: () => void;
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

/* ── Inline collapsible panel ── */

export function WorktreeInlinePanel({
  worktree,
  onOpenFile,
  onDeleted,
}: WorktreeInlinePanelProps): React.ReactElement {
  const {
    fetchWorktreeStatus,
    mergeWorktree,
    deleteWorktree,
    isStatusLoading,
    isMerging,
    isDeleting,
    mergeResult,
    deleteResult,
    clearMergeResult,
    clearDeleteResult,
    statusCache,
  } = useWorktreeStore();

  const status = statusCache[worktree.worktreePath] ?? null;

  // Branch picker state
  const [branches, setBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>("");
  const [targetBranch, setTargetBranch] = useState<string>("");
  const [showBranchPicker, setShowBranchPicker] = useState(false);

  // Post-merge state: show delete/keep options
  const [showPostMerge, setShowPostMerge] = useState(false);

  // File hover state
  const [hoveredFile, setHoveredFile] = useState<string | null>(null);

  // Load status + branches on mount
  useEffect(() => {
    fetchWorktreeStatus(worktree.repoPath, worktree.worktreePath);
    clearMergeResult();
    clearDeleteResult();

    sendOrThrow({ type: "worktree:branches", repoPath: worktree.repoPath })
      .then((resp) => {
        setBranches(resp.branches);
        setCurrentBranch(resp.current);
        setTargetBranch(resp.current);
      })
      .catch(() => {});
  }, [worktree.worktreePath, worktree.repoPath, fetchWorktreeStatus, clearMergeResult, clearDeleteResult]);

  const handleMerge = useCallback(async () => {
    if (!targetBranch || isMerging) return;
    const result = await mergeWorktree(
      worktree.repoPath,
      worktree.worktreePath,
      worktree.branch,
      targetBranch,
    );
    if (result.success) {
      setShowPostMerge(true);
    }
  }, [targetBranch, isMerging, mergeWorktree, worktree]);

  const handleDelete = useCallback(async () => {
    const result = await deleteWorktree(worktree.repoPath, worktree.worktreePath);
    if (result.success) {
      onDeleted?.();
    }
  }, [deleteWorktree, worktree, onDeleted]);

  const handleKeep = useCallback(() => {
    setShowPostMerge(false);
    clearMergeResult();
  }, [clearMergeResult]);

  const handleFileClick = useCallback(
    (filePath: string) => {
      // Build the full path: worktreePath + relative file path
      const fullPath = `${worktree.worktreePath}/${filePath}`;
      onOpenFile?.(fullPath);
    },
    [worktree.worktreePath, onOpenFile],
  );

  const createdDate = new Date(worktree.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e2da",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {/* Meta info */}
      <div
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid #f0ede8",
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          fontSize: 11,
          color: "#6b6560",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <GitBranch size={11} strokeWidth={1.5} color="#C15F3C" />
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
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            color: "#9a958c",
            fontSize: 10,
            fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
          }}
          title={worktree.worktreePath}
        >
          <FolderOpen size={10} strokeWidth={1.5} />
          {worktree.worktreePath.split("/").slice(-2).join("/")}
        </span>
      </div>

      {/* Changed files list */}
      <div style={{ padding: "10px 16px" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#9a958c",
            marginBottom: 8,
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
              padding: "12px 0",
            }}
          >
            <Loader2 size={14} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
            Loading file status…
          </div>
        )}

        {!isStatusLoading && status && status.files.length === 0 && (
          <div style={{ color: "#9a958c", fontSize: 12, padding: "12px 0" }}>
            No changed files in this worktree.
          </div>
        )}

        {!isStatusLoading && status && status.files.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {status.files.map((file) => {
              // Deleted files don't exist on disk — can't open them
              const isClickable = file.status !== "deleted";

              return (
              <div
                key={file.path}
                onClick={isClickable ? () => handleFileClick(file.path) : undefined}
                onMouseEnter={() => setHoveredFile(file.path)}
                onMouseLeave={() => setHoveredFile(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "7px 10px",
                  background: isClickable && hoveredFile === file.path ? "#f5f3f0" : "#faf9f5",
                  borderRadius: 6,
                  border: `1px solid ${isClickable && hoveredFile === file.path ? "#e0ddd5" : "#f0ede8"}`,
                  cursor: isClickable ? "pointer" : "default",
                  opacity: isClickable ? 1 : 0.6,
                  transition: "background 0.1s, border-color 0.1s",
                }}
                title={isClickable ? `Click to open ${file.path}` : `${file.path} (deleted)`}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: isClickable && hoveredFile === file.path ? "#C15F3C" : "#2c2c2c",
                    fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                    minWidth: 0,
                    transition: "color 0.1s",
                  }}
                >
                  {file.path}
                </span>
                <div style={{ flexShrink: 0, marginLeft: 12 }}>
                  <FileStatusBadge status={file.status} />
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Post-merge: Delete / Keep options */}
      {showPostMerge && mergeResult?.success ? (
        <div
          style={{
            borderTop: "1px solid #e5e2da",
            padding: "14px 16px",
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              fontSize: 12,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "#f0fdf4",
              color: "#16A34A",
              border: "1px solid #bbf7d0",
              marginBottom: 12,
            }}
          >
            <Check size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
            <span style={{ lineHeight: 1.4 }}>{mergeResult.message}</span>
          </div>

          <div style={{ fontSize: 12, color: "#4a4540", marginBottom: 10 }}>
            What would you like to do with this worktree?
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              style={{
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 600,
                color: "#fff",
                background: isDeleting ? "#c4c1ba" : "#dc2626",
                border: "none",
                borderRadius: 6,
                cursor: isDeleting ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "background 0.15s",
              }}
            >
              {isDeleting ? (
                <>
                  <Loader2 size={12} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 size={12} strokeWidth={2} />
                  Delete worktree
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleKeep}
              style={{
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 600,
                color: "#4a4540",
                background: "#faf9f5",
                border: "1px solid #e5e2da",
                borderRadius: 6,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "background 0.15s",
              }}
            >
              <FolderOpen size={12} strokeWidth={2} />
              Keep worktree
            </button>
          </div>

          {/* Delete result (error) */}
          {deleteResult && !deleteResult.success && (
            <div
              style={{
                marginTop: 10,
                padding: "8px 12px",
                fontSize: 12,
                borderRadius: 6,
                display: "flex",
                alignItems: "flex-start",
                gap: 6,
                background: "#fef2f2",
                color: "#dc2626",
                border: "1px solid #fecaca",
              }}
            >
              <AlertCircle size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ lineHeight: 1.4 }}>{deleteResult.message}</span>
            </div>
          )}
        </div>
      ) : (
        /* Action section: Delete (no changes) or Merge (has changes) */
        status && status.files.length === 0 ? (
          /* Delete section — no changes in this worktree */
          <div
            style={{
              borderTop: "1px solid #e5e2da",
              padding: "12px 16px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 12, color: "#9a958c" }}>
              No changes — this worktree can be safely removed.
            </span>

            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              style={{
                padding: "7px 16px",
                fontSize: 12,
                fontWeight: 600,
                color: "#fff",
                background: isDeleting ? "#c4c1ba" : "#dc2626",
                border: "none",
                borderRadius: 6,
                cursor: isDeleting ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                transition: "background 0.15s",
              }}
            >
              {isDeleting ? (
                <>
                  <Loader2 size={12} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 size={12} strokeWidth={2} />
                  Delete worktree
                </>
              )}
            </button>
          </div>
        ) : (
          /* Merge section — worktree has changes */
          <div
            style={{
              borderTop: "1px solid #e5e2da",
              padding: "12px 16px 14px",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#9a958c",
                marginBottom: 8,
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

            {/* Merge result (error only — success goes to post-merge state) */}
            {mergeResult && !mergeResult.success && (
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 12px",
                  fontSize: 12,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 6,
                  background: "#fef2f2",
                  color: "#dc2626",
                  border: "1px solid #fecaca",
                }}
              >
                <AlertCircle size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ lineHeight: 1.4 }}>{mergeResult.message}</span>
              </div>
            )}
          </div>
        )
      )}

      {/* Spinner animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
