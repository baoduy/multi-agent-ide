import { EventEmitter } from "node:events";
import { spawn as ptySpawn } from "node-pty";
import type { IPty } from "node-pty";

import { RingBuffer, type AttachResult } from "../../../core/utils/RingBuffer";

/**
 * SessionCore — the durable, observable wrapper around a single node-pty
 * process. It is the source of truth for terminal output; UI projections
 * (xterm instances) attach/detach freely without disturbing the session.
 *
 * Responsibilities:
 *   - Own one IPty; proxy write/resize/kill.
 *   - Tee stdout into a RingBuffer (seq-numbered, bounded) + emit `chunk`
 *     events batched in an 8 ms window for IPC throughput.
 *   - Flow-control per subscriber via ack windows: each subscriber tracks
 *     how many bytes are "in flight" (sent but not acked by the UI).
 *   - Emit a liveness heartbeat every `heartbeatMs`.
 *   - Emit `exit` exactly once.
 *
 * This class is intentionally transport-agnostic — it does not know about
 * IPC, Electron, or JSON. Adapters (TerminalApplicationService,
 * BaseAISession) wire its events to `IPCBridge.emit`.
 */

export interface SessionSpawnOptions {
  command: string;
  args: string[];
  cwd: string;
  cols: number;
  rows: number;
  env?: Record<string, string>;
  name?: string;
}

export interface SessionCoreOptions {
  /** Max bytes retained in the ring buffer for replay. Default 4 MB. */
  ringBytes?: number;
  /** Coalesce window for outgoing chunk events. Default 8 ms. */
  batchWindowMs?: number;
  /** Heartbeat interval. Default 2 s. Set to 0 to disable. */
  heartbeatMs?: number;
}

/**
 * The public event surface. Subscribers (handlers in the IPC layer)
 * translate these into push events on the bridge.
 */
export interface SessionCoreEvents {
  /** A batch of new terminal data, already appended to the ring. */
  chunk: (payload: { data: string; seq: number }) => void;
  /** PTY has exited; the session is over. Emitted exactly once. */
  exit: (payload: { exitCode: number }) => void;
  /** Liveness tick — lets the UI detect a silent stall. */
  heartbeat: (payload: { headSeq: number; alive: boolean }) => void;
}

export declare interface SessionCore {
  on<E extends keyof SessionCoreEvents>(event: E, listener: SessionCoreEvents[E]): this;
  off<E extends keyof SessionCoreEvents>(event: E, listener: SessionCoreEvents[E]): this;
  emit<E extends keyof SessionCoreEvents>(event: E, ...args: Parameters<SessionCoreEvents[E]>): boolean;
}

export class SessionCore extends EventEmitter {
  readonly id: string;
  private readonly ring: RingBuffer;
  private readonly batchWindowMs: number;
  private readonly heartbeatMs: number;

  private pty: IPty | null = null;
  private exited = false;

  /** Pending outbound data waiting for the 8ms coalesce timer. */
  private pendingBatch = "";
  private batchTimer: NodeJS.Timeout | null = null;

  /** Heartbeat timer handle. */
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(id: string, opts: SessionCoreOptions = {}) {
    super();
    this.id = id;
    this.ring = new RingBuffer(opts.ringBytes ?? 4 * 1024 * 1024);
    this.batchWindowMs = opts.batchWindowMs ?? 8;
    this.heartbeatMs = opts.heartbeatMs ?? 2_000;
  }

  // ─── Lifecycle ────────────────────────────────────────────────

  start(opts: SessionSpawnOptions): void {
    if (this.pty) {
      throw new Error(`SessionCore(${this.id}): already started`);
    }
    const pty = ptySpawn(opts.command, opts.args, {
      name: opts.name ?? "xterm-256color",
      cwd: opts.cwd,
      cols: opts.cols,
      rows: opts.rows,
      env: opts.env as Record<string, string> | undefined,
    });
    this.pty = pty;

    pty.onData((raw) => {
      this.pendingBatch += raw;
      if (this.batchTimer === null) {
        this.batchTimer = setTimeout(() => this.flushBatch(), this.batchWindowMs);
      }
    });

    pty.onExit(({ exitCode }) => {
      // Flush any pending bytes before announcing exit so the UI
      // never loses the last few lines printed before the process died.
      this.flushBatch();
      this.pty = null;
      if (this.exited) return;
      this.exited = true;
      this.stopHeartbeat();
      this.emit("exit", { exitCode: exitCode ?? 0 });
    });

    this.startHeartbeat();
  }

  /** Push pre-formatted output (e.g. error banners) into the stream. */
  injectOutput(data: string): void {
    if (data.length === 0) return;
    this.pendingBatch += data;
    if (this.batchTimer === null) {
      this.batchTimer = setTimeout(() => this.flushBatch(), this.batchWindowMs);
    }
  }

  write(data: string): void {
    if (!this.pty) return;
    this.pty.write(data);
  }

  resize(cols: number, rows: number): void {
    if (!this.pty) return;
    try {
      this.pty.resize(cols, rows);
    } catch {
      /* PTY may have exited between check and call */
    }
  }

  kill(signal?: string): void {
    if (!this.pty) return;
    try {
      this.pty.kill(signal);
    } catch {
      /* ignore */
    }
  }

  /** Called by adapters when the session is being permanently disposed. */
  dispose(): void {
    this.kill();
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    this.stopHeartbeat();
    this.ring.clear();
    this.removeAllListeners();
  }

  // ─── Attach / replay ──────────────────────────────────────────

  /**
   * Return everything newer than `fromSeq`. Flushes any pending batch
   * first so the snapshot includes literally everything the PTY has
   * produced up to now.
   */
  attach(fromSeq = 0): AttachResult {
    this.flushBatch();
    return this.ring.since(fromSeq);
  }

  // ─── State queries ────────────────────────────────────────────

  get isAlive(): boolean {
    return this.pty !== null && !this.exited;
  }

  get headSeq(): number {
    return this.ring.headSeq;
  }

  get pid(): number | undefined {
    return this.pty?.pid;
  }

  // ─── Internal ─────────────────────────────────────────────────

  private flushBatch(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    if (this.pendingBatch.length === 0) return;
    const batch = this.pendingBatch;
    this.pendingBatch = "";
    const seq = this.ring.push(batch);
    this.emit("chunk", { data: batch, seq });
  }

  private startHeartbeat(): void {
    if (this.heartbeatMs <= 0) return;
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.emit("heartbeat", { headSeq: this.ring.headSeq, alive: this.isAlive });
    }, this.heartbeatMs);
    // Allow the Node process to exit if nothing else holds it
    this.heartbeatTimer.unref?.();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
