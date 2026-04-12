import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

import { sendOrThrow } from "../../services/ipcClient";
import { useAISessionStore } from "../../store/aiSessionStore";
import { useRepoStore } from "../../store/repoStore";
import { BaseDialog } from "../common/BaseDialog";
import { CancelButton, PrimaryButton } from "../common/DialogButtons";
import { FormLabel, FormInput, FormError } from "../common/FormControls";
import { SearchableRepoSelector } from "../common/SearchableRepoSelector";
import { ProviderDot } from "../common/ProviderDot";
import { getProviderName, getProviderColor } from "../common/providerConfig";
import type { AIPermissionMode, AIProvider, AISessionRecord } from "@magenta/shared/aiTerminal";
import { PERMISSION_MODE_LABELS, PROVIDER_PERMISSION_MODES } from "@magenta/shared/aiTerminal";
import { colors } from "../../utils/colors";

type NewAISessionDialogProps = {
  open: boolean;
  onClose: () => void;
  repoPath?: string;
  repoName?: string | null;
  /** Called with the newly created session when creation succeeds. */
  onSessionCreated?: (session: AISessionRecord) => void;
};

type SelectedProvider = AIProvider | null;


/* ── Main Dialog ── */

/**
 * Dialog for creating a new AI session.
 *
 * Layout:
 *   Provider  (required)
 *   Repo      (searchable dropdown — Workspace is first, always available)
 *   Branch    (shown when repo is selected)
 *   Worktree  (optional toggle — when enabled, name input auto-prefixed with provider)
 *   Permission Mode
 */
