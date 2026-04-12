import { create } from "zustand";

import type { Repository } from "@magenta/shared/models";
import { ipc } from "../utils/ipc";
import { createSubscriptionInitializer } from "../services/createSubscriptionInitializer";

type ScanProgress = {
  scanned: number;
  total: number;
  currentDir: string;
};

type RepoStoreState = {
  repos: Repository[];
  activeRepoPath: string | null;
  pinnedPaths: Set<string>;
  isScanning: boolean;
  scanProgress: ScanProgress | null;
  error: string | null;
  subscriptionsReady: boolean;
  searchQuery: string;
  setRepos: (repos: Repository[]) => void;
  setActiveRepoPath: (path: string | null) => void;
  togglePin: (repoPath: string) => void;
  isPinned: (repoPath: string) => boolean;
  fetchRepos: () => Promise<void>;
  triggerScan: () => Promise<void>;
  initializeSubscriptions: () => void;
  setSearchQuery: (query: string) => void;
};

// Persist pinned repos to a simple JSON file via the daemon config,
// but for now use an in-memory set (survives within session).
function loadPinnedPaths(): Set<string> {
  try {
    const stored = globalThis.localStorage?.getItem("magenta:pinned-repos");
    if (stored) {
      return new Set(JSON.parse(stored) as string[]);
    }
  } catch {
    // Ignore — localStorage may not exist in Electron
  }
  return new Set();
}

function savePinnedPaths(paths: Set<string>): void {
  try {
    globalThis.localStorage?.setItem("magenta:pinned-repos", JSON.stringify([...paths]));
  } catch {
    // Ignore
  }
}

export const useRepoStore = create<RepoStoreState>((set, get) => ({
  repos: [],
  activeRepoPath: null,
  pinnedPaths: loadPinnedPaths(),
  isScanning: false,
  scanProgress: null,
  error: null,
  subscriptionsReady: false,
  searchQuery: "",
  setRepos: (repos) => set({ repos }),
  setActiveRepoPath(path: string | null) {
    set({ activeRepoPath: path });
  },
  togglePin(repoPath: string) {
    const current = get().pinnedPaths;
    const next = new Set(current);
    if (next.has(repoPath)) {
      next.delete(repoPath);
    } else {
      next.add(repoPath);
    }
    savePinnedPaths(next);
    set({ pinnedPaths: next });
  },
  isPinned(repoPath: string) {
    return get().pinnedPaths.has(repoPath);
  },
  async fetchRepos() {
    const response = await ipc.send({ type: "repo:list" });

    if (response.type === "repo:list:result") {
      set({ repos: response.repos, error: null });
      return;
    }

    if (response.type === "error") {
      set({ error: response.message });
    }
  },
  setSearchQuery(query: string) {
    set({ searchQuery: query });
  },
  async triggerScan() {
    set({ isScanning: true, scanProgress: null, error: null });
    const response = await ipc.send({ type: "repo:scan" });

    if (response.type === "error") {
      set({ isScanning: false, error: response.message });
    }
  },
  initializeSubscriptions: createSubscriptionInitializer(get, set, () => {
    ipc.on("repo:scan:started", () => {
      set({ isScanning: true, scanProgress: { scanned: 0, total: 0, currentDir: "Starting scan" } });
    });

    ipc.on("repo:scan:progress", (payload) => {
      set({
        isScanning: true,
        scanProgress: {
          scanned: payload.scanned,
          total: payload.total,
          currentDir: payload.currentDir,
        },
      });
    });

    ipc.on("repo:scan:complete", (payload) => {
      set({
        repos: payload.repos,
        isScanning: false,
        scanProgress: null,
      });
    });
  }),
}));
