import { execSync } from "child_process";

/**
 * SpecGitGateway wraps git commands for spec access.
 * Provides methods to read specs from non-current branches without checking them out.
 */
export class SpecGitGateway {
  /**
   * Get the current branch name.
   */
  getCurrentBranch(repoPath: string): string {
    try {
      return execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: repoPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    } catch {
      return "unknown";
    }
  }

  /**
   * List all local branches.
   */
  listLocalBranches(repoPath: string): string[] {
    try {
      const output = execSync("git branch --format='%(refname:short)'", {
        cwd: repoPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return output
        .split("\n")
        .map((b) => b.trim().replace(/^'|'$/g, ""))
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Lists spec directory names under `specs/` on the given branch via `git ls-tree`.
   */
  gitListSpecDirs(repoPath: string, branch: string): string[] {
    try {
      const output = execSync(
        `git ls-tree --name-only "${branch}" -- specs/`,
        {
          cwd: repoPath,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      // git ls-tree returns "specs/001-foo", "specs/002-bar" etc.
      return output
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^specs\//, ""));
    } catch {
      return [];
    }
  }

  /**
   * Lists files inside a spec directory on the given branch via `git ls-tree`.
   */
  gitListSpecFiles(repoPath: string, branch: string, specName: string): string[] {
    try {
      const output = execSync(
        `git ls-tree --name-only "${branch}" -- "specs/${specName}/"`,
        {
          cwd: repoPath,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      return output
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(`specs/${specName}/`, ""));
    } catch {
      return [];
    }
  }

  /**
   * Checks if a file/tree exists on a given branch.
   */
  gitPathExists(repoPath: string, branch: string, relativePath: string): boolean {
    try {
      execSync(`git cat-file -e "${branch}:${relativePath}"`, {
        cwd: repoPath,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return true;
    } catch {
      return false;
    }
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
      return execSync(`git show "${ref}:${relativePath}"`, {
        cwd: repoPath,
        encoding: "utf-8",
        maxBuffer: 5 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      return null;
    }
  }
}
