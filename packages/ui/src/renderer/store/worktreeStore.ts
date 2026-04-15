import { create } from "zustand";

import { ipc } from "../utils/ipc";
import { sendOrThrow } from "../services/ipcClient";
import { getErrorMessage } from "../utils/getErrorMessage";

/** Represents a single git worktree discovered on disk. */
export interface WorktreeInfo {
  repoPath: string;
  worktreePath: string;
  branch: string;
  name: string;
  createdAt: number;
}

/** A changed file entry from worktree status. */
export interface WorktreeFileStatus {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "copied" | "untracked";
}

/** Full status of a worktree including changed files. */
export interface WorktreeStatus {
  files: WorktreeFileStatus[];
  ahead: number;
  behind: number;
}

type WorktreeStoreState = {
  /** All known worktrees across all repos. */
  worktrees: WorktreeInfo[];

  /** Whether we're currently loading. */
  isLoading: boolean;

  /** Last error message, if any. */
  error: string | null;

  /** Repo paths that have already been scanned for worktrees (avoids redundant fetches). */
  scannedRepoPaths: Set<string>;

  /** Cached worktree statuses keyed by worktreePath. */
  statusCache: Record<string, WorktreeStatus>;

  /** Whether a status fetch is loading. */
  isStatusLoading: boolean;

  /** Whether a merge is in progress. */
  isMerging: boolean;

  /** Result message from the last merge attempt. */
  mergeResult: { success: boolean; message: string } | null;

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
   * Fetch worktrees for a repo only if it hasn't been scanned yet.
   * Used for incremental loading when a repo becomes active.
   */
  fetchWorktreesIfNeeded: (repoPath: string) => Promise<void>;

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

  /**
   * Fetch the status (changed files) for a specific worktree.
   */
  fetchWorktreeStatus: (repoPath: string, worktreePath: string) => Promise<WorktreeStatus | null>;

  /**
   * Merge a worktree branch into a target branch locally.
   */
  mergeWorktree: (repoPath: string, worktreePath: string, worktreeBranch: string, targetBranch: string) => Promise<{ success: boolean; message: string }>;

  /** Clear merge result state. */
  clearMergeResult: () => void;

  /** Whether a delete is in progress. */
  isDeleting: boolean;

  /** Result message from the last delete attempt. */
  deleteResult: { success: boolean; message: string } | null;

  /** Delete a worktree and remove it from the store. */
  deleteWorktree: (repoPath: string, worktreePath: string) => Promise<{ success: boolean; message: string }>;

  /** Remove a worktree from the store by path (local state only, no git operation). */
  removeWorktreeFromStore: (worktreePath: string) => void;

  /** Clear delete result state. */
  clearDeleteResult: () => void;

  /* ── Worktrees View UI state (persists across tab switches) ── */

  /** Which repo paths are expanded in the worktrees view. Empty = all collapsed (default). */
  expandedRepos: Record<string, boolean>;

  /** Which worktree path is currently expanded (only one at a time). */
  expandedWorktreePath: string | null;

  /** Toggle a repo group expanded/collapsed. */
  toggleRepoExpanded: (repoPath: string) => void;

  /** Explicitly set a repo group's expanded state. */
  setRepoExpanded: (repoPath: string, expanded: boolean) => void;

  /** Set which worktree is expanded (null to collapse all). */
  setExpandedWorktreePath: (worktreePath: string | null) => void;
};

