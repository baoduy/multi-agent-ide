import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";
import type { WorkingDirEntry } from "@magenta/shared/workingDir";

export interface ResolvedMcpConfig {
  /**
   * The effective config the daemon should pass to the CLI. May be a string
   * (existing file path the CLI reads directly) or a plain object (which the
   * caller will materialize to a temp file via TempFileGateway). Absent when
   * neither spawn nor working-dir specify anything.
   */
  effective?: string | Record<string, unknown>;
  /** Whether to add `--strict-mcp-config` (Claude only). */
  strict?: boolean;
  /** Provenance — useful for debug logs and tests. */
  source?: "spawn" | "working-dir";
}

/**
 * Pure precedence rule for MCP config (FR-9.2):
 *
 *   1. If `spawn.mcpConfig` is present (string or object), it WINS.
 *   2. Otherwise, fall back to the working-dir entry's `mcpConfigJson`.
 *      If it parses as JSON it is treated as inline config; otherwise as a
 *      path the CLI can read directly.
 *   3. If neither, return `{}` (caller emits no MCP flag).
 *
 * `strict` is taken from `spawn.strictMcpConfig` only — working-dir defaults
 * are non-strict by design.
 */
export function resolveMcpConfig(
  spawn: Pick<AISpawnOptions, "mcpConfig" | "strictMcpConfig">,
  workingDir: WorkingDirEntry,
): ResolvedMcpConfig {
  const strict = spawn.strictMcpConfig ?? false;

  if (spawn.mcpConfig !== undefined) {
    return {
      effective: spawn.mcpConfig,
      strict,
      source: "spawn",
    };
  }

  if (workingDir.mcpConfigJson !== undefined) {
    const raw = workingDir.mcpConfigJson;
    let parsed: Record<string, unknown> | undefined;
    try {
      const candidate = JSON.parse(raw);
      if (
        candidate &&
        typeof candidate === "object" &&
        !Array.isArray(candidate)
      ) {
        parsed = candidate as Record<string, unknown>;
      }
    } catch {
      /* not JSON — treat as path */
    }
    return {
      effective: parsed ?? raw,
      strict,
      source: "working-dir",
    };
  }

  return strict ? { strict } : {};
}
