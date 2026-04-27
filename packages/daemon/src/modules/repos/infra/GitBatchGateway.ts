import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { AppError } from "../../../core/errors/AppError";
import { LruCache } from "../../../core/utils/LruCache";

/**
 * GitBatchGateway owns one long-lived `git cat-file --batch` process per repo.
 *
 * Spawning `git` for every blob read costs 20–100 ms on typical systems — the
 * dominant cost on the file/diff hot path. A persistent batch process turns
 * those reads into ~1–5 ms stdin/stdout round-trips.
 *
 * Lifecycle:
 *   - Lazy start on first request per repo.
 *   - Idle-shutdown after 5 minutes of no use.
 *   - On stderr output or unexpected exit, the process is torn down and the
 *     next request respawns a fresh one.
 *   - Requests per repo are serialized via a FIFO queue; the git binary does
 *     not interleave responses, so we can't pipeline.
 */

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const READ_TIMEOUT_MS = 15_000;
const MAX_PATH_BYTES = 4096;

function resolveBinary(): string {
  return process.env["MAGENTA_GIT_PATH"] || "git";
}

type Resolver = {
  resolve: (value: { content: Buffer; sha: string; type: string; size: number } | null) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
};

class RepoBatchProcess {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private readonly queue: Resolver[] = [];
  private readBuf: Buffer = Buffer.alloc(0);
  private idleTimer: NodeJS.Timeout | null = null;
  private disposed = false;

  constructor(private readonly repoPath: string) {}

  private spawn(): void {
    if (this.proc) return;
    const proc = spawn(resolveBinary(), ["cat-file", "--batch=%(objectname) %(objecttype) %(objectsize)"], {
      cwd: this.repoPath,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    this.proc = proc;
    proc.stdout.on("data", (chunk: Buffer) => this.onStdout(chunk));
    proc.stderr.on("data", (chunk: Buffer) => {
      // A stderr write from `git cat-file --batch` is almost always fatal.
      this.fail(new AppError("GIT_ERROR", `git cat-file: ${chunk.toString("utf8").trim()}`));
    });
    proc.on("exit", (code, signal) => {
      if (!this.disposed) {
        const reason = signal ? `signal ${signal}` : `exit ${code ?? 0}`;
        this.fail(new AppError("GIT_ERROR", `git cat-file terminated: ${reason}`));
      }
    });
    proc.on("error", (err) => this.fail(new AppError("GIT_ERROR", `git cat-file spawn failed: ${err.message}`)));
  }

  /**
   * Route incoming stdout into the head-of-queue resolver.
   *
   * The protocol per request is:
   *   <sha> <type> <size>\n     (or "<input> missing\n" for unknown refs)
   *   <bytes...size>\n
   *
   * Because we serialize requests we never need to correlate by ID.
   */
  private onStdout(chunk: Buffer): void {
    this.readBuf = this.readBuf.length === 0 ? chunk : Buffer.concat([this.readBuf, chunk]);

    while (this.queue.length > 0) {
      const nlIdx = this.readBuf.indexOf(0x0a);
      if (nlIdx < 0) return;
      const header = this.readBuf.slice(0, nlIdx).toString("utf8");

      // "missing" response — consume header only and resolve with null.
      if (header.endsWith(" missing")) {
        const next = this.queue.shift();
        this.readBuf = this.readBuf.slice(nlIdx + 1);
        if (next) {
          clearTimeout(next.timer);
          next.resolve(null);
        }
        continue;
      }

      const parts = header.split(" ");
      if (parts.length !== 3) {
        const next = this.queue.shift();
        this.readBuf = Buffer.alloc(0);
        if (next) {
          clearTimeout(next.timer);
          next.reject(new AppError("GIT_ERROR", `git cat-file unexpected header: ${header}`));
        }
        continue;
      }
      const [sha, type, sizeStr] = parts;
      const size = parseInt(sizeStr!, 10);
      if (!Number.isFinite(size) || size < 0) {
        const next = this.queue.shift();
        this.readBuf = Buffer.alloc(0);
        if (next) {
          clearTimeout(next.timer);
          next.reject(new AppError("GIT_ERROR", `git cat-file invalid size: ${sizeStr}`));
        }
        continue;
      }

      // Need header + size bytes + trailing newline.
      const need = nlIdx + 1 + size + 1;
      if (this.readBuf.length < need) return;

      const content = this.readBuf.slice(nlIdx + 1, nlIdx + 1 + size);
      this.readBuf = this.readBuf.slice(need);

      const next = this.queue.shift();
      if (next) {
        clearTimeout(next.timer);
        next.resolve({ content, sha: sha!, type: type!, size });
      }
    }
  }

  async request(spec: string): Promise<{ content: Buffer; sha: string; type: string; size: number } | null> {
    if (this.disposed) throw new AppError("GIT_ERROR", "GitBatchGateway disposed");
    if (Buffer.byteLength(spec) > MAX_PATH_BYTES) {
      throw new AppError("VALIDATION_ERROR", "cat-file spec exceeds max path length");
    }
    this.armIdleTimer();
    this.spawn();
    const proc = this.proc;
    if (!proc) throw new AppError("GIT_ERROR", "git cat-file not running");

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Head-of-queue stall — tear down so subsequent calls get a fresh proc.
        const idx = this.queue.findIndex((r) => r.timer === timer);
        if (idx >= 0) this.queue.splice(idx, 1);
        reject(new AppError("GIT_ERROR", "git cat-file timed out"));
        this.recycle();
      }, READ_TIMEOUT_MS);
      this.queue.push({ resolve, reject, timer });
      proc.stdin.write(spec + "\n");
    });
  }

  private armIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.queue.length === 0) this.recycle();
    }, IDLE_TIMEOUT_MS);
  }

  private recycle(): void {
    const proc = this.proc;
    this.proc = null;
    this.readBuf = Buffer.alloc(0);
    if (proc) {
      try { proc.stdin.end(); } catch { /* noop */ }
      try { proc.kill(); } catch { /* noop */ }
    }
  }

  private fail(err: Error): void {
    const pending = this.queue.splice(0, this.queue.length);
    for (const p of pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.recycle();
  }

  dispose(): void {
    this.disposed = true;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.fail(new AppError("GIT_ERROR", "GitBatchGateway disposed"));
  }
}

