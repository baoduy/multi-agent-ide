import React from "react";
import { ClaudeIcon } from "./icons/ClaudeIcon";
import { GithubCopilotIcon } from "./icons/GithubCopilotIcon";
import type { ProviderVariant } from "./providerConfig";
import { colors } from "../../utils/colors";

type ProviderIconProps = {
  provider: ProviderVariant;
  size?: number;
};

/**
 * Renders the appropriate AI provider icon (Claude or GitHub Copilot).
 * Uses local inline SVG components so the app does not depend on @lobehub/icons.
 */
function ProviderIconComponent({ provider, size = 16 }: ProviderIconProps): React.ReactElement {
  return (
    <span
      style={{
        color: colors.textTertiary,
        display: "inline-flex",
        lineHeight: 1,
      }}
    >
      {provider === "claude" ? <ClaudeIcon size={size} /> : <GithubCopilotIcon size={size} />}
    </span>
  );
}

export const ProviderIcon = React.memo(ProviderIconComponent);
