import simpleGit, { type SimpleGit } from "simple-git";

/**
 * Creates a configured simple-git instance for the given working directory.
 *
 * Centralises configuration that every git call in the daemon needs:
 *  - Custom binary path via MAGENTA_GIT_PATH (required in packaged Electron
 *    apps where the forked ELECTRON_RUN_AS_NODE process can't search PATH).
 *  - Per-command timeout of 10 seconds (matches the previous execFileSync limit).
 *  - maxConcurrentProcesses = 1 per instance to avoid git lock contention
 *    within a single repository.
 */
export function createGit(cwd: string): SimpleGit {
  const binary = process.env["MAGENTA_GIT_PATH"] || "git";

  return simpleGit({
    baseDir: cwd,
    binary,
    maxConcurrentProcesses: 1,
    timeout: {
      block: 10_000, // kill if no output for 10s
    },
    trimmed: true,
  });
}
