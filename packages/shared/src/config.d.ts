import { z } from "zod";
export declare const MagentaConfigSchema: z.ZodObject<{
    workingDirs: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type MagentaConfig = z.infer<typeof MagentaConfigSchema>;
