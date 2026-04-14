import React, { useCallback, useEffect, useState } from "react";
import {
  GitMerge,
  ArrowRight,
  ChevronDown,
  Check,
  AlertCircle,
  Loader2,
  Trash2,
  FolderOpen,
} from "lucide-react";

import { colors } from "../../utils/colors";
import type { WorktreeInfo } from "../../store/worktreeStore";
import { useWorktreeStore } from "../../store/worktreeStore";
import { ScrollableText } from "../common/ScrollableText";
import { BranchLabel } from "../common/RepoLabel";
import { FileStatusBadge } from "../common/FileStatusBadge";
import { SectionHeader } from "../common/FormControls";
import { sendOrThrow } from "../../services/ipcClient";

type WorktreeInlinePanelProps = {
  worktree: WorktreeInfo;
  /** Called when user clicks a changed file — opens it in a new tab. */
  onOpenFile?: (filePath: string) => void;
  /** Called after the worktree is deleted so the parent can clean up selection state. */
  onDeleted?: () => void;
};

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
      .catch((err) => console.warn("[WorktreeInlinePanel] Failed to load branches:", err));
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
        background: colors.dialogBg,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {/* Meta info */}
      <div
        style={{
          padding: "10px 16px",
          borderBottom: `1px solid ${colors.borderLight}`,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          fontSize: 11,
          color: colors.textSecondary,
        }}
      >
        <BranchLabel name={worktree.branch} size="sm" />
        <span style={{ color: colors.textTertiary }}>Created {createdDate}</span>
        {status && (
          <span style={{ color: colors.textTertiary }}>
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
            color: colors.textTertiary,
            fontSize: 10,
            fontFamily: "var(--font-mono)",
          }}
          title={worktree.worktreePath}
        >
          <FolderOpen size={10} strokeWidth={1.5} />
          {worktree.worktreePath.split("/").slice(-2).join("/")}
        </span>
      </div>

      {/* Changed files list */}
      <div style={{ padding: "10px 16px" }}>
        <SectionHeader style={{ marginBottom: 8 }}>
          Changed files
          {status && ` (${status.files.length})`}
        </SectionHeader>

        {isStatusLoading && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: colors.textTertiary,
              fontSize: 12,
              padding: "12px 0",
            }}
          >
            <Loader2 size={14} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
            Loading file status…
          </div>
        )}

        {!isStatusLoading && status && status.files.length === 0 && (
          <div style={{ color: colors.textTertiary, fontSize: 12, padding: "12px 0" }}>
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
                  background: isClickable && hoveredFile === file.path ? colors.bgHover : colors.bgSurface,
                  borderRadius: 6,
                  border: `1px solid ${isClickable && hoveredFile === file.path ? colors.border : colors.borderLight}`,
                  cursor: isClickable ? "pointer" : "default",
                  opacity: isClickable ? 1 : 0.6,
                  transition: "background 0.1s, border-color 0.1s",
                }}
                title={isClickable ? `Click to open ${file.path}` : `${file.path} (deleted)`}
              >
                <ScrollableText
                  style={{
                    fontSize: 12,
                    color: isClickable && hoveredFile === file.path ? colors.primary : colors.text,
                    fontFamily: "var(--font-mono)",
                    flex: 1,
                    minWidth: 0,
                    transition: "color 0.1s",
                  }}
                >
                  {file.path}
                </ScrollableText>
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
            borderTop: `1px solid ${colors.border}`,
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
              background: colors.successSoft,
              color: colors.success,
              border: `1px solid ${colors.successSoftBorder}`,
              marginBottom: 12,
            }}
          >
            <Check size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
            <span style={{ lineHeight: 1.4 }}>{mergeResult.message}</span>
          </div>

          <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 10 }}>
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
                color: colors.textWhite,
                background: isDeleting ? colors.borderMuted : colors.errorDark,
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
                color: colors.textMuted,
                background: colors.bgSurface,
                border: `1px solid ${colors.border}`,
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
                background: colors.errorSoft,
                color: colors.errorDark,
                border: `1px solid ${colors.errorSoftBorder}`,
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
              borderTop: `1px solid ${colors.border}`,
              padding: "12px 16px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 12, color: colors.textTertiary }}>
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
                color: colors.textWhite,
                background: isDeleting ? colors.borderMuted : colors.errorDark,
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
              borderTop: `1px solid ${colors.border}`,
              padding: "12px 16px 14px",
            }}
          >
            <SectionHeader style={{ marginBottom: 8 }}>
              <GitMerge size={11} strokeWidth={2} style={{ marginRight: 4, verticalAlign: "middle" }} />
              Local merge (no push)
            </SectionHeader>

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
                        boxShadow: colors.shadowPopover,
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
                              background: b === targetBranch ? colors.bgPanelSoft : "transparent",
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
                  color: colors.textWhite,
                  background: !targetBranch || isMerging ? colors.borderMuted : colors.primary,
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
                  background: colors.errorSoft,
                  color: colors.errorDark,
                  border: `1px solid ${colors.errorSoftBorder}`,
                }}
              >
                <AlertCircle size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ lineHeight: 1.4 }}>{mergeResult.message}</span>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
