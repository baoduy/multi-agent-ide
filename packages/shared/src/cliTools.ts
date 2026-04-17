import { z } from "zod";

export const CLI_TOOL_IDS = ["claude", "copilot", "specify"] as const;
export type CliToolId = (typeof CLI_TOOL_IDS)[number];

export const CliToolIdSchema = z.enum(CLI_TOOL_IDS);

/**
 * Where to look up the latest published version of a CLI.
 * - `github` reads `/repos/<repo>/releases/latest`
 * - `npm` reads `registry.npmjs.org/<package>/latest`
 */
export type CliVersionSource =
  | { kind: "github"; repo: string }
  | { kind: "npm"; package: string };

export interface CliToolSpec {
  id: CliToolId;
  displayName: string;
  binary: string;
  versionArgs: string[];
  source: CliVersionSource;
  /** Public page to link the user to when they want to learn more. */
  infoUrl: string;
  upgradeCommand: string;
}

export const CLI_TOOLS: Record<CliToolId, CliToolSpec> = {
  claude: {
    id: "claude",
    displayName: "Claude Code",
    binary: "claude",
    versionArgs: ["--version"],
    source: { kind: "npm", package: "@anthropic-ai/claude-code" },
    infoUrl: "https://www.npmjs.com/package/@anthropic-ai/claude-code",
    upgradeCommand: "npm install -g @anthropic-ai/claude-code@latest",
  },
  copilot: {
    id: "copilot",
    displayName: "GitHub Copilot CLI",
    binary: "copilot",
    versionArgs: ["--version"],
    source: { kind: "npm", package: "@github/copilot" },
    infoUrl: "https://www.npmjs.com/package/@github/copilot",
    upgradeCommand: "npm install -g @github/copilot@latest",
  },
  specify: {
    id: "specify",
    displayName: "Specify (spec-kit)",
    binary: "specify",
    versionArgs: ["--version"],
    source: { kind: "github", repo: "github/spec-kit" },
    infoUrl: "https://github.com/github/spec-kit",
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
