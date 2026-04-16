import React from "react";
import { AlertTriangle } from "lucide-react";

import { colors } from "../../utils/colors";
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
};

/**
 * Compact footer indicator showing the current Specify integration status.
 * When the selected provider doesn't match, displays a mismatch hint —
 * the actual switch happens automatically on session creation.
 *
 * Rendered on the LEFT side of the dialog action bar.
 */
export const SpecifyFooterStatus = React.memo(function SpecifyFooterStatus({
  currentAgent,
  selectedProvider,
  hasSpecs,
}: SpecifyFooterStatusProps): React.ReactElement | null {
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

      {/* Mismatch hint — auto-switched on Create */}
      {isMismatch && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10,
            color: colors.warningTextStrong,
            whiteSpace: "nowrap",
          }}
          title={`Will auto-switch to ${getProviderName(selectedProvider)} on create`}
        >
          <AlertTriangle size={11} strokeWidth={2} />
          Auto-switch on create
        </span>
      )}
    </div>
  );
});
