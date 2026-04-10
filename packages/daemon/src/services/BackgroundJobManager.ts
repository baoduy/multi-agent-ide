import { EventEmitter } from "node:events";

const TAG = "[JobManager]";

export type JobStatus = "queued" | "running" | "completed" | "failed";

export interface JobInfo {
  name: string;
  status: JobStatus;
  queuedAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

interface QueuedJob {
  name: string;
  action: () => Promise<void>;
  queuedAt: number;
}

/**
 * Application-level background job manager.
 *
 * Features:
 * - Named job deduplication: enqueueing a job whose name is already
 *   queued or running is silently ignored (no duplicate work).
 * - Sequential execution from a FIFO queue in a microtask-separate
 *   "thread" (the queue drains itself via chained Promises so
 *   the caller is never blocked).
 * - Lifecycle events: `job:started`, `job:completed`, `job:failed`,
 *   `jobs:idle` (queue empty and nothing running).
 *
 * Usage:
 *   const mgr = new BackgroundJobManager();
 *   mgr.enqueue("spec-refresh:/repo/path", async () => { ... });
 *   mgr.enqueue("repo-scan", async () => { ... });
 *   // Second enqueue with same name is a no-op while first is pending/running.
 */
export class BackgroundJobManager extends EventEmitter {
  /** Jobs waiting to run, in FIFO order. */
  private readonly queue: QueuedJob[] = [];

  /** Names of jobs that are currently queued (waiting) or running. */
  private readonly activeNames = new Set<string>();

  /** Currently running job info (null when idle). */
  private runningJob: JobInfo | null = null;

  /** Whether the drain loop is active. */
  private draining = false;

  /**
   * Enqueue a named background job.
   *
   * If a job with the same `name` is already queued or running,
   * the call is silently ignored (returns false).
   *
   * @returns true if the job was enqueued, false if deduplicated away.
   */
  enqueue(name: string, action: () => Promise<void>): boolean {
    if (this.activeNames.has(name)) {
      console.log(`${TAG} Job "${name}" already active — skipping duplicate`);
      return false;
    }

    console.log(`${TAG} Enqueuing job "${name}"`);
    this.activeNames.add(name);
    this.queue.push({ name, action, queuedAt: Date.now() });

    // Kick the drain loop if it's not already running
    if (!this.draining) {
      void this.drain();
    }

    return true;
  }

  /**
   * Returns true if a job with the given name is queued or running.
   */
  has(name: string): boolean {
    return this.activeNames.has(name);
  }

  /**
   * Returns info about the currently running job, or null.
   */
  getRunning(): JobInfo | null {
    return this.runningJob ? { ...this.runningJob } : null;
  }

  /**
   * Returns all queued (waiting) job names.
   */
  getQueuedNames(): string[] {
    return this.queue.map((j) => j.name);
  }

  /**
   * Returns the number of jobs currently queued + running.
   */
  get size(): number {
    return this.queue.length + (this.runningJob ? 1 : 0);
  }

  /* ═══════════════════════════════════════════════════════
     Internal drain loop
     ═══════════════════════════════════════════════════════ */

  private async drain(): Promise<void> {
    this.draining = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      const info: JobInfo = {
        name: job.name,
        status: "running",
        queuedAt: job.queuedAt,
        startedAt: Date.now(),
      };
      this.runningJob = info;

      console.log(`${TAG} Running job "${job.name}"`);
      this.emit("job:started", { name: job.name });

      try {
        await job.action();

        info.status = "completed";
        info.completedAt = Date.now();
        const elapsed = info.completedAt - info.startedAt!;
        console.log(`${TAG} Job "${job.name}" completed in ${elapsed}ms`);
        this.emit("job:completed", { name: job.name, elapsed });
      } catch (error) {
        info.status = "failed";
        info.completedAt = Date.now();
        info.error = error instanceof Error ? error.message : String(error);
        console.error(`${TAG} Job "${job.name}" failed:`, info.error);
        this.emit("job:failed", { name: job.name, error: info.error });
      } finally {
        this.activeNames.delete(job.name);
        this.runningJob = null;
      }
    }

    this.draining = false;
    console.log(`${TAG} Queue drained — idle`);
    this.emit("jobs:idle");
  }
}
