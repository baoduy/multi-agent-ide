import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GitBranch, GitFork, FolderPlus, Loader2, Shield, Zap, ShieldOff, FolderGit2, Sparkles, RotateCcw } from "lucide-react";

import { isValidWorktreeName } from "@magenta/shared/sanitize";
import { sendOrThrow } from "../../services/ipcClient";
import { ipc } from "../../utils/ipc";
import { useAISessionStore } from "../../store/aiSessionStore";
import { useRepoStore } from "../../store/repoStore";
import { useWorktreeStore } from "../../store/worktreeStore";
import type { WorktreeInfo } from "../../store/worktreeStore";
import { BaseDialog } from "../common/BaseDialog";
import { CancelButton, PrimaryButton } from "../common/DialogButtons";
import { FormLabel, FormError } from "../common/FormControls";
import { ProviderIcon } from "../common/ProviderIcon";
import { ButtonGroup, type ButtonGroupOption } from "../common/ButtonGroup";
import { DoublePicker, type DoublePickerOption } from "../common/DoublePicker";
import { InlineLoadingRow } from "../common/InlineLoadingRow";
import { BranchLabel } from "../common/RepoLabel";
import { ScrollableText } from "../common/ScrollableText";
import { colors } from "../../utils/colors";
import { getProviderName } from "../common/providerConfig";
import { SpecifyOnboardBanner } from "./SpecifyOnboardBanner";
import { SpecifyFooterStatus } from "./SpecifyFooterStatus";
import type { AIPermissionMode, AIProvider, AISessionRecord } from "@magenta/shared/aiTerminal";

/* ── Types ── */

type WorkspaceTarget = "branch" | "existing-worktree" | "new-worktree";

/** Simplified permission modes exposed in the UI (mapped to AIPermissionMode). */
type SimplifiedPermission = "default" | "auto" | "bypassPermissions";

type NewSessionDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Pre-selected repo path (e.g. from context menu). */
  repoPath?: string;
  repoName?: string | null;
  /** Called with the newly created AI session when creation succeeds. */
  onSessionCreated?: (session: AISessionRecord) => void;
  /**
   * When set, the dialog acts as a "Resume Session" picker.
   * The providerSessionId is passed to createSession so the agent
   * resumes from the synced session rather than starting fresh.
   */
  resumeContext?: {
    providerSessionId: string;
    provider: AIProvider;
    branch?: string;
  };
};

/* ── Dialog ── */

