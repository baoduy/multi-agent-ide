import { z } from "zod";

/**
 * Default command template for Specify onboarding and upgrades.
 * Placeholder: {agent} = selected AI agent id.
 */
export const DEFAULT_SPECIFY_COMMAND = "uvx --from git+https://github.com/github/spec-kit.git specify init --here --ai {agent} --force";

/** Default interval (minutes) for periodic spec sync of all active repos. */
export const DEFAULT_SPEC_SYNC_INTERVAL_MINUTES = 15;
/** Default interval (minutes) for periodic CLI session history sync. */
export const DEFAULT_SESSION_SYNC_INTERVAL_MINUTES = 15;
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
});

export type MagentaConfig = z.infer<typeof MagentaConfigSchema>;
