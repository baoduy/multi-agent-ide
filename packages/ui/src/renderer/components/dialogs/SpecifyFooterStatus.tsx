import React from "react";

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
 * Compact read-only footer indicator showing the current Specify integration.
 * Purely informational — the actual switch happens in handleConfirm on Create.
 *
 * Rendered on the LEFT side of the dialog action bar.
 */
export const SpecifyFooterStatus = React.memo(function SpecifyFooterStatus({
  currentAgent,
  selectedProvider,
  hasSpecs,
}: SpecifyFooterStatusProps): React.ReactElement | null {
  if (!hasSpecs) return null;

  const isKnownProvider =
    currentAgent === "claude" || currentAgent === "copilot";
  const agentLabel = isKnownProvider
    ? getProviderName(currentAgent as ProviderVariant)
    : (currentAgent ?? "Unknown");

  const isMismatch =
    currentAgent != null && currentAgent !== selectedProvider;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        color: colors.textSecondary,
        minWidth: 0,
      }}
    >
      {isKnownProvider && (
        <ProviderIcon provider={currentAgent as ProviderVariant} size={13} />
      )}
      <ScrollableText>
        Specify:{" "}
        <strong
          style={{
            color: isMismatch ? colors.warningTextStrong : colors.text,
            fontWeight: 600,
          }}
        >
          {agentLabel}
        </strong>
      </ScrollableText>
    </div>
  );
});
