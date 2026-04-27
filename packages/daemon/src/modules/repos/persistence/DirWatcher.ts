import chokidar, { type FSWatcher } from "chokidar";
import type { ConfigManager } from "../../../core/config/ConfigManager";
import type { ScanQueue } from "./ScanQueue";

const TAG = "[DirWatcher]";
const DEBOUNCE_MS = 2000;

export class DirWatcher {
  private readonly watchers: Map<string, FSWatcher> = new Map();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly scanQueue: ScanQueue,
    private readonly configManager: ConfigManager,
  ) {}

  watchDir(dirPath: string): void {
    if (this.watchers.has(dirPath)) {
      return;
    }

    const watcher = chokidar.watch(dirPath, {
      depth: 3,
      ignoreInitial: true,
      ignored: [/node_modules/, /\.git\//, /dist/, /build/],
    });

    watcher.on("addDir", (path) => {
      if (path.endsWith("/.git")) {
        this.requestRescan();
      }
    });

    watcher.on("unlinkDir", (_path) => {
      // Any directory removal could be a repo folder deletion.
      // Rescan to detect missing repos (debounced to avoid rapid-fire).
      this.requestRescan();
    });

    this.watchers.set(dirPath, watcher);
    console.log(`${TAG} Watching ${dirPath} for repository changes`);
  }

  unwatchDir(dirPath: string): void {
    const watcher = this.watchers.get(dirPath);
    if (watcher) {
      void watcher.close();
      this.watchers.delete(dirPath);
    }
  }

  unwatchAll(): void {
    for (const watcher of this.watchers.values()) {
      void watcher.close();
    }
    this.watchers.clear();
  }

  private requestRescan(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      const roots = this.configManager.getAllowedRoots();
      console.log(`${TAG} Repository change detected, scheduling rescan for ${roots.length} roots`);
      void this.scanQueue.requestScan([...roots]);
      this.debounceTimer = null;
    }, DEBOUNCE_MS);
  }
}
