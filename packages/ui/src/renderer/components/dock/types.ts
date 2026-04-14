/**
 * Dock Layout Type System
 *
 * Defines the data model for the VS Code-style dock layout.
 * A single DockView definition renders differently depending on
 * which container it lives in (accordion in sidebars, tab in center/bottom).
 */

import type { ReactNode, ComponentType } from "react";

/* ── Regions ── */

export type DockRegion = "left" | "right" | "bottom" | "center";

/* ── View Descriptor (registered once in ViewRegistry) ── */

export type ViewDescriptor = {
  /** Unique identifier, e.g. 'repos', 'specs', 'workflow', 'file-viewer' */
  id: string;
  /** Human-readable title shown in tab/accordion headers */
  title: string;
  /** Icon element for tab/accordion/activity bar */
  icon: ReactNode;
  /** The React component to render */
  component: ComponentType<any>;
  /** Where this view docks by default on first use */
  defaultLocation: DockRegion;
  /** Which regions this view is allowed to be placed in */
  allowedLocations?: DockRegion[];
  /** If true, multiple instances can exist (e.g. FileViewer per file) */
  canHaveMultiple?: boolean;
  /** If true, keep mounted when not active (for editors/terminals) */
  keepAlive?: boolean;
  /** If false, cannot be closed (e.g. repos panel). Defaults to true. */
  closable?: boolean;
  /** Activity bar group: 'primary' (left icons) or 'secondary' (bottom icons) */
  activityGroup?: "primary" | "secondary";
  /** Order in activity bar (lower = higher) */
  activityOrder?: number;
};

/* ── Layout Tree (serializable, persisted) ── */

export type SectionState = {
  /** Matches ViewRegistry id */
  viewId: string;
  /** Whether this accordion section is expanded */
  expanded: boolean;
  /** Flex basis within the accordion stack (pixels) */
  size: number;
};

export type TabState = {
  /** Unique per instance — for multi-instance views like file viewers */
  tabId: string;
  /** Matches ViewRegistry id */
  viewId: string;
  /** Props passed to the component (e.g. { filePath, repoPath }) */
  props?: Record<string, unknown>;
  /** Title override for dynamic tabs */
  title?: string;
  /** Icon override for dynamic tabs */
  iconKey?: string;
};

export type SideContainerState = {
  /** Width in pixels */
  width: number;
  /** Whether the entire sidebar is collapsed */
  collapsed: boolean;
  /** Accordion sections from top to bottom */
  sections: SectionState[];
};

export type PanelContainerState = {
  /** Height in pixels */
  height: number;
  /** Whether the bottom panel is collapsed */
  collapsed: boolean;
  /** Active tab id */
  activeTabId: string | null;
  /** Tabs in order */
  tabs: TabState[];
};

export type CenterState = {
  /** Active tab id */
  activeTabId: string | null;
  /** Tabs in order */
  tabs: TabState[];
};

/**
 * A view group bundles related left-sidebar sections under a single
 * activity-bar icon (like VS Code's Explorer, Search, Source Control, etc.).
 */
export type ActivityBarGroup = {
  /** Unique group id, e.g. "explorer" */
  id: string;
  /** Human-readable title shown as tooltip */
  title: string;
  /**
   * ViewId whose registered icon represents this group in the activity bar.
   * Looked up from ViewRegistry at render time.
   */
  iconViewId: string;
  /** Left-sidebar section viewIds that belong to this group */
  viewIds: string[];
};

export type ActivityBarState = {
  /** Whether the activity bar is visible */
  visible: boolean;
  /** Ordered groups that appear as icons in the activity bar */
  groups: ActivityBarGroup[];
  /** Currently active (highlighted) group id */
  activeGroupId: string | null;
};

export type LayoutTree = {
  left: SideContainerState;
  right: SideContainerState;
  bottom: PanelContainerState;
  center: CenterState;
  activityBar: ActivityBarState;
};

/* ── Drop Target (used during drag-and-drop) ── */

export type DropTarget = {
  region: DockRegion;
  position: "before" | "after" | "center";
  /** Index within the target container's list */
  index?: number;
};

/* ── DockView Props (passed to the wrapper) ── */

export type DockViewProps = {
  viewId: string;
  tabId?: string;
  title: string;
  icon: ReactNode;
  children: ReactNode;
  closable?: boolean;
  onClose?: () => void;
};

/* ── Container render mode (how a DockView should render its chrome) ── */

export type RenderMode = "accordion" | "tab";
