import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

import { sendOrThrow } from "../../services/ipcClient";
import { useAISessionStore } from "../../store/aiSessionStore";
import { BaseDialog } from "../common/BaseDialog";
import { CancelButton, PrimaryButton } from "../common/DialogButtons";
import { FormLabel, FormInput, FormError } from "../common/FormControls";
import { ProviderDot } from "../common/ProviderDot";
import { getProviderName, getProviderColor } from "../common/providerConfig";

type NewAISessionDialogProps = {
  open: boolean;
  onClose: () => void;
  repoPath?: string;
  repoName?: string | null;
};

type SelectedProvider = "claude" | "copilot" | null;
type BranchMode = "current" | "new-worktree";

/**
 * Dialog for creating a new AI session.
 * Allows user to select provider, repository context, and optional worktree creation.
 */
export function NewAISessionDialog({
  open,
  onClose,
  repoPath,
  repoName,
}: NewAISessionDialogProps): React.ReactElement | null {
  const createSession = useAISessionStore((s) => s.createSession);

  const [selectedProvider, setSelectedProvider] = useState<SelectedProvider>(null);
  const [branchMode, setBranchMode] = useState<BranchMode>("current");
  const [branches, setBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>("");
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [worktreeName, setWorktreeName] = useState("");
  const [worktreeNameError, setWorktreeNameError] = useState<string | null>(null);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const worktreeNameInputRef = useRef<HTMLInputElement>(null);

  // Load branches when dialog opens and repoPath is available
  useEffect(() => {
    if (!open || !repoPath) {
      return;
    }

    let cancelled = false;

    setIsLoadingBranches(true);
    setCreateError(null);

    sendOrThrow({ type: "worktree:branches", repoPath })
      .then((res) => {
        if (cancelled) return;
        setBranches(res.branches);
        setCurrentBranch(res.current);
        setSelectedBranch(res.current);
        setIsLoadingBranches(false);
      })
      .catch(() => {
        if (!cancelled) {
          setIsLoadingBranches(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, repoPath]);

  // Focus worktree name input when mode switches to new-worktree
  useEffect(() => {
    if (branchMode === "new-worktree" && worktreeNameInputRef.current) {
      worktreeNameInputRef.current.focus();
      worktreeNameInputRef.current.select();
    }
  }, [branchMode]);

  const handleBranchChange = useCallback((branch: string) => {
    setSelectedBranch(branch);
    setCreateError(null);
  }, []);

  const handleWorktreeNameChange = useCallback((name: string) => {
    setWorktreeName(name);
    setWorktreeNameError(null);
    setCreateError(null);
  }, []);

  const handleConfirm = useCallback(async () => {
    // Validate provider selection
    if (!selectedProvider) {
      setCreateError("Please select a provider.");
      return;
    }

    // Validate branch/worktree selection
    if (repoPath && !selectedBranch) {
      setCreateError("Please select a branch.");
      return;
    }

    // Validate worktree name if in new-worktree mode
    if (repoPath && branchMode === "new-worktree") {
      const trimmed = worktreeName.trim();
      if (!trimmed) {
        setWorktreeNameError("Worktree name cannot be empty.");
        return;
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
        setWorktreeNameError("Only letters, numbers, dashes, and underscores are allowed.");
        return;
      }
    }

    setIsCreating(true);
    setCreateError(null);
    setWorktreeNameError(null);

    try {
      let worktreePathToUse: string | undefined;
      let branchToUse: string | undefined;

      // If creating a new worktree, do that first
      if (repoPath && branchMode === "new-worktree") {
        const result = await sendOrThrow({
          type: "worktree:create",
          repoPath,
          branch: selectedBranch,
          name: worktreeName.trim(),
        });
        worktreePathToUse = result.worktreePath;
        branchToUse = result.branch;
      } else if (repoPath) {
        branchToUse = selectedBranch;
      }

      // Create the AI session
      const session = await createSession(
        {
          provider: selectedProvider,
          repoPath,
          branch: branchToUse,
          worktreePath: worktreePathToUse,
        },
        80,
        24,
      );

      // Success: close the dialog
      onClose();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
      setIsCreating(false);
    }
  }, [selectedProvider, repoPath, selectedBranch, branchMode, worktreeName, createSession, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void handleConfirm();
      }
    },
    [handleConfirm],
  );

  if (!open) return null;

  const showRepoSection = !!repoPath;
  const showBranchSection = showRepoSection && !isLoadingBranches && branches.length > 0;

  return (
    <BaseDialog
      title="New AI Session"
      width={440}
      onClose={onClose}
      footer={
        <>
          <CancelButton onClick={onClose} />
          <PrimaryButton
            onClick={() => void handleConfirm()}
            disabled={!selectedProvider}
            loading={isCreating}
            loadingText="Creating..."
          >
            Create Session
          </PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Provider selector */}
        <div>
          <FormLabel>Provider</FormLabel>
          <div style={{ display: "flex", gap: 8 }}>
            {(["claude", "copilot"] as const).map((provider) => {
              const isSelected = selectedProvider === provider;
              const dotColor = getProviderColor(provider);

              return (
                <button
                  key={provider}
                  type="button"
                  onClick={() => setSelectedProvider(provider)}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    borderRadius: 6,
                    border: isSelected ? `1px solid ${dotColor}` : "1px solid #e5e2da",
                    background: isSelected ? "#e5e2da" : "#ffffff",
                    cursor: "pointer",
                    transition: "all 0.12s",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "#2c2c2c",
                  }}
                >
                  <ProviderDot variant={provider} />
                  {getProviderName(provider)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Repository info section */}
        {showRepoSection && (
          <div>
            <FormLabel>Repository</FormLabel>
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                background: "#f5f4ed",
                border: "1px solid #e5e2da",
                fontSize: 13,
                color: "#2c2c2c",
              }}
            >
              {repoName || "Selected Repository"}
            </div>
          </div>
        )}

        {/* Branch / Worktree choice */}
        {showBranchSection && (
          <div>
            <FormLabel>Branch or Worktree</FormLabel>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {(["current", "new-worktree"] as const).map((mode) => {
                const isSelected = branchMode === mode;
                const displayText = mode === "current" ? "Current Branch" : "New Worktree";

                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setBranchMode(mode)}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: isSelected ? "1px solid #2c2c2c" : "1px solid #e5e2da",
                      background: isSelected ? "#e5e2da" : "#ffffff",
                      cursor: "pointer",
                      transition: "all 0.12s",
                      fontSize: 12,
                      fontWeight: 500,
                      color: "#2c2c2c",
                    }}
                  >
                    {displayText}
                  </button>
                );
              })}
            </div>

            {/* Branch selector (if current branch mode) */}
            {branchMode === "current" && (
              <div style={{ position: "relative" }}>
                <select
                  value={selectedBranch}
                  onChange={(e) => handleBranchChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  style={{
                    width: "100%",
                    padding: "8px 32px 8px 12px",
                    fontSize: 13,
                    border: `1px solid #e5e2da`,
                    borderRadius: 6,
                    outline: "none",
                    background: "#ffffff",
                    color: "#2c2c2c",
                    fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
                    boxSizing: "border-box",
                    appearance: "none",
                    cursor: "pointer",
                    transition: "border-color 0.15s",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#C15F3C";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e5e2da";
                  }}
                >
                  {branches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  color="#9a958c"
                  style={{
                    position: "absolute",
                    right: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    pointerEvents: "none",
                  }}
                />
              </div>
            )}

            {/* Worktree name input (if new worktree mode) */}
            {branchMode === "new-worktree" && (
              <div>
                <FormLabel htmlFor="new-ai-worktree-name" style={{ marginBottom: 8 }}>
                  Worktree Name
                </FormLabel>
                <FormInput
                  id="new-ai-worktree-name"
                  inputRef={worktreeNameInputRef}
                  value={worktreeName}
                  onChange={handleWorktreeNameChange}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. feature-auth-review"
                  error={!!worktreeNameError}
                />
                <FormError message={worktreeNameError} />
              </div>
            )}
          </div>
        )}

        {/* Loading branches message */}
        {showRepoSection && isLoadingBranches && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0" }}>
            <Loader2 size={16} color="#9a958c" style={{ animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 13, color: "#6b6560" }}>Loading branches...</span>
          </div>
        )}

        {/* No branches message */}
        {showRepoSection && !isLoadingBranches && branches.length === 0 && (
          <p style={{ fontSize: 13, color: "#6b6560", margin: "8px 0", lineHeight: 1.5 }}>
            No other branches available. You are on <strong>{currentBranch}</strong> and there are
            no additional branches to create a worktree from.
          </p>
        )}

        {/* Error message */}
        <FormError message={createError} />

        {/* Help text */}
        <p style={{ fontSize: 12, color: "#9a958c", margin: 0, lineHeight: 1.5 }}>
          {repoPath
            ? "Create a session to start chatting with your selected AI provider about this codebase."
            : "Create a session to start chatting with your selected AI provider in the workspace."}
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </BaseDialog>
  );
}
