import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GitBranch, GitFork } from "lucide-react";

import { sanitizeGitName, sanitizeWorktreeName } from "@magenta/shared/sanitize";
import { colors } from "../../utils/colors";
import { sendOrThrow } from "../../services/ipcClient";
import { useRepoStore } from "../../store/repoStore";
import { useWorktreeStore } from "../../store/worktreeStore";
import { useSessionStore } from "../../store/sessionStore";
import { BaseDialog } from "../common/BaseDialog";
import { BranchPicker } from "../common/BranchPicker";
import { CancelButton, PrimaryButton } from "../common/DialogButtons";
import { FormLabel, FormInput, FormError } from "../common/FormControls";
import { InlineLoadingRow } from "../common/InlineLoadingRow";

/* ══════════════════════════════════════════
 * CreateBranchOrWorktreeDialog
 *
 * Unified dialog for creating a new branch OR a new worktree.
 * Flow is identical in both modes: pick a base branch → enter a name.
 * Behaviour diverges only in the IPC call and validation rules.
 * ══════════════════════════════════════════ */

export type CreateKind = "branch" | "worktree";

type Props = {
  /** Which object we're creating */
  kind: CreateKind;
  repoPath: string;
  currentBranch: string;
  onClose: () => void;
};

/* ── Validation (imported from @magenta/shared/sanitize) ── */

/* ── Component ── */

