import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, Loader2, Check, AlertCircle } from "lucide-react";

import { colors } from "../../utils/colors";
import { sendOrThrow } from "../../services/ipcClient";
import { ipc } from "../../utils/ipc";
import { ActionButton } from "../common/ActionButton";
import { ProviderIcon } from "../common/ProviderIcon";
import { getProviderName } from "../common/providerConfig";
import type { ProviderVariant } from "../common/providerConfig";
import type { AIProvider } from "@magenta/shared/aiTerminal";
import { ScrollableText } from "../common/ScrollableText";

type SpecifyFooterStatusProps = {
  /** The Specify-configured agent for this repo (e.g. "claude" | "copilot"). */
  currentAgent: string | null;
  /** The provider the user has selected in the dialog. */
  selectedProvider: AIProvider;
  /** Whether the repo has Specify specs at all. */
  hasSpecs: boolean;
  /** Repo path for the switch IPC call. */
  repoPath: string;
  /** Called after a successful switch so the parent can refresh. */
  onSwitchComplete: () => void;
  /** When true, auto-trigger the switch when a mismatch is detected. */
  autoSwitch?: boolean;
};

type SwitchPhase = "idle" | "switching" | "success" | "error";

/**
 * Compact footer indicator that shows the current Specify integration
 * and offers an inline switch button when the selected provider doesn't match.
 *
 * Rendered on the LEFT side of the dialog action bar.
 */
export const SpecifyFooterStatus = React.memo(function SpecifyFooterStatus({
  currentAgent,
  selectedProvider,
  hasSpecs,
  repoPath,
  onSwitchComplete,
  autoSwitch = false,
}: SpecifyFooterStatusProps): React.ReactElement | null {
  const [phase, setPhase] = useState<SwitchPhase>("idle");

  // Reset phase when the provider or repo changes
  useEffect(() => {
    setPhase("idle");
  }, [selectedProvider, repoPath]);

  // Listen for switch completion via IPC events
  useEffect(() => {
    const unsubs = [
      ipc.on("repo:onboard:complete", (msg) => {
        if (msg.repoPath === repoPath) {
          if (msg.success) {
            setPhase("success");
            onSwitchComplete();
          } else {
            setPhase("error");
          }
        }
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [repoPath, onSwitchComplete]);

  // Auto-clear success after a brief flash
  useEffect(() => {
    if (phase !== "success") return;
    const t = setTimeout(() => setPhase("idle"), 1500);
    return () => clearTimeout(t);
  }, [phase]);

  const handleSwitch = useCallback(async () => {
    setPhase("switching");
    try {
      await sendOrThrow({
        type: "repo:specify-switch",
        repoPath,
        aiAgent: selectedProvider,
      });
    } catch {
      // Errors arrive via IPC events; if the promise rejects without an event, mark error.
      setPhase("error");
    }
  }, [repoPath, selectedProvider]);

  // Auto-trigger switch when mismatch is detected and autoSwitch is enabled.
  // Runs after the workspace/branch path is resolved so it targets the correct destination.
  useEffect(() => {
    if (!autoSwitch || !hasSpecs || phase !== "idle") return;
    if (currentAgent != null && currentAgent !== selectedProvider) {
      void handleSwitch();
    }
  }, [autoSwitch, hasSpecs, currentAgent, selectedProvider, phase, handleSwitch]);

  // Don't render anything if the repo isn't onboarded to Specify
  if (!hasSpecs) return null;

  const isMismatch =
    currentAgent != null && currentAgent !== selectedProvider;

  const isKnownProvider =
    currentAgent === "claude" || currentAgent === "copilot";
  const agentLabel = isKnownProvider
    ? getProviderName(currentAgent as ProviderVariant)
    : (currentAgent ?? "Unknown");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 11,
        color: colors.textSecondary,
        minWidth: 0,
      }}
    >
      {/* Current integration indicator */}
      {isKnownProvider && (
        <ProviderIcon provider={currentAgent as ProviderVariant} size={13} />
      )}
      <ScrollableText>
        Specify: <strong style={{ color: colors.text, fontWeight: 600 }}>{agentLabel}</strong>
      </ScrollableText>

      {/* Mismatch: show switch affordance */}
      {isMismatch && phase === "idle" && (
        <button
          type="button"
          onClick={() => void handleSwitch()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 5,
            borderRadius: 5,
            border: `1px solid ${colors.warningBorder}`,
            background: colors.warningSoft,
            color: colors.warningTextStrong,
            cursor: "pointer",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.85";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
          title={`Switch Specify integration to ${getProviderName(selectedProvider)}`}
        >
          <ArrowLeftRight size={12} strokeWidth={2.5} />
        </button>
      )}

      {/* Switching spinner */}
      {phase === "switching" && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: colors.textTertiary,
            whiteSpace: "nowrap",
          }}
        >
          <Loader2
            size={11}
            strokeWidth={2.5}
            style={{ animation: "spin 1s linear infinite" }}
          />
          Switching...
        </span>
      )}

      {/* Success flash */}
      {phase === "success" && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: colors.success,
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          <Check size={11} strokeWidth={2.5} />
          Switched
        </span>
      )}

      {/* Error with retry */}
      {phase === "error" && (
        <>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: colors.error, fontSize: 11 }}>
            <AlertCircle size={11} strokeWidth={2} />
            Failed
          </span>
          <ActionButton
            onClick={() => void handleSwitch()}
            variant="ghost"
            padding="2px 8px"
            fontSize={10}
            fontWeight={500}
            borderRadius={4}
            hoverColor={colors.textSecondary}
            style={{ whiteSpace: "nowrap" }}
          >
            Retry
          </ActionButton>
        </>
      )}
    </div>
  );
});
