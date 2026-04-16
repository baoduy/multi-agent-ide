import React from "react";
import { ClaudeIcon } from "./icons/ClaudeIcon";
import { GithubCopilotIcon } from "./icons/GithubCopilotIcon";
import type { ProviderVariant } from "./providerConfig";

type ProviderIconProps = {
  provider: ProviderVariant;
  size?: number;
};

/**
 * Renders the appropriate AI provider icon (Claude or GitHub Copilot).
 * Uses local inline SVG components so the app does not depend on @lobehub/icons.
 */
function ProviderIconComponent({ provider, size = 16 }: ProviderIconProps): React.ReactElement {
  if (provider === "claude") {
    return <ClaudeIcon size={size} />;
  }
  return <GithubCopilotIcon size={size} />;
}

export const ProviderIcon = React.memo(ProviderIconComponent);
