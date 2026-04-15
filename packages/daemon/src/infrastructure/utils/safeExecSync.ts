import { execFileSync } from "child_process";
import { existsSync } from "fs";

/**
 * Executes a git command synchronously and returns the trimmed output.
 * Uses execFileSync to call git directly (no shell required).
 * Returns the provided default value on any error.
 */
export function safeExecSync(
  command: string,
  cwd: string,
  defaultValue: string,
): string;
export function safeExecSync<T>(
  command: string,
  cwd: string,
  defaultValue: T,
  transform: (output: string) => T,
): T;
export function safeExecSync<T>(
  command: string,
  cwd: string,
  defaultValue: T,
  transform?: (output: string) => T,
): T | string {
  try {
    const output = gitExecSync(command, cwd).trim();

    if (transform) {
      return transform(output);
    }
    return output;
  } catch {
    return defaultValue;
  }
}

/**
 * Parses typical git output into an array of non-empty lines.
 * Strips leading/trailing quotes that git sometimes adds.
 */
export function parseGitLines(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim().replace(/^'|'$/g, ""))
    .filter(Boolean);
}

/**
 * Executes a command string by splitting it into binary + args and calling
 * execFileSync (no shell required). This avoids the `/bin/sh ENOENT` error
 * in packaged Electron apps where the shell may not be accessible.
 *
 * For "git" commands, uses the absolute path from MAGENTA_GIT_PATH if set
 * (Electron's ELECTRON_RUN_AS_NODE forked processes don't reliably search PATH).
 *
 * Supports simple quoted arguments (double quotes only) for paths with spaces.
 */
export function gitExecSync(
  command: string,
  cwd: string,
  options?: { maxBuffer?: number },
): string {
  const args = parseCommandArgs(command);
  let binary = args.shift()!;

  // In packaged Electron apps, the main process resolves git to an absolute
  // path and passes it via MAGENTA_GIT_PATH since execFileSync in forked
  // ELECTRON_RUN_AS_NODE processes can't reliably search PATH.
  if (binary === "git" && process.env["MAGENTA_GIT_PATH"]) {
    binary = process.env["MAGENTA_GIT_PATH"];
  }

  // Guard: Node.js reports ENOENT for the binary when the cwd doesn't exist,
  // which is very misleading. Throw a clear error instead.
  if (!existsSync(cwd)) {
    throw new Error(`Directory does not exist: ${cwd}`);
  }

  return execFileSync(binary, args, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 10_000,
    ...options,
  });
}

/**
 * Split a command string into arguments, respecting double-quoted segments.
 * e.g. `git worktree add "/path with spaces" -b "branch"` →
 *      ["git", "worktree", "add", "/path with spaces", "-b", "branch"]
 */
function parseCommandArgs(command: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === " " && !inQuotes) {
      if (current) {
        args.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}
