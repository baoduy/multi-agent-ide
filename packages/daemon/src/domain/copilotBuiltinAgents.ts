import type { Agent } from "@magenta/shared/ipc";

/**
 * Static list of Copilot CLI built-in agents. Source-of-truth lives here so
 * application code can return it without shelling out — Copilot has no
 * "list agents" CLI command.
 */
export const COPILOT_BUILTIN_AGENTS: readonly Agent[] = [
  { name: "code-review", source: "builtin", description: "Reviews a diff (mapped to /review)." },
  { name: "explore", source: "builtin", description: "Maps the repo's structure." },
  { name: "general-purpose", source: "builtin", description: "Default Copilot assistant." },
  { name: "research", source: "builtin", description: "Researches a topic before coding." },
  { name: "task", source: "builtin", description: "Executes a focused implementation task." },
];
