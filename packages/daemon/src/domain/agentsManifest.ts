import { z } from "zod";
import { AppError } from "../errors/AppError";

/**
 * Schema for a single agent entry in `<repo>/spec/agents.json`. Strict so an
 * unexpected key surfaces as a validation error rather than silently passing
 * through to the CLI.
 */
const AgentEntry = z
  .object({ description: z.string(), prompt: z.string() })
  .strict();

export const AgentsManifestSchema = z.record(z.string(), AgentEntry);
export type AgentsManifest = z.infer<typeof AgentsManifestSchema>;

/**
 * Parses raw JSON content of `spec/agents.json`. Throws AppError on any
 * failure so callers can surface a single error code to the IPC layer.
 */
export function parseAgentsManifest(raw: string): AgentsManifest {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new AppError(
      "AGENTS_MANIFEST_INVALID",
      `agents.json is not valid JSON: ${(e as Error).message}`,
    );
  }
  const result = AgentsManifestSchema.safeParse(json);
  if (!result.success) {
    throw new AppError(
      "AGENTS_MANIFEST_INVALID",
      `agents.json schema error: ${result.error.message}`,
    );
  }
  return result.data;
}
