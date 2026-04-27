import { create } from "zustand";
import type { AIPreset } from "@magenta/shared/aiPresets";
import { sendOrThrow } from "../services/ipcClient";

/**
 * Phase 4 — Tool/permission preset store.
 *
 * Loads built-ins + user-authored presets via `ai:presets:list`. Built-ins
 * are tagged with `builtin: true` and rejected by the daemon for update or
 * delete; the UI surfaces this by hiding edit/delete affordances on those
 * rows. Cross-store wiring is intentionally minimal: the create-session
 * dialog reads `presets` directly via the hook, then sends the chosen
 * `presetId` along with `ai-session:create`.
 */
type State = {
  presets: AIPreset[];
  loading: boolean;
  loadAll: () => Promise<void>;
  create: (p: AIPreset) => Promise<void>;
  update: (id: string, patch: Partial<AIPreset>) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export const useAiPresetStore = create<State>((set, get) => ({
  presets: [],
  loading: false,
  async loadAll() {
    set({ loading: true });
    try {
      const res = await sendOrThrow({ type: "ai:presets:list" });
      set({ presets: res.presets, loading: false });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },
  async create(p) {
    await sendOrThrow({ type: "ai:presets:create", preset: p });
    await get().loadAll();
  },
  async update(id, patch) {
    await sendOrThrow({ type: "ai:presets:update", id, patch });
    await get().loadAll();
  },
  async remove(id) {
    await sendOrThrow({ type: "ai:presets:delete", id });
    await get().loadAll();
  },
}));
