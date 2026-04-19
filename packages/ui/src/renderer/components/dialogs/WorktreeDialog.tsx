import React, { useCallback, useEffect, useRef, useState } from "react";
import { GitBranch } from "lucide-react";

import { isValidWorktreeName, sanitizeWorktreeName } from "@magenta/shared/sanitize";
import { colors } from "../../utils/colors";
import { BaseDialog } from "../common/BaseDialog";
import { CancelButton, PrimaryButton } from "../common/DialogButtons";
import { FormLabel, FormInput, FormError } from "../common/FormControls";

type WorktreeDialogProps = {
  /** The remote branch name being checked out */
  branch: string;
  /** Default worktree name suggestion (e.g. branch name sanitized) */
  defaultName?: string;
  /** Called when user confirms — receives the chosen worktree name */
  onConfirm: (worktreeName: string) => void;
  /** Called when user cancels the dialog */
  onCancel: () => void;
};

/**
 * A modal dialog that asks the user to provide a name for a new git worktree.
 * Shown when the user tries to approve a file from a remote (non-current) branch,
 * since the file must be checked out in a worktree before it can be written to.
 */
export function WorktreeDialog({
  branch,
  defaultName,
  onConfirm,
  onCancel,
}: WorktreeDialogProps): React.ReactElement {
  const suggested = defaultName ?? sanitizeWorktreeName(branch);
  const [name, setName] = useState(suggested);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleConfirm = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Worktree name cannot be empty.");
      return;
    }
    if (!isValidWorktreeName(trimmed)) {
      setError("Only letters, numbers, dashes, and underscores are allowed.");
      return;
    }
    onConfirm(trimmed);
  }, [name, onConfirm]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleConfirm();
      }
    },
    [handleConfirm],
  );

  return (
    <BaseDialog
      title="Create Worktree"
      icon={<GitBranch size={16} color={colors.primary} strokeWidth={2} />}
      width={420}
      onClose={onCancel}
      footer={
        <>
          <CancelButton onClick={onCancel} />
          <PrimaryButton onClick={handleConfirm} color={colors.success}>
            Create & Approve
          </PrimaryButton>
        </>
      }
    >
      <p style={{ fontSize: 11, color: colors.textMuted, margin: "0 0 8px", lineHeight: 1.5 }}>
        This file is on the <strong>{branch}</strong> branch. To approve it,
        a worktree will be created so the changes can be written to disk
        and later committed as a PR.
      </p>

      <FormLabel htmlFor="worktree-name">Worktree name</FormLabel>

      <FormInput
        id="worktree-name"
        inputRef={inputRef}
        value={name}
        onChange={(v) => { setName(v); setError(null); }}
        onKeyDown={handleKeyDown}
        placeholder="e.g. feature-auth-review"
        error={!!error}
      />

      <FormError message={error} />
    </BaseDialog>
  );
}
