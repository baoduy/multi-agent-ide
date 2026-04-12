/**
 * Centralized configuration for AI provider display.
 * Single source of truth for provider colors, display names, and related constants.
 */

export type ProviderVariant = "claude" | "copilot";

export type ProviderConfig = {
  /** Human-readable display name */
  displayName: string;
  /** Brand color (hex) */
  color: string;
};

export const PROVIDER_CONFIG: Record<ProviderVariant, ProviderConfig> = {
  claude: {
    displayName: "Claude Code",
    color: "#C15F3C",
  },
  copilot: {
    displayName: "GitHub Copilot",
    color: "#3d7a2a",
  },
} as const;

/** Color used for idle / unassigned agent state. */
export const IDLE_COLOR = "#d1cec6";

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
