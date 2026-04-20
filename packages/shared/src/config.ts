import { z } from "zod";

import { CliToolOverridesSchema } from "./cliTools";

/**
 * A Specify CLI extension to auto-install after `specify init` (onboard) or
 * the Specify template upgrade. Identified by its CLI `name` and the GitHub
 * `repo` (`<owner>/<repo>`) whose **latest release** provides the zip.
 */
export const SpecifyExtensionSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .regex(
        /^[A-Za-z0-9_.\-]+$/,
        "extension name may only contain letters, digits, '_', '.', '-'",
      ),
    repo: z
      .string()
      .min(1)
      .regex(
        /^[A-Za-z0-9_.\-]+\/[A-Za-z0-9_.\-]+$/,
        "repo must be in <owner>/<name> form",
      ),
  })
  .strict();

export type SpecifyExtension = z.infer<typeof SpecifyExtensionSchema>;

/**
 * Default seeded extensions. The worktree-parallel extension unlocks running
 * multiple Specify specs concurrently in isolated worktrees — a core Magenta
 * IDE workflow — so it ships on by default.
 */
export const DEFAULT_SPECIFY_EXTENSIONS: SpecifyExtension[] = [
  { name: "worktrees", repo: "dango85/spec-kit-worktree-parallel" },
];

/**
 * Default command template for Specify onboarding and upgrades.
 * Placeholder: {agent} = selected AI agent id.
 */
export const DEFAULT_SPECIFY_COMMAND = "uvx --from git+https://github.com/github/spec-kit.git specify init --here --ai {agent} --force";

/** Default interval (minutes) for periodic spec sync of all active repos. */
export const DEFAULT_SPEC_SYNC_INTERVAL_MINUTES = 15;
/** Default interval (minutes) for periodic CLI session history sync. */
export const DEFAULT_SESSION_SYNC_INTERVAL_MINUTES = 15;
/** Default interval (minutes) for periodic worktree sync. */
export const DEFAULT_WORKTREE_SYNC_INTERVAL_MINUTES = 1;
/** Minimum allowed sync interval. Guards against pathological tight loops. */
export const MIN_SYNC_INTERVAL_MINUTES = 1;
/** Maximum allowed sync interval (24h). Keeps values sane. */
export const MAX_SYNC_INTERVAL_MINUTES = 24 * 60;

export const MagentaConfigSchema = z.object({
  workingDirs: z.array(z.string()).default([]),
  /** Command template for running specify init (both onboard and upgrade). */
  specifyCommand: z.string().default(DEFAULT_SPECIFY_COMMAND),
  /** Interval (minutes) for periodic spec sync across all active repos. */
  specSyncIntervalMinutes: z
    .number()
    .int()
    .min(MIN_SYNC_INTERVAL_MINUTES)
    .max(MAX_SYNC_INTERVAL_MINUTES)
    .default(DEFAULT_SPEC_SYNC_INTERVAL_MINUTES),
  /** Interval (minutes) for periodic CLI session history sync. */
  sessionSyncIntervalMinutes: z
    .number()
    .int()
    .min(MIN_SYNC_INTERVAL_MINUTES)
    .max(MAX_SYNC_INTERVAL_MINUTES)
    .default(DEFAULT_SESSION_SYNC_INTERVAL_MINUTES),
  /**
   * Approver name used when the repo's git `user.name` / `user.email` are
   * both empty. Populated the first time the user approves a Markdown file
   * in a repo with no git identity.
   */
  fallbackApproverName: z.string().default(""),
  /**
   * Per-tool overrides for CLI install/upgrade commands, version-check args,
   * and binary names. Empty by default — missing fields fall back to the
   * hardcoded defaults in `CLI_TOOLS`. Keyed by `CliToolId` ("claude",
   * "copilot", "specify").
   */
  cliTools: CliToolOverridesSchema,
  /**
   * Specify CLI extensions to auto-install after a successful `specify init`
   * (onboard) or Specify template upgrade. For each entry, the daemon
   * resolves the repo's latest GitHub release tag and runs
   * `<specify runner> extension add <name> --from <zip-url>` in the repo.
   */
  specifyExtensions: z
    .array(SpecifyExtensionSchema)
    .default(DEFAULT_SPECIFY_EXTENSIONS),
});

export type MagentaConfig = z.infer<typeof MagentaConfigSchema>;
