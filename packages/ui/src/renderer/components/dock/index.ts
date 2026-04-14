/**
 * Dock Layout System — barrel export.
 */

// Types
export type {
  DockRegion,
  ViewDescriptor,
  SectionState,
  TabState,
  SideContainerState,
  PanelContainerState,
  CenterState,
  ActivityBarState,
  LayoutTree,
  DropTarget,
  DockViewProps,
  RenderMode,
} from "./types";

// Registry
export { viewRegistry } from "./ViewRegistry";

// Store
export { useLayoutStore, DEFAULT_LAYOUT } from "./layoutStore";

// Components
export { DockManager } from "./DockManager";
export { SideContainer } from "./SideContainer";
export { TabView } from "./TabView";
export { PanelContainer } from "./PanelContainer";
export { ActivityBar } from "./ActivityBar";
export { AccordionSection } from "./AccordionSection";
export { DockTabBar } from "./DockTabBar";
export { ResizeHandle } from "./ResizeHandle";
export { StatusBar } from "./StatusBar";

// Hooks
export { useKeyboardShortcuts } from "./useKeyboardShortcuts";

// Drag & Drop
export { DockDragOverlay } from "./DragOverlay";
export { useDockDrag } from "./useDockDrag";

// Registration
export { registerAllViews } from "./registerViews";
