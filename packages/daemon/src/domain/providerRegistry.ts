import type { AIProvider, AIPermissionMode, ProviderMeta } from "@magenta/shared/aiTerminal";
import { PROVIDER_PERMISSION_MODES } from "@magenta/shared/aiTerminal";

export const PROVIDER_META: Record<AIProvider, ProviderMeta> = {
  claude: {
    name: "Claude Code",
    icon: "claude",
    binaryName: "claude",
    defaultArgs: [],
    supportedPermissionModes: [...PROVIDER_PERMISSION_MODES.claude],
    slashCommands: [],
    cliFlags: [],
  },
  copilot: {
    name: "GitHub Copilot",
    icon: "copilot",
    binaryName: "copilot",
    defaultArgs: [],
    supportedPermissionModes: [...PROVIDER_PERMISSION_MODES.copilot],
    slashCommands: [],
    cliFlags: [],
  },
};

/**
 * Maps a permission mode to the CLI arguments required to activate it
 * for a given provider. Returns an empty array for "default" mode (no
 * extra flags needed).
 */
export function getPermissionModeArgs(
  provider: AIProvider,
  mode: AIPermissionMode,
): string[] {
  if (mode === "default") return [];

  if (provider === "claude") {
    switch (mode) {
      case "acceptEdits":
        return ["--permission-mode", "acceptEdits"];
      case "plan":
        return ["--permission-mode", "plan"];
      case "auto":
        // --enable-auto-mode adds auto to the Shift+Tab cycle and activates it
        return ["--permission-mode", "auto", "--enable-auto-mode"];
      case "dontAsk":
        return ["--permission-mode", "dontAsk"];
      case "bypassPermissions":
        return ["--dangerously-skip-permissions"];
      default:
        return [];
    }
  }

  if (provider === "copilot") {
    switch (mode) {
      case "auto":
        return ["--autopilot", "--allow-all"];
      case "bypassPermissions":
        return ["--allow-all"];
      default:
        return [];
    }
  }

  return [];
}

export function getProviderMeta(provider: AIProvider): ProviderMeta {
  return PROVIDER_META[provider];
}

export function getAllProviderMeta(): Record<AIProvider, ProviderMeta> {
  return PROVIDER_META;
}
