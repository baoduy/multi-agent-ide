/**
 * useDockDrag — lightweight drag state manager for the dock system.
 *
 * Instead of @dnd-kit (which we'll integrate later for sortable reorder),
 * this provides a simple "grab header → show overlay → drop on region" flow
 * using native mouse events. Works immediately with no extra library setup.
 */

import { create } from "zustand";
import type { DockRegion } from "./types";

type DockDragState = {
  /** Whether a drag is currently active */
  isDragging: boolean;
  /** The view ID being dragged */
  dragViewId: string | null;
  /** The region the view was dragged from */
  fromRegion: DockRegion | null;

  /** Start dragging a view */
  startDrag: (viewId: string, fromRegion: DockRegion) => void;
  /** End the drag (drop or cancel) */
  endDrag: () => void;
};

export const useDockDrag = create<DockDragState>((set) => ({
  isDragging: false,
  dragViewId: null,
  fromRegion: null,

  startDrag: (viewId, fromRegion) =>
    set({ isDragging: true, dragViewId: viewId, fromRegion }),

  endDrag: () =>
    set({ isDragging: false, dragViewId: null, fromRegion: null }),
}));