export function NewSessionDialog({
  open,
  onClose,
  repoPath: initialRepoPath,
  repoName: _initialRepoName,
  onSessionCreated,
  resumeContext,
}: NewSessionDialogProps): React.ReactElement | null {
  const createSession = useAISessionStore((s) => s.createSession);
  const repos = useRepoStore((s) => s.repos);
  const pinnedPaths = useRepoStore((s) => s.pinnedPaths);
  const worktrees = useWorktreeStore((s) => s.worktrees);
  const fetchWorktrees = useWorktreeStore((s) => s.fetchWorktrees);

  /* ── Form state ── */
  const [provider, setProvider] = useState<AIProvider>("claude");
  const [permissionMode, setPermissionMode] = useState<SimplifiedPermission>("auto");

  // Workspace
  const [selectedRepoPath, setSelectedRepoPath] = useState<string | null>(initialRepoPath ?? null);
  const [workspaceTarget, setWorkspaceTarget] = useState<WorkspaceTarget>("branch");

  // Branch mode
  const [branches, setBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>("");
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);

  // Existing worktree mode
  const [selectedWorktreePath, setSelectedWorktreePath] = useState<string | null>(null);

  // New worktree mode (branch for new worktree comes from top-level selectedBranch)
  const [worktreeCustomName, setWorktreeCustomName] = useState("");
  const [worktreeNameError, setWorktreeNameError] = useState<string | null>(null);

  // Specify onboard status
  const [specifyStatus, setSpecifyStatus] = useState<{
    hasSpecs: boolean;
    currentAgent: string | null;
  } | null>(null);
  const [isLoadingSpecifyStatus, setIsLoadingSpecifyStatus] = useState(false);

  // Global
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const worktreeNameInputRef = useRef<HTMLInputElement>(null);

  /* ── Derived values ── */

  /** Repo dropdown options for the DoublePicker — pinned repos first with star icon. */
  const repoOptions = useMemo((): readonly DoublePickerOption<string>[] => {
    const pinned: DoublePickerOption<string>[] = [];
    const unpinned: DoublePickerOption<string>[] = [];
    for (const r of repos) {
      const isPinned = pinnedPaths.has(r.path);
      const opt: DoublePickerOption<string> = {
        value: r.path,
        label: r.name,
        description: r.path,
        icon: <FolderGit2 size={14} color={colors.textTertiary} />,
        suffix: isPinned ? <span style={{ color: colors.primary, fontSize: 10 }}>{"\u2605"}</span> : undefined,
      };
      if (isPinned) {
        pinned.push(opt);
      } else {
        unpinned.push(opt);
      }
    }
    return [...pinned, ...unpinned];
  }, [repos, pinnedPaths]);

  const repoWorktrees = useMemo(
    () =>
      selectedRepoPath
        ? worktrees.filter((w) => w.repoPath === selectedRepoPath)
        : [],
    [worktrees, selectedRepoPath],
  );

  const providerPrefix = `${provider}-`;
  const fullWorktreeName = worktreeCustomName.trim()
    ? `${providerPrefix}${worktreeCustomName.trim()}`
    : "";

  /** Provider dropdown options with brand icons. */
  const providerOptions = useMemo(
    (): readonly DoublePickerOption<AIProvider>[] => [
      {
        value: "claude",
        label: getProviderName("claude"),
        icon: <ProviderIcon provider="claude" size={14} />,
      },
      {
        value: "copilot",
        label: getProviderName("copilot"),
        icon: <ProviderIcon provider="copilot" size={14} />,
      },
    ],
    [],
  );

  /** Permission dropdown options. */
  const permissionOptions = useMemo(
    (): readonly DoublePickerOption<SimplifiedPermission>[] => [
      {
        value: "default",
        label: "Default",
        description: "Asks before file edits",
        icon: <Shield size={14} color={colors.textSecondary} strokeWidth={1.8} />,
      },
      {
        value: "auto",
        label: "Auto",
        description: "Auto-accepts safe actions",
        icon: <Zap size={14} color={colors.textSecondary} strokeWidth={1.8} />,
      },
      {
        value: "bypassPermissions",
        label: "Bypass",
        description: "Skips all permission checks",
        icon: <ShieldOff size={14} color={colors.error} strokeWidth={1.8} />,
      },
    ],
    [],
  );

  /** Branch dropdown options with "(current)" suffix. */
  const branchOptions = useMemo(
    (): readonly DoublePickerOption<string>[] =>
      branches.map((b) => ({
        value: b,
        label: b,
        suffix: b === currentBranch ? "(current)" : undefined,
        icon: <GitBranch size={13} color={colors.textTertiary} />,
      })),
    [branches, currentBranch],
  );

  /** Dynamic "Run in" options — disable "Existing Worktree" when none available. */
  const workspaceTargetOptions = useMemo(
    (): readonly ButtonGroupOption<WorkspaceTarget>[] => [
      {
        key: "existing-worktree",
        label: `Worktree${repoWorktrees.length > 0 ? ` (${repoWorktrees.length})` : ""}`,
        icon: <GitFork size={13} />,
        disabled: repoWorktrees.length === 0,
      },
      { key: "new-worktree", label: "New Worktree", icon: <FolderPlus size={13} /> },
    ],
    [repoWorktrees.length],
  );

  /**
   * The path we should check for Specify status.
   * For existing worktrees, use the worktree path (its own .specify/ may differ).
   * Otherwise fall back to the repo root.
   */
  const effectiveSpecifyPath = useMemo((): string | null => {
    if (!selectedRepoPath) return null;
    if (workspaceTarget === "existing-worktree" && selectedWorktreePath) {
      return selectedWorktreePath;
    }
    return selectedRepoPath;
  }, [selectedRepoPath, workspaceTarget, selectedWorktreePath]);

  const canCreate = useMemo(() => {
    if (!selectedRepoPath) return false;
    if (workspaceTarget === "branch" && !selectedBranch) return false;
    if (workspaceTarget === "existing-worktree" && !selectedWorktreePath) return false;
    if (workspaceTarget === "new-worktree" && !selectedBranch) return false;
    if (!provider) return false;
    return true;
  }, [selectedRepoPath, workspaceTarget, selectedBranch, selectedWorktreePath, provider]);

  type SpecifyBannerKind = "none" | "not-onboarded";

  /** Body banner — only used for "not onboarded". Agent-mismatch now lives in the footer. */
  const specifyBanner = useMemo((): { kind: SpecifyBannerKind; currentAgent: string | null } => {
    if (!specifyStatus || isLoadingSpecifyStatus) {
      return { kind: "none", currentAgent: null };
    }
    if (!specifyStatus.hasSpecs) {
      return { kind: "not-onboarded", currentAgent: null };
    }
    return { kind: "none", currentAgent: null };
  }, [specifyStatus, isLoadingSpecifyStatus]);

  /* ── Effects ── */

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedRepoPath(initialRepoPath ?? null);
      setProvider(resumeContext?.provider ?? "claude");
      setPermissionMode("auto");
      setWorkspaceTarget("branch");
      setSelectedWorktreePath(null);
      setWorktreeCustomName("");
      setWorktreeNameError(null);
      setCreateError(null);
      setIsCreating(false);
      setSpecifyStatus(null);
      setIsLoadingSpecifyStatus(false);
    }
  }, [open, initialRepoPath, resumeContext]);

  // Load branches when repo changes
  useEffect(() => {
    if (!open || !selectedRepoPath) {
      setBranches([]);
      setCurrentBranch("");
      setSelectedBranch("");
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
        // Pre-select the resume branch if it exists in the list, otherwise current
        const preferredBranch = resumeContext?.branch;
        const initialBranch = preferredBranch && res.branches.includes(preferredBranch)
          ? preferredBranch
          : res.current;
        setSelectedBranch(initialBranch);
        setIsLoadingBranches(false);
      })
      .catch(() => {
        if (!cancelled) setIsLoadingBranches(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, selectedRepoPath]);

  // Check Specify onboard status whenever the effective path changes
  // (repo switch, worktree selection, or branch change).
  useEffect(() => {
    if (!open || !effectiveSpecifyPath) {
      setSpecifyStatus(null);
      return;
    }

    let cancelled = false;
    setIsLoadingSpecifyStatus(true);

    sendOrThrow({ type: "repo:specify-status", repoPath: effectiveSpecifyPath })
      .then((res) => {
        if (cancelled) return;
        setSpecifyStatus({ hasSpecs: res.hasSpecs, currentAgent: res.currentAgent });
        setIsLoadingSpecifyStatus(false);
      })
      .catch(() => {
        if (!cancelled) {
          setSpecifyStatus(null);
          setIsLoadingSpecifyStatus(false);
        }
      });

    return () => { cancelled = true; };
  }, [open, effectiveSpecifyPath]);

  // Load worktrees for selected repo
  useEffect(() => {
    if (open && selectedRepoPath) {
      void fetchWorktrees(selectedRepoPath);
    }
  }, [open, selectedRepoPath, fetchWorktrees]);

  // Focus worktree name input when entering new-worktree mode
  useEffect(() => {
    if (workspaceTarget === "new-worktree" && worktreeNameInputRef.current) {
      worktreeNameInputRef.current.focus();
    }
  }, [workspaceTarget]);

  /* ── Handlers ── */

  const handleRepoSelect = useCallback((path: string) => {
    setSelectedRepoPath(path);
    setWorkspaceTarget("branch");
    setSelectedWorktreePath(null);
    setWorktreeCustomName("");
    setWorktreeNameError(null);
    setCreateError(null);
  }, []);

  // Auto-sync selectedBranch to the chosen worktree's branch so the disabled
  // picker still displays meaningful info in existing-worktree mode.
  const handleExistingWorktreeSelect = useCallback(
    (worktreePath: string) => {
      setSelectedWorktreePath(worktreePath);
      const wt = repoWorktrees.find((w) => w.worktreePath === worktreePath);
      if (wt) setSelectedBranch(wt.branch);
    },
    [repoWorktrees],
  );

  const handleWorkspaceTargetChange = useCallback(
    (target: WorkspaceTarget) => {
      // Toggle: clicking the active option reverts to plain "branch" mode.
      const next = target === workspaceTarget ? "branch" : target;
      setWorkspaceTarget(next);
      setSelectedWorktreePath(null);
      setWorktreeCustomName("");
      setWorktreeNameError(null);
      setCreateError(null);
    },
    [workspaceTarget],
  );

  const handleConfirm = useCallback(async () => {
    if (!selectedRepoPath) {
      setCreateError("Please select a repository.");
      return;
    }

    // Validate worktree name if custom
    if (workspaceTarget === "new-worktree" && worktreeCustomName.trim()) {
      if (!isValidWorktreeName(worktreeCustomName.trim())) {
        setWorktreeNameError("Only letters, numbers, dashes, and underscores.");
        return;
      }
    }

    setIsCreating(true);
    setCreateError(null);
    setWorktreeNameError(null);

    try {
      /* ── Resolve the working directory / worktree ── */

      let worktreePathToUse: string | undefined;
      let branchToUse: string | undefined;

      if (workspaceTarget === "branch") {
        branchToUse = selectedBranch;
      } else if (workspaceTarget === "existing-worktree") {
        const wt = repoWorktrees.find((w) => w.worktreePath === selectedWorktreePath);
        if (!wt) {
          setCreateError("Selected worktree not found.");
          setIsCreating(false);
          return;
        }
        worktreePathToUse = wt.worktreePath;
        branchToUse = wt.branch;
      } else if (workspaceTarget === "new-worktree") {
        const wtName = worktreeCustomName.trim()
          ? `${providerPrefix}${worktreeCustomName.trim()}`
          : `${provider}-${Date.now()}`;

        const result = await sendOrThrow({
          type: "worktree:create",
          repoPath: selectedRepoPath,
          branch: selectedBranch,
          name: wtName,
        });
        worktreePathToUse = result.worktreePath;
        branchToUse = result.branch;
      }

      /* ── Auto-switch Specify integration on the destination path ── */

      const switchTargetPath = worktreePathToUse ?? selectedRepoPath;
      if (specifyStatus?.hasSpecs && specifyStatus.currentAgent !== provider) {
        await sendOrThrow({
          type: "repo:specify-switch",
          repoPath: switchTargetPath,
          aiAgent: provider,
        });

        // Wait for the async switch to complete before creating the session
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            unsub();
            reject(new Error("Specify switch timed out"));
          }, 30_000);

          const unsub = ipc.on("repo:onboard:complete", (msg) => {
            if (msg.repoPath === switchTargetPath) {
              clearTimeout(timeout);
              unsub();
              if (msg.success) {
                setSpecifyStatus({ hasSpecs: true, currentAgent: provider });
                resolve();
              } else {
                reject(new Error(msg.error ?? "Specify switch failed"));
              }
            }
          });
        });
      }

      /* ── Create the agent session ── */

      const session = await createSession(
        {
          provider,
          repoPath: selectedRepoPath,
          branch: branchToUse,
          worktreePath: worktreePathToUse,
          permissionMode: permissionMode as AIPermissionMode,
          providerSessionId: resumeContext?.providerSessionId,
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
    provider,
    permissionMode,
    selectedRepoPath,
    workspaceTarget,
    selectedBranch,
    selectedWorktreePath,
    worktreeCustomName,
    providerPrefix,
    repoWorktrees,
    specifyStatus,
    resumeContext,
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
  const branchesReady = hasRepo && !isLoadingBranches && branches.length > 0;

  return (
    <BaseDialog
      title={resumeContext ? "Resume Session" : "New Session"}
      icon={
        resumeContext
          ? <RotateCcw size={16} color={colors.primary} strokeWidth={2} />
          : <Sparkles size={16} color={colors.primary} strokeWidth={2} />
      }
      width={680}
      scrollable
      minHeight="70vh"
      maxHeight="90vh"
      onClose={onClose}
      footer={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          {/* Left: Specify integration status + switch */}
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            {specifyStatus && specifyStatus.hasSpecs && (
              <SpecifyFooterStatus
                currentAgent={specifyStatus.currentAgent}
                selectedProvider={provider}
                hasSpecs={specifyStatus.hasSpecs}
              />
            )}
          </div>

          {/* Right: action buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <PrimaryButton
              onClick={() => void handleConfirm()}
              disabled={!canCreate}
              loading={isCreating}
              loadingText={resumeContext ? "Resuming..." : "Creating..."}
            >
              {resumeContext ? "Resume" : "Create"}
            </PrimaryButton>
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* ─── Agent + Workspace on one row ─── */}
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: "1 1 0", minWidth: 0 }}>
            <FormLabel>Agent</FormLabel>
            <DoublePicker<AIProvider, SimplifiedPermission>
              left={{
                options: providerOptions,
                value: provider,
                onChange: setProvider,
                placeholder: "Provider",
                minPanelWidth: 180,
              }}
              right={{
                options: permissionOptions,
                value: permissionMode,
                onChange: setPermissionMode,
                placeholder: "Permission",
                minPanelWidth: 220,
              }}
            />
          </div>

          <div style={{ flex: "1 1 0", minWidth: 0 }}>
            <FormLabel>Workspace</FormLabel>
            <DoublePicker<string, string>
              left={{
                options: repoOptions,
                value: selectedRepoPath ?? "",
                onChange: handleRepoSelect,
                placeholder: "Select repository",
                searchable: repos.length > 5,
                searchPlaceholder: "Search repositories...",
                minPanelWidth: 280,
              }}
              right={{
                options: branchOptions,
                value: selectedBranch,
                onChange: setSelectedBranch,
                placeholder: hasRepo ? "Select branch" : "Branch",
                searchable: branches.length > 5,
                searchPlaceholder: "Search branches...",
                minPanelWidth: 240,
                disabled:
                  !hasRepo ||
                  isLoadingBranches ||
                  workspaceTarget === "existing-worktree",
              }}
            />
          </div>
        </div>

        {/* ─── Loading branches indicator ─── */}
        {hasRepo && isLoadingBranches && (
          <InlineLoadingRow
            label="Loading branches..."
            padding="4px 0"
            color={colors.textSecondary}
          />
        )}

        {/* ─── Specify Onboard Notice ─── */}
        {specifyBanner.kind !== "none" && branchesReady && effectiveSpecifyPath && (
          <SpecifyOnboardBanner
            kind={specifyBanner.kind}
            currentAgent={specifyBanner.currentAgent}
            selectedProvider={provider}
            repoPath={effectiveSpecifyPath}
            repoName={repos.find((r) => r.path === selectedRepoPath)?.name ?? ""}
            onComplete={() => {
              // Optimistically update to hide banner immediately
              setSpecifyStatus({ hasSpecs: true, currentAgent: provider });
              // Also re-fetch from daemon for accuracy
              sendOrThrow({ type: "repo:specify-status", repoPath: effectiveSpecifyPath })
                .then((res) => setSpecifyStatus({ hasSpecs: res.hasSpecs, currentAgent: res.currentAgent }))
                .catch(() => {});
            }}
          />
        )}

        {/* ─── Run in (after repo selected + branches loaded) ─── */}
        {branchesReady && (
          <>
            <div>
              <FormLabel>Run In</FormLabel>
              <ButtonGroup
                options={workspaceTargetOptions}
                value={workspaceTarget}
                onChange={handleWorkspaceTargetChange}
              />
            </div>

            {/* ── Existing worktree mode ── */}
            {workspaceTarget === "existing-worktree" && repoWorktrees.length > 0 && (
              <div>
                <FormLabel>Worktree</FormLabel>
                <WorktreeList
                  worktrees={repoWorktrees}
                  selectedPath={selectedWorktreePath}
                  onSelect={handleExistingWorktreeSelect}
                />
              </div>
            )}

            {/* ── New worktree mode ── */}
            {workspaceTarget === "new-worktree" && (
              <>
                <div>
                  <FormLabel>Worktree Name</FormLabel>
                  <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                    <div
                      style={{
                        padding: "8px 6px 8px 12px",
                        fontSize: 13,
                        fontFamily: "var(--font-mono)",
                        color: colors.textTertiary,
                        background: colors.bgMuted,
                        border: `1px solid ${worktreeNameError ? colors.error : colors.border}`,
                        borderRight: "none",
                        borderRadius: "6px 0 0 6px",
                        whiteSpace: "nowrap",
                        lineHeight: "1.35",
                      }}
                    >
                      {providerPrefix}
                    </div>
                    <input
                      ref={worktreeNameInputRef}
                      type="text"
                      value={worktreeCustomName}
                      onChange={(e) => {
                        setWorktreeCustomName(e.target.value);
                        setWorktreeNameError(null);
                        setCreateError(null);
                      }}
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
                        fontFamily: "var(--font-mono)",
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
                    <p
                      style={{
                        fontSize: 11,
                        color: colors.textTertiary,
                        margin: "4px 0 0",
                        lineHeight: 1.4,
                      }}
                    >
                      Full name:{" "}
                      <code
                        style={{
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {fullWorktreeName}
                      </code>
                    </p>
                  )}
                  {!worktreeCustomName.trim() && (
                    <p style={{ fontSize: 11, color: colors.textTertiary, margin: "4px 0 0" }}>
                      Leave blank to auto-generate
                    </p>
                  )}
                  <FormError message={worktreeNameError} />
                </div>
              </>
            )}
          </>
        )}

        {/* ─── Error ─── */}
        <FormError message={createError} />
      </div>
    </BaseDialog>
  );
}

/* ── Sub-components ── */

/** Scrollable list of worktrees for the "Existing Worktree" mode. */
function WorktreeList({
  worktrees,
  selectedPath,
  onSelect,
}: {
  worktrees: WorktreeInfo[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        maxHeight: 160,
        overflowY: "auto",
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: 4,
      }}
    >
      {worktrees.map((wt) => {
        const isSelected = selectedPath === wt.worktreePath;
        return (
          <button
            key={wt.worktreePath}
            type="button"
            onClick={() => onSelect(wt.worktreePath)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 6,
              border: isSelected
                ? `1.5px solid ${colors.primary}`
                : "1.5px solid transparent",
              background: isSelected ? colors.primaryAlpha : "transparent",
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
              transition: "all 0.1s",
              fontFamily: "inherit",
            }}
            onMouseEnter={(e) => {
              if (!isSelected) e.currentTarget.style.background = colors.bgHover;
            }}
            onMouseLeave={(e) => {
              if (!isSelected) e.currentTarget.style.background = "transparent";
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <ScrollableText
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: colors.text,
                }}
              >
                {wt.name}
              </ScrollableText>
              <div style={{ marginTop: 2 }}>
                <BranchLabel name={wt.branch} size="xs" />
              </div>
            </div>
            {isSelected && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke={colors.primary}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
