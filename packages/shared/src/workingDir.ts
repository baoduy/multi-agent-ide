import { z } from "zod";

/**
 * Per-working-directory metadata that the daemon merges into AI spawn options
 * when launching a Claude/Copilot run rooted in that working dir. Both extra
 * fields are optional — when absent, nothing is appended to argv. Adding new
 * optional fields here is additive and does NOT require a CACHE_SCHEMA_VERSION
 * bump (the cache doesn't store these — they live in `~/.magenta/config.json`).
 */
export const WorkingDirEntrySchema = z
  .object({
    path: z.string().min(1),
    /**
     * Directory holding `claude.md` / `copilot.md` (or arbitrary filenames the
     * resolver knows about). Used as a fallback `--system-prompt-file` /
     * `--append-system-prompt-file` source when a per-task or per-spawn file
     * is not provided. Spec FR-9.4.
     */
    promptTemplatesPath: z.string().optional(),
    /**
     * Default MCP config for runs rooted at this working dir. Either a path
     * to an existing JSON file or an inline JSON string (the resolver detects
     * which by attempting `JSON.parse`). Spec §5 migration 14 / FR-9.2.
     */
    mcpConfigJson: z.string().optional(),
  })
  .strict();

export type WorkingDirEntry = z.infer<typeof WorkingDirEntrySchema>;

/**
 * Persisted form of the `workingDirs` config field. Accepts the historical
 * `string[]` shape (Magenta 0.x) plus the new entry-object shape (FR-9.4).
 * Mixed arrays are tolerated to make the in-place upgrade reversible.
 */
export const WorkingDirsFieldSchema = z.array(
  z.union([z.string().min(1), WorkingDirEntrySchema]),
);

export type WorkingDirsField = z.infer<typeof WorkingDirsFieldSchema>;

/**
 * Lift any legacy string entries into `{ path }` objects, deduping by path.
 * On collision (same path appears twice), later metadata wins.
 *
 * Pure: no fs, no logging. Called by ConfigManager on load and by the IPC
 * handler when persisting partial updates.
 */
export function normalizeWorkingDirs(
  raw: WorkingDirsField,
): WorkingDirEntry[] {
  const map = new Map<string, WorkingDirEntry>();
  for (const item of raw) {
    const entry: WorkingDirEntry =
      typeof item === "string" ? { path: item } : item;
    const existing = map.get(entry.path);
    if (!existing) {
      map.set(entry.path, entry);
      continue;
    }
    map.set(entry.path, {
      path: entry.path,
      promptTemplatesPath:
        entry.promptTemplatesPath ?? existing.promptTemplatesPath,
      mcpConfigJson: entry.mcpConfigJson ?? existing.mcpConfigJson,
    });
  }
  return [...map.values()].map((e) => {
    const out: WorkingDirEntry = { path: e.path };
    if (e.promptTemplatesPath !== undefined)
      out.promptTemplatesPath = e.promptTemplatesPath;
    if (e.mcpConfigJson !== undefined) out.mcpConfigJson = e.mcpConfigJson;
    return out;
  });
}
