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
      { viewId: "md-file-tree", expanded: true, size: 400 },
      { viewId: "git-repos", expanded: true, size: 600 },
      { viewId: "extensions-nav", expanded: true, size: 200 },
      { viewId: "extensions-summary", expanded: true, size: 160 },
    ],
  },
  right: {
    width: 260,
    collapsed: false,
    sections: [
      // markdown-toc sits first so it appears at the top of the right
      // sidebar whenever a markdown file is in preview mode. It's filtered
      // out of the visible section list in SideContainer when no preview is
      // active, so keeping it at index 0 costs nothing in other contexts.
      { viewId: "markdown-toc", expanded: true, size: 240 },
      { viewId: "spec-files", expanded: true, size: 200 },
      { viewId: "repo-changes", expanded: true, size: 200 },
      { viewId: "extensions-inspector", expanded: true, size: 300 },
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
        title: "Specify Explorer",
        iconViewId: "repos",
        viewIds: ["repos", "specs"],
        rightViewIds: ["spec-files", "repo-changes", "markdown-toc"],
        ownedCenterViewIds: [
          "specs-list",
          "workflow",
          "worktrees",
          "ai-sessions",
          "file-viewer",
          "diff-viewer",
          "agent-session",
          "terminal-session",
        ],
      },
      {
        id: "markdown-manager",
        title: "Markdown Manager",
        iconViewId: "md-file-tree",
        viewIds: ["md-file-tree"],
        rightViewIds: ["markdown-toc"],
        ownedCenterViewIds: ["file-viewer"],
        hidesPinnedMain: true,
      },
      {
        id: "git",
        title: "Git Management",
        iconViewId: "git-changes-center",
        viewIds: ["git-repos"],
        rightViewIds: [],
        ownedCenterViewIds: [
          "git-changes-center",
          "git-commit-composer",
          "diff-viewer",
        ],
        hidesPinnedMain: true,
        defaultCenterViewId: "git-changes-center",
      },
      {
        id: "extensions",
        title: "Extensions",
        iconViewId: "extensions-nav",
        viewIds: ["extensions-nav", "extensions-summary"],
        rightViewIds: ["extensions-inspector"],
        ownedCenterViewIds: ["extensions-browser"],
        hidesPinnedMain: true,
        defaultCenterViewId: "extensions-browser",
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

/* ── Auto-persist on change (debounced via requestIdleCallback) ── */

let persistTimer: ReturnType<typeof requestIdleCallback> | null = null;

useLayoutStore.subscribe((state) => {
  if (persistTimer) cancelIdleCallback(persistTimer);
  persistTimer = requestIdleCallback(() => {
    try {
      localStorage.setItem("magenta:dock-layout", JSON.stringify(state.layout));
    } catch {
      // Ignore storage errors
    }
  }, { timeout: 1000 });
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

    // ── Migration: add rightViewIds to existing groups ──
    for (const group of parsed.activityBar.groups) {
      if (group.id === "explorer" && !group.rightViewIds) {
        group.rightViewIds = ["spec-files", "repo-changes"];
      }
    }

    // ── Migration: add markdown-manager group if missing ──
    if (!parsed.activityBar.groups.some((g: ActivityBarGroup) => g.id === "markdown-manager")) {
      parsed.activityBar.groups.push({
        id: "markdown-manager",
        title: "Markdown Manager",
        iconViewId: "md-file-tree",
        viewIds: ["md-file-tree"],
        rightViewIds: [],
      });
    }

    // ── Migration: add md-file-tree section to left sidebar if missing ──
    if (!parsed.left.sections.some((s: SectionState) => s.viewId === "md-file-tree")) {
      parsed.left.sections.push({ viewId: "md-file-tree", expanded: true, size: 400 });
    }

    // ── Migration: add Git Management group if missing, or update shape ──
    const gitGroup = parsed.activityBar.groups.find((g: ActivityBarGroup) => g.id === "git");
    if (!gitGroup) {
      parsed.activityBar.groups.push({
        id: "git",
        title: "Git Management",
        iconViewId: "git-changes-center",
        viewIds: ["git-repos"],
        rightViewIds: [],
        ownedCenterViewIds: [
          "git-changes-center",
          "git-commit-composer",
          "diff-viewer",
        ],
        hidesPinnedMain: true,
        defaultCenterViewId: "git-changes-center",
      });
    } else {
      // Rewire older persisted Git group shapes (file-tree right, branches left,
      // orphan center views) to the simplified current layout.
      gitGroup.viewIds = ["git-repos"];
      gitGroup.rightViewIds = [];
      gitGroup.iconViewId = "git-changes-center";
      gitGroup.ownedCenterViewIds = [
        "git-changes-center",
        "git-commit-composer",
        "diff-viewer",
      ];
      gitGroup.hidesPinnedMain = true;
      gitGroup.defaultCenterViewId = "git-changes-center";
    }

    // Ensure explorer + markdown groups have ownedCenterViewIds populated.
    const explorer = parsed.activityBar.groups.find((g: ActivityBarGroup) => g.id === "explorer");
    if (explorer && !explorer.ownedCenterViewIds) {
      explorer.ownedCenterViewIds = [
        "specs-list",
        "workflow",
        "worktrees",
        "ai-sessions",
        "file-viewer",
        "diff-viewer",
        "agent-session",
        "terminal-session",
      ];
    }
    const mdGroup = parsed.activityBar.groups.find((g: ActivityBarGroup) => g.id === "markdown-manager");
    if (mdGroup && !mdGroup.ownedCenterViewIds) {
      mdGroup.ownedCenterViewIds = ["file-viewer"];
      mdGroup.hidesPinnedMain = true;
    }

    // ── Migration: add Extensions Manager group if missing ──
    if (!parsed.activityBar.groups.some((g: ActivityBarGroup) => g.id === "extensions")) {
      parsed.activityBar.groups.push({
        id: "extensions",
        title: "Extensions",
        iconViewId: "extensions-nav",
        viewIds: ["extensions-nav", "extensions-summary"],
        rightViewIds: ["extensions-inspector"],
        ownedCenterViewIds: ["extensions-browser"],
        hidesPinnedMain: true,
        defaultCenterViewId: "extensions-browser",
      });
    }
    if (!parsed.left.sections.some((s: SectionState) => s.viewId === "extensions-nav")) {
      parsed.left.sections.push({ viewId: "extensions-nav", expanded: true, size: 200 });
    }
    if (!parsed.left.sections.some((s: SectionState) => s.viewId === "extensions-summary")) {
      parsed.left.sections.push({ viewId: "extensions-summary", expanded: true, size: 160 });
    }
    if (!parsed.right.sections.some((s: SectionState) => s.viewId === "extensions-inspector")) {
      parsed.right.sections.push({ viewId: "extensions-inspector", expanded: true, size: 300 });
    }

    // ── Migration: add markdown-toc section + wire it into Explorer and
    //    Markdown Manager groups so the right sidebar picks it up for both.
    //    SideContainer filters it out of the visible list when no markdown
    //    file is in preview mode, so adding it to both groups is safe. ──
    if (!parsed.right.sections.some((s: SectionState) => s.viewId === "markdown-toc")) {
      parsed.right.sections.push({ viewId: "markdown-toc", expanded: true, size: 240 });
    }
    for (const group of parsed.activityBar.groups) {
      if (group.id === "explorer" || group.id === "markdown-manager") {
        const ids = new Set(group.rightViewIds ?? []);
        ids.add("markdown-toc");
        group.rightViewIds = Array.from(ids);
      }
    }

    // ── Migration: pin markdown-toc to the top of the right sidebar. Older
    //    persisted layouts had it at position 2 or 3; the current default is
    //    index 0 so it appears first when preview mode activates. Preserve
    //    the user's persisted `expanded`/`size` state for the section. ──
    const tocIdx = parsed.right.sections.findIndex(
      (s: SectionState) => s.viewId === "markdown-toc",
    );
    if (tocIdx > 0) {
      const [tocSection] = parsed.right.sections.splice(tocIdx, 1);
      parsed.right.sections.unshift(tocSection);
    }

    // ── Migration: drop left-sidebar git-file-tree, git-changes, git-branches,
    //    git-history (moved / removed); drop right-sidebar git-file-tree
    //    (Git group no longer has a right sidebar); seed git-repos as the sole
    //    left section for the Git group. Branch switching lives in the repo
    //    row's context menu; history + files live inside the Changes tab.
    parsed.left.sections = parsed.left.sections.filter(
      (s: SectionState) =>
        s.viewId !== "git-file-tree" &&
        s.viewId !== "git-changes" &&
        s.viewId !== "git-branches" &&
        s.viewId !== "git-history",
    );
    parsed.right.sections = parsed.right.sections.filter(
      (s: SectionState) => s.viewId !== "git-file-tree",
    );
    if (!parsed.left.sections.some((s: SectionState) => s.viewId === "git-repos")) {
      parsed.left.sections.push({ viewId: "git-repos", expanded: true, size: 600 });
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
