import { create } from "zustand";
import { localStore } from "../services/localStorage";

type PinnedSessionsStoreState = {
  pinnedKeys: Set<string>;
  togglePin: (key: string) => void;
  isPinned: (key: string) => boolean;
};

const pinnedStore = localStore<string[]>({
  key: "magenta:pinned-sessions",
  fallback: [],
  debounceMs: 300,
});

function loadPinnedKeys(): Set<string> {
  return new Set(pinnedStore.get());
}

function savePinnedKeys(keys: Set<string>): void {
  pinnedStore.set([...keys]);
}

export const usePinnedSessionsStore = create<PinnedSessionsStoreState>((set, get) => ({
  pinnedKeys: loadPinnedKeys(),
  togglePin(key: string) {
    const next = new Set(get().pinnedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    savePinnedKeys(next);
    set({ pinnedKeys: next });
  },
  isPinned(key: string) {
    return get().pinnedKeys.has(key);
  },
}));
