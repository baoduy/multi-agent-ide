import React, { useCallback, useEffect, useRef, useState } from "react";
import { GitBranch, ChevronDown } from "lucide-react";

import { colors } from "../../utils/colors";
import { sendOrThrow } from "../../services/ipcClient";
import { useWorktreeStore } from "../../store/worktreeStore";
import { useSessionStore } from "../../store/sessionStore";
import { BaseDialog } from "../common/BaseDialog";
import { CancelButton, PrimaryButton } from "../common/DialogButtons";
import { FormLabel, FormInput, FormError } from "../common/FormControls";
import { InlineLoadingRow } from "../common/InlineLoadingRow";

type AddWorktreeDialogProps = {
  /** The repository path to create the worktree in */
  repoPath: string;
  /** Called after worktree is created successfully */
  onCreated?: () => void;
  /** Called when user cancels the dialog */
  onCancel: () => void;
};

/**
 * A modal dialog that lets the user pick a branch and name for a new git worktree.
 * Shown from the repo context menu "Add Worktree" action.
 */
export function AddWorktreeDialog({
  repoPath,
  onCreated,
  onCancel,
}: AddWorktreeDialogProps): React.ReactElement {
  const [branches, setBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>("");
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isLoadingBranches, setIsLoadingBranches] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const addWorktree = useWorktreeStore((s) => s.addWorktree);
  const fetchWorktrees = useWorktreeStore((s) => s.fetchWorktrees);
  const toggleRepoExpanded = useWorktreeStore((s) => s.toggleRepoExpanded);
  const expandedRepos = useWorktreeStore((s) => s.expandedRepos);
  const setExpandedWorktreePath = useWorktreeStore((s) => s.setExpandedWorktreePath);
  const patchSession = useSessionStore((s) => s.patchSession);

  // Fetch branches on mount
  useEffect(() => {
    let cancelled = false;

    sendOrThrow({ type: "worktree:branches", repoPath })
      .then((res) => {
        if (cancelled) return;
        setBranches(res.branches);
        setCurrentBranch(res.current);
        if (res.branches.length > 0) {
          const defaultBranch = res.branches.find((b: string) => b !== res.current) ?? res.branches[0];
          setSelectedBranch(defaultBranch);
          setName(defaultBranch.replace(/[^a-zA-Z0-9_-]/g, "-"));
        }
        setIsLoadingBranches(false);
      })
      .catch(() => {
        if (!cancelled) setIsLoadingBranches(false);
      });

    return () => { cancelled = true; };
  }, [repoPath]);

  // Focus name input after branches load
  useEffect(() => {
    if (!isLoadingBranches && branches.length > 0) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [isLoadingBranches, branches.length]);

  const handleBranchChange = useCallback((branch: string) => {
    setSelectedBranch(branch);
    setName(branch.replace(/[^a-zA-Z0-9_-]/g, "-"));
    setNameError(null);
    setCreateError(null);
  }, []);

  const handleConfirm = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Worktree name cannot be empty.");
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setNameError("Only letters, numbers, dashes, and underscores are allowed.");
      return;
    }
    if (!selectedBranch) {
      setCreateError("Please select a branch.");
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      const result = await sendOrThrow({
        type: "worktree:create",
        repoPath,
        branch: selectedBranch,
        name: trimmed,
      });

      addWorktree({
        repoPath,
        worktreePath: result.worktreePath,
        branch: result.branch,
        name: trimmed,
        createdAt: Date.now(),
      });

      void fetchWorktrees(repoPath);
      void patchSession({ mainTab: "worktrees" });
      if (!expandedRepos[repoPath]) {
        toggleRepoExpanded(repoPath);
      }
      setExpandedWorktreePath(result.worktreePath);

      onCreated?.();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
      setIsCreating(false);
    }
  }, [name, selectedBranch, repoPath, addWorktree, fetchWorktrees, patchSession, expandedRepos, toggleRepoExpanded, setExpandedWorktreePath, onCreated]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void handleConfirm();
      }
    },
    [handleConfirm],
  );

  return (
    <BaseDialog
      title="Add Worktree"
      icon={<GitBranch size={16} color={colors.primary} strokeWidth={2} />}
      width={440}
      onClose={onCancel}
      footer={
        <>
          <CancelButton onClick={onCancel} />
          {branches.length > 0 && (
            <PrimaryButton
              onClick={() => void handleConfirm()}
              disabled={!selectedBranch}
              loading={isCreating}
              loadingText="Creating..."
            >
              Create Worktree
            </PrimaryButton>
          )}
        </>
      }
    >
      {isLoadingBranches ? (
        <InlineLoadingRow
          label="Loading branches..."
          size={16}
          fontSize={13}
          color={colors.textSecondary}
        />
      ) : branches.length === 0 ? (
        <p style={{ fontSize: 13, color: colors.textSecondary, margin: "8px 0", lineHeight: 1.5 }}>
          No other branches available. You are on <strong>{currentBranch}</strong> and there are
          no additional branches to create a worktree from.
        </p>
      ) : (
        <>
          <p style={{ fontSize: 13, color: colors.textMuted, margin: "0 0 14px", lineHeight: 1.5 }}>
            Create a worktree to work on a branch in a separate directory without switching
            your main checkout.
          </p>

          {/* Branch selector */}
          <FormLabel htmlFor="worktree-branch">Branch</FormLabel>

          <div style={{ position: "relative", marginBottom: 14 }}>
            <select
              id="worktree-branch"
              value={selectedBranch}
              onChange={(e) => handleBranchChange(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                width: "100%",
                padding: "8px 32px 8px 12px",
                fontSize: 13,
                border: `1px solid ${colors.border}`,
                borderRadius: 6,
                outline: "none",
                background: colors.bgSurface,
                color: colors.text,
                fontFamily: "var(--font-mono)",
                boxSizing: "border-box",
                appearance: "none",
                cursor: "pointer",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = colors.primary; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = colors.border; }}
            >
              {branches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <ChevronDown
              size={14}
              color={colors.textTertiary}
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
              }}
            />
          </div>

          {/* Worktree name */}
          <FormLabel htmlFor="worktree-name-add">Worktree name</FormLabel>

          <FormInput
            id="worktree-name-add"
            inputRef={nameInputRef}
            value={name}
            onChange={(v) => { setName(v); setNameError(null); setCreateError(null); }}
            onKeyDown={handleKeyDown}
            placeholder="e.g. feature-auth-review"
            error={!!nameError}
          />

          <FormError message={nameError} />
          <FormError message={createError} />
        </>
      )}
    </BaseDialog>
  );
}
