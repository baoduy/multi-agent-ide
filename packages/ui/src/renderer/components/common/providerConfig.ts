/**
 * Centralized configuration for AI provider display.
 * Single source of truth for provider colors, display names, and related constants.
 */

import { colors } from "../../utils/colors";

export type ProviderVariant = "claude" | "copilot";

type ProviderConfig = {
  /** Human-readable display name */
  displayName: string;
  /** Brand color (hex) */
  color: string;
};

const PROVIDER_CONFIG: Record<ProviderVariant, ProviderConfig> = {
  claude: {
    displayName: "Claude Code",
    color: colors.info,
  },
  copilot: {
    displayName: "GitHub Copilot",
    color: colors.success,
  },
} as const;

/** Color used for idle / unassigned agent state. */
export const IDLE_COLOR = colors.statusIdle;

/**
 * Returns the display name for a provider.
 */
export function getProviderName(provider: ProviderVariant): string {
  return PROVIDER_CONFIG[provider].displayName;
}

/**
 * Returns the brand color for a provider.
 */
export function getProviderColor(provider: ProviderVariant): string {
  return PROVIDER_CONFIG[provider].color;
}
