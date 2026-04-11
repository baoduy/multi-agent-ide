import React, { useCallback, useEffect, useRef, useState } from "react";
import { Rocket, X, Check, ChevronDown, Minimize2, GitBranch, GitFork, Square } from "lucide-react";

import { sendOrThrow } from "../../services/ipcClient";
import { useOnboardStore } from "../../store/onboardStore";
import { MagentaTerminal } from "../common/MagentaTerminal";

/**
 * Available AI agents for Specify onboarding.
 * Mirrors the SPECIFY_AI_AGENTS list on the daemon.
 */
const AI_AGENTS = [
  { id: "claude", label: "Claude Code" },
  { id: "copilot", label: "GitHub Copilot" },
  { id: "cursor-agent", label: "Cursor" },
  { id: "gemini", label: "Gemini CLI" },
  { id: "codex", label: "Codex CLI" },
  { id: "windsurf", label: "Windsurf" },
  { id: "amp", label: "Amp" },
  { id: "qwen", label: "Qwen Code" },
  { id: "opencode", label: "OpenCode" },
  { id: "junie", label: "Junie" },
  { id: "kilocode", label: "Kilo Code" },
  { id: "roo", label: "Roo Code" },
  { id: "kiro-cli", label: "Kiro CLI" },
  { id: "tabnine", label: "Tabnine CLI" },
  { id: "trae", label: "Trae" },
  { id: "forge", label: "Forge" },
] as const;

type OnboardDialogProps = {
  repoPath: string;
  repoName: string;
  onClose: () => void;
};

