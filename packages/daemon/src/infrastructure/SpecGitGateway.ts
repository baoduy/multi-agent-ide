import { createGit } from "./utils/createGit";

/**
 * SpecGitGateway wraps git commands for spec access.
 * Provides methods to read specs from non-current branches without checking them out.
 *
 * All methods are async — uses simple-git under the hood to avoid
 * blocking the Node.js event loop.
 */
export class SpecGitGateway {
  /**
   * Returns the git user name and email from the repo's git config.
   * Falls back to global config, then to empty strings.
   */
  async getGitUser(repoPath: string): Promise<{ name: string; email: string }> {
    const git = createGit(repoPath);
    let name = "";
    let email = "";

    try {
      const nameResult = await git.getConfig("user.name");
      name = nameResult.value ?? "";
    } catch { /* fallback */ }

    try {
      const emailResult = await git.getConfig("user.email");
      email = emailResult.value ?? "";
    } catch { /* fallback */ }

    return { name, email };
  }

  /**
   * Get the current branch name.
   */
  async getCurrentBranch(repoPath: string): Promise<string> {
    const git = createGit(repoPath);
    try {
      return (await git.revparse(["--abbrev-ref", "HEAD"])).trim() || "unknown";
    } catch {
      return "unknown";
    }
  }

  /**
   * List all local branches.
   */
  async listLocalBranches(repoPath: string): Promise<string[]> {
    const git = createGit(repoPath);
    try {
      const summary = await git.branchLocal();
      return summary.all;
    } catch {
      return [];
    }
  }

  /**
   * Lists spec directory names under `specs/` on the given branch via `git ls-tree`.
   */
  async gitListSpecDirs(repoPath: string, branch: string): Promise<string[]> {
    const git = createGit(repoPath);
    try {
      const raw = await git.raw(["ls-tree", "--name-only", branch, "--", "specs/"]);
      return parseLines(raw).map((line) => line.replace(/^specs\//, ""));
    } catch {
      return [];
    }
  }

  /**
   * Lists files inside a spec directory on the given branch via `git ls-tree`.
   */
  async gitListSpecFiles(repoPath: string, branch: string, specName: string): Promise<string[]> {
    const git = createGit(repoPath);
    try {
      const raw = await git.raw(["ls-tree", "--name-only", branch, "--", `specs/${specName}/`]);
      return parseLines(raw).map((line) => line.replace(`specs/${specName}/`, ""));
    } catch {
      return [];
    }
  }

  /**
   * Checks if a file/tree exists on a given branch.
   */
  async gitPathExists(repoPath: string, branch: string, relativePath: string): Promise<boolean> {
    const git = createGit(repoPath);
    try {
      await git.raw(["cat-file", "-e", `${branch}:${relativePath}`]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Returns the Unix timestamp (seconds) of the latest commit touching a path on a branch.
   * Returns 0 if the path has no commits or an error occurs.
   */
  async getLatestCommitTimestamp(repoPath: string, branch: string, relativePath: string): Promise<number> {
    const git = createGit(repoPath);
    try {
      const raw = await git.raw(["log", "-1", "--format=%ct", branch, "--", relativePath]);
      const ts = parseInt(raw.trim(), 10);
      return Number.isFinite(ts) ? ts : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Reads a file from a git ref (branch) without checkout.
   * @param repoPath Repository root
   * @param ref Branch or ref name
   * @param relativePath Path relative to repo root (e.g. "specs/001-foo/spec.md")
   * @returns File content as string, or null if not found
   */
  async readGitFile(repoPath: string, ref: string, relativePath: string): Promise<string | null> {
    const git = createGit(repoPath);
    try {
      return await git.show([`${ref}:${relativePath}`]);
    } catch {
      return null;
    }
  }
}

/* ═══════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════ */

/**
 * Parses typical git output into an array of non-empty lines.
 * Strips leading/trailing quotes that git sometimes adds.
 */
function parseLines(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim().replace(/^'|'$/g, ""))
    .filter(Boolean);
}
