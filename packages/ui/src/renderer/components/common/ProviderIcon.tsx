import React from "react";
import { Claude } from "@lobehub/icons";
import { GithubCopilot } from "@lobehub/icons";
import type { ProviderVariant } from "./providerConfig";

type ProviderIconProps = {
  provider: ProviderVariant;
  size?: number;
};

/**
 * Renders the appropriate AI provider icon (Claude or GitHub Copilot).
 * Uses @lobehub/icons for brand-accurate SVG icons.
 */
function ProviderIconComponent({ provider, size = 16 }: ProviderIconProps): React.ReactElement {
  if (provider === "claude") {
    return <Claude.Color size={size} />;
  }
  return <GithubCopilot size={size} />;
}

export const ProviderIcon = React.memo(ProviderIconComponent);
