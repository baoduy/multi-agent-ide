/**
 * layoutStore — Zustand store for the dock layout tree.
 *
 * Single source of truth for: region sizes, each view's location,
 * accordion expand state, active tab per container, bottom panel visibility.
 *
 * Follows the project rule: stores are pure state containers,
 * no cross-store imports, no IPC calls directly.
 */

import { create } from "zustand";
import type {
  LayoutTree,
  SectionState,
  TabState,
  DockRegion,
  ActivityBarGroup,
} from "./types";

/* ── Default Layout ── */

export const DEFAULT_LAYOUT: LayoutTree = {
  left: {
    width: 280,
    collapsed: false,
    sections: [
      { viewId: "repos", expanded: true, size: 300 },
      { viewId: "specs", expanded: true, size: 220 },
    ],
  },
  right: {
    width: 260,
    collapsed: false,
    sections: [
      { viewId: "spec-files", expanded: true, size: 200 },
      { viewId: "repo-changes", expanded: true, size: 200 },
    ],
  },
  bottom: {
    height: 200,
    collapsed: true,
    activeTabId: null,
    tabs: [],
  },
  center: {
    activeTabId: "tab-main",
    tabs: [
      { tabId: "tab-main", viewId: "specs-list" },
    ],
  },
  activityBar: {
    visible: true,
    groups: [
      {
        id: "explorer",
        title: "Explorer",
        iconViewId: "repos",
        viewIds: ["repos", "specs"],
      },
    ],
    activeGroupId: "explorer",
  },
};

/* ── Store Shape ── */

type LayoutStoreState = {
  layout: LayoutTree;

  // ── Region actions ──
  setRegionWidth: (region: "left" | "right", width: number) => void;
  setRegionHeight: (region: "bottom", height: number) => void;
  toggleRegionCollapse: (region: "left" | "right" | "bottom") => void;
  setRegionCollapsed: (region: "left" | "right" | "bottom", collapsed: boolean) => void;

  // ── Accordion section actions ──
  toggleSection: (region: "left" | "right", viewId: string) => void;
  setSectionExpanded: (region: "left" | "right", viewId: string, expanded: boolean) => void;
  setSectionSize: (region: "left" | "right", viewId: string, size: number) => void;

  // ── Tab actions ──
  openTab: (region: "center" | "bottom", tab: TabState) => void;
  closeTab: (region: "center" | "bottom", tabId: string) => void;
  setActiveTab: (region: "center" | "bottom", tabId: string) => void;
  reorderTabs: (region: "center" | "bottom", tabIds: string[]) => void;

  /** Swap the pinned main tab's viewId (first tab in center) and activate it */
  setMainView: (viewId: string) => void;

  // ── Move view between regions ──
  moveView: (viewId: string, fromRegion: DockRegion, toRegion: DockRegion, index?: number) => void;

  // ── Activity bar ──
  setActiveGroup: (groupId: string | null) => void;

  // ── Persistence ──
  setLayout: (layout: LayoutTree) => void;
  resetLayout: () => void;
};

/* ── Store Implementation ── */

