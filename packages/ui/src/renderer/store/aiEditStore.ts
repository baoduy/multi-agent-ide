import { create } from "zustand";
import type { AiEditAction, AiEditConfig } from "@magenta/shared/ipc";
import { sendOrThrow } from "../services/ipcClient";

/**
 * Read-only store used by the AI Editor settings view.
 *
 * Editing actions (selection rewrite, `/ai` slash command) were replaced by
 * the standalone chat bubble — see `aiChatStore`. This store now just
 * surfaces resolved config and action metadata so the settings tab can show
 * the user what's in effect.
 *
 * Per CLAUDE.md rules: this store does NOT import other stores. Callers pass
 * the active `repoPath` in explicitly.
 */
export type AiEditStoreState = {
  actions: AiEditAction[];
  config: AiEditConfig | null;
  listLoading: boolean;
  lastError: string | null;
  currentRepoPath: string | null;

  loadForRepo(repoPath: string): Promise<void>;
  clearError(): void;
};

export const useAiEditStore = create<AiEditStoreState>((set, get) => ({
  actions: [],
  config: null,
  listLoading: false,
  lastError: null,
  currentRepoPath: null,

  async loadForRepo(repoPath: string) {
    const state = get();
    if (state.currentRepoPath === repoPath && state.config && !state.listLoading) {
      return;
    }
    set({ listLoading: true, lastError: null, currentRepoPath: repoPath });
    try {
      const [actions, config] = await Promise.all([
        sendOrThrow({ type: "ai-edit:list-actions", repoPath }),
        sendOrThrow({ type: "ai-edit:get-config", repoPath }),
      ]);
      set({
        actions: actions.actions,
        config: config.config,
        listLoading: false,
      });
    } catch (err) {
      set({
        listLoading: false,
        lastError: (err as Error).message,
      });
    }
  },

  clearError() {
    set({ lastError: null });
  },
}));
