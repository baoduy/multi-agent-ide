import { EventEmitter } from "node:events";
import { spawn as ptySpawn } from "node-pty";
import type { IPty } from "node-pty";
import os from "node:os";
import path from "node:path";
import type { AIProvider, AISessionStatus } from "@magenta/shared/aiTerminal";

export interface AISessionEvents {
  data: (data: string) => void;
  status: (status: AISessionStatus) => void;
  exit: (exitCode: number) => void;
}

/**
 * Build an augmented PATH as a last-resort fallback for Windows and
 * environments where the login-shell trick isn't available.
 */
function buildEnrichedPath(): string {
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
    );
  } else if (platform === "win32") {
    extraPaths.push(
      path.join(home, "AppData", "Roaming", "npm"),
      path.join(home, "AppData", "Local", "Programs", "claude"),
      path.join(home, ".bun", "bin"),
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

/**
 * POSIX shell quoting — wrap each argument in single quotes, escaping any
 * embedded single quotes. Safe for interpolation into a shell -c command.
 */
function shellQuote(arg: string): string {
  if (arg === "") return "''";
  // If the arg is "safe" (alnum + limited punctuation) no quoting needed
  if (/^[a-zA-Z0-9_\-./:=@%+,]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/**
 * Build the argv to spawn the AI binary.
 *
 * On macOS / Linux we spawn the user's login shell (`$SHELL -l -i -c
 * 'exec <binary> <args>'`) so the shell's rc files run first. This is
 * critical in packaged Electron apps: when the app is launched from
 * Finder / Dock / a desktop file, the process inherits a minimal PATH
 * and none of the shell's init env (nvm, pyenv, homebrew shellenv,
 * asdf, etc.). Without running through the login shell, `claude` /
 * `copilot` (which are usually Node CLI shebangs installed under nvm
 * or a user-local prefix) cannot be resolved. `exec` replaces the
 * shell process with the target binary so the TTY, signals, and
 * exit code pass through cleanly — the shell is just a bootstrap.
 *
 * On Windows we don't have a cross-shell `-l -c` equivalent, so we
 * fall back to direct spawn with an enriched PATH.
 */
function buildSpawnArgv(
  binaryName: string,
  binaryArgs: string[],
): { command: string; args: string[]; viaLoginShell: boolean } {
  const platform = process.platform;

  if (platform === "win32") {
    return { command: binaryName, args: binaryArgs, viaLoginShell: false };
  }

  const userShell = process.env.SHELL || "/bin/bash";
  // Compose: exec <binary> <quoted args...>
  const quoted = [binaryName, ...binaryArgs].map(shellQuote).join(" ");
  const script = `exec ${quoted}`;
  // -l: login shell (loads /etc/profile + ~/.zprofile or ~/.profile)
  // -i: interactive (loads ~/.zshrc or ~/.bashrc for nvm, etc.)
  // -c: run the script and exit
  return {
    command: userShell,
    args: ["-l", "-i", "-c", script],
    viaLoginShell: true,
  };
}

export abstract class BaseAISession extends EventEmitter {
  readonly id: string;
  readonly provider: AIProvider;
  private pty: IPty | null = null;
  private currentStatus: AISessionStatus = "idle";

  constructor(id: string, provider: AIProvider) {
    super();
    this.id = id;
    this.provider = provider;
  }

  protected abstract getBinaryName(): string;
  protected abstract detectStatus(
    data: string,
    currentStatus: AISessionStatus
  ): AISessionStatus | null;

  start(cwd: string, args: string[], cols: number, rows: number): void {
    const binaryName = this.getBinaryName();
    const enrichedPath = buildEnrichedPath();
    const { command, args: spawnArgs, viaLoginShell } = buildSpawnArgv(
      binaryName,
      args,
    );

    try {
      this.pty = ptySpawn(command, spawnArgs, {
        name: "xterm-256color",
        cwd,
        cols,
        rows,
        env: {
          ...process.env,
          // Enriched PATH used both by the login shell (as its starting
          // PATH before rc files extend it) and as a Windows fallback.
          PATH: enrichedPath,
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
        } as Record<string, string>,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const hint = viaLoginShell
        ? `\r\n\x1b[31mFailed to start AI session via '${command}': ${message}\x1b[0m\r\n` +
          `\x1b[33mMake sure '${binaryName}' is installed and on your shell PATH (try running '${binaryName} --version' in your terminal).\x1b[0m\r\n`
        : `\r\n\x1b[31mFailed to start '${binaryName}': ${message}\x1b[0m\r\n` +
          `\x1b[33mMake sure '${binaryName}' is installed and on your PATH.\x1b[0m\r\n`;
      setImmediate(() => {
        this.emit("data", hint);
        this.setStatus("exited");
        this.emit("exit", 127);
      });
      return;
    }

    this.setStatus("active");

    this.pty.onData((data: string) => {
      this.emit("data", data);

      // Attempt status detection
      const newStatus = this.detectStatus(data, this.currentStatus);
      if (newStatus !== null && newStatus !== this.currentStatus) {
        this.setStatus(newStatus);
      }
    });

    this.pty.onExit(({ exitCode }) => {
      this.pty = null;
      // Exit code 127 from a login shell means "command not found" —
      // surface a friendlier hint so the user knows to check their PATH.
      if (viaLoginShell && exitCode === 127) {
        this.emit(
          "data",
          `\r\n\x1b[31m'${binaryName}' was not found in your shell PATH.\x1b[0m\r\n` +
            `\x1b[33mOpen a terminal and run '${binaryName} --version' to verify it's installed. ` +
            `If you use nvm/volta/asdf, make sure your rc file (~/.zshrc or ~/.bashrc) ` +
            `activates the right node version.\x1b[0m\r\n`,
        );
      }
      this.setStatus("exited");
      this.emit("exit", exitCode ?? 0);
    });
  }

  sendInput(text: string): void {
    if (!this.pty) return;
    this.pty.write(text);
  }

  resize(cols: number, rows: number): void {
    if (!this.pty) return;
    this.pty.resize(cols, rows);
  }

  stop(): void {
    if (!this.pty) return;
    this.pty.kill();
    this.pty = null;
  }

  getStatus(): AISessionStatus {
    return this.currentStatus;
  }

  private setStatus(status: AISessionStatus): void {
    this.currentStatus = status;
    this.emit("status", status);
  }
}
