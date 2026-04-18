import { create } from "zustand";

import type { CommitSummary, CommitFile } from "@magenta/shared/ipc";
import { sendOrThrow } from "../services/ipcClient";

export type HistoryQuery = {
  repoPath: string;
  branch?: string;
  path?: string;
  search?: string;
};

export type HistoryEntry = {
  commits: CommitSummary[];
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
};

export type CommitDetailEntry = {
  commit: CommitSummary;
  files: CommitFile[];
};

const PAGE_SIZE = 100;
const COMMIT_DETAIL_CACHE_LIMIT = 50;

function queryKey(q: HistoryQuery): string {
  return `${q.repoPath}|${q.branch ?? ""}|${q.path ?? ""}|${q.search ?? ""}`;
}

function commitDetailKey(repoPath: string, sha: string): string {
  return `${repoPath}|${sha}`;
}

type GitHistoryStoreState = {
  entries: Map<string, HistoryEntry>;
  /** Query keys that match the currently-displayed repo — lets us evict on repo change. */
  currentKey: string | null;
  selectedSha: Map<string, string | null>; // repoPath -> sha

  /**
   * Commit SHAs are immutable so responses are safe to reuse across clicks.
   * Bounded by FIFO eviction when it exceeds COMMIT_DETAIL_CACHE_LIMIT.
   */
  commitDetailCache: Map<string, CommitDetailEntry>;

  loadFirstPage: (q: HistoryQuery) => Promise<void>;
  loadMore: (q: HistoryQuery) => Promise<void>;
  refresh: (q: HistoryQuery) => Promise<void>;
  selectCommit: (repoPath: string, sha: string | null) => void;
  /** Fetch (or return cached) commit detail. */
  getCommitDetail: (repoPath: string, sha: string) => Promise<CommitDetailEntry>;
};

/**
 * In-flight dedup + generation tracking live outside the zustand store
 * because they're implementation detail the UI should not re-render on.
 */
const inflightFirstPage = new Map<string, Promise<void>>();
const inflightLoadMore = new Map<string, Promise<void>>();
const inflightCommitDetail = new Map<string, Promise<CommitDetailEntry>>();
const queryGeneration = new Map<string, number>();

function bumpGeneration(key: string): number {
  const next = (queryGeneration.get(key) ?? 0) + 1;
  queryGeneration.set(key, next);
  return next;
}

function isStale(key: string, gen: number): boolean {
  return (queryGeneration.get(key) ?? 0) !== gen;
}

export const useGitHistoryStore = create<GitHistoryStoreState>((set, get) => ({
  entries: new Map(),
  currentKey: null,
  selectedSha: new Map(),
  commitDetailCache: new Map(),

  async loadFirstPage(q) {
    const key = queryKey(q);
    const existing = get().entries.get(key);
    if (existing && existing.commits.length > 0 && !existing.error) {
      set({ currentKey: key });
      return;
    }
    // Dedup concurrent callers.
    const inflight = inflightFirstPage.get(key);
    if (inflight) {
      set({ currentKey: key });
      return inflight;
    }

    const gen = bumpGeneration(key);
    const next = new Map(get().entries);
    next.set(key, { commits: [], hasMore: false, isLoading: true, error: null });
    set({ entries: next, currentKey: key });

    const promise = (async () => {
      try {
        const res = await sendOrThrow({
          type: "git:log",
          repoPath: q.repoPath,
          branch: q.branch,
          path: q.path,
          search: q.search,
          limit: PAGE_SIZE,
          skip: 0,
        });
        if (isStale(key, gen)) return;
        const after = new Map(get().entries);
        after.set(key, {
          commits: res.commits,
          hasMore: res.hasMore,
          isLoading: false,
          error: null,
        });
        set({ entries: after });
      } catch (err) {
        if (isStale(key, gen)) return;
        const after = new Map(get().entries);
        after.set(key, {
          commits: [],
          hasMore: false,
          isLoading: false,
          error: err instanceof Error ? err.message : String(err),
        });
        set({ entries: after });
      } finally {
        inflightFirstPage.delete(key);
      }
    })();
    inflightFirstPage.set(key, promise);
    return promise;
  },

  async loadMore(q) {
    const key = queryKey(q);
    const current = get().entries.get(key);
    if (!current || current.isLoading || !current.hasMore) return;
    const inflight = inflightLoadMore.get(key);
    if (inflight) return inflight;

    const gen = queryGeneration.get(key) ?? 0;
    const next = new Map(get().entries);
    next.set(key, { ...current, isLoading: true });
    set({ entries: next });

    const promise = (async () => {
      try {
        const res = await sendOrThrow({
          type: "git:log",
          repoPath: q.repoPath,
          branch: q.branch,
          path: q.path,
          search: q.search,
          limit: PAGE_SIZE,
          skip: current.commits.length,
        });
        if (isStale(key, gen)) return;
        const after = new Map(get().entries);
        const latest = after.get(key);
        const base = latest?.commits ?? current.commits;
        const merged = [...base, ...res.commits];
        after.set(key, {
          commits: merged,
          hasMore: res.hasMore,
          isLoading: false,
          error: null,
        });
        set({ entries: after });
      } catch (err) {
        if (isStale(key, gen)) return;
        const after = new Map(get().entries);
        const latest = after.get(key) ?? current;
        after.set(key, {
          ...latest,
          isLoading: false,
          error: err instanceof Error ? err.message : String(err),
        });
        set({ entries: after });
      } finally {
        inflightLoadMore.delete(key);
      }
    })();
    inflightLoadMore.set(key, promise);
    return promise;
  },

  async refresh(q) {
    const key = queryKey(q);
    bumpGeneration(key); // invalidate any outstanding load
    inflightFirstPage.delete(key);
    inflightLoadMore.delete(key);
    const next = new Map(get().entries);
    next.delete(key);
    set({ entries: next });
    await get().loadFirstPage(q);
  },

  selectCommit(repoPath, sha) {
    const next = new Map(get().selectedSha);
    next.set(repoPath, sha);
    set({ selectedSha: next });
  },

  async getCommitDetail(repoPath, sha) {
    const key = commitDetailKey(repoPath, sha);
    const cached = get().commitDetailCache.get(key);
    if (cached) return cached;
    const inflight = inflightCommitDetail.get(key);
    if (inflight) return inflight;

    const promise = (async () => {
      const res = await sendOrThrow({ type: "git:commit-detail", repoPath, sha });
      const entry: CommitDetailEntry = { commit: res.commit, files: res.files };
      const cache = new Map(get().commitDetailCache);
      // FIFO cap — drop the oldest entry when we'd exceed the limit.
      if (cache.size >= COMMIT_DETAIL_CACHE_LIMIT) {
        const oldest = cache.keys().next();
        if (!oldest.done) cache.delete(oldest.value);
      }
      cache.set(key, entry);
      set({ commitDetailCache: cache });
      return entry;
    })();
    inflightCommitDetail.set(key, promise);
    try {
      return await promise;
    } finally {
      inflightCommitDetail.delete(key);
    }
  },
}));

export function historyKey(q: HistoryQuery): string {
  return queryKey(q);
}
