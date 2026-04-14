import { safeExecSync, parseGitLines, gitExecSync } from "./utils/safeExecSync";

/**
 * SpecGitGateway wraps git commands for spec access.
 * Provides methods to read specs from non-current branches without checking them out.
 */
export class SpecGitGateway {
  /**
   * Returns the git user name and email from the repo's git config.
   * Falls back to global config, then to empty strings.
   */
  getGitUser(repoPath: string): { name: string; email: string } {
    return {
      name: safeExecSync("git config user.name", repoPath, ""),
      email: safeExecSync("git config user.email", repoPath, ""),
    };
  }

  /**
   * Get the current branch name.
   */
  getCurrentBranch(repoPath: string): string {
    return safeExecSync("git rev-parse --abbrev-ref HEAD", repoPath, "unknown");
  }

  /**
   * List all local branches.
   */
  listLocalBranches(repoPath: string): string[] {
    return safeExecSync(
      "git branch --format=%(refname:short)",
      repoPath,
      [] as string[],
      parseGitLines,
    );
  }

  /**
   * Lists spec directory names under `specs/` on the given branch via `git ls-tree`.
   */
  gitListSpecDirs(repoPath: string, branch: string): string[] {
    return safeExecSync(
      `git ls-tree --name-only "${branch}" -- specs/`,
      repoPath,
      [] as string[],
      (output) =>
        parseGitLines(output).map((line) => line.replace(/^specs\//, "")),
    );
  }

  /**
   * Lists files inside a spec directory on the given branch via `git ls-tree`.
   */
  gitListSpecFiles(repoPath: string, branch: string, specName: string): string[] {
    return safeExecSync(
      `git ls-tree --name-only "${branch}" -- "specs/${specName}/"`,
      repoPath,
      [] as string[],
      (output) =>
        parseGitLines(output).map((line) => line.replace(`specs/${specName}/`, "")),
    );
  }

  /**
   * Checks if a file/tree exists on a given branch.
   */
  gitPathExists(repoPath: string, branch: string, relativePath: string): boolean {
    try {
      gitExecSync(`git cat-file -e "${branch}:${relativePath}"`, repoPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Returns the Unix timestamp (seconds) of the latest commit touching a path on a branch.
   * Returns 0 if the path has no commits or an error occurs.
   */
  getLatestCommitTimestamp(repoPath: string, branch: string, relativePath: string): number {
    return safeExecSync(
      `git log -1 --format=%ct "${branch}" -- "${relativePath}"`,
      repoPath,
      0,
      (output) => {
        const ts = parseInt(output, 10);
        return Number.isFinite(ts) ? ts : 0;
      },
    );
  }

  /**
   * Reads a file from a git ref (branch) without checkout.
   * @param repoPath Repository root
   * @param ref Branch or ref name
   * @param relativePath Path relative to repo root (e.g. "specs/001-foo/spec.md")
   * @returns File content as string, or null if not found
   */
  readGitFile(repoPath: string, ref: string, relativePath: string): string | null {
    try {
      return gitExecSync(`git show "${ref}:${relativePath}"`, repoPath, { maxBuffer: 5 * 1024 * 1024 });
    } catch {
      return null;
    }
  }
}
