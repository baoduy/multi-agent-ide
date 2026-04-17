import { create } from "zustand";

import type { CommitSummary } from "@magenta/shared/ipc";
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

const PAGE_SIZE = 100;

function queryKey(q: HistoryQuery): string {
  return `${q.repoPath}|${q.branch ?? ""}|${q.path ?? ""}|${q.search ?? ""}`;
}

type GitHistoryStoreState = {
  entries: Map<string, HistoryEntry>;
  /** Query keys that match the currently-displayed repo — lets us evict on repo change. */
  currentKey: string | null;
  selectedSha: Map<string, string | null>; // repoPath -> sha

  loadFirstPage: (q: HistoryQuery) => Promise<void>;
  loadMore: (q: HistoryQuery) => Promise<void>;
  refresh: (q: HistoryQuery) => Promise<void>;
  selectCommit: (repoPath: string, sha: string | null) => void;
};

export const useGitHistoryStore = create<GitHistoryStoreState>((set, get) => ({
  entries: new Map(),
  currentKey: null,
  selectedSha: new Map(),

  async loadFirstPage(q) {
    const key = queryKey(q);
    const existing = get().entries.get(key);
    if (existing && existing.commits.length > 0 && !existing.error) {
      set({ currentKey: key });
      return;
    }
    const next = new Map(get().entries);
    next.set(key, { commits: [], hasMore: false, isLoading: true, error: null });
    set({ entries: next, currentKey: key });

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
      const after = new Map(get().entries);
      after.set(key, {
        commits: res.commits,
        hasMore: res.hasMore,
        isLoading: false,
        error: null,
      });
      set({ entries: after });
    } catch (err) {
      const after = new Map(get().entries);
      after.set(key, {
        commits: [],
        hasMore: false,
        isLoading: false,
        error: err instanceof Error ? err.message : String(err),
      });
      set({ entries: after });
    }
  },

  async loadMore(q) {
    const key = queryKey(q);
    const current = get().entries.get(key);
    if (!current || current.isLoading || !current.hasMore) return;
    const next = new Map(get().entries);
    next.set(key, { ...current, isLoading: true });
    set({ entries: next });

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
      const after = new Map(get().entries);
      const merged = [...current.commits, ...res.commits];
      after.set(key, {
        commits: merged,
        hasMore: res.hasMore,
        isLoading: false,
        error: null,
      });
      set({ entries: after });
    } catch (err) {
      const after = new Map(get().entries);
      after.set(key, {
        ...current,
        isLoading: false,
        error: err instanceof Error ? err.message : String(err),
      });
      set({ entries: after });
    }
  },

  async refresh(q) {
    const key = queryKey(q);
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
}));

export function historyKey(q: HistoryQuery): string {
  return queryKey(q);
}