export type BlobResult = {
  content: Buffer;
  isBinary: boolean;
  size: number;
  /** Commit/tree-ish SHA of the resolved object. Empty when the ref did not resolve. */
  sha: string;
};

/** Quick binary-sniff over the first 8 KB; identical heuristic to GitHistoryGateway. */
function detectBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8192);
  if (n === 0) return false;
  let control = 0;
  for (let i = 0; i < n; i++) {
    const c = buf[i]!;
    if (c === 0) return true;
    if (c < 9 || (c > 13 && c < 32)) control++;
  }
  return control / n > 0.05;
}

export class GitBatchGateway {
  private readonly procs = new Map<string, RepoBatchProcess>();
  private readonly blobCache: LruCache<string, BlobResult>;
  /** Cache bypass threshold — large blobs fetch fresh every time. */
  private static readonly BLOB_CACHE_MAX_BYTES_PER_ENTRY = 2 * 1024 * 1024;

  constructor(options: { blobCache?: LruCache<string, BlobResult> } = {}) {
    this.blobCache =
      options.blobCache ??
      new LruCache<string, BlobResult>({ maxEntries: 2000, maxBytes: 128 * 1024 * 1024 });
  }

  private procFor(repoPath: string): RepoBatchProcess {
    const key = path.resolve(repoPath);
    let proc = this.procs.get(key);
    if (!proc) {
      proc = new RepoBatchProcess(key);
      this.procs.set(key, proc);
    }
    return proc;
  }

  /**
   * Read a blob (file content) at a given ref. Returns null when the path
   * doesn't exist at that ref — used by diff to render add/delete cases.
   */
  async getBlob(repoPath: string, ref: string, relativePath: string): Promise<BlobResult | null> {
    const cacheKey = `blob|${path.resolve(repoPath)}|${ref}|${relativePath}`;
    const hit = this.blobCache.get(cacheKey);
    if (hit) return hit;

    const spec = `${ref}:${relativePath}`;
    const res = await this.procFor(repoPath).request(spec);
    if (!res) return null;
    if (res.type !== "blob") {
      // Only blobs are meaningful here — trees/commits would require different handling.
      return null;
    }
    const isBinary = detectBinary(res.content);
    const result: BlobResult = {
      content: res.content,
      isBinary,
      size: res.size,
      sha: res.sha,
    };
    if (res.size <= GitBatchGateway.BLOB_CACHE_MAX_BYTES_PER_ENTRY) {
      this.blobCache.set(cacheKey, result, res.size);
    }
    return result;
  }

  /**
   * Invalidate every cached blob whose key starts with the given repo path.
   * Called by the repo watcher whenever the working tree or refs change.
   */
  invalidateRepo(repoPath: string): void {
    const prefix = `blob|${path.resolve(repoPath)}|`;
    this.blobCache.invalidateWhere((k) => k.startsWith(prefix));
  }

  /** Dispose a single repo's process (e.g. when the repo is removed). */
  disposeRepo(repoPath: string): void {
    const key = path.resolve(repoPath);
    const proc = this.procs.get(key);
    if (proc) {
      proc.dispose();
      this.procs.delete(key);
    }
    this.invalidateRepo(repoPath);
  }

  /** Dispose all processes — called during daemon shutdown. */
  dispose(): void {
    for (const proc of this.procs.values()) proc.dispose();
    this.procs.clear();
    this.blobCache.clear();
  }
}
