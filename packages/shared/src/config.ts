import { z } from "zod";

export const MagentaConfigSchema = z.object({
  workingDirs: z.array(z.string()).default([]),
});

export type MagentaConfig = z.infer<typeof MagentaConfigSchema>;
