import React, { useCallback, useEffect, useRef, useState } from "react";
import { GitBranch, X, ChevronDown, Loader2 } from "lucide-react";

import { sendOrThrow } from "../../services/ipcClient";
import { useWorktreeStore } from "../../store/worktreeStore";
import { useSessionStore } from "../../store/sessionStore";

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
          // Default to the first non-current branch if available, otherwise the current
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

      // Refresh worktree list from daemon
      void fetchWorktrees(repoPath);

      // Navigate to worktrees tab, expand the repo group, and select the new worktree
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
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    },
    [handleConfirm, onCancel],
  );

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onCancel}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.35)",
          zIndex: 9998,
        }}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-label="Add worktree"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 16px 48px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.08)",
          width: 440,
          maxWidth: "90vw",
          zIndex: 9999,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px 12px",
            borderBottom: "1px solid #e5e2da",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <GitBranch size={16} color="#C15F3C" strokeWidth={2} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "#2c2c2c" }}>
              Add Worktree
            </span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 24,
              height: 24,
              borderRadius: 4,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "#9a958c",
            }}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 20px" }}>
          {isLoadingBranches ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0" }}>
              <Loader2 size={16} color="#9a958c" style={{ animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: 13, color: "#6b6560" }}>Loading branches...</span>
            </div>
          ) : branches.length === 0 ? (
            <p style={{ fontSize: 13, color: "#6b6560", margin: "8px 0", lineHeight: 1.5 }}>
              No other branches available. You are on <strong>{currentBranch}</strong> and there are
              no additional branches to create a worktree from.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: "#4a4540", margin: "0 0 14px", lineHeight: 1.5 }}>
                Create a worktree to work on a branch in a separate directory without switching
                your main checkout.
              </p>

              {/* Branch selector */}
              <label
                htmlFor="worktree-branch"
                style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#6b6560",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Branch
              </label>

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
                    border: "1px solid #e5e2da",
                    borderRadius: 6,
                    outline: "none",
                    background: "#faf9f5",
                    color: "#2c2c2c",
                    fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
                    boxSizing: "border-box",
                    appearance: "none",
                    cursor: "pointer",
                    transition: "border-color 0.15s",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "#C15F3C"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "#e5e2da"; }}
                >
                  {branches.map((b) => (
                    <option key={b} value={b}>{b}</option>
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

              {/* Worktree name */}
              <label
                htmlFor="worktree-name-add"
                style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#6b6560",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Worktree name
              </label>

              <input
                ref={nameInputRef}
                id="worktree-name-add"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(null);
                  setCreateError(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder="e.g. feature-auth-review"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: 13,
                  border: `1px solid ${nameError ? "#ef4444" : "#e5e2da"}`,
                  borderRadius: 6,
                  outline: "none",
                  background: "#faf9f5",
                  color: "#2c2c2c",
                  fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
                  boxSizing: "border-box",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = nameError ? "#ef4444" : "#C15F3C";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = nameError ? "#ef4444" : "#e5e2da";
                }}
              />

              {nameError && (
                <p style={{ fontSize: 11, color: "#ef4444", margin: "6px 0 0", fontWeight: 500 }}>
                  {nameError}
                </p>
              )}

              {createError && (
                <p style={{ fontSize: 11, color: "#ef4444", margin: "6px 0 0", fontWeight: 500 }}>
                  {createError}
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 20px 16px",
            borderTop: "1px solid #f0ede8",
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "7px 16px",
              fontSize: 12,
              fontWeight: 500,
              color: "#6b6560",
              background: "#f5f4ed",
              border: "1px solid #e5e2da",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          {branches.length > 0 && (
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={isCreating || !selectedBranch}
              style={{
                padding: "7px 16px",
                fontSize: 12,
                fontWeight: 600,
                color: "#fff",
                background: isCreating ? "#9a958c" : "#C15F3C",
                border: "none",
                borderRadius: 6,
                cursor: isCreating ? "default" : "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                gap: 6,
                opacity: isCreating ? 0.7 : 1,
              }}
            >
              {isCreating && (
                <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
              )}
              {isCreating ? "Creating..." : "Create Worktree"}
            </button>
          )}
        </div>
      </div>

      {/* Spinner keyframe (injected inline for isolation) */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
