import { spawn as ptySpawn } from "node-pty";
import type { IPty } from "node-pty";
import type { IPCBridge } from "../ipc/IPCBridge";

const DEFAULT_SHELL =
  process.platform === "win32" ? "cmd.exe" : (process.env.SHELL ?? "/bin/bash");

/**
 * Build a clean environment for user-facing PTY sessions.
 * Electron and npm inject variables (npm_config_prefix, npm_lifecycle_*,
 * npm_package_*, ELECTRON_*) that conflict with tools like nvm and pollute
 * the user's shell. Strip them out so the terminal behaves like a native one.
 */
function buildPtyEnv(): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    // Strip npm/Electron-injected vars that don't belong in a user shell
    if (
      key.startsWith("npm_") ||
      key.startsWith("ELECTRON_") ||
      key === "NODE_ENV"
    ) {
      continue;
    }
    clean[key] = value;
  }
  // Ensure terminal capabilities are set correctly
  clean.COLORTERM = "truecolor";
  clean.TERM = "xterm-256color";
  return clean;
}

/**
 * TerminalApplicationService manages live PTY sessions spawned via node-pty.
 * Each session is identified by a ULID sessionId generated at spawn time.
 * Raw PTY output (with ANSI codes intact) is forwarded to the UI via bridge events.
 * The UI layer handles ANSI stripping only for readonly (dialog) branches as needed.
 *
 * closeAll() is wired as a daemon shutdown hook in DaemonContainer.
 */
export class TerminalApplicationService {
  private readonly sessions = new Map<string, IPty>();

  constructor(private readonly bridge: IPCBridge) {}

  spawn(sessionId: string, cwd: string, cols: number, rows: number): void {
    const pty = ptySpawn(DEFAULT_SHELL, [], {
      name: "xterm-256color", // Support 256-color palette for richer terminal output
      cwd,
      cols,
      rows,
      env: buildPtyEnv(),
    });

    pty.onData((raw) => {
      // Keep raw output with ANSI codes intact for xterm.js rendering.
      // The UI layer will strip ANSI only for readonly (dialog) branches.
      this.bridge.emit({ type: "terminal:data", sessionId, data: raw });
    });

    pty.onExit(({ exitCode }) => {
      this.sessions.delete(sessionId);
      this.bridge.emit({ type: "terminal:exited", sessionId, exitCode: exitCode ?? 0 });
    });

    this.sessions.set(sessionId, pty);
  }

  write(sessionId: string, data: string): void {
    const pty = this.sessions.get(sessionId);
    if (!pty) return;
    pty.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const pty = this.sessions.get(sessionId);
    if (!pty) return;
    pty.resize(cols, rows);
  }

  close(sessionId: string): void {
    const pty = this.sessions.get(sessionId);
    if (!pty) return;
    pty.kill();
    this.sessions.delete(sessionId);
  }

  closeAll(): void {
    for (const [sessionId, pty] of this.sessions) {
      try {
        pty.kill();
      } catch {
        // Best effort — session may have already exited
      }
      this.sessions.delete(sessionId);
    }
  }
}
