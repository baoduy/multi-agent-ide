import os from "node:os";
import path from "node:path";

export function resolveSessionCwd(config: {
  repoPath?: string;
  worktreePath?: string;
}): string {
  if (config.worktreePath) return config.worktreePath;
  if (config.repoPath) return config.repoPath;
  return path.join(os.homedir(), ".magenta", "workspace");
}
