import { execSync } from "child_process";

/**
 * Executes a shell command synchronously and returns the trimmed output.
 * Returns the provided default value on any error (command not found, non-zero exit, etc.).
 *
 * Standard options for git commands: encoding utf-8, suppress stdio.
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
    const output = execSync(command, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

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