export const useWorktreeStore = create<WorktreeStoreState>((set, get) => ({
  worktrees: [],
  isLoading: false,
  error: null,
  scannedRepoPaths: new Set<string>(),
  statusCache: {},
  isStatusLoading: false,
  isMerging: false,
  mergeResult: null,

  async fetchWorktrees(repoPath: string) {
    set({ isLoading: true, error: null });

    try {
      const response = await sendOrThrow({ type: "worktree:list", repoPath });
      set((state) => {
        // Remove stale entries for this repo, then add fresh ones
        const others = state.worktrees.filter((w) => w.repoPath !== repoPath);
        const nextScanned = new Set(state.scannedRepoPaths);
        nextScanned.add(repoPath);
        return {
          worktrees: [...others, ...response.worktrees],
          scannedRepoPaths: nextScanned,
          isLoading: false,
        };
      });
    } catch (err) {
      set({
        error: getErrorMessage(err),
        isLoading: false,
      });
    }
  },

  async fetchWorktreesForAll(repoPaths: string[]) {
    set({ isLoading: true, error: null });

    try {
      const allEntries: WorktreeInfo[] = [];
      const scanned = new Set(get().scannedRepoPaths);

      for (const repoPath of repoPaths) {
        try {
          const response = await sendOrThrow({ type: "worktree:list", repoPath });
          allEntries.push(...response.worktrees);
          scanned.add(repoPath);
        } catch {
          // Continue on error for individual repo
        }
      }

      set((state) => {
        // Keep worktrees from repos not in this batch, then add fresh ones
        const batchSet = new Set(repoPaths);
        const kept = state.worktrees.filter((w) => !batchSet.has(w.repoPath));
        return {
          worktrees: [...kept, ...allEntries],
          scannedRepoPaths: scanned,
          isLoading: false,
        };
      });
    } catch (err) {
      set({
        error: getErrorMessage(err),
        isLoading: false,
      });
    }
  },

  async fetchWorktreesIfNeeded(repoPath: string) {
    if (get().scannedRepoPaths.has(repoPath)) return;
    await get().fetchWorktrees(repoPath);
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

  async fetchWorktreeStatus(repoPath: string, worktreePath: string) {
    set({ isStatusLoading: true });

    try {
      const response = await sendOrThrow({ type: "worktree:status", repoPath, worktreePath });
      const status: WorktreeStatus = {
        files: response.files,
        ahead: response.ahead,
        behind: response.behind,
      };

      set((state) => ({
        statusCache: { ...state.statusCache, [worktreePath]: status },
        isStatusLoading: false,
      }));

      return status;
    } catch (err) {
      set({
        error: getErrorMessage(err),
        isStatusLoading: false,
      });
      return null;
    }
  },

  async mergeWorktree(repoPath: string, worktreePath: string, worktreeBranch: string, targetBranch: string) {
    set({ isMerging: true, mergeResult: null });

    try {
      const response = await sendOrThrow({
        type: "worktree:merge",
        repoPath,
        worktreePath,
        worktreeBranch,
        targetBranch,
      });
      const result = { success: response.success, message: response.message };
      set({ isMerging: false, mergeResult: result });
      return result;
    } catch (err) {
      const result = { success: false, message: getErrorMessage(err) };
      set({ isMerging: false, mergeResult: result });
      return result;
    }
  },

  clearMergeResult() {
    set({ mergeResult: null });
  },

  isDeleting: false,
  deleteResult: null,

  async deleteWorktree(repoPath: string, worktreePath: string) {
    set({ isDeleting: true, deleteResult: null });

    try {
      const response = await sendOrThrow({
        type: "worktree:delete",
        repoPath,
        worktreePath,
      });
      const result = { success: response.success, message: response.message };

      set((state) => ({
        isDeleting: false,
        deleteResult: result,
        // Remove from local store
        worktrees: state.worktrees.filter((w) => w.worktreePath !== worktreePath),
        // Remove cached status
        statusCache: Object.fromEntries(
          Object.entries(state.statusCache).filter(([key]) => key !== worktreePath),
        ),
      }));
      return result;
    } catch (err) {
      const result = { success: false, message: getErrorMessage(err) };
      set({ isDeleting: false, deleteResult: result });
      return result;
    }
  },

  removeWorktreeFromStore(worktreePath: string) {
    set((state) => ({
      worktrees: state.worktrees.filter((w) => w.worktreePath !== worktreePath),
      statusCache: Object.fromEntries(
        Object.entries(state.statusCache).filter(([key]) => key !== worktreePath),
      ),
    }));
  },

  clearDeleteResult() {
    set({ deleteResult: null });
  },

  /* ── Worktrees View UI state ── */

  expandedRepos: {},
  expandedWorktreePath: null,

  toggleRepoExpanded(repoPath: string) {
    set((state) => ({
      expandedRepos: {
        ...state.expandedRepos,
        [repoPath]: !state.expandedRepos[repoPath],
      },
    }));
  },

  setRepoExpanded(repoPath: string, expanded: boolean) {
    set((state) => {
      if (!!state.expandedRepos[repoPath] === expanded) return state;
      return {
        expandedRepos: {
          ...state.expandedRepos,
          [repoPath]: expanded,
        },
      };
    });
  },

  setExpandedWorktreePath(worktreePath: string | null) {
    set({ expandedWorktreePath: worktreePath });
  },
}));
