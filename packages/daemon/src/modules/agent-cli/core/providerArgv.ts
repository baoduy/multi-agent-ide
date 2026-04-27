import type { AIProvider } from "@magenta/shared/aiTerminal";
import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";
import type { ProviderCapability } from "@magenta/shared/providerCapabilities";
import { toArgvClaude, type ToArgvResult } from "../claude/argv";
import { toArgvCopilot } from "../copilot/argv";

export type ToArgv = (
  opts: AISpawnOptions,
  caps: ProviderCapability,
) => ToArgvResult;

const REGISTRY: Record<AIProvider, ToArgv> = {
  claude: toArgvClaude,
  copilot: toArgvCopilot,
};

export function getToArgv(provider: AIProvider): ToArgv {
  return REGISTRY[provider];
}

export { toArgvClaude, toArgvCopilot, type ToArgvResult };
