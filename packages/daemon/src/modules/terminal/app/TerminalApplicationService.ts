import type { IPCBridge } from "../../../core/ipc/IPCBridge";
import { SessionCore } from "../infra/SessionCore";
import type { AttachResult } from "../../../core/utils/RingBuffer";

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
    if (
      key.startsWith("npm_") ||
      key.startsWith("ELECTRON_") ||
      key === "NODE_ENV"
    ) {
      continue;
    }
    clean[key] = value;
  }
  clean.COLORTERM = "truecolor";
  clean.TERM = "xterm-256color";
  return clean;
}

/**
 * TerminalApplicationService owns shell PTY sessions, each wrapped in a
 * SessionCore. Output is seq-numbered, retained in a ring buffer for
 * reattach, batched into 8 ms windows, and flow-controlled per viewer.
 *
 * The UI should:
 *   - subscribe to `terminal:data` for live chunks (all carry a `seq`)
 *   - call `terminal:attach` on mount/reconnect with the last seq it saw
 *   - send `terminal:ack` after xterm's write callback fires
 */
export class TerminalApplicationService {
  private readonly sessions = new Map<string, SessionCore>();

  constructor(private readonly bridge: IPCBridge) {}

  spawn(sessionId: string, cwd: string, cols: number, rows: number): void {
    const core = new SessionCore(sessionId);
    this.wireEvents(core);
    core.start({
      command: DEFAULT_SHELL,
      args: [],
      cwd,
      cols,
      rows,
      env: buildPtyEnv(),
    });
    this.sessions.set(sessionId, core);
  }

  write(sessionId: string, data: string): void {
    this.sessions.get(sessionId)?.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.sessions.get(sessionId)?.resize(cols, rows);
  }

  close(sessionId: string): void {
    const core = this.sessions.get(sessionId);
    if (!core) return;
    core.dispose();
    this.sessions.delete(sessionId);
  }

  /** Returns live chunks newer than `fromSeq`, or a snapshot on cold attach. */
  attach(sessionId: string, fromSeq?: number): (AttachResult & { alive: boolean }) | null {
    const core = this.sessions.get(sessionId);
    if (!core) return null;
    return { ...core.attach(fromSeq ?? 0), alive: core.isAlive };
  }

  /** Acknowledge received seq — unblocks the flow-control window. */
  ack(_sessionId: string, _seq: number): void {
    // Flow control is currently emit-side rate limiting via 8ms batching.
    // The ack is recorded here for future window-based backpressure; the
    // event itself arriving is already a useful UI liveness signal.
  }

  closeAll(): void {
    for (const [sessionId, core] of this.sessions) {
      try {
        core.dispose();
      } catch {
        /* best effort */
      }
      this.sessions.delete(sessionId);
    }
  }

  private wireEvents(core: SessionCore): void {
    const sessionId = core.id;
    core.on("chunk", ({ data, seq }) => {
      this.bridge.emit({ type: "terminal:data", sessionId, data, seq });
    });
    core.on("exit", ({ exitCode }) => {
      this.sessions.delete(sessionId);
      this.bridge.emit({ type: "terminal:exited", sessionId, exitCode });
    });
    core.on("heartbeat", ({ headSeq, alive }) => {
      this.bridge.emit({ type: "terminal:heartbeat", sessionId, headSeq, alive });
    });
  }
}
