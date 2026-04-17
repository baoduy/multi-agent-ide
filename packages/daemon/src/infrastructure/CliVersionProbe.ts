import { spawn } from "node:child_process";
import stripAnsi from "strip-ansi";

const PROBE_TIMEOUT_MS = 5_000;
const VERSION_REGEX = /(\d+)\.(\d+)\.(\d+)(?:[-.][A-Za-z0-9.]+)?/;

export interface ProbeResult {
  installed: boolean;
  version: string | null;
  error: string | null;
}

/**
 * Detects the locally installed version of a CLI by spawning `<binary>
 * <versionArgs>` and parsing the first semver-like token from stdout.
 *
 * - ENOENT (binary not on PATH) → `{ installed: false, version: null }`.
 * - Any other spawn/exit failure → `{ installed: false, error }`.
 */
export class CliVersionProbe {
  probe(binary: string, versionArgs: string[]): Promise<ProbeResult> {
    return new Promise<ProbeResult>((resolve) => {
      let child;
      try {
        child = spawn(binary, versionArgs, {
          shell: false,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
          timeout: PROBE_TIMEOUT_MS,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        resolve({ installed: false, version: null, error: message });
        return;
      }

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf-8");
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf-8");
      });

      child.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") {
          resolve({ installed: false, version: null, error: null });
        } else {
          resolve({ installed: false, version: null, error: err.message });
        }
      });

      child.on("close", (code) => {
        if (code !== 0) {
          const combined = (stdout + stderr).trim();
          resolve({
            installed: false,
            version: null,
            error: combined.length > 0 ? combined.slice(0, 200) : `exit code ${code}`,
          });
          return;
        }

        const clean = stripAnsi(stdout + "\n" + stderr);
        const match = clean.match(VERSION_REGEX);
        if (!match) {
          resolve({ installed: true, version: null, error: "unparseable version output" });
          return;
        }

        resolve({ installed: true, version: `${match[1]}.${match[2]}.${match[3]}`, error: null });
      });
    });
  }
}

/**
 * Strips a leading `v` from a tag name and trims pre-release suffixes so it
 * can be compared to a CLI-reported X.Y.Z triple. Returns `null` when the
 * tag cannot be parsed as a semver-like version.
 */
export function normalizeReleaseTag(tag: string): string | null {
  const match = tag.match(VERSION_REGEX);
  if (!match) return null;
  return `${match[1]}.${match[2]}.${match[3]}`;
}

/**
 * Returns `true` when `latest` is strictly newer than `current`. Invalid
 * inputs conservatively return `false` so the UI never nags with bogus
 * updates.
 */
export function isNewerVersion(current: string | null, latest: string | null): boolean {
  if (!current || !latest) return false;
  const currentParts = current.split(".").map((n) => parseInt(n, 10));
  const latestParts = latest.split(".").map((n) => parseInt(n, 10));
  if (currentParts.length !== 3 || latestParts.length !== 3) return false;
  if (currentParts.some(Number.isNaN) || latestParts.some(Number.isNaN)) return false;

  for (let i = 0; i < 3; i++) {
    if (latestParts[i] > currentParts[i]) return true;
    if (latestParts[i] < currentParts[i]) return false;
  }
  return false;
}
