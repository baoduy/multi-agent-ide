/**
 * usePersistedSnapshots — localStorage-backed per-repo and per-spec tab snapshots.
 *
 * Replaces the in-memory `repoSnapshots` and `tabSnapshots` Maps in Main.tsx
 * so that open file tabs, active tab, and selected spec survive app restarts.
 *
 * Storage layout:
 *   magenta:repo-snapshot:{repoPath}       → RepoSnapshotData
 *   magenta:tab-snapshot:{repoPath::spec}   → TabSnapshotData
 */

import { useCallback, useRef } from "react";
import { scopedStore } from "../services/localStorage";
import type { ActiveTab, OpenFileTab } from "../components/main/TabBar";

/* ── Persisted shapes (JSON-safe versions of the runtime types) ── */

export type TabSnapshotData = {
  openFiles: OpenFileTab[];
  activeTab: ActiveTab;
};

export type RepoSnapshotData = {
  selectedSpecPath: string | null;
  mainTab: ActiveTab;
};

/* ── Scoped stores ── */

const repoSnapshotStore = scopedStore<RepoSnapshotData>({
  prefix: "magenta:repo-snapshot",
  fallback: { selectedSpecPath: null, mainTab: { kind: "builtin", id: "specs" } },
  debounceMs: 500,
});

const tabSnapshotStore = scopedStore<TabSnapshotData>({
  prefix: "magenta:tab-snapshot",
  fallback: { openFiles: [], activeTab: { kind: "builtin", id: "specs" } },
  debounceMs: 500,
});

/* ── Composite key helper ── */

function tabKey(repoPath: string | null, specPath: string | null): string | null {
  if (!repoPath) return null;
  return specPath ? `${repoPath}::${specPath}` : repoPath;
}

/* ── Hook ── */

export type PersistedSnapshots = {
  /** Save the current repo context before switching away. */
  saveRepoSnapshot: (repoPath: string, data: RepoSnapshotData) => void;
  /** Restore saved state for a repo (returns null if never visited). */
  getRepoSnapshot: (repoPath: string) => RepoSnapshotData | null;
  /** Save per-spec tab state. */
  saveTabSnapshot: (repoPath: string | null, specPath: string | null, data: TabSnapshotData) => void;
  /** Restore per-spec tab state. */
  getTabSnapshot: (repoPath: string | null, specPath: string | null) => TabSnapshotData | null;
  /** Flush all pending writes immediately (call on shutdown). */
  flush: () => void;
};

/**
 * Returns stable callbacks for reading/writing snapshots.
 * Internally uses scopedStore which lazily creates localStorage entries.
 */
export function usePersistedSnapshots(): PersistedSnapshots {
  // Track which repos have been visited so we can distinguish
  // "never visited" from "visited but using defaults".
  const visitedRepos = useRef(new Set<string>());

  const saveRepoSnapshot = useCallback((repoPath: string, data: RepoSnapshotData) => {
    visitedRepos.current.add(repoPath);
    repoSnapshotStore.set(repoPath, data);
  }, []);

  const getRepoSnapshot = useCallback((repoPath: string): RepoSnapshotData | null => {
    // Check localStorage directly — if key exists, repo was previously visited
    const stored = repoSnapshotStore.get(repoPath);
    // If selectedSpecPath is null and mainTab is default, could be "never visited"
    // but also could be a legit saved state. We check visitedRepos or localStorage presence.
    if (visitedRepos.current.has(repoPath)) {
      return stored;
    }
    // Check if there's actually something in localStorage for this repo
    try {
      const raw = globalThis.localStorage?.getItem(`magenta:repo-snapshot:${repoPath}`);
      if (raw !== null) {
        visitedRepos.current.add(repoPath);
        return stored;
      }
    } catch { /* ignore */ }
    return null;
  }, []);

  const saveTabSnapshot = useCallback((repoPath: string | null, specPath: string | null, data: TabSnapshotData) => {
    const key = tabKey(repoPath, specPath);
    if (key) tabSnapshotStore.set(key, data);
  }, []);

  const getTabSnapshot = useCallback((repoPath: string | null, specPath: string | null): TabSnapshotData | null => {
    const key = tabKey(repoPath, specPath);
    if (!key) return null;
    try {
      const raw = globalThis.localStorage?.getItem(`magenta:tab-snapshot:${key}`);
      if (raw !== null) {
        return tabSnapshotStore.get(key);
      }
    } catch { /* ignore */ }
    return null;
  }, []);

  const flush = useCallback(() => {
    repoSnapshotStore.flush();
    tabSnapshotStore.flush();
  }, []);

  return { saveRepoSnapshot, getRepoSnapshot, saveTabSnapshot, getTabSnapshot, flush };
}
