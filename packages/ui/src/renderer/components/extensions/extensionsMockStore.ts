/**
 * extensionsMockStore — mockup-phase Zustand store.
 *
 * Holds selection state (scope/category/item), a per-item enabled override
 * (since we don't write to disk yet), and the search query. All reads go
 * through the MOCK table — no IPC, no persistence.
 *
 * Phase 2 will replace this with a real `extensionsStore` that talks to
 * the daemon via sendOrThrow.
 */

import { create } from "zustand";
import type { ExtensionCategory, ExtensionItem, ExtensionScope } from "./mockData";
import { MOCK, categoriesForScope, mockKey } from "./mockData";

type Overrides = Record<string /* `${scope}:${category}:${id}` */, boolean>;

type ExtensionsMockState = {
  scope: ExtensionScope;
  category: ExtensionCategory;
  selectedItemId: string | null;
  search: string;
  /** Local enable/disable overrides keyed by scope+category+id */
  enabledOverrides: Overrides;

  setScope: (scope: ExtensionScope) => void;
  setCategory: (category: ExtensionCategory) => void;
  setSelectedItemId: (id: string | null) => void;
  setSearch: (search: string) => void;
  toggleEnabled: (scope: ExtensionScope, category: ExtensionCategory, id: string) => void;
};

function overrideKey(scope: ExtensionScope, category: ExtensionCategory, id: string): string {
  return `${scope}:${category}:${id}`;
}

export const useExtensionsMockStore = create<ExtensionsMockState>((set) => ({
  scope: "user",
  category: "plugins",
  selectedItemId: null,
  search: "",
  enabledOverrides: {},

  setScope: (scope) =>
    set((state) => {
      // If current category isn't valid for this scope, fall back to the first allowed one.
      const allowed = categoriesForScope(scope);
      const nextCategory = allowed.includes(state.category) ? state.category : allowed[0];
      return { scope, category: nextCategory, selectedItemId: null };
    }),

  setCategory: (category) => set({ category, selectedItemId: null }),

  setSelectedItemId: (id) => set({ selectedItemId: id }),

  setSearch: (search) => set({ search }),

  toggleEnabled: (scope, category, id) =>
    set((state) => {
      const key = overrideKey(scope, category, id);
      const current = state.enabledOverrides[key];
      const base = MOCK[mockKey(scope, category)].find((i) => i.id === id)?.enabled ?? false;
      const effective = current === undefined ? base : current;
      return {
        enabledOverrides: { ...state.enabledOverrides, [key]: !effective },
      };
    }),
}));

/**
 * Helper selector: returns the list for the current (scope, category) with
 * enabled overrides applied and search filter honored.
 */
export function selectVisibleItems(state: ExtensionsMockState): ExtensionItem[] {
  const base = MOCK[mockKey(state.scope, state.category)] ?? [];
  const needle = state.search.trim().toLowerCase();
  return base
    .map((item) => {
      const k = overrideKey(state.scope, state.category, item.id);
      const override = state.enabledOverrides[k];
      return override === undefined ? item : { ...item, enabled: override };
    })
    .filter((item) => {
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        item.id.toLowerCase().includes(needle) ||
        (item.subtitle?.toLowerCase().includes(needle) ?? false) ||
        item.path.toLowerCase().includes(needle)
      );
    });
}