export function OnboardDialog({
  repoPath,
  repoName,
  onClose,
}: OnboardDialogProps): React.ReactElement {
  const process = useOnboardStore((s) => s.processes[repoPath]);
  const setRunning = useOnboardStore((s) => s.setRunning);
  const setDialogOpen = useOnboardStore((s) => s.setDialogOpen);
  const dismiss = useOnboardStore((s) => s.dismiss);
  const initSubs = useOnboardStore((s) => s.initializeSubscriptions);

  const phase = process?.phase ?? "select";
  const output = process?.output ?? "";
  const success = process?.success ?? null;
  const error = process?.error ?? null;

  const [selectedAgent, setSelectedAgent] = useState("claude");
  const [useWorktree, setUseWorktree] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Initialize subscriptions on mount
  useEffect(() => {
    initSubs();
  }, [initSubs]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  const handleStart = useCallback(async () => {
    setRunning(repoPath);
    try {
      await sendOrThrow({
        type: "repo:onboard",
        repoPath,
        aiAgent: selectedAgent,
        useWorktree,
      });
    } catch (err) {
      // Error will be caught by IPC event
    }
  }, [repoPath, selectedAgent, setRunning]);

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

  const selectedLabel = AI_AGENTS.find((a) => a.id === selectedAgent)?.label ?? selectedAgent;

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
        aria-label="Onboard to Specify"
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
            <Rocket size={16} color="#C15F3C" strokeWidth={2} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "#2c2c2c" }}>
              Onboard to Specify
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {/* Minimize button (only when running) */}
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
            {/* Close button */}
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
            <>
              <p
                style={{
                  fontSize: 13,
                  color: "#4a4540",
                  margin: "0 0 16px",
                  lineHeight: 1.5,
                }}
              >
                Initialize <strong>{repoName}</strong> with Specify to enable
                spec-driven development. Choose the AI agent to configure:
              </p>

              {/* AI Agent Selector */}
              <label
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
                AI Agent
              </label>

              <div ref={dropdownRef} style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen((v) => !v)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: 13,
                    border: "1px solid #e5e2da",
                    borderRadius: 6,
                    background: "#faf9f5",
                    color: "#2c2c2c",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontFamily: "inherit",
                  }}
                >
                  <span>{selectedLabel}</span>
                  <ChevronDown
                    size={14}
                    color="#9a958c"
                    style={{
                      transform: dropdownOpen ? "rotate(180deg)" : "none",
                      transition: "transform 0.15s",
                    }}
                  />
                </button>

                {dropdownOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      marginTop: 4,
                      background: "#fff",
                      border: "1px solid #e5e2da",
                      borderRadius: 8,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                      maxHeight: 240,
                      overflowY: "auto",
                      zIndex: 10000,
                    }}
                  >
                    {AI_AGENTS.map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => {
                          setSelectedAgent(agent.id);
                          setDropdownOpen(false);
                        }}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          fontSize: 13,
                          border: "none",
                          background:
                            agent.id === selectedAgent
                              ? "#f0ebe4"
                              : "transparent",
                          color: "#2c2c2c",
                          cursor: "pointer",
                          textAlign: "left",
                          fontFamily: "inherit",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                        onMouseEnter={(e) => {
                          if (agent.id !== selectedAgent)
                            e.currentTarget.style.background = "#faf9f5";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background =
                            agent.id === selectedAgent
                              ? "#f0ebe4"
                              : "transparent";
                        }}
                      >
                        {agent.id === selectedAgent && (
                          <Check size={12} color="#C15F3C" strokeWidth={2.5} />
                        )}
                        <span
                          style={{
                            marginLeft: agent.id === selectedAgent ? 0 : 20,
                          }}
                        >
                          {agent.label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Install target toggle */}
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#6b6560",
                  marginBottom: 6,
                  marginTop: 16,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Install Target
              </label>

              <div style={{ display: "flex", gap: 8 }}>
                {/* Current branch option */}
                <button
                  type="button"
                  onClick={() => setUseWorktree(false)}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    fontSize: 12,
                    border: `1.5px solid ${!useWorktree ? "#C15F3C" : "#e5e2da"}`,
                    borderRadius: 8,
                    background: !useWorktree ? "#C15F3C08" : "#faf9f5",
                    color: "#2c2c2c",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    textAlign: "left",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                >
                  <GitBranch
                    size={14}
                    color={!useWorktree ? "#C15F3C" : "#9a958c"}
                    strokeWidth={2}
                  />
                  <div>
                    <div style={{ fontWeight: 600, lineHeight: 1.3 }}>
                      Current branch
                    </div>
                    <div style={{ fontSize: 11, color: "#9a958c", marginTop: 2 }}>
                      Install directly in the working tree
                    </div>
                  </div>
                </button>

                {/* New worktree option */}
                <button
                  type="button"
                  onClick={() => setUseWorktree(true)}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    fontSize: 12,
                    border: `1.5px solid ${useWorktree ? "#C15F3C" : "#e5e2da"}`,
                    borderRadius: 8,
                    background: useWorktree ? "#C15F3C08" : "#faf9f5",
                    color: "#2c2c2c",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    textAlign: "left",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                >
                  <GitFork
                    size={14}
                    color={useWorktree ? "#C15F3C" : "#9a958c"}
                    strokeWidth={2}
                  />
                  <div>
                    <div style={{ fontWeight: 600, lineHeight: 1.3 }}>
                      New worktree
                    </div>
                    <div style={{ fontSize: 11, color: "#9a958c", marginTop: 2 }}>
                      Create an isolated branch first
                    </div>
                  </div>
                </button>
              </div>
            </>
          )}

          {/* Terminal output (running / done) */}
          {(phase === "running" || phase === "done") && (
            <MagentaTerminal
              readonly={true}
              output={output}
              status={
                phase === "running"
                  ? "running"
                  : phase === "done"
                    ? success
                      ? "done"
                      : error === "canceled"
                        ? "canceled"
                        : "error"
                    : "idle"
              }
              successMessage="Setup complete!"
              errorMessage={error ?? undefined}
              label={
                phase === "running"
                  ? "Running..."
                  : phase === "done"
                    ? success
                      ? "Completed"
                      : "Failed"
                    : ""
              }
            />
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
                  background: "#C15F3C",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Start Onboarding
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
                background: success ? "#16A34A" : "#C15F3C",
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

    </>
  );
}