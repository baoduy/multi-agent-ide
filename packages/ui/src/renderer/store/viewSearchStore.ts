import { create } from "zustand";

type ViewSearchState = {
  queries: Record<string, string>;
  setQuery: (viewId: string, query: string) => void;
  clearQuery: (viewId: string) => void;
};

export const useViewSearchStore = create<ViewSearchState>((set) => ({
  queries: {},
  setQuery: (viewId, query) =>
    set((s) => ({ queries: { ...s.queries, [viewId]: query } })),
  clearQuery: (viewId) =>
    set((s) => {
      const { [viewId]: _, ...rest } = s.queries;
      return { queries: rest };
    }),
}));
