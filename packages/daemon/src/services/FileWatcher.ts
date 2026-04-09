import chokidar from "chokidar";
import path from "node:path";

type FileWatcherCallbacks = {
  onSpecsChanged?: () => void;
};

/**
 * FileWatcher manages chokidar file system watching for spec folder changes.
 * Emits debounced callbacks when files in the specs/ directory change.
 */
export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private currentWatchPath: string | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly debounceMs = 500;
  private callbacks: FileWatcherCallbacks = {};

  /**
   * Start watching a specs directory for changes.
   */
  watch(specsPath: string, callbacks: FileWatcherCallbacks): void {
    // Stop existing watcher if we're watching a different path
    if (this.currentWatchPath !== specsPath) {
      this.stop();
    }

    this.currentWatchPath = specsPath;
    this.callbacks = callbacks;

    // Watch the specs directory with debouncing
    this.watcher = chokidar.watch(specsPath, {
      persistent: true,
      ignoreInitial: true,
      ignored: /(^|[/\\])\.|node_modules|\.git/,
    });

    this.watcher.on("change", () => this.onFileChanged());
    this.watcher.on("add", () => this.onFileChanged());
    this.watcher.on("unlink", () => this.onFileChanged());
    this.watcher.on("addDir", () => this.onFileChanged());
    this.watcher.on("unlinkDir", () => this.onFileChanged());
  }

  /**
   * Stop watching for changes.
   */
  stop(): void {
    if (this.watcher) {
      void this.watcher.close();
      this.watcher = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.currentWatchPath = null;
  }

  /**
   * Check if currently watching.
   */
  isWatching(): boolean {
    return this.currentWatchPath !== null && this.watcher !== null;
  }

  /**
   * Get the current watch path.
   */
  getWatchPath(): string | null {
    return this.currentWatchPath;
  }

  /**
   * Handle file changes with debouncing.
   */
  private onFileChanged(): void {
    // Clear existing debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Queue next callback with debounce
    this.debounceTimer = setTimeout(() => {
      if (this.callbacks.onSpecsChanged) {
        this.callbacks.onSpecsChanged();
      }

      this.debounceTimer = null;
    }, this.debounceMs);
  }
}
