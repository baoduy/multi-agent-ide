import { spawn as ptySpawn } from "node-pty";
import type { IPty } from "node-pty";
import type { IPCBridge } from "../ipc/IPCBridge";

const DEFAULT_SHELL =
  process.platform === "win32" ? "cmd.exe" : (process.env.SHELL ?? "/bin/bash");

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
      env: {
        ...process.env,
        COLORTERM: "truecolor", // Enable 24-bit true color support
        TERM: "xterm-256color",
      } as Record<string, string>,
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
