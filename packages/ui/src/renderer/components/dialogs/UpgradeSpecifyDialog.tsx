import React, { useCallback, useEffect, useRef } from "react";
import { ArrowUpCircle, X, Terminal, Minimize2, Square } from "lucide-react";

import { sendOrThrow } from "../../services/ipcClient";
import { useOnboardStore } from "../../store/onboardStore";

type UpgradeSpecifyDialogProps = {
  repoPath: string;
  repoName: string;
  onClose: () => void;
};

export function UpgradeSpecifyDialog({
  repoPath,
  repoName,
  onClose,
}: UpgradeSpecifyDialogProps): React.ReactElement {
  const process = useOnboardStore((s) => s.processes[repoPath]);
  const setRunning = useOnboardStore((s) => s.setRunning);
  const setDialogOpen = useOnboardStore((s) => s.setDialogOpen);
  const dismiss = useOnboardStore((s) => s.dismiss);
  const initSubs = useOnboardStore((s) => s.initializeSubscriptions);

  const phase = process?.phase ?? "select";
  const output = process?.output ?? "";
  const success = process?.success ?? null;
  const error = process?.error ?? null;

  const terminalRef = useRef<HTMLPreElement>(null);

  // Initialize subscriptions on mount
  useEffect(() => {
    initSubs();
  }, [initSubs]);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [output]);

  const handleStart = useCallback(async () => {
    setRunning(repoPath);
    try {
      await sendOrThrow({
        type: "repo:upgrade-specify",
        repoPath,
      });
    } catch (err) {
      // Error will be caught by IPC event
    }
  }, [repoPath, setRunning]);

  const handleCancel = useCallback(async () => {
    try {
      await sendOrThrow({ type: "repo:onboard:cancel", repoPath });
    } catch {
      // Best effort
    }
  }, [repoPath]);

  const handleMinimize = useCallback(() => {
    setDialogOpen(repoPath, false);
    onClose();
  }, [repoPath, setDialogOpen, onClose]);

  const handleClose = useCallback(() => {
    if (phase === "done") {
      dismiss(repoPath);
    }
    onClose();
  }, [phase, repoPath, dismiss, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (phase === "running") {
          handleMinimize();
        } else {
          handleClose();
        }
      }
    },
    [phase, handleMinimize, handleClose],
  );

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={phase === "running" ? handleMinimize : handleClose}
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
        aria-label="Upgrade Specify"
        onKeyDown={handleKeyDown}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "#fff",
          borderRadius: 12,
          boxShadow:
            "0 16px 48px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.08)",
          width: 520,
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
            <ArrowUpCircle size={16} color="#6b5ebd" strokeWidth={2} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "#2c2c2c" }}>
              Upgrade Specify
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {phase === "running" && (
              <button
                type="button"
                onClick={handleMinimize}
                title="Minimize to background"
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
                onMouseEnter={(e) => { e.currentTarget.style.background = "#f0ede8"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <Minimize2 size={13} strokeWidth={2} />
              </button>
            )}
            <button
              type="button"
              onClick={phase === "running" ? handleMinimize : handleClose}
              title={phase === "running" ? "Minimize to background" : "Close"}
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
        </div>

        {/* Body */}
        <div style={{ padding: "16px 20px" }}>
          {phase === "select" && (
            <p
              style={{
                fontSize: 13,
                color: "#4a4540",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Upgrade Specify for <strong>{repoName}</strong> to the latest
              version. This will install the latest <code>specify-cli</code> and
              re-initialize the configuration using the existing AI agent setting.
            </p>
          )}

          {/* Terminal output */}
          {(phase === "running" || phase === "done") && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                <Terminal size={12} color="#9a958c" strokeWidth={2} />
                <span
                  style={{ fontSize: 11, fontWeight: 600, color: "#6b6560" }}
                >
                  {phase === "running"
                    ? "Upgrading..."
                    : success
                      ? "Completed"
                      : "Failed"}
                </span>
                {phase === "running" && (
                  <span
                    style={{
                      display: "inline-block",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#6b5ebd",
                      animation: "upgrade-pulse 1.2s infinite",
                    }}
                  />
                )}
              </div>
              <pre
                ref={terminalRef}
                style={{
                  background: "#1e1e1e",
                  color: "#d4d4d4",
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 11,
                  fontFamily:
                    "'SF Mono', 'Fira Code', ui-monospace, monospace",
                  lineHeight: 1.6,
                  maxHeight: 300,
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  margin: 0,
                }}
              >
                {output || (phase === "running" ? "Starting...\n" : "")}
                {phase === "done" && success && (
                  <span style={{ color: "#4ade80" }}>
                    {"\n"}Upgrade complete!
                  </span>
                )}
                {phase === "done" && !success && error && (
                  <span style={{ color: "#f87171" }}>
                    {"\n"}Error: {error}
                  </span>
                )}
              </pre>
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
          {phase === "select" && (
            <>
              <button
                type="button"
                onClick={handleClose}
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
                onClick={handleStart}
                style={{
                  padding: "7px 16px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#fff",
                  background: "#6b5ebd",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Upgrade
              </button>
            </>
          )}
          {phase === "running" && (
            <>
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  padding: "7px 16px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "#dc2626",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Square size={10} strokeWidth={2.5} fill="#dc2626" />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMinimize}
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
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Minimize2 size={12} strokeWidth={2} />
                Run in Background
              </button>
            </>
          )}
          {phase === "done" && (
            <button
              type="button"
              onClick={handleClose}
              style={{
                padding: "7px 16px",
                fontSize: 12,
                fontWeight: 600,
                color: "#fff",
                background: success ? "#16A34A" : "#6b5ebd",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {success ? "Done" : "Close"}
            </button>
          )}
        </div>
      </div>

      <style>
        {`@keyframes upgrade-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }`}
      </style>
    </>
  );
}
