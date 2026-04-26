import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReadStream, statSync, watch, type FSWatcher } from "node:fs";

export interface DebugLogPushPayload {
  type: "ai-session:debug-log";
  payload: { sessionId: string; seq: number; bytes: string };
}

interface ActiveTail {
  filePath: string;
  watcher: FSWatcher;
  cursor: number;
  seq: number;
}

/**
 * Phase 7 — per-session debug log allocator + tailer. The path is materialized
 * at spawn time and passed to Claude via `--debug-file` (already rendered by
 * Phase 1's `toArgvClaude`). The renderer asks the daemon to tail it via
 * `ai-session:debug-log:open`.
 *
 * Spec FR-10.4. Note: storage is intentionally OS tmpdir — debug logs are
 * ephemeral, not authoritative, and survive only as long as the OS keeps them.
 */
export class DebugLogService {
  private readonly paths = new Map<string, string>();
  private readonly tails = new Map<string, ActiveTail>();

  /**
   * Allocate a per-session debug-log path under the OS tmpdir. The path is
   * deterministic for a given sessionId so the live spawn and a renderer
   * tail-follow request both resolve to the same file.
   */
  allocate(sessionId: string): string {
    const path = join(tmpdir(), `magenta-debug-${sessionId}.log`);
    this.paths.set(sessionId, path);
    return path;
  }

  /**
   * Register a caller-supplied debug-log path for tailing. Used when the
   * caller passes `AISpawnOptions.debugFile` explicitly rather than relying
   * on `allocate()` to choose a tmpdir path.
   */
  registerExternalPath(sessionId: string, path: string): void {
    this.paths.set(sessionId, path);
  }

  pathFor(sessionId: string): string | undefined {
    return this.paths.get(sessionId);
  }

  open(
    sessionId: string,
    push: (msg: DebugLogPushPayload) => void,
  ): { filePath: string; seq: number } {
    const filePath = this.paths.get(sessionId);
    if (!filePath) {
      throw new Error(`No debug-log path registered for session ${sessionId}`);
    }
    let cursor = 0;
    try {
      cursor = statSync(filePath).size;
    } catch {
      cursor = 0;
    }
    let seq = 0;

    const tail: ActiveTail = { filePath, watcher: null as never, cursor, seq };

    const flush = (): void => {
      let size = 0;
      try {
        size = statSync(filePath).size;
      } catch {
        return;
      }
      if (size <= tail.cursor) return;
      const stream = createReadStream(filePath, {
        start: tail.cursor,
        end: size - 1,
        encoding: "utf8",
      });
      stream.on("data", (chunk) => {
        tail.seq += 1;
        push({
          type: "ai-session:debug-log",
          payload: { sessionId, seq: tail.seq, bytes: String(chunk) },
        });
      });
      stream.on("end", () => {
        tail.cursor = size;
      });
    };

    let watcher: FSWatcher;
    try {
      watcher = watch(filePath, { persistent: false }, () => flush());
    } catch {
      // File may not exist yet — return a noop watcher and let the renderer
      // retry on next open. The seq is still 0.
      return { filePath, seq: 0 };
    }
    tail.watcher = watcher;
    this.tails.set(sessionId, tail);
    return { filePath, seq: 0 };
  }

  close(sessionId: string): void {
    const t = this.tails.get(sessionId);
    if (!t) return;
    try {
      t.watcher.close();
    } catch {
      // best-effort
    }
    this.tails.delete(sessionId);
  }
}