export function NewAISessionDialog({
  open,
  onClose,
  repoPath: initialRepoPath,
  repoName: initialRepoName,
  onSessionCreated,
}: NewAISessionDialogProps): React.ReactElement | null {
  const createSession = useAISessionStore((s) => s.createSession);
  const repos = useRepoStore((s) => s.repos);

  // Form state
  const [selectedProvider, setSelectedProvider] = useState<SelectedProvider>(null);
  const [permissionMode, setPermissionMode] = useState<AIPermissionMode>("auto");
  const [selectedRepoPath, setSelectedRepoPath] = useState<string | null>(initialRepoPath ?? null);
  const [branches, setBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>("");
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [useWorktree, setUseWorktree] = useState(false);
  const [worktreeCustomName, setWorktreeCustomName] = useState("");
  const [worktreeNameError, setWorktreeNameError] = useState<string | null>(null);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const worktreeNameInputRef = useRef<HTMLInputElement>(null);

  // Derive the selected repo name
  const selectedRepoName = useMemo(() => {
    if (!selectedRepoPath) return null;
    const repo = repos.find((r) => r.path === selectedRepoPath);
    return repo?.name ?? selectedRepoPath.split("/").pop() ?? null;
  }, [repos, selectedRepoPath]);

  // Stable repo list reference for the dropdown (identity-stable when repos haven't changed)
  const repoOptions = useMemo(() => repos, [repos]);

  // Reset branch/worktree state when repo changes
  const handleRepoSelect = useCallback((path: string | null) => {
    setSelectedRepoPath(path);
    setBranches([]);
    setCurrentBranch("");
    setSelectedBranch("");
    setUseWorktree(false);
    setWorktreeCustomName("");
    setWorktreeNameError(null);
    setCreateError(null);
  }, []);

  // Sync initial repo path on open
  useEffect(() => {
    if (open) {
      setSelectedRepoPath(initialRepoPath ?? null);
    }
  }, [open, initialRepoPath]);

  // Load branches when repo is selected
  useEffect(() => {
    if (!open || !selectedRepoPath) {
      setBranches([]);
      return;
    }

    let cancelled = false;
    setIsLoadingBranches(true);
    setCreateError(null);

    sendOrThrow({ type: "worktree:branches", repoPath: selectedRepoPath })
      .then((res) => {
        if (cancelled) return;
        setBranches(res.branches);
        setCurrentBranch(res.current);
        setSelectedBranch(res.current);
        setIsLoadingBranches(false);
      })
      .catch(() => {
        if (!cancelled) setIsLoadingBranches(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, selectedRepoPath]);

  // Focus worktree name input when toggled on
  useEffect(() => {
    if (useWorktree && worktreeNameInputRef.current) {
      worktreeNameInputRef.current.focus();
    }
  }, [useWorktree]);

  // Compute the full worktree name (provider prefix + custom name)
  const providerPrefix = selectedProvider ? `${selectedProvider}-` : "";
  const fullWorktreeName = worktreeCustomName.trim()
    ? `${providerPrefix}${worktreeCustomName.trim()}`
    : "";

  const handleWorktreeNameChange = useCallback((name: string) => {
    setWorktreeCustomName(name);
    setWorktreeNameError(null);
    setCreateError(null);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!selectedProvider) {
      setCreateError("Please select a provider.");
      return;
    }

    if (selectedRepoPath && !selectedBranch) {
      setCreateError("Please select a branch.");
      return;
    }

    // Validate worktree name if worktree mode is on and name is provided
    if (selectedRepoPath && useWorktree && worktreeCustomName.trim()) {
      if (!/^[a-zA-Z0-9_-]+$/.test(worktreeCustomName.trim())) {
        setWorktreeNameError("Only letters, numbers, dashes, and underscores.");
        return;
      }
    }

    setIsCreating(true);
    setCreateError(null);
    setWorktreeNameError(null);

    try {
      let worktreePathToUse: string | undefined;
      let branchToUse: string | undefined;

      if (selectedRepoPath && useWorktree) {
        // Generate worktree name: provider-prefix + custom or auto-generated
        const wtName = worktreeCustomName.trim()
          ? `${providerPrefix}${worktreeCustomName.trim()}`
          : `${selectedProvider}-${Date.now()}`;

        const result = await sendOrThrow({
          type: "worktree:create",
          repoPath: selectedRepoPath,
          branch: selectedBranch,
          name: wtName,
        });
        worktreePathToUse = result.worktreePath;
        branchToUse = result.branch;
      } else if (selectedRepoPath) {
        branchToUse = selectedBranch;
      }

      const session = await createSession(
        {
          provider: selectedProvider,
          repoPath: selectedRepoPath ?? undefined,
          branch: branchToUse,
          worktreePath: worktreePathToUse,
          permissionMode,
        },
        80,
        24,
      );

      onSessionCreated?.(session);
      onClose();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
      setIsCreating(false);
    }
  }, [
    selectedProvider,
    permissionMode,
    selectedRepoPath,
    selectedBranch,
    useWorktree,
    worktreeCustomName,
    providerPrefix,
    createSession,
    onSessionCreated,
    onClose,
  ]);

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

  const hasRepo = !!selectedRepoPath;
  const showBranchSection = hasRepo && !isLoadingBranches && branches.length > 0;

  return (
    <BaseDialog
      title="New AI Session"
      width={460}
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
        {/* ─── Provider ─── */}
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
                    border: isSelected ? `1px solid ${dotColor}` : `1px solid ${colors.border}`,
                    background: isSelected ? colors.bgHover : "#ffffff",
                    cursor: "pointer",
                    transition: "all 0.12s",
                    fontSize: 12,
                    fontWeight: 500,
                    color: colors.text,
                  }}
                >
                  <ProviderDot variant={provider} />
                  {getProviderName(provider)}
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── Repository (searchable) ─── */}
        <div>
          <FormLabel>Repository</FormLabel>
          <SearchableRepoSelector
            repos={repoOptions}
            selectedPath={selectedRepoPath}
            onSelect={handleRepoSelect}
          />
        </div>

        {/* ─── Branch ─── */}
        {hasRepo && isLoadingBranches && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
            <Loader2 size={14} color={colors.textTertiary} style={{ animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 12, color: colors.textSecondary }}>Loading branches...</span>
          </div>
        )}

        {showBranchSection && (
          <div>
            <FormLabel>Branch</FormLabel>
            <div style={{ position: "relative" }}>
              <select
                value={selectedBranch}
                onChange={(e) => {
                  setSelectedBranch(e.target.value);
                  setCreateError(null);
                }}
                onKeyDown={handleKeyDown}
                style={{
                  width: "100%",
                  padding: "8px 32px 8px 12px",
                  fontSize: 13,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 6,
                  outline: "none",
                  background: "#ffffff",
                  color: colors.text,
                  fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
                  boxSizing: "border-box",
                  appearance: "none",
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = colors.primary;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = colors.border;
                }}
              >
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b}{b === currentBranch ? " (current)" : ""}
                  </option>
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
          </div>
        )}

        {/* ─── Worktree (optional) ─── */}
        {showBranchSection && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: useWorktree ? 10 : 0 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 500,
                  color: colors.text,
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={useWorktree}
                  onChange={(e) => {
                    setUseWorktree(e.target.checked);
                    if (!e.target.checked) {
                      setWorktreeCustomName("");
                      setWorktreeNameError(null);
                    }
                  }}
                  style={{
                    width: 14,
                    height: 14,
                    accentColor: colors.primary,
                    cursor: "pointer",
                  }}
                />
                Create in new worktree
              </label>
              <span style={{ fontSize: 11, color: colors.textTertiary }}>Optional</span>
            </div>

            {useWorktree && (
              <div>
                <FormLabel style={{ marginBottom: 4 }}>Worktree Name</FormLabel>
                <p style={{ fontSize: 11, color: colors.textTertiary, margin: "0 0 6px", lineHeight: 1.4 }}>
                  Leave blank to auto-generate. Provider prefix is added automatically.
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                  {/* Provider prefix (read-only) */}
                  <div
                    style={{
                      padding: "8px 8px 8px 12px",
                      fontSize: 13,
                      fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
                      color: colors.textTertiary,
                      background: colors.bgMuted,
                      border: `1px solid ${worktreeNameError ? colors.error : colors.border}`,
                      borderRight: "none",
                      borderRadius: "6px 0 0 6px",
                      whiteSpace: "nowrap",
                      lineHeight: "1.35",
                    }}
                  >
                    {providerPrefix || "provider-"}
                  </div>
                  {/* Custom name input */}
                  <input
                    ref={worktreeNameInputRef}
                    type="text"
                    value={worktreeCustomName}
                    onChange={(e) => handleWorktreeNameChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="e.g. auth-review"
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      fontSize: 13,
                      border: `1px solid ${worktreeNameError ? colors.error : colors.border}`,
                      borderRadius: "0 6px 6px 0",
                      outline: "none",
                      background: colors.bgSurface,
                      color: colors.text,
                      fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
                      boxSizing: "border-box",
                      transition: "border-color 0.15s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = worktreeNameError
                        ? colors.error
                        : colors.primary;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = worktreeNameError
                        ? colors.error
                        : colors.border;
                    }}
                  />
                </div>
                {fullWorktreeName && (
                  <p style={{ fontSize: 11, color: colors.textSecondary, margin: "4px 0 0" }}>
                    Full name: <code style={{ fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace" }}>{fullWorktreeName}</code>
                  </p>
                )}
                <FormError message={worktreeNameError} />
              </div>
            )}
          </div>
        )}

        {/* ─── Permission Mode ─── */}
        {selectedProvider && (
          <div>
            <FormLabel>Permission Mode</FormLabel>
            <div style={{ position: "relative" }}>
              <select
                value={permissionMode}
                onChange={(e) => setPermissionMode(e.target.value as AIPermissionMode)}
                style={{
                  width: "100%",
                  padding: "8px 32px 8px 12px",
                  fontSize: 13,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 6,
                  outline: "none",
                  background: "#ffffff",
                  color: colors.text,
                  fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
                  boxSizing: "border-box",
                  appearance: "none",
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = colors.primary;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = colors.border;
                }}
              >
                {PROVIDER_PERMISSION_MODES[selectedProvider].map((mode) => (
                  <option key={mode} value={mode}>
                    {PERMISSION_MODE_LABELS[mode]}
                  </option>
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
            <p style={{ fontSize: 11, color: colors.textTertiary, margin: "6px 0 0", lineHeight: 1.4 }}>
              {permissionMode === "auto"
                ? "Auto mode lets the agent run without permission prompts, with safety checks."
                : permissionMode === "acceptEdits"
                  ? "Auto-approve file edits while still prompting for shell commands."
                  : permissionMode === "plan"
                    ? "Read-only analysis mode — explore before making changes."
                    : permissionMode === "bypassPermissions"
                      ? "Skip all permission checks. Use only in isolated environments."
                      : permissionMode === "dontAsk"
                        ? "Auto-deny all tools not in the allow list."
                        : "Default mode — prompts before each action."}
            </p>
          </div>
        )}

        {/* ─── Error ─── */}
        <FormError message={createError} />
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </BaseDialog>
  );
}
