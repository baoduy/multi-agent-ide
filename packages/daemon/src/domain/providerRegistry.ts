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
    // --allow-all (alias --yolo) was introduced in Copilot CLI v0.0.381.
    // --autopilot was introduced in v1.0.23.
    // For older versions that support neither, fall back to the granular
    // flags (--allow-all-tools + --allow-all-paths + --allow-all-urls)
    // which were available since ~v0.0.340. If even those aren't available
    // we return nothing and let the user grant permissions interactively.
    const hasAllowAll = isCopilotVersionAtLeast("0.0.381");
    const hasAutopilot = isCopilotVersionAtLeast("1.0.23");

    const allowAllArgs = hasAllowAll
      ? ["--allow-all"]
      : ["--allow-all-tools", "--allow-all-paths", "--allow-all-urls"];

    switch (mode) {
      case "auto":
        if (hasAutopilot) {
          return ["--autopilot", ...allowAllArgs];
        }
        // No --autopilot flag — grant permissions only, user can Shift+Tab into autopilot
        return [...allowAllArgs];
      case "bypassPermissions":
        return [...allowAllArgs];
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
