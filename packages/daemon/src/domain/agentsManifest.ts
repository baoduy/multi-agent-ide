import { AppError } from "../errors/AppError";

export type AgentsManifestEntry = { description: string; prompt: string };
export type AgentsManifest = Record<string, AgentsManifestEntry>;

/**
 * Parses raw JSON content of `<repo>/spec/agents.json`. Strict — any unknown
 * key on an entry, missing required field, or non-string value rejects with
 * `AGENTS_MANIFEST_INVALID`. Pure (no I/O), so callers (gateways, app
 * services) can wrap a single try/catch around their file-read.
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
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new AppError(
      "AGENTS_MANIFEST_INVALID",
      "agents.json must be a JSON object mapping agent name -> entry",
    );
  }
  const out: AgentsManifest = {};
  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new AppError(
        "AGENTS_MANIFEST_INVALID",
        `agents.json entry '${key}' must be an object`,
      );
    }
    const v = value as Record<string, unknown>;
    if (typeof v.description !== "string") {
      throw new AppError(
        "AGENTS_MANIFEST_INVALID",
        `agents.json entry '${key}' is missing 'description'`,
      );
    }
    if (typeof v.prompt !== "string") {
      throw new AppError(
        "AGENTS_MANIFEST_INVALID",
        `agents.json entry '${key}' is missing 'prompt'`,
      );
    }
    const allowed = new Set(["description", "prompt"]);
    for (const k of Object.keys(v)) {
      if (!allowed.has(k)) {
        throw new AppError(
          "AGENTS_MANIFEST_INVALID",
          `agents.json entry '${key}' has unknown key '${k}'`,
        );
      }
    }
    out[key] = { description: v.description, prompt: v.prompt };
  }
  return out;
}
