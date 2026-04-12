import type { AIProvider, ProviderMeta } from "@magenta/shared/aiTerminal";

export const PROVIDER_META: Record<AIProvider, ProviderMeta> = {
  claude: {
    name: "Claude Code",
    icon: "claude",
    binaryName: "claude",
    defaultArgs: [],
    slashCommands: [],
    cliFlags: [],
  },
  copilot: {
    name: "GitHub Copilot",
    icon: "copilot",
    binaryName: "copilot",
    defaultArgs: [],
    slashCommands: [],
    cliFlags: [],
  },
};

export function getProviderMeta(provider: AIProvider): ProviderMeta {
  return PROVIDER_META[provider];
}

export function getAllProviderMeta(): Record<AIProvider, ProviderMeta> {
  return PROVIDER_META;
}
