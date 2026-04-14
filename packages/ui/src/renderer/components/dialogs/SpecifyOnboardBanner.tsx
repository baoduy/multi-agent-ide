import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Rocket, Loader2, Check, X, ChevronDown, ChevronUp, ArrowLeftRight } from "lucide-react";

import { colors } from "../../utils/colors";
import { sendOrThrow } from "../../services/ipcClient";
import { ipc } from "../../utils/ipc";
import { getProviderName } from "../common/providerConfig";
import type { AIProvider } from "@magenta/shared/aiTerminal";

type SpecifyOnboardBannerProps = {
  kind: "not-onboarded" | "agent-mismatch";
  currentAgent: string | null;
  selectedProvider: AIProvider;
  repoPath: string;
  repoName: string;
  onComplete: () => void;
};

type BannerPhase = "idle" | "running" | "success" | "error";

/**
 * Self-contained inline banner for Specify onboard/switch actions.
 * Does NOT depend on the onboardStore or OnboardDialog — manages its own
 * IPC subscriptions and local state so it can run inside NewSessionDialog
 * without triggering the global onboard dialog.
 */
export function SpecifyOnboardBanner({
  kind,
  currentAgent,
  selectedProvider,
  repoPath,
  onComplete,
}: SpecifyOnboardBannerProps): React.ReactElement {
  const [phase, setPhase] = useState<BannerPhase>("idle");
  const [output, setOutput] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [outputExpanded, setOutputExpanded] = useState(false);

  // Subscribe to onboard IPC events for this repo
  useEffect(() => {
    const unsubs = [
      ipc.on("repo:onboard:output", (msg) => {
        if (msg.repoPath === repoPath) {
          setOutput((prev) => prev + msg.data);
        }
      }),
      ipc.on("repo:onboard:complete", (msg) => {
        if (msg.repoPath === repoPath) {
          if (msg.success) {
            setPhase("success");
            onComplete();
          } else {
            setPhase("error");
            setErrorMsg(msg.error ?? "Unknown error");
          }
        }
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [repoPath, onComplete]);

  // Auto-dismiss success after a short delay (parent re-fetches status)
  useEffect(() => {
    if (phase !== "success") return;
    const timer = setTimeout(() => setPhase("idle"), 2000);
    return () => clearTimeout(timer);
  }, [phase]);

  const handleAction = useCallback(async () => {
    setPhase("running");
    setOutput("");
    setErrorMsg(null);

    try {
      if (kind === "agent-mismatch") {
        await sendOrThrow({
          type: "repo:specify-switch",
          repoPath,
          aiAgent: selectedProvider,
        });
      } else {
        await sendOrThrow({
          type: "repo:onboard",
          repoPath,
          aiAgent: selectedProvider,
        });
      }
    } catch {
      // Errors arrive via IPC events
    }
  }, [kind, repoPath, selectedProvider]);

  const providerLabel = getProviderName(selectedProvider);
  const currentLabel = currentAgent === "claude" || currentAgent === "copilot"
    ? getProviderName(currentAgent)
    : currentAgent ?? "unknown";

  const isSwitch = kind === "agent-mismatch";
  const message = isSwitch
    ? <>This repo uses <strong>{currentLabel}</strong> but you selected <strong>{providerLabel}</strong>.</>
    : <>This repo isn&apos;t onboarded to Specify.</>;
  const actionLabel = isSwitch ? "Switch" : "Onboard";
  const runningLabel = isSwitch ? "Switching..." : "Onboarding...";
  const successLabel = isSwitch ? `Switched to ${providerLabel}!` : "Specify onboarding complete!";
  const ActionIcon = isSwitch ? ArrowLeftRight : Rocket;

  // ── Success state ──
  if (phase === "success") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          borderRadius: 8,
          background: colors.successSoft,
          border: `1px solid ${colors.successSoftBorder}`,
          fontSize: 12,
          color: colors.successText,
          lineHeight: 1.4,
        }}
      >
        <Check size={14} strokeWidth={2.5} />
        <span style={{ flex: 1 }}>{successLabel}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        borderRadius: 8,
        background: colors.warningSoft,
        border: `1px solid ${colors.warningBorder}`,
        overflow: "hidden",
      }}
    >
      {/* Banner header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          fontSize: 12,
          color: colors.warningTextStrong,
          lineHeight: 1.4,
        }}
      >
        <AlertTriangle size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{message}</span>

        {/* Action / status area */}
        {phase === "idle" && (
          <button
            type="button"
            onClick={() => void handleAction()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              fontSize: 11,
              fontWeight: 600,
              fontFamily: "inherit",
              borderRadius: 6,
              border: `1px solid ${colors.warningBorder}`,
              background: colors.warningTextStrong,
              color: colors.textWhite,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
          >
            <ActionIcon size={11} strokeWidth={2.5} />
            {actionLabel}
          </button>
        )}

        {phase === "running" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 500, whiteSpace: "nowrap" }}>
            <Loader2
              size={12}
              strokeWidth={2.5}
              style={{ animation: "spin 1s linear infinite" }}
            />
            {runningLabel}
            <button
              type="button"
              onClick={() => setOutputExpanded((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "2px 4px",
                border: "none",
                background: "transparent",
                color: colors.warningTextStrong,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
              title={outputExpanded ? "Collapse output" : "Show output"}
            >
              {outputExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
        )}

        {phase === "error" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <X size={12} color={colors.error} strokeWidth={2.5} />
            <span style={{ color: colors.error, fontWeight: 500 }}>Failed</span>
            <button
              type="button"
              onClick={() => void handleAction()}
              style={{
                padding: "3px 8px",
                fontSize: 11,
                fontWeight: 500,
                fontFamily: "inherit",
                borderRadius: 4,
                border: `1px solid ${colors.warningBorder}`,
                background: "transparent",
                color: colors.warningTextStrong,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Collapsible output area */}
      {(phase === "running" || phase === "error") && outputExpanded && output && (
        <div
          style={{
            maxHeight: 160,
            overflowY: "auto",
            padding: "8px 14px",
            borderTop: `1px solid ${colors.warningBorder}`,
            background: `color-mix(in srgb, ${colors.border} 20%, transparent)`,
          }}
        >
          <pre
            style={{
              margin: 0,
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              lineHeight: 1.5,
              color: colors.text,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}
