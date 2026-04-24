import { randomUUID } from "node:crypto";
import type { IPCBridge } from "../ipc/IPCBridge";
import type { FileWatcherGateway } from "../infrastructure/FileWatcherGateway";

/**
 * Recent self-write record. When the app writes a file via `file:write`, the
 * watcher sees its own write and would otherwise fire a bogus
 * `file:changed-on-disk` event. We stash the content the app just wrote,
 * plus a short TTL, and suppress the first matching change inside that
 * window.
 *
 * Match by content — not just path — so that a second external write
 * arriving close behind the app's save still triggers the push.
 */
type SelfWriteRecord = {
  content: string;
  expiresAt: number;
};

/** How long a self-write record stays suppressible. */
const SELF_WRITE_TTL_MS = 1500;

/**
 * Coordinates file-watching for the renderer. Owns the watchId → filePath
 * map, emits `file:changed-on-disk` push events through the IPC bridge, and
 * runs a short suppression window so the app's own saves don't re-trigger
 * the watcher.
 *
 * The renderer is expected to call `file:watch` when a markdown tab mounts
 * and `file:unwatch` on unmount. If the same file is opened in two tabs
 * we'll have two watcher entries; that's fine — the emit fan-out is cheap
 * and closing one doesn't affect the other.
 */
export class FileWatchService {
  private readonly pathById = new Map<string, string>();
  private readonly recentSelfWrites = new Map<string, SelfWriteRecord>();

  constructor(
    private readonly gateway: FileWatcherGateway,
    private readonly bridge: IPCBridge,
  ) {}

  /**
   * Register a watcher for `filePath`. Returns the watchId the renderer will
   * pass back to `unwatch` on unmount.
   */
  watch(filePath: string): string {
    const watchId = randomUUID();
    this.pathById.set(watchId, filePath);
    this.gateway.watch(watchId, filePath, (absPath, newContent, mtime) => {
      this.handleChange(watchId, absPath, newContent, mtime);
    });
    return watchId;
  }

  /**
   * Stop watching. Idempotent.
   */
  async unwatch(watchId: string): Promise<void> {
    this.pathById.delete(watchId);
    await this.gateway.unwatch(watchId);
  }

  /**
   * Close every open watcher. Called on daemon shutdown.
   */
  async closeAll(): Promise<void> {
    this.pathById.clear();
    this.recentSelfWrites.clear();
    await this.gateway.closeAll();
  }

  /**
   * Record a self-write so the next watcher event that carries identical
   * content is suppressed. The file:write handler calls this immediately
   * after a successful write.
   */
  noteSelfWrite(filePath: string, content: string): void {
    this.pruneExpired();
    this.recentSelfWrites.set(filePath, {
      content,
      expiresAt: Date.now() + SELF_WRITE_TTL_MS,
    });
  }

  /**
   * Dispatch a watcher event. If the new content matches a recent self-write,
   * consume the record and swallow the event (it's our own save). Otherwise
   * fan out a push event so the renderer can run its 3-way merge.
   */
  private handleChange(watchId: string, absPath: string, newContent: string, mtime: number): void {
    this.pruneExpired();
    const selfWrite = this.recentSelfWrites.get(absPath);
    if (selfWrite && selfWrite.content === newContent) {
      // The change is the app's own save. Consume the record (don't let one
      // save suppress a later external change with the same content).
      this.recentSelfWrites.delete(absPath);
      return;
    }
    this.bridge.emit({
      type: "file:changed-on-disk",
      watchId,
      filePath: absPath,
      newContent,
      mtime,
    });
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [path, rec] of this.recentSelfWrites) {
      if (rec.expiresAt < now) this.recentSelfWrites.delete(path);
    }
  }
}
