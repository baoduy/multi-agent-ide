import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface TestRepoConfig {
  name: string;
  branch: string;
  withSpecs?: boolean;
}

/**
 * Creates a directory of real git repos inside `tempHome` for E2E testing.
 * Returns the workdir path that should be added to Magenta config.
 */
export function createTestRepos(tempHome: string, repos: TestRepoConfig[]): string {
  const workdir = path.join(tempHome, "workdir");
  fs.mkdirSync(workdir, { recursive: true });

  for (const repo of repos) {
    createSingleRepo(workdir, repo);
  }

  return workdir;
}

/**
 * Creates an empty workdir with no git repos (for "no repos found" scenario).
 */
export function createEmptyWorkdir(tempHome: string): string {
  const workdir = path.join(tempHome, "workdir");
  fs.mkdirSync(workdir, { recursive: true });
  // Create a non-git directory so there's something to scan
  const subdir = path.join(workdir, "not-a-repo");
  fs.mkdirSync(subdir, { recursive: true });
  fs.writeFileSync(path.join(subdir, "file.txt"), "not a git repo");
  return workdir;
}

function createSingleRepo(workdir: string, config: TestRepoConfig): string {
  const repoPath = path.join(workdir, config.name);
  fs.mkdirSync(repoPath, { recursive: true });

  const git = (cmd: string) =>
    execSync(`git ${cmd}`, {
      cwd: repoPath,
      stdio: "pipe",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Test",
        GIT_AUTHOR_EMAIL: "test@test.com",
        GIT_COMMITTER_NAME: "Test",
        GIT_COMMITTER_EMAIL: "test@test.com",
      },
    });

  git("init");
  git(`checkout -b ${config.branch}`);

  fs.writeFileSync(path.join(repoPath, "README.md"), `# ${config.name}\n`);
  git("add .");
  git('commit -m "initial commit"');

  if (config.withSpecs) {
    const specDir = path.join(repoPath, ".specify");
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(
      path.join(specDir, "integration.json"),
      JSON.stringify({ agent: "claude", version: "1.0.0" }),
    );
    git("add .");
    git('commit -m "add specify config"');
  }

  return repoPath;
}
