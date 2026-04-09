import React, { useCallback, useEffect, useRef, useState } from "react";
import { GitBranch, X } from "lucide-react";

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
  const suggested = defaultName ?? branch.replace(/[^a-zA-Z0-9_-]/g, "-");
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
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
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
        aria-label="Create worktree"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 16px 48px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.08)",
          width: 420,
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
              Create Worktree
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
          <p style={{ fontSize: 13, color: "#4a4540", margin: "0 0 12px", lineHeight: 1.5 }}>
            This file is on the <strong>{branch}</strong> branch. To approve it,
            a worktree will be created so the changes can be written to disk
            and later committed as a PR.
          </p>

          <label
            htmlFor="worktree-name"
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
            ref={inputRef}
            id="worktree-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="e.g. feature-auth-review"
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: 13,
              border: `1px solid ${error ? "#ef4444" : "#e5e2da"}`,
              borderRadius: 6,
              outline: "none",
              background: "#faf9f5",
              color: "#2c2c2c",
              fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
              boxSizing: "border-box",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = error ? "#ef4444" : "#C15F3C";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = error ? "#ef4444" : "#e5e2da";
            }}
          />

          {error && (
            <p style={{ fontSize: 11, color: "#ef4444", margin: "6px 0 0", fontWeight: 500 }}>
              {error}
            </p>
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
          <button
            type="button"
            onClick={handleConfirm}
            style={{
              padding: "7px 16px",
              fontSize: 12,
              fontWeight: 600,
              color: "#fff",
              background: "#16A34A",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Create & Approve
          </button>
        </div>
      </div>
    </>
  );
}
