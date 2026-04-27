import chokidar, { type FSWatcher } from "chokidar";
import fs from "node:fs";
import path from "node:path";
import { AppError } from "../../../core/errors/AppError";

const TAG = "[FileWatcherGateway]";
const DEBOUNCE_MS = 300;

/**
 * Callback fired when the watched file settles after a change.
 * `mtime` is ms-since-epoch so callers can dedupe if needed.
 */
export type FileChangeListener = (filePath: string, newContent: string, mtime: number) => void;

type WatchEntry = {
  watcher: FSWatcher;
  absPath: string;
  listener: FileChangeListener;
  /** Debounce / stability state. */
  timer: NodeJS.Timeout | null;
  lastSize: number;
};

/**
 * Thin chokidar wrapper for single-file watches. One `FSWatcher` per watchId
 * keeps the implementation simple at the cost of a handful of native fd's;
 * the markdown editor only opens one watcher per visible tab.
 *
 * Change events are debounced (`DEBOUNCE_MS`) and require file size to be
 * stable across one debounce tick before firing — this avoids emitting
 * mid-write content when an editor saves in two passes (e.g. write + fsync).
 * If the file is still growing when the timer fires, we reschedule.
 *
 * Callers get the new content and mtime in the listener; self-write
 * suppression (matching app-initiated writes) lives one layer up in
 * FileWatchService, which owns the "recent write" log.
 */
export class FileWatcherGateway {
  private readonly entries = new Map<string, WatchEntry>();

  /**
   * Start watching `filePath`. `watchId` is supplied by the caller so the
   * application service can keep its own id map; the gateway itself is
   * oblivious to ids. Listener fires with the post-write content whenever
   * the file settles after an external mutation.
   *
   * Throws FILE_WATCH_FAILED if chokidar cannot attach (usually: file does
   * not exist or permission denied).
   */
  watch(watchId: string, filePath: string, listener: FileChangeListener): void {
    if (this.entries.has(watchId)) {
      throw new AppError("FILE_WATCH_FAILED", `watchId already in use: ${watchId}`);
    }
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) {
      throw new AppError("FILE_WATCH_FAILED", `Cannot watch non-existent file: ${absPath}`);
    }

    let watcher: FSWatcher;
    try {
      watcher = chokidar.watch(absPath, {
        ignoreInitial: true,
        // Use polling on macOS where chokidar's fsevents can miss writes
        // from outside the app (atomic writes replace the inode). 200ms
        // polling matches the responsiveness users expect from "file changed".
        usePolling: process.platform === "darwin",
        interval: 200,
        awaitWriteFinish: false, // we do our own stability check
      });
    } catch (err) {
      throw new AppError("FILE_WATCH_FAILED", `chokidar.watch failed: ${(err as Error).message}`);
    }

    const entry: WatchEntry = {
      watcher,
      absPath,
      listener,
      timer: null,
      lastSize: -1,
    };
    this.entries.set(watchId, entry);

    const onChange = () => this.scheduleEmit(entry);
    watcher.on("change", onChange);
    watcher.on("add", onChange);
    // We deliberately don't handle `unlink` — a deleted-then-recreated file
    // will fire `add` when it comes back, which is the right signal.
    watcher.on("error", (err) => {
      // Keep the watcher alive but log — transient errors on NFS / network
      // drives shouldn't kill the feature.
      // eslint-disable-next-line no-console
      console.warn(`${TAG} watcher error for ${absPath}:`, err);
    });
  }

  /**
   * Stop watching and release native resources. Idempotent — unknown ids
   * are a silent no-op so the renderer can safely unwatch on unmount.
   */
  async unwatch(watchId: string): Promise<void> {
    const entry = this.entries.get(watchId);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    this.entries.delete(watchId);
    try {
      await entry.watcher.close();
    } catch {
      /* ignore close errors — we're throwing the handle away anyway */
    }
  }

  /**
   * Close every open watcher. Called on daemon shutdown.
   */
  async closeAll(): Promise<void> {
    const ids = [...this.entries.keys()];
    await Promise.all(ids.map((id) => this.unwatch(id)));
  }

  /**
   * Debounced stability-check before firing the listener. If the file is
   * still growing when the timer expires, we reschedule so the listener
   * doesn't see a partial write. If a stat fails (file was unlinked), we
   * silently drop the event — the next `add` / `change` will restart us.
   */
  private scheduleEmit(entry: WatchEntry): void {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      let size: number;
      let mtime: number;
      try {
        const stat = fs.statSync(entry.absPath);
        size = stat.size;
        mtime = stat.mtimeMs;
      } catch {
        return;
      }
      if (size !== entry.lastSize) {
        // Still changing — wait another tick.
        entry.lastSize = size;
        this.scheduleEmit(entry);
        return;
      }
      // Stable. Read and notify.
      let content: string;
      try {
        content = fs.readFileSync(entry.absPath, "utf-8");
      } catch {
        return;
      }
      try {
        entry.listener(entry.absPath, content, mtime);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`${TAG} listener threw for ${entry.absPath}:`, err);
      }
    }, DEBOUNCE_MS);
    // Remember the size at schedule time so the next tick can compare.
    try {
      entry.lastSize = fs.statSync(entry.absPath).size;
    } catch {
      /* ignore */
    }
  }
}
