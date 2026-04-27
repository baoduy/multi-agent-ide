import path from "node:path";

/**
 * Checks whether a session's working directory belongs to any of the known
 * application paths (registered repos, working directories, worktrees).
 *
 * A session is considered relevant if its `cwd` is equal to or a subdirectory
 * of any known path. This is a pure function — no I/O.
 *
 * @param cwd - The session's working directory (may be null for sessions without cwd)
 * @param knownPaths - Array of normalized absolute paths from registered repos, working dirs, and worktrees
 * @returns true if the session belongs to a known path
 */
export function isSessionPathRelevant(
  cwd: string | null,
  knownPaths: readonly string[],
): boolean {
  if (!cwd) return false;

  const normalizedCwd = path.normalize(cwd);

  for (const knownPath of knownPaths) {
    const normalizedKnown = path.normalize(knownPath);

    // Exact match
    if (normalizedCwd === normalizedKnown) return true;

    // Subdirectory match: cwd starts with knownPath + separator
    if (normalizedCwd.startsWith(normalizedKnown + path.sep)) return true;
  }

  return false;
}

/**
 * Collects all known application paths from repos, working directories,
 * and worktree entries into a single deduplicated array.
 */
export function collectKnownPaths(
  repoPaths: readonly string[],
  workingDirs: readonly string[],
  worktreePaths: readonly string[],
): string[] {
  const pathSet = new Set<string>();

  for (const p of repoPaths) {
    pathSet.add(path.normalize(p));
  }
  for (const p of workingDirs) {
    pathSet.add(path.normalize(p));
  }
  for (const p of worktreePaths) {
    pathSet.add(path.normalize(p));
  }

  return Array.from(pathSet);
}
