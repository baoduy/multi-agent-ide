import os from "node:os";
import path from "node:path";

/**
 * Build an augmented PATH as a last-resort fallback for environments where
 * the login-shell trick isn't available (Windows) or unavailable (daemons
 * forked from a GUI Electron launch with a minimal inherited PATH).
 *
 * Used by both BaseAISession (PTY sessions) and AiCliGateway (one-shot
 * `claude -p` / `copilot -p` invocations) so binaries installed under
 * common user-local prefixes (npm, pnpm, volta, bun, cargo, …) resolve.
 */
export function buildEnrichedPath(): string {
  const currentPath = process.env.PATH ?? "";
  const home = os.homedir();
  const platform = process.platform;

  const extraPaths: string[] = [];

  if (platform === "darwin" || platform === "linux") {
    extraPaths.push(
      "/usr/local/bin",
      "/opt/homebrew/bin",
      "/opt/homebrew/sbin",
      "/usr/local/sbin",
      path.join(home, ".local", "bin"),
      path.join(home, "bin"),
      path.join(home, ".npm-global", "bin"),
      path.join(home, ".volta", "bin"),
      path.join(home, ".bun", "bin"),
      path.join(home, ".cargo", "bin"),
      path.join(home, "Library", "pnpm"),
      path.join(home, ".local", "share", "pnpm"),
    );
  } else if (platform === "win32") {
    extraPaths.push(
      path.join(home, "AppData", "Roaming", "npm"),
      path.join(home, "AppData", "Local", "Programs", "claude"),
      path.join(home, ".bun", "bin"),
      path.join(home, "AppData", "Local", "pnpm"),
    );
  }

  const sep = platform === "win32" ? ";" : ":";
  const existing = new Set(currentPath.split(sep).filter(Boolean));
  const merged: string[] = [];
  for (const p of extraPaths) {
    if (!existing.has(p)) {
      merged.push(p);
      existing.add(p);
    }
  }
  merged.push(...currentPath.split(sep).filter(Boolean));
  return merged.join(sep);
}
