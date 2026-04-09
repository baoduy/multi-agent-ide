import fs from "node:fs";
import path from "node:path";

import simpleGit from "simple-git";

export type RepoScanCandidate = {
  name: string;
  path: string;
  branch: string;
  hasSpecs: boolean;
  specCount: number;
};

export type RepoScanProgress = {
  scanned: number;
  total: number;
  currentDir: string;
};

export class RepoScanner {
  private readonly maxDepth: number;
  private readonly ignoredDirectories: Set<string>;

  constructor(maxDepth = 3) {
    this.maxDepth = maxDepth;
    this.ignoredDirectories = new Set([
      ".git",
      "node_modules",
      "dist",
      "build",
      "coverage",
      ".next",
      ".nuxt",
    ]);
  }

  async scan(
    roots: string[],
    onProgress?: (progress: RepoScanProgress) => void
  ): Promise<{ results: RepoScanCandidate[]; scanned: number }> {
    const results: RepoScanCandidate[] = [];
    let scanned = 0;

    for (const root of roots) {
      if (!fs.existsSync(root)) {
        continue;
      }

      const work = [root];
      while (work.length > 0) {
        const current = work.pop();
        if (!current) {
          continue;
        }

        const depth = this.depthFromRoot(root, current);
        if (depth > this.maxDepth) {
          continue;
        }

        scanned += 1;
        onProgress?.({ scanned, total: 0, currentDir: current });

        const gitPath = path.join(current, ".git");
        if (fs.existsSync(gitPath)) {
          const stat = fs.lstatSync(gitPath);
          if (stat.isDirectory() || stat.isFile()) {
            results.push(await this.inspectRepo(current));
            continue;
          }
        }

        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) {
            continue;
          }

          if (entry.isSymbolicLink()) {
            continue;
          }

          if (this.ignoredDirectories.has(entry.name)) {
            continue;
          }

          work.push(path.join(current, entry.name));
        }
      }
    }

    return { results, scanned };
  }

  private depthFromRoot(root: string, current: string): number {
    const relativePath = path.relative(root, current);
    if (!relativePath || relativePath === ".") {
      return 0;
    }

    return relativePath.split(path.sep).length;
  }

  private async inspectRepo(repoPath: string): Promise<RepoScanCandidate> {
    const git = simpleGit(repoPath);

    let branch = "unknown";
    try {
      branch = (await git.revparse(["--abbrev-ref", "HEAD"]))?.trim() || "unknown";
    } catch {
      branch = "unknown";
    }

    const specsPath = path.join(repoPath, "specs");
    const hasSpecs = fs.existsSync(specsPath) && fs.lstatSync(specsPath).isDirectory();

    let specCount = 0;
    if (hasSpecs) {
      specCount = fs
        .readdirSync(specsPath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .length;
    }

    return {
      name: path.basename(repoPath),
      path: repoPath,
      branch,
      hasSpecs,
      specCount,
    };
  }
}
