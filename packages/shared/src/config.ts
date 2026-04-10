import { z } from "zod";

/**
 * Default command template for Specify onboarding and upgrades.
 * Placeholder: {agent} = selected AI agent id.
 */
export const DEFAULT_SPECIFY_COMMAND = "uvx --from git+https://github.com/github/spec-kit.git specify init --here --ai {agent} --force";

export const MagentaConfigSchema = z.object({
  workingDirs: z.array(z.string()).default([]),
  /** Command template for running specify init (both onboard and upgrade). */
  specifyCommand: z.string().default(DEFAULT_SPECIFY_COMMAND),
});

export type MagentaConfig = z.infer<typeof MagentaConfigSchema>;
