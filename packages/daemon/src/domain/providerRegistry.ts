import { execSync } from "node:child_process";
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
        // Full autopilot: --mode autopilot --yolo (requires Copilot CLI v1.0.23+).
        // On older versions, fall back to --yolo alone which grants all permissions
        // but doesn't activate autopilot (user can still Shift+Tab into it).
        if (isCopilotVersionAtLeast("1.0.23")) {
          return ["--mode", "autopilot", "--yolo"];
        }
        return ["--yolo"];
      case "bypassPermissions":
        return ["--yolo"];
      default:
        return [];
    }
  }

  return [];
}

/**
 * Cached Copilot CLI version string — detected once per process lifetime.
 * `null` means not yet checked; empty string means detection failed.
 */
let cachedCopilotVersion: string | null = null;

function getCopilotVersion(): string {
  if (cachedCopilotVersion !== null) return cachedCopilotVersion;
  try {
    const raw = execSync("copilot --version", { encoding: "utf-8", timeout: 5000 }).trim();
    // Output is typically "1.0.24" or "copilot version 1.0.24"
    const match = raw.match(/(\d+\.\d+\.\d+)/);
    cachedCopilotVersion = match ? match[1] : "";
  } catch {
    cachedCopilotVersion = "";
  }
  return cachedCopilotVersion;
}

/**
 * Returns true if the installed Copilot CLI version is >= the given version.
 * Returns false if version can't be detected.
 */
function isCopilotVersionAtLeast(minVersion: string): boolean {
  const version = getCopilotVersion();
  if (!version) return false;

  const [majA, minA, patA] = version.split(".").map(Number);
  const [majB, minB, patB] = minVersion.split(".").map(Number);

  if (majA !== majB) return majA > majB;
  if (minA !== minB) return minA > minB;
  return patA >= patB;
}

export function getProviderMeta(provider: AIProvider): ProviderMeta {
  return PROVIDER_META[provider];
}

export function getAllProviderMeta(): Record<AIProvider, ProviderMeta> {
  return PROVIDER_META;
}
