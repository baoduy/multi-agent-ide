import React, { useCallback, useEffect, useRef, useState } from "react";
import { Rocket, Check, ChevronDown, Minimize2, GitBranch, GitFork, Square } from "lucide-react";

import { colors } from "../../utils/colors";
import { sendOrThrow } from "../../services/ipcClient";
import { useOnboardStore } from "../../store/onboardStore";
import { MagentaTerminal } from "../common/MagentaTerminal";
import { BaseDialog } from "../common/BaseDialog";
import { CancelButton, PrimaryButton, DangerButton, SecondaryButton } from "../common/DialogButtons";
import { FormLabel } from "../common/FormControls";
import { ProviderIcon } from "../common/ProviderIcon";

/**
 * Available AI agents for Specify onboarding.
 * Mirrors the SPECIFY_AI_AGENTS list on the daemon.
 */
const AI_AGENTS = [
  { id: "claude", label: "Claude Code" },
  { id: "copilot", label: "GitHub Copilot" },
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

  useEffect(() => { initSubs(); }, [initSubs]);

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

  const selectedLabel = AI_AGENTS.find((a) => a.id === selectedAgent)?.label ?? selectedAgent;

  const footer = (
    <>
      {phase === "select" && (
        <>
          <CancelButton onClick={handleClose} />
          <PrimaryButton onClick={handleStart}>Start Onboarding</PrimaryButton>
        </>
      )}
      {phase === "running" && (
        <>
          <DangerButton onClick={handleCancel} icon={<Square size={10} strokeWidth={2.5} fill={colors.errorDark} />}>
            Cancel
          </DangerButton>
          <SecondaryButton onClick={handleMinimize} icon={<Minimize2 size={12} strokeWidth={2} />}>
            Run in Background
          </SecondaryButton>
        </>
      )}
      {phase === "done" && (
        <PrimaryButton onClick={handleClose} color={success ? colors.success : colors.primary}>
          {success ? "Done" : "Close"}
        </PrimaryButton>
      )}
    </>
  );

  return (
    <BaseDialog
      title="Onboard to Specify"
      icon={<Rocket size={16} color={colors.primary} strokeWidth={2} />}
      width={520}
      onClose={handleClose}
      onMinimize={phase === "running" ? handleMinimize : undefined}
      showMinimize={phase === "running"}
      footer={footer}
    >
      {phase === "select" && (
        <>
          <p
            style={{
              fontSize: 13,
              color: colors.textMuted,
              margin: "0 0 16px",
              lineHeight: 1.5,
            }}
          >
            Initialize <strong>{repoName}</strong> with Specify to enable
            spec-driven development. Choose the AI agent to configure:
          </p>

          {/* AI Agent Selector */}
          <FormLabel>AI Agent</FormLabel>

          <div ref={dropdownRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setDropdownOpen((v) => !v)}
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: 13,
                border: `1px solid ${colors.border}`,
                borderRadius: 6,
                background: colors.bgSurface,
                color: colors.text,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontFamily: "inherit",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ProviderIcon provider={selectedAgent as "claude" | "copilot"} size={16} />
                {selectedLabel}
              </span>
              <ChevronDown
                size={14}
                color={colors.textTertiary}
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
                  background: colors.dialogBg,
                  border: `1px solid ${colors.border}`,
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
                          ? colors.bgHover
                          : "transparent",
                      color: colors.text,
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "inherit",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                    onMouseEnter={(e) => {
                      if (agent.id !== selectedAgent)
                        e.currentTarget.style.background = colors.bgSurface;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background =
                        agent.id === selectedAgent
                          ? colors.bgHover
                          : "transparent";
                    }}
                  >
                    {agent.id === selectedAgent && (
                      <Check size={12} color={colors.primary} strokeWidth={2.5} />
                    )}
                    {!( agent.id === selectedAgent) && <span style={{ width: 12 }} />}
                    <ProviderIcon provider={agent.id as "claude" | "copilot"} size={16} />
                    <span>
                      {agent.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Install target toggle */}
          <FormLabel style={{ marginTop: 16 }}>Install Target</FormLabel>

          <div style={{ display: "flex", gap: 8 }}>
            {/* Current branch option */}
            <button
              type="button"
              onClick={() => setUseWorktree(false)}
              style={{
                flex: 1,
                padding: "10px 12px",
                fontSize: 12,
                border: `1.5px solid ${!useWorktree ? colors.primary : colors.border}`,
                borderRadius: 8,
                background: !useWorktree ? colors.primaryAlpha : colors.bgSurface,
                color: colors.text,
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
                color={!useWorktree ? colors.primary : colors.textTertiary}
                strokeWidth={2}
              />
              <div>
                <div style={{ fontWeight: 600, lineHeight: 1.3 }}>
                  Current branch
                </div>
                <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
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
                border: `1.5px solid ${useWorktree ? colors.primary : colors.border}`,
                borderRadius: 8,
                background: useWorktree ? colors.primaryAlpha : colors.bgSurface,
                color: colors.text,
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
                color={useWorktree ? colors.primary : colors.textTertiary}
                strokeWidth={2}
              />
              <div>
                <div style={{ fontWeight: 600, lineHeight: 1.3 }}>
                  New worktree
                </div>
                <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
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
    </BaseDialog>
  );
}
