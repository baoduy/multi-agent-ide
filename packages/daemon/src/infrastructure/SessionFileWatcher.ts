import fs from "node:fs";
import path from "node:path";
import type { SessionSyncApplicationService } from "../application/SessionSyncApplicationService";

const TAG = "[SessionFileWatcher]";
const DEBOUNCE_MS = 300;

/**
 * Watches the Claude Code projects directory and the Copilot CLI session-state
 * directory for JSONL appends. When a session file changes, schedules a
 * debounced single-file re-sync via `SessionSyncApplicationService.syncSingleFile`,
 * which in turn emits `synced-session:sync:complete` so the UI can refresh
 * the live activity badge.
 *
 * Macro design:
 *   - One `fs.watch` per provider directory (recursive). On macOS this uses
 *     FSEvents under the hood and is cheap.
 *   - Per-file debounce via a `Map<string, NodeJS.Timeout>` so a burst of
 *     appends collapses into a single re-sync.
 *   - We do NOT replace the recurring 5-min sync; this watcher is additive
 *     and `fs.watch` is known to be best-effort on some volumes.
 */
export class SessionFileWatcher {
  private claudeWatcher: fs.FSWatcher | null = null;
  private copilotWatcher: fs.FSWatcher | null = null;
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private isRunning = false;

  constructor(
    private readonly syncService: SessionSyncApplicationService,
    private readonly claudeProjectsDir: string,
    private readonly copilotStateDir: string,
  ) {}

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.claudeWatcher = this.tryWatch(this.claudeProjectsDir, (filename) => {
      if (!filename || !filename.endsWith(".jsonl")) return;
      // Skip subagent files — they live under <sessionId>/subagents/*.jsonl
      if (filename.includes(`${path.sep}subagents${path.sep}`)) return;
      const absPath = path.join(this.claudeProjectsDir, filename);
      this.scheduleSync(absPath);
    });

    this.copilotWatcher = this.tryWatch(this.copilotStateDir, (filename) => {
      if (!filename) return;
      // Only react to events.jsonl (live event stream) or workspace.yaml (binding changes)
      const base = path.basename(filename);
      if (base !== "events.jsonl" && base !== "workspace.yaml") return;
      const absPath = path.join(this.copilotStateDir, filename);
      this.scheduleSync(absPath);
    });
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.claudeWatcher) {
      try {
        this.claudeWatcher.close();
      } catch {
        // ignore
      }
      this.claudeWatcher = null;
    }
    if (this.copilotWatcher) {
      try {
        this.copilotWatcher.close();
      } catch {
        // ignore
      }
      this.copilotWatcher = null;
    }

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  private tryWatch(
    dir: string,
    onFile: (filename: string | null) => void,
  ): fs.FSWatcher | null {
    if (!fs.existsSync(dir)) {
      console.log(`${TAG} Directory not found, skipping watch: ${dir}`);
      return null;
    }
    try {
      const watcher = fs.watch(dir, { recursive: true }, (_event, filename) => {
        // filename is `string | null` when the watcher is opened with the default
        // (utf-8) encoding, which is what we get here. Normalize defensively.
        const name = typeof filename === "string" ? filename : null;
        onFile(name);
      });
      watcher.on("error", (err) => {
        console.error(`${TAG} watcher error on ${dir}:`, err);
      });
      console.log(`${TAG} Watching ${dir}`);
      return watcher;
    } catch (err) {
      console.error(`${TAG} Failed to watch ${dir}:`, err);
      return null;
    }
  }

  private scheduleSync(absPath: string): void {
    const existing = this.debounceTimers.get(absPath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(absPath);
      void this.syncService.syncSingleFile(absPath).catch((err) => {
        console.error(`${TAG} syncSingleFile failed for ${absPath}:`, err);
      });
    }, DEBOUNCE_MS);

    this.debounceTimers.set(absPath, timer);
  }
}
