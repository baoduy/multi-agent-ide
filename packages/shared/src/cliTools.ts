import { z } from "zod";

export const CLI_TOOL_IDS = ["claude", "copilot", "specify"] as const;
export type CliToolId = (typeof CLI_TOOL_IDS)[number];

export const CliToolIdSchema = z.enum(CLI_TOOL_IDS);

export interface CliToolSpec {
  id: CliToolId;
  displayName: string;
  binary: string;
  versionArgs: string[];
  githubRepo: string;
  releaseUrl: string;
  upgradeCommand: string;
}

export const CLI_TOOLS: Record<CliToolId, CliToolSpec> = {
  claude: {
    id: "claude",
    displayName: "Claude Code",
    binary: "claude",
    versionArgs: ["--version"],
    githubRepo: "anthropics/claude-code",
    releaseUrl: "https://github.com/anthropics/claude-code/releases",
    upgradeCommand: "npm install -g @anthropic-ai/claude-code@latest",
  },
  copilot: {
    id: "copilot",
    displayName: "GitHub Copilot CLI",
    binary: "copilot",
    versionArgs: ["--version"],
    githubRepo: "github/copilot-cli",
    releaseUrl: "https://github.com/github/copilot-cli/releases",
    upgradeCommand: "npm install -g @github/copilot@latest",
  },
  specify: {
    id: "specify",
    displayName: "Specify (spec-kit)",
    binary: "specify",
    versionArgs: ["--version"],
    githubRepo: "github/spec-kit",
    releaseUrl: "https://github.com/github/spec-kit/releases",
    upgradeCommand: "uv tool upgrade specify-cli",
  },
};

export const CliToolStatusSchema = z.object({
  tool: CliToolIdSchema,
  installed: z.boolean(),
  currentVersion: z.string().nullable(),
  latestVersion: z.string().nullable(),
  updateAvailable: z.boolean(),
  releaseUrl: z.string().nullable(),
  checkedAt: z.number().nullable(),
  checkError: z.string().nullable(),
});

export type CliToolStatus = z.infer<typeof CliToolStatusSchema>;

export const CliVersionsSnapshotSchema = z.object({
  checkedAt: z.number(),
  tools: z.array(CliToolStatusSchema),
});

export type CliVersionsSnapshot = z.infer<typeof CliVersionsSnapshotSchema>;

export const CLI_VERSION_CHECK_CACHE_MS = 24 * 60 * 60 * 1000;
