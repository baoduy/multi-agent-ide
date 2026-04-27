import { z } from "zod";
import { AISpawnOptionsSchema } from "./aiSpawnOptions";

/**
 * Per-provider partial spawn options; explicitly authored — no automatic
 * translation here. The daemon's preset translator (Phase 4 task 3) is the
 * place that does cross-syntax rendering when an author wants a single source.
 */
const PerProviderSpawn = AISpawnOptionsSchema.partial();

export const AIPresetSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    builtin: z.boolean(),
    claude: PerProviderSpawn,
    copilot: PerProviderSpawn,
  })
  .strict();

export type AIPreset = z.infer<typeof AIPresetSchema>;

export const BUILTIN_PRESETS: readonly AIPreset[] = [
  {
    id: "read-only-review",
    name: "Read-only review",
    description: "Inspect code; refuse all writes and shell commands.",
    builtin: true,
    claude: {
      allowedTools: ["Read", "Grep", "Glob"],
      disallowedTools: ["Edit", "Write", "Bash", "WebFetch"],
      permissionMode: "plan",
    },
    copilot: {
      allowedTools: ["read", "view"],
      disallowedTools: ["write", "shell"],
      permissionMode: "plan",
    },
  },
  {
    id: "commit-and-push",
    name: "Commit & push",
    description: "Edits + git add/commit/push only. No arbitrary shell.",
    builtin: true,
    claude: {
      allowedTools: [
        "Read",
        "Edit",
        "Bash(git add *)",
        "Bash(git commit *)",
        "Bash(git push *)",
        "Bash(git status)",
        "Bash(git diff *)",
      ],
      disallowedTools: ["WebFetch"],
    },
    copilot: {
      allowedTools: ["read", "write", "shell(git:*)"],
      disallowedTools: ["fetch"],
    },
  },
  {
    id: "test-and-fix",
    name: "Test & fix",
    description: "Run tests and edit code; no network, no git push.",
    builtin: true,
    claude: {
      allowedTools: [
        "Read",
        "Edit",
        "Bash(npm test *)",
        "Bash(pnpm test *)",
        "Bash(pnpm vitest *)",
      ],
      disallowedTools: ["Bash(git push *)", "WebFetch"],
    },
    copilot: {
      allowedTools: [
        "read",
        "write",
        "shell(npm:*)",
        "shell(pnpm:*)",
        "shell(npx:*)",
      ],
      disallowedTools: ["shell(git:push:*)", "fetch"],
    },
  },
  {
    id: "docs-only",
    name: "Docs only",
    description: "Read everything; only write Markdown files.",
    builtin: true,
    claude: {
      allowedTools: ["Read", "Grep", "Glob", "Edit"],
      disallowedTools: ["Bash", "WebFetch"],
    },
    copilot: {
      allowedTools: ["read", "view", "write"],
      disallowedTools: ["shell", "fetch"],
    },
  },
] as const;

export const BUILTIN_PRESET_IDS: readonly string[] = BUILTIN_PRESETS.map(
  (p) => p.id,
);