export function CreateBranchOrWorktreeDialog({
  kind,
  repoPath,
  currentBranch,
  onClose,
}: Props): React.ReactElement {
  const isBranch = kind === "branch";

  const [branches, setBranches] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(true);
  const [baseBranch, setBaseBranch] = useState<string>(currentBranch);
  const [name, setName] = useState("");
  const [switchAfter, setSwitchAfter] = useState(true);
  const [nameError, setNameError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Stores
  const fetchRepos = useRepoStore((s) => s.fetchRepos);
  const addWorktree = useWorktreeStore((s) => s.addWorktree);
  const toggleRepoExpanded = useWorktreeStore((s) => s.toggleRepoExpanded);
  const expandedRepos = useWorktreeStore((s) => s.expandedRepos);
  const setExpandedWorktreePath = useWorktreeStore((s) => s.setExpandedWorktreePath);
  const patchSession = useSessionStore((s) => s.patchSession);

  // Load branches on mount
  useEffect(() => {
    let cancelled = false;
    sendOrThrow({ type: "branch:list", repoPath })
      .then((res) => {
        if (cancelled) return;
        setBranches(res.branches);
        setBaseBranch(res.current || (res.branches[0] ?? ""));
        setIsLoadingBranches(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setCreateError(err instanceof Error ? err.message : String(err));
          setIsLoadingBranches(false);
        }
      });
    return () => { cancelled = true; };
  }, [repoPath]);

  // Focus name input once branches load
  useEffect(() => {
    if (!isLoadingBranches) nameInputRef.current?.focus();
  }, [isLoadingBranches]);

  // Auto-fill worktree name when user picks a new base branch and name is empty/untouched.
  // Only for worktree mode — branch mode expects a meaningful user-chosen name.
  const handleBaseBranchChange = useCallback((b: string) => {
    setBaseBranch(b);
    setCreateError(null);
    if (!isBranch) setName((prev) => (prev === "" ? sanitizeWorktreeName(b) : prev));
  }, [isBranch]);

  // Auto-transform the raw input into a safe git/worktree name.
  const normalizeName = useCallback((raw: string): string => {
    const trimmed = raw.trim();
    return isBranch ? sanitizeGitName(trimmed) : sanitizeWorktreeName(trimmed);
  }, [isBranch]);

  const handleConfirm = useCallback(async () => {
    const finalName = normalizeName(name);
    if (!finalName) {
      setNameError(isBranch ? "Branch name cannot be empty." : "Worktree name cannot be empty.");
      return;
    }
    if (isBranch && branches.includes(finalName)) {
      setNameError("A branch with this name already exists.");
      return;
    }
    // Reflect the sanitized name back to the user so they can see what got created.
    if (finalName !== name) setName(finalName);
    if (!baseBranch) { setCreateError("Please select a base branch."); return; }
    const trimmed = finalName;

    setIsCreating(true);
    setCreateError(null);

    try {
      if (isBranch) {
        await sendOrThrow({ type: "branch:create", repoPath, branchName: trimmed, startPoint: baseBranch });
        if (switchAfter) {
          await sendOrThrow({ type: "branch:checkout", repoPath, branch: trimmed });
        }
        await fetchRepos();
      } else {
        const result = await sendOrThrow({ type: "worktree:create", repoPath, branch: baseBranch, name: trimmed });
        addWorktree({
          repoPath,
          worktreePath: result.worktreePath,
          branch: result.branch,
          name: trimmed,
          createdAt: Date.now(),
        });
        // Daemon triggers a worktree sync after create; the store refreshes
        // from DB via the worktree:sync:complete push event.
        void patchSession({ mainTab: "worktrees" });
        if (!expandedRepos[repoPath]) toggleRepoExpanded(repoPath);
        setExpandedWorktreePath(result.worktreePath);
      }
      onClose();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error));
      setIsCreating(false);
    }
  }, [
    name, baseBranch, isBranch, branches, switchAfter, repoPath,
    normalizeName, fetchRepos, addWorktree, patchSession,
    expandedRepos, toggleRepoExpanded, setExpandedWorktreePath, onClose,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); void handleConfirm(); } },
    [handleConfirm],
  );

  const titleText = isBranch ? "Create Branch" : "Create Worktree";
  const nameLabel = isBranch ? "Branch name" : "Worktree name";
  const namePlaceholder = isBranch ? "e.g. feature/my-feature" : "e.g. feature-auth-review";
  const primaryButtonText = isBranch ? "Create Branch" : "Create Worktree";
  const HeaderIcon = isBranch ? GitBranch : GitFork;

  // Memoize id strings to keep FormLabel htmlFor stable
  const { baseId, nameId } = useMemo(
    () => ({ baseId: `${kind}-base-branch`, nameId: `${kind}-new-name` }),
    [kind],
  );

  return (
    <BaseDialog
      title={titleText}
      icon={<HeaderIcon size={16} color={colors.primary} strokeWidth={2} />}
      width={440}
      minHeight={360}
      onClose={onClose}
      footer={
        <>
          <CancelButton onClick={onClose} />
          <PrimaryButton
            onClick={() => void handleConfirm()}
            disabled={!name.trim() || !baseBranch || isLoadingBranches}
            loading={isCreating}
            loadingText="Creating..."
          >
            {primaryButtonText}
          </PrimaryButton>
        </>
      }
    >
      {isLoadingBranches ? (
        <InlineLoadingRow label="Loading branches..." size={16} fontSize={13} color={colors.textSecondary} />
      ) : (
        <>
          {!isBranch && (
            <p style={{ fontSize: 11, color: colors.textMuted, margin: "0 0 8px", lineHeight: 1.5 }}>
              Create a worktree to work on a branch in a separate directory without switching
              your main checkout.
            </p>
          )}

          {/* Step 1 — Base branch (always first) */}
          <FormLabel htmlFor={baseId}>Base branch</FormLabel>
          <div style={{ marginBottom: 14 }}>
            <BranchPicker
              id={baseId}
              branches={branches}
              value={baseBranch}
              onChange={handleBaseBranchChange}
              currentBranch={currentBranch}
            />
          </div>

          {/* Step 2 — New name */}
          <FormLabel htmlFor={nameId}>{nameLabel}</FormLabel>
          <FormInput
            id={nameId}
            inputRef={nameInputRef}
            value={name}
            onChange={(v) => { setName(v); setNameError(null); setCreateError(null); }}
            onKeyDown={handleKeyDown}
            placeholder={namePlaceholder}
            error={!!nameError}
          />
          <FormError message={nameError} />

          {/* Branch-only: switch after creation */}
          {isBranch && (
            <label
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: colors.textSecondary, cursor: "pointer", marginTop: 8 }}
            >
              <input
                type="checkbox"
                checked={switchAfter}
                onChange={(e) => setSwitchAfter(e.target.checked)}
                style={{ accentColor: colors.primary }}
              />
              Switch to new branch after creation
            </label>
          )}

          <FormError message={createError} />
        </>
      )}
    </BaseDialog>
  );
}
