import { create } from "zustand";
import type { Agent } from "@magenta/shared/ipc";
import type { AIProvider } from "@magenta/shared/aiTerminal";
import { sendOrThrow } from "../services/ipcClient";

/**
 * Phase 6 — caches `ai:list-agents` results per provider. The list is small
 * and rarely changes (filesystem-driven for Claude, static for Copilot), so a
 * simple in-memory cache keyed by provider is enough; callers re-trigger via
 * `loadFor(provider)` if they want a fresh read.
 */
type State = {
  byProvider: Partial<Record<AIProvider, Agent[]>>;
  loading: boolean;
  error: string | null;
  loadFor: (p: AIProvider, force?: boolean) => Promise<void>;
};

export const useAgentStore = create<State>((set, get) => ({
  byProvider: {},
  loading: false,
  error: null,
  async loadFor(provider, force = false) {
    if (!force && get().byProvider[provider]) return;
    set({ loading: true, error: null });
    try {
      const res = await sendOrThrow({ type: "ai:list-agents", provider });
      set((s) => ({
        byProvider: { ...s.byProvider, [provider]: res.agents },
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
}));
