/**
 * TabView — the center region tab container.
 *
 * All openable content in the main area MUST go through TabView.
 * Renders DockTabBar + the active tab's content component.
 * Supports keepAlive — non-active tabs stay mounted but hidden.
 */

import React, { useCallback, createElement, useMemo } from "react";
import { useLayoutStore } from "./layoutStore";
import { viewRegistry } from "./ViewRegistry";
import { DockTabBar } from "./DockTabBar";
import type { TabState, CenterState, ActivityBarGroup } from "./types";
import { colors } from "../../utils/colors";

type TabViewProps = {
  /** Extra props to pass down to individual view components by viewId */
  viewProps?: Record<string, Record<string, unknown>>;
  /** Callback to duplicate an agent-session tab */
  onDuplicateTab?: (tab: TabState) => void;
};

export const TabView = React.memo(function TabView({
  viewProps,
  onDuplicateTab,
}: TabViewProps): React.ReactElement {
  const center: CenterState = useLayoutStore((s) => s.layout.center);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const closeTab = useLayoutStore((s) => s.closeTab);

  // Active dock group — drives which tabs are visible in the center region.
  const activeGroupId = useLayoutStore((s) => s.layout.activityBar.activeGroupId);
  const groups = useLayoutStore((s) => s.layout.activityBar.groups);
  const activeGroup = useMemo<ActivityBarGroup | undefined>(
    () => groups.find((g) => g.id === activeGroupId),
    [groups, activeGroupId],
  );

  const handleSelectTab = useCallback(
    (tabId: string) => setActiveTab("center", tabId),
    [setActiveTab]
  );

  const handleCloseTab = useCallback(
    (tabId: string) => closeTab("center", tabId),
    [closeTab]
  );

  // The first tab ("tab-main") is the pinned builtin view, controlled by the TitleBar.
  // File tabs come after it. Groups that declare `hidesPinnedMain` suppress the
  // main pill entirely (so a Git / Markdown context doesn't leak the Specs tab).
  const hideMain = activeGroup?.hidesPinnedMain === true;
  const mainTab = hideMain ? null : (center.tabs[0] ?? null);

  // File tabs: drop the pinned main tab, then filter to only those whose viewId
  // is owned by the active group. `ownedCenterViewIds` undefined = unrestricted.
  const ownedSet = useMemo(
    () => (activeGroup?.ownedCenterViewIds ? new Set(activeGroup.ownedCenterViewIds) : null),
    [activeGroup],
  );

  const fileTabs = useMemo(
    () =>
      center.tabs
        .slice(1)
        .filter((t: TabState) => (ownedSet ? ownedSet.has(t.viewId) : true)),
    [center.tabs, ownedSet],
  );

  // Build the set of tab ids that are actually visible in this group. The
  // active tab we render must be one of them (or the main tab, if not hidden).
  const visibleTabIds = useMemo(() => {
    const ids = new Set<string>();
    if (mainTab) ids.add(mainTab.tabId);
    for (const t of fileTabs) ids.add(t.tabId);
    return ids;
  }, [mainTab, fileTabs]);

  const effectiveActiveTabId = useMemo(() => {
    if (center.activeTabId && visibleTabIds.has(center.activeTabId)) {
      return center.activeTabId;
    }
    // Fall back to the first visible tab so the panel is never blank.
    if (mainTab) return mainTab.tabId;
    return fileTabs[0]?.tabId ?? null;
  }, [center.activeTabId, visibleTabIds, mainTab, fileTabs]);

  // Split tabs into keepAlive (always mounted) and normal — only within the
  // visible set, so hidden-group tabs don't get mounted or run effects.
  const { keepAliveTabs, activeTab } = useMemo(() => {
    const visible = center.tabs.filter((t: TabState) => visibleTabIds.has(t.tabId));
    const active = visible.find((t: TabState) => t.tabId === effectiveActiveTabId) ?? null;
    const keepAlive = visible.filter((t: TabState) => {
      const desc = viewRegistry.get(t.viewId);
      return desc?.keepAlive === true;
    });
    return { keepAliveTabs: keepAlive, activeTab: active };
  }, [center.tabs, visibleTabIds, effectiveActiveTabId]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Tab bar — shown whenever we have any file tabs, OR when the pinned main tab
          is present (so the main pill remains clickable even with no file tabs). */}
      {(fileTabs.length > 0 || mainTab) && (
        <DockTabBar
          tabs={fileTabs}
          activeTabId={effectiveActiveTabId}
          onSelectTab={handleSelectTab}
          onCloseTab={handleCloseTab}
          variant="center"
          region="center"
          mainTabActive={mainTab ? effectiveActiveTabId === mainTab.tabId : false}
          mainTabViewId={mainTab?.viewId}
          onSelectMainTab={mainTab ? () => handleSelectTab(mainTab.tabId) : undefined}
          onDuplicateTab={onDuplicateTab}
        />
      )}

      {/* Tab content area */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {/* Keep-alive tabs: always mounted, hidden when not active.
            Terminal views use visibility+absolute so xterm can measure. */}
        {keepAliveTabs.map((tab: TabState) => {
          const descriptor = viewRegistry.get(tab.viewId);
          if (!descriptor) return null;
          const isActive = tab.tabId === effectiveActiveTabId;
          const isTerminalView =
            tab.viewId === "agent-session" || tab.viewId === "terminal-session";
          const extraProps = {
            ...viewProps?.[tab.viewId],
            ...(tab.props ?? {}),
            ...(isTerminalView ? { isVisible: isActive } : {}),
          };

          // Terminal views need visibility-based hiding (not display:none)
          // so xterm can measure its container dimensions.
          const style: React.CSSProperties = isTerminalView
            ? {
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                visibility: isActive ? "visible" : "hidden",
                zIndex: isActive ? 1 : 0,
              }
            : {
                display: isActive ? "flex" : "none",
                flexDirection: "column",
                height: "100%",
                overflow: "auto",
              };

          return (
            <div key={tab.tabId} style={style}>
              {createElement(descriptor.component, extraProps)}
            </div>
          );
        })}

        {/* Non-keepAlive active tab: mount/unmount on switch */}
        {activeTab && !keepAliveTabs.find((t: TabState) => t.tabId === activeTab.tabId) && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
              overflow: "auto",
            }}
          >
            {(() => {
              const descriptor = viewRegistry.get(activeTab.viewId);
              if (!descriptor) {
                return (
                  <div style={{ padding: 12, color: colors.textTertiary, fontSize: 11 }}>
                    View &quot;{activeTab.viewId}&quot; not found in registry.
                  </div>
                );
              }
              const extraProps = {
                ...viewProps?.[activeTab.viewId],
                ...(activeTab.props ?? {}),
              };
              return createElement(descriptor.component, extraProps);
            })()}
          </div>
        )}

        {/* Empty state — no tabs visible in the current group at all */}
        {visibleTabIds.size === 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: colors.textTertiary,
              fontSize: 13,
            }}
          >
            No tabs open
          </div>
        )}
      </div>
    </div>
  );
});
