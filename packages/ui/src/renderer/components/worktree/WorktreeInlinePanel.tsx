import React, { useCallback, useEffect, useState } from "react";
import {
  GitMerge,
  ArrowRight,
  ChevronDown,
  Check,
  AlertCircle,
  Trash2,
  FolderOpen,
} from "lucide-react";

import { colors } from "../../utils/colors";
import type { WorktreeInfo } from "../../store/worktreeStore";
import { useWorktreeStore } from "../../store/worktreeStore";
import { ActionButton } from "../common/ActionButton";
import { BranchLabel } from "../common/RepoLabel";
import { BranchRow } from "../common/BranchRow";
import { FileChangesList } from "../common/FileChangesList";
import { SectionHeader } from "../common/FormControls";
import { InlineLoadingRow } from "../common/InlineLoadingRow";
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

  // Post-merge state: show delete/keep prompt
  const [showPostMerge, setShowPostMerge] = useState(false);

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

  const createdDate = new Date(worktree.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const hasChanges = !!status && status.files.length > 0;
  const canMerge = hasChanges && !showPostMerge;

  return (
    <div
      style={{
        background: colors.dialogBg,
        border: `1px solid ${colors.border}`,
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      {/* Top bar — meta info on the left, action buttons on the right */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: `1px solid ${colors.borderLight}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        {/* Left: branch + meta info */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
            fontSize: 11,
            color: colors.textSecondary,
            flex: 1,
            minWidth: 0,
          }}
        >
          <BranchLabel name={worktree.branch} />

          {status && (
            <span style={{ color: colors.textTertiary }}>
              {status.ahead > 0 && `${status.ahead} ahead`}
              {status.ahead > 0 && status.behind > 0 && " · "}
              {status.behind > 0 && `${status.behind} behind`}
              {status.ahead === 0 && status.behind === 0 && "Up to date"}
            </span>
          )}

          <span style={{ color: colors.textTertiary }}>Created {createdDate}</span>

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

        {/* Right: single primary action — Merge when there are changes, Delete when clean */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {canMerge ? (
            <>
              <ArrowRight size={12} strokeWidth={1.5} color={colors.textTertiary} />

              {/* Target branch picker */}
              <div style={{ position: "relative" }}>
                <ActionButton
                  onClick={() => setShowBranchPicker(!showBranchPicker)}
                  variant="secondary"
                  padding="4px 8px"
                  gap={4}
                  fontWeight={500}
                  color={colors.text}
                  icon={<ChevronDown size={12} strokeWidth={1.5} />}
                  style={{ flexDirection: "row-reverse" }}
                >
                  {targetBranch || "Select branch"}
                </ActionButton>

                {showBranchPicker && branches.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      right: 0,
                      marginTop: 4,
                      background: colors.dialogBg,
                      border: `1px solid ${colors.border}`,
                      borderRadius: 6,
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
                        <BranchRow
                          key={b}
                          name={b}
                          isSelected={b === targetBranch}
                          onSelect={(name) => {
                            setTargetBranch(name);
                            setShowBranchPicker(false);
                          }}
                        />
                      ))}
                  </div>
                )}
              </div>

              <ActionButton
                onClick={handleMerge}
                disabled={!targetBranch || isMerging}
                variant="primary"
                loading={isMerging}
                loadingText="Merging…"
                padding="4px 10px"
                icon={<GitMerge size={12} strokeWidth={2} />}
              >
                Merge
              </ActionButton>
            </>
          ) : !showPostMerge && status && status.files.length === 0 ? (
            <ActionButton
              onClick={handleDelete}
              variant="danger"
              loading={isDeleting}
              loadingText="Deleting…"
              padding="4px 10px"
              icon={<Trash2 size={12} strokeWidth={2} />}
            >
              Delete
            </ActionButton>
          ) : null}
        </div>
      </div>

      {/* Post-merge banner — delete / keep prompt */}
      {showPostMerge && mergeResult?.success && (
        <div
          style={{
            borderBottom: `1px solid ${colors.borderLight}`,
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              padding: "6px 10px",
              fontSize: 11,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: colors.successSoft,
              color: colors.success,
              border: `1px solid ${colors.successSoftBorder}`,
            }}
          >
            <Check size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
            <span style={{ lineHeight: 1.4 }}>{mergeResult.message}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 11, color: colors.textMuted }}>
              Merge complete — delete this worktree?
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <ActionButton
                onClick={handleDelete}
                variant="danger"
                loading={isDeleting}
                loadingText="Deleting…"
                padding="4px 10px"
                icon={<Trash2 size={12} strokeWidth={2} />}
              >
                Delete worktree
              </ActionButton>
              <ActionButton
                onClick={handleKeep}
                variant="secondary"
                padding="4px 10px"
                icon={<FolderOpen size={12} strokeWidth={2} />}
              >
                Keep
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {/* Error banners for merge / delete */}
      {mergeResult && !mergeResult.success && (
        <div
          style={{
            padding: "8px 12px",
            fontSize: 11,
            display: "flex",
            alignItems: "flex-start",
            gap: 6,
            background: colors.errorSoft,
            color: colors.errorDark,
            borderBottom: `1px solid ${colors.errorSoftBorder}`,
          }}
        >
          <AlertCircle size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ lineHeight: 1.4 }}>{mergeResult.message}</span>
        </div>
      )}

      {deleteResult && !deleteResult.success && (
        <div
          style={{
            padding: "8px 12px",
            fontSize: 11,
            display: "flex",
            alignItems: "flex-start",
            gap: 6,
            background: colors.errorSoft,
            color: colors.errorDark,
            borderBottom: `1px solid ${colors.errorSoftBorder}`,
          }}
        >
          <AlertCircle size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ lineHeight: 1.4 }}>{deleteResult.message}</span>
        </div>
      )}

      {/* Changed files list */}
      <div style={{ padding: "10px 16px" }}>
        <SectionHeader style={{ marginBottom: 8 }}>
          Changed files
          {status && ` (${status.files.length})`}
        </SectionHeader>

        {isStatusLoading && <InlineLoadingRow label="Loading file status…" />}

        {!isStatusLoading && status && status.files.length === 0 && (
          <div style={{ color: colors.textTertiary, fontSize: 11, padding: "8px 0" }}>
            No changed files in this worktree.
          </div>
        )}

        {!isStatusLoading && status && status.files.length > 0 && (
          <FileChangesList
            files={status.files}
            basePath={worktree.worktreePath}
            onOpen={(fullPath) => onOpenFile?.(fullPath)}
          />
        )}
      </div>
    </div>
  );
}
