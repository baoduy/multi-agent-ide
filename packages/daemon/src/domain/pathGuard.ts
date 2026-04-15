import os from "node:os";
import path from "node:path";

import { AppError } from "../errors/AppError";

/**
 * PathGuard — containment check for filesystem/terminal/process-spawn paths.
 *
 * The IPC boundary accepts arbitrary path strings from the renderer. Without
 * containment any renderer-side code (or XSS in rendered content) can read
 * `~/.ssh/id_rsa`, write to `~/.ssh/authorized_keys`, spawn a shell inside
 * `/etc`, etc. This module enforces that every path an IPC caller hands the
 * daemon resolves inside one of the user's declared working directories or
 * a small set of known-safe system roots.
 *
 * Callers should typically use {@link resolveAndAssert} which handles the
 * resolve+check in one shot and returns the canonical absolute path.
 */

/**
 * Source of the current allowlist. Kept as an interface so application
 * services / gateways can accept it in their constructor without pulling
 * in a hard dependency on `ConfigManager`.
 */
export interface PathAllowlistProvider {
  /** Returns the list of absolute root directories callers may touch. */
  getAllowedRoots(): readonly string[];
}

/**
 * System roots that are always permitted regardless of user config:
 *   - `~/.magenta`        — daemon's own config/database location
 *   - `~/.specify`        — speckit state files
 *   - `os.tmpdir()`       — scratch space (short-lived temp files)
 *
 * Everything else must come from the user's `workingDirs` setting.
 */
export function systemSafeRoots(): string[] {
  return [
    path.join(os.homedir(), ".magenta"),
    path.join(os.homedir(), ".specify"),
    os.tmpdir(),
  ];
}

function normalizeRoot(root: string): string {
  return path.resolve(root);
}

/**
 * Throws `VALIDATION_ERROR` if `resolved` is not equal to, or nested inside,
 * one of the allowed roots.
 *
 * Uses `startsWith(root + sep)` rather than plain `startsWith(root)` so that
 * `/work/repo-private` does not match an allowlist entry of `/work/repo`.
 */
export function assertPathAllowed(resolved: string, allowedRoots: readonly string[]): void {
  const normalized = path.resolve(resolved);
  for (const raw of allowedRoots) {
    const root = normalizeRoot(raw);
    if (normalized === root || normalized.startsWith(root + path.sep)) {
      return;
    }
  }
  throw new AppError(
    "VALIDATION_ERROR",
    `Path is outside allowed directories: ${normalized}`,
  );
}

/**
 * Resolve the input path and assert containment in one step.
 * Returns the canonical absolute path (identical to `path.resolve(input)`).
 */
export function resolveAndAssert(inputPath: string, allowedRoots: readonly string[]): string {
  const resolved = path.resolve(inputPath);
  assertPathAllowed(resolved, allowedRoots);
  return resolved;
}

/**
 * Convenience: build the combined allowlist (user working dirs + system safe
 * roots) from a {@link PathAllowlistProvider}.
 */
export function buildAllowlist(provider: PathAllowlistProvider): string[] {
  return [...provider.getAllowedRoots(), ...systemSafeRoots()];
}