export const useLayoutStore = create<LayoutStoreState>((set) => ({
  layout: loadPersistedLayout() ?? { ...DEFAULT_LAYOUT },

  setRegionWidth: (region, width) =>
    set((state) => ({
      layout: {
        ...state.layout,
        [region]: { ...state.layout[region], width },
      },
    })),

  setRegionHeight: (_region, height) =>
    set((state) => ({
      layout: {
        ...state.layout,
        bottom: { ...state.layout.bottom, height },
      },
    })),

  toggleRegionCollapse: (region) =>
    set((state) => ({
      layout: {
        ...state.layout,
        [region]: {
          ...state.layout[region],
          collapsed: !state.layout[region].collapsed,
        },
      },
    })),

  setRegionCollapsed: (region, collapsed) =>
    set((state) => ({
      layout: {
        ...state.layout,
        [region]: { ...state.layout[region], collapsed },
      },
    })),

  toggleSection: (region, viewId) =>
    set((state) => {
      const container = state.layout[region];
      const sections = container.sections.map((s: SectionState) =>
        s.viewId === viewId ? { ...s, expanded: !s.expanded } : s
      );
      return {
        layout: {
          ...state.layout,
          [region]: { ...container, sections },
        },
      };
    }),

  setSectionExpanded: (region, viewId, expanded) =>
    set((state) => {
      const container = state.layout[region];
      const sections = container.sections.map((s: SectionState) =>
        s.viewId === viewId ? { ...s, expanded } : s
      );
      return {
        layout: {
          ...state.layout,
          [region]: { ...container, sections },
        },
      };
    }),

  setSectionSize: (region, viewId, size) =>
    set((state) => {
      const container = state.layout[region];
      const sections = container.sections.map((s: SectionState) =>
        s.viewId === viewId ? { ...s, size } : s
      );
      return {
        layout: {
          ...state.layout,
          [region]: { ...container, sections },
        },
      };
    }),

  openTab: (region, tab) =>
    set((state) => {
      const container = state.layout[region];
      // Don't add duplicate tabs
      const existing = container.tabs.find((t: TabState) => t.tabId === tab.tabId);
      if (existing) {
        // Just activate it
        return {
          layout: {
            ...state.layout,
            [region]: { ...container, activeTabId: tab.tabId },
          },
        };
      }
      return {
        layout: {
          ...state.layout,
          [region]: {
            ...container,
            tabs: [...container.tabs, tab],
            activeTabId: tab.tabId,
          },
        },
      };
    }),

  closeTab: (region, tabId) =>
    set((state) => {
      const container = state.layout[region];
      const tabs = container.tabs.filter((t: TabState) => t.tabId !== tabId);
      let activeTabId = container.activeTabId;
      if (activeTabId === tabId) {
        // Activate the last remaining tab, or null
        activeTabId = tabs.length > 0 ? tabs[tabs.length - 1].tabId : null;
      }
      return {
        layout: {
          ...state.layout,
          [region]: { ...container, tabs, activeTabId },
        },
      };
    }),

  setActiveTab: (region, tabId) =>
    set((state) => ({
      layout: {
        ...state.layout,
        [region]: { ...state.layout[region], activeTabId: tabId },
      },
    })),

  reorderTabs: (region, tabIds) =>
    set((state) => {
      const container = state.layout[region];
      const tabMap = new Map(container.tabs.map((t: TabState) => [t.tabId, t]));
      const reordered = tabIds.map((id) => tabMap.get(id)).filter(Boolean) as TabState[];
      return {
        layout: {
          ...state.layout,
          [region]: { ...container, tabs: reordered },
        },
      };
    }),

  setMainView: (viewId) =>
    set((state) => {
      const center = state.layout.center;
      if (center.tabs.length === 0) return state;
      const mainTabId = center.tabs[0].tabId;
      const tabs = [{ ...center.tabs[0], viewId }, ...center.tabs.slice(1)];
      return {
        layout: {
          ...state.layout,
          center: { ...center, tabs, activeTabId: mainTabId },
        },
      };
    }),

  moveView: (viewId, fromRegion, toRegion, index) =>
    set((state) => {
      const newLayout = { ...state.layout };

      // Remove from source
      if (fromRegion === "left" || fromRegion === "right") {
        const src = { ...newLayout[fromRegion] };
        src.sections = src.sections.filter((s: SectionState) => s.viewId !== viewId);
        newLayout[fromRegion] = src;
      } else if (fromRegion === "center") {
        const src = { ...newLayout.center };
        src.tabs = src.tabs.filter((t: TabState) => t.viewId !== viewId);
        if (src.activeTabId && !src.tabs.find((t: TabState) => t.tabId === src.activeTabId)) {
          src.activeTabId = src.tabs.length > 0 ? src.tabs[0].tabId : null;
        }
        newLayout.center = src;
      } else {
        const src = { ...newLayout.bottom };
        src.tabs = src.tabs.filter((t: TabState) => t.viewId !== viewId);
        if (src.activeTabId && !src.tabs.find((t: TabState) => t.tabId === src.activeTabId)) {
          src.activeTabId = src.tabs.length > 0 ? src.tabs[0].tabId : null;
        }
        newLayout.bottom = src;
      }

      // Add to destination
      if (toRegion === "left" || toRegion === "right") {
        const dst = { ...newLayout[toRegion] };
        const section: SectionState = { viewId, expanded: true, size: 200 };
        const sections = [...dst.sections];
        if (index != null && index >= 0) {
          sections.splice(index, 0, section);
        } else {
          sections.push(section);
        }
        dst.sections = sections;
        newLayout[toRegion] = dst;
      } else if (toRegion === "center") {
        const dst = { ...newLayout.center };
        const tab: TabState = { tabId: `tab-${viewId}`, viewId };
        const tabs = [...dst.tabs];
        if (index != null && index >= 0) {
          tabs.splice(index, 0, tab);
        } else {
          tabs.push(tab);
        }
        dst.tabs = tabs;
        dst.activeTabId = tab.tabId;
        newLayout.center = dst;
      } else {
        const dst = { ...newLayout.bottom };
        const tab: TabState = { tabId: `tab-${viewId}`, viewId };
        const tabs = [...dst.tabs];
        if (index != null && index >= 0) {
          tabs.splice(index, 0, tab);
        } else {
          tabs.push(tab);
        }
        dst.tabs = tabs;
        dst.activeTabId = tab.tabId;
        newLayout.bottom = dst;
      }

      return { layout: newLayout };
    }),

  setActiveGroup: (groupId) =>
    set((state) => ({
      layout: {
        ...state.layout,
        activityBar: { ...state.layout.activityBar, activeGroupId: groupId },
      },
    })),

  setLayout: (layout) => set({ layout }),

  resetLayout: () => {
    clearPersistedLayout();
    set({ layout: { ...DEFAULT_LAYOUT } });
  },
}));

