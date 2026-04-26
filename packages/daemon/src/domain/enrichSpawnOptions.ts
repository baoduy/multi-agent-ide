import path from "node:path";
import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";
import type { AIProvider } from "@magenta/shared/aiTerminal";
import { parseAgentsManifest } from "./agentsManifest";

export interface EnrichmentDeps {
  /** Returns the user-configured `--plugin-dir` list (Claude only). */
  listPluginDirs(): string[];
  /**
   * Reads a file from disk. Used to auto-load `<repo>/spec/agents.json` when
   * the caller hasn't supplied `agents` directly. Should throw with
   * `code === "ENOENT"` (or NodeJS.ErrnoException-shaped) when the file is
   * absent so this helper can swallow that case.
   */
  readFileIfExists(absPath: string): string | null;
}

/**
 * Phase 6 — enrich a caller's `AISpawnOptions` with settings-resolved values
 * before argv translation.
 *
 *   1. `pluginDirs` — when caller didn't set them, populate from the user's
 *      saved Settings list. (Claude-only flag; argv translator drops them
 *      for Copilot.)
 *   2. `agents`     — for Claude, when caller didn't set them and the repo
 *      has a `spec/agents.json`, parse + auto-load.
 *
 * Pure-ish: `readFileIfExists` and `listPluginDirs` are injected so the
 * helper is callable from tests and from any application service. Errors in
 * `agents.json` parsing surface as AppError("AGENTS_MANIFEST_INVALID"),
 * which the createHandler wrapper will normalize for the IPC boundary.
 */
export function enrichSpawnOptions(
  provider: AIProvider,
  repoPath: string,
  spawn: AISpawnOptions,
  deps: EnrichmentDeps,
): AISpawnOptions {
  const out: AISpawnOptions = { ...spawn };

  if (out.pluginDirs === undefined) {
    const fromSettings = deps.listPluginDirs();
    if (fromSettings.length > 0) out.pluginDirs = [...fromSettings];
  }

  if (provider === "claude" && out.agents === undefined) {
    const manifestPath = path.join(repoPath, "spec", "agents.json");
    const raw = deps.readFileIfExists(manifestPath);
    if (raw !== null) {
      out.agents = parseAgentsManifest(raw);
    }
  }

  return out;
}
