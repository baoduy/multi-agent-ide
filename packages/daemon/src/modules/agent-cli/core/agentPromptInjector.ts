import type { AIProvider } from "@magenta/shared/aiTerminal";

/**
 * Pure transform that prepends a Copilot agent directive to a prompt. Claude
 * exposes `--agent` as a flag, so this is a pass-through there.
 *
 * The 'code-review' agent maps to Copilot's `/review` slash command; all
 * other built-ins (and unknown names, for forward-compat) use `/agent <name>`.
 */
export function applyAgentToPrompt(
  prompt: string,
  agent: string | undefined,
  provider: AIProvider,
): string {
  if (!agent || provider !== "copilot") return prompt;
  if (agent === "code-review") return `/review ${prompt}`;
  return `/agent ${agent} ${prompt}`;
}
