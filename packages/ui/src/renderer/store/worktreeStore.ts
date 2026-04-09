import { create } from "zustand";

import { ipc } from "../utils/ipc";
import { sendOrThrow } from "../services/ipcClient";

/** Represents a single git worktree discovered on disk. */
export interface WorktreeInfo {
  repoPath: string;
  worktreePath: string;
  branch: string;
  name: string;
  createdAt: number;
}

type WorktreeStoreState = {
  /** All known worktrees across all repos. */
  worktrees: WorktreeInfo[];

  /** Whether we're currently loading. */
  isLoading: boolean;

  /** Last error message, if any. */
  error: string | null;

  /**
   * Fetch worktrees for a specific repo from the daemon.
   * Merges the results into the global list (replaces entries for that repo).
   */
  fetchWorktrees: (repoPath: string) => Promise<void>;

  /**
   * Fetch worktrees for multiple repos at once.
   */
  fetchWorktreesForAll: (repoPaths: string[]) => Promise<void>;

  /**
   * Look up an existing worktree for a given repo + branch combo.
   * Returns the worktree info if found, null otherwise.
   */
  getWorktreeForBranch: (repoPath: string, branch: string) => WorktreeInfo | null;

  /**
   * Add a worktree entry to the store (called after worktree:create succeeds).
   * Deduplicates by worktreePath.
   */
  addWorktree: (entry: WorktreeInfo) => void;
};

export const useWorktreeStore = create<WorktreeStoreState>((set, get) => ({
  worktrees: [],
  isLoading: false,
  error: null,

  async fetchWorktrees(repoPath: string) {
    set({ isLoading: true, error: null });

    try {
      const response = await sendOrThrow({ type: "worktree:list", repoPath });
      set((state) => {
        // Remove stale entries for this repo, then add fresh ones
        const others = state.worktrees.filter((w) => w.repoPath !== repoPath);
        return {
          worktrees: [...others, ...response.worktrees],
          isLoading: false,
        };
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isLoading: false,
      });
    }
  },

  async fetchWorktreesForAll(repoPaths: string[]) {
    set({ isLoading: true, error: null });

    try {
      const allEntries: WorktreeInfo[] = [];

      for (const repoPath of repoPaths) {
        try {
          const response = await sendOrThrow({ type: "worktree:list", repoPath });
          allEntries.push(...response.worktrees);
        } catch {
          // Continue on error for individual repo
        }
      }

      set({ worktrees: allEntries, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isLoading: false,
      });
    }
  },

  getWorktreeForBranch(repoPath: string, branch: string): WorktreeInfo | null {
    const { worktrees } = get();
    return (
      worktrees.find(
        (w) => w.repoPath === repoPath && w.branch === branch,
      ) ?? null
    );
  },

  addWorktree(entry: WorktreeInfo) {
    set((state) => {
      // Deduplicate by worktreePath
      const exists = state.worktrees.some((w) => w.worktreePath === entry.worktreePath);
      if (exists) return state;
      return { worktrees: [...state.worktrees, entry] };
    });
  },
}));
