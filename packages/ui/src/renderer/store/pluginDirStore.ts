import { create } from "zustand";
import { sendOrThrow } from "../services/ipcClient";

/**
 * Phase 6 — store for the user's `--plugin-dir` list. Persisted in LMDB on
 * the daemon side. The Settings → Plugins panel is the only consumer today.
 */
type State = {
  paths: string[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  add: (p: string) => Promise<void>;
  remove: (p: string) => Promise<void>;
};

export const usePluginDirStore = create<State>((set) => ({
  paths: [],
  loading: false,
  error: null,
  async refresh() {
    set({ loading: true, error: null });
    try {
      const res = await sendOrThrow({ type: "plugin-dirs:list" });
      set({ paths: res.paths, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
  async add(p) {
    const res = await sendOrThrow({ type: "plugin-dirs:add", path: p });
    set({ paths: res.paths });
  },
  async remove(p) {
    const res = await sendOrThrow({ type: "plugin-dirs:remove", path: p });
    set({ paths: res.paths });
  },
}));
