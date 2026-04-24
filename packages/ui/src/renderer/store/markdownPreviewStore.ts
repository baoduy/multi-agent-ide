/**
 * markdownPreviewStore — tracks the single markdown file currently being
 * viewed in preview mode inside the center pane.
 *
 * Written to by `FileViewer` when a markdown tab enters preview mode.
 * Read by the right-sidebar `MarkdownTocPanel` to build a Table of Contents
 * with scroll-spy. Cleared when the file leaves preview mode, unmounts,
 * or another markdown preview takes its place.
 *
 * Holding the `scrollEl` directly (rather than a DOM-queried attribute)
 * keeps the coupling explicit: the panel is subscribed to exactly the
 * element the active FileViewer is scrolling, no global queries required.
 *
 * Follows the project rule: pure state container, no cross-store imports,
 * no IPC.
 */

import { create } from "zustand";

export type MarkdownPreviewState = {
  filePath: string;
  content: string;
  /** The FileViewer's scroll container — used for scroll-spy and click-to-scroll. */
  scrollEl: HTMLElement;
};

type Store = {
  active: MarkdownPreviewState | null;
  /** Set/replace the currently-previewed file. */
  setActive: (next: MarkdownPreviewState) => void;
  /**
   * Clear only if the active preview belongs to `filePath`. Prevents a
   * stale unmount cleanup from clobbering a newer preview that just took
   * over (common when switching tabs fast).
   */
  clearIf: (filePath: string) => void;
};

export const useMarkdownPreviewStore = create<Store>((set) => ({
  active: null,
  setActive: (next) => set({ active: next }),
  clearIf: (filePath) =>
    set((s) => (s.active?.filePath === filePath ? { active: null } : s)),
}));