/* ── Auto-persist on change (debounced) ── */

let persistTimer: ReturnType<typeof setTimeout> | null = null;

useLayoutStore.subscribe((state) => {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      localStorage.setItem("magenta:dock-layout", JSON.stringify(state.layout));
    } catch {
      // Ignore storage errors
    }
  }, 500);
});

/* ── Load/clear helpers ── */

/** View IDs that belong to the TitleBar-controlled main tab (not standalone center tabs). */
const BUILTIN_VIEW_IDS = new Set(["specs-list", "workflow", "worktrees", "ai-sessions"]);

function loadPersistedLayout(): LayoutTree | null {
  try {
    const raw = localStorage.getItem("magenta:dock-layout");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LayoutTree;
    // Basic shape validation
    if (!parsed.left || !parsed.right || !parsed.center || !parsed.bottom || !parsed.activityBar) {
      return null;
    }

    // ── Migration: consolidate old per-builtin tabs into a single tab-main ──
    const centerTabs: TabState[] = parsed.center.tabs ?? [];
    const hasOldLayout = centerTabs.some(
      (t: TabState) => t.tabId !== "tab-main" && BUILTIN_VIEW_IDS.has(t.viewId)
    );

    if (hasOldLayout) {
      // Find the active builtin viewId (or default to specs-list)
      const activeTab = centerTabs.find((t: TabState) => t.tabId === parsed.center.activeTabId);
      const activeViewId =
        activeTab && BUILTIN_VIEW_IDS.has(activeTab.viewId)
          ? activeTab.viewId
          : "specs-list";

      // Keep only non-builtin tabs (file tabs etc.) and prepend the unified main tab
      const fileTabs = centerTabs.filter(
        (t: TabState) => !BUILTIN_VIEW_IDS.has(t.viewId)
      );
      parsed.center = {
        activeTabId: "tab-main",
        tabs: [{ tabId: "tab-main", viewId: activeViewId }, ...fileTabs],
      };
    }

    // ── Migration: replace old "activity" right sidebar section with repo-changes + spec-files ──
    const rightSections = parsed.right?.sections ?? [];
    const hasOldActivity = rightSections.some(
      (s: SectionState) => s.viewId === "activity"
    );
    const hasNewSections = rightSections.some(
      (s: SectionState) => s.viewId === "repo-changes" || s.viewId === "spec-files"
    );

    if (hasOldActivity && !hasNewSections) {
      parsed.right.sections = rightSections
        .filter((s: SectionState) => s.viewId !== "activity")
        .concat([
          { viewId: "spec-files", expanded: true, size: 200 },
          { viewId: "repo-changes", expanded: true, size: 200 },
        ]);
    }

    // ── Migration: update activity bar to reference new view IDs (legacy flat format) ──
    const legacyBar = parsed.activityBar as any;
    if (legacyBar?.primaryItems) {
      const items: string[] = legacyBar.primaryItems;
      const activityIdx = items.indexOf("activity");
      if (activityIdx !== -1) {
        items.splice(activityIdx, 1, "repo-changes", "spec-files");
        legacyBar.primaryItems = items;
      }
      if (legacyBar.activeItem === "activity") {
        legacyBar.activeItem = "repo-changes";
      }
    }

    // ── Migration: convert flat primaryItems to view groups ──
    if (!(parsed.activityBar as any).groups) {
      const leftViewIds = (parsed.left?.sections ?? []).map(
        (s: SectionState) => s.viewId
      );
      parsed.activityBar = {
        visible: parsed.activityBar?.visible ?? true,
        groups: [
          {
            id: "explorer",
            title: "Explorer",
            iconViewId: leftViewIds[0] ?? "repos",
            viewIds: leftViewIds.length > 0 ? leftViewIds : ["repos", "specs"],
          },
        ],
        activeGroupId: "explorer",
      };
    }

    return parsed;
  } catch {
    return null;
  }
}

function clearPersistedLayout(): void {
  try {
    localStorage.removeItem("magenta:dock-layout");
  } catch {
    // Ignore
  }
}
