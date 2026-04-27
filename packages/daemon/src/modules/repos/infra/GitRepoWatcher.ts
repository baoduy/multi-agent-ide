import chokidar, { type FSWatcher } from "chokidar";
import path from "node:path";
import fs from "node:fs";
import type { IPCBridge } from "../../../core/ipc/IPCBridge";
import type { GitBatchGateway } from "./GitBatchGateway";
import type { LogResult, CommitDetailResult } from "./GitHistoryGateway";
import type { LruCache } from "../../../core/utils/LruCache";

const TAG = "[GitRepoWatcher]";
const DEBOUNCE_MS = 150;

export type GitChangeKind = "index" | "ref" | "head";

type PendingEvent = {
  kinds: Set<GitChangeKind>;
  timer: NodeJS.Timeout;
};

/**
 * Watches the `.git` directory of each open repo and fires a debounced
 * `git:repo:changed` IPC event the moment the working tree or refs change.
 *
 * This replaces the renderer's 15-second status poll with push-based
 * updates that land within ~150 ms of any index write, while also invalidating
 * every stale daemon-side cache that depended on the old state.
 *
 * Watched files per repo:
 *   - `.git/index`         → working-tree changes (add/stage/commit)
 *   - `.git/HEAD`          → branch switch, detached HEAD moves
 *   - `.git/refs/**`       → branch creates/deletes/fast-forwards
 *   - `.git/packed-refs`   → fetch/pull packs refs down
 *
 * Callers register a repo lazily (first `git:status` / `git:log` per repo)
 * via `ensureWatching(repoPath)`. Watchers are disposed together on daemon
 * shutdown.
 */
export class GitRepoWatcher {
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly pending = new Map<string, PendingEvent>();

  constructor(
    private readonly bridge: IPCBridge,
    private readonly batchGateway: GitBatchGateway,
    private readonly caches: {
      logCache: LruCache<string, LogResult>;
      commitDetailCache: LruCache<string, CommitDetailResult>;
    },
  ) {}

  ensureWatching(repoPath: string): void {
    const absRepo = path.resolve(repoPath);
    if (this.watchers.has(absRepo)) return;
    const gitDir = path.join(absRepo, ".git");
    if (!fs.existsSync(gitDir)) return; // not a git repo — silent no-op

    const watcher = chokidar.watch(
      [
        path.join(gitDir, "index"),
        path.join(gitDir, "HEAD"),
        path.join(gitDir, "packed-refs"),
        path.join(gitDir, "refs"),
      ],
      {
        ignoreInitial: true,
        // `.git/index.lock` and `.git/refs/heads/<branch>.lock` appear during
        // writes — dropping them keeps us from broadcasting two events per
        // write (once on lock create, once on rename into place).
        ignored: /\.lock$/,
        depth: 10,
      },
    );

    const onChange = (filePath: string) => {
      const rel = path.relative(gitDir, filePath);
      if (!rel || rel.startsWith("..")) return;
      let kind: GitChangeKind;
      if (rel === "index") kind = "index";
      else if (rel === "HEAD") kind = "head";
      else kind = "ref";
      this.schedule(absRepo, kind);
    };

    watcher.on("add", onChange);
    watcher.on("change", onChange);
    watcher.on("unlink", onChange);
    watcher.on("error", (err) => {
      console.error(`${TAG} watcher error on ${absRepo}:`, err);
    });

    this.watchers.set(absRepo, watcher);
  }

  unwatch(repoPath: string): void {
    const absRepo = path.resolve(repoPath);
    const watcher = this.watchers.get(absRepo);
    if (watcher) {
      void watcher.close();
      this.watchers.delete(absRepo);
    }
    const pending = this.pending.get(absRepo);
    if (pending) {
      clearTimeout(pending.timer);
      this.pending.delete(absRepo);
    }
  }

  stop(): void {
    for (const w of this.watchers.values()) void w.close();
    this.watchers.clear();
    for (const p of this.pending.values()) clearTimeout(p.timer);
    this.pending.clear();
  }

  private schedule(absRepo: string, kind: GitChangeKind): void {
    const existing = this.pending.get(absRepo);
    if (existing) {
      existing.kinds.add(kind);
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => this.flush(absRepo), DEBOUNCE_MS);
      return;
    }
    const entry: PendingEvent = {
      kinds: new Set<GitChangeKind>([kind]),
      timer: setTimeout(() => this.flush(absRepo), DEBOUNCE_MS),
    };
    this.pending.set(absRepo, entry);
  }

  private flush(absRepo: string): void {
    const entry = this.pending.get(absRepo);
    if (!entry) return;
    this.pending.delete(absRepo);
    const kinds = Array.from(entry.kinds);

    // Invalidate daemon-side caches proactively. Commit-detail is keyed by
    // SHA and stays valid; log cache depends on refs moving, and blob cache
    // keyed on branch/HEAD refs becomes stale on index writes too.
    this.caches.logCache.invalidateWhere((k) => k.startsWith(`log|${absRepo}|`));
    this.batchGateway.invalidateRepo(absRepo);

    this.bridge.emit({ type: "git:repo:changed", repoPath: absRepo, kinds });
  }
}
