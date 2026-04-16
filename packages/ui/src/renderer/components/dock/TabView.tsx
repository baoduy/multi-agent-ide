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
import type { TabState, CenterState } from "./types";
import { colors } from "../../utils/colors";

type TabViewProps = {
  /** Extra props to pass down to individual view components by viewId */
  viewProps?: Record<string, Record<string, unknown>>;
};

export const TabView = React.memo(function TabView({
  viewProps,
}: TabViewProps): React.ReactElement {
  const center: CenterState = useLayoutStore((s) => s.layout.center);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const closeTab = useLayoutStore((s) => s.closeTab);

  const handleSelectTab = useCallback(
    (tabId: string) => setActiveTab("center", tabId),
    [setActiveTab]
  );

  const handleCloseTab = useCallback(
    (tabId: string) => closeTab("center", tabId),
    [closeTab]
  );

  // The first tab ("tab-main") is the pinned builtin view, controlled by the TitleBar.
  // File tabs come after it. The DockTabBar only shows file tabs.
  const mainTab = center.tabs[0] ?? null;
  const fileTabs = useMemo(() => center.tabs.slice(1), [center.tabs]);

  // Split tabs into keepAlive (always mounted) and normal
  const { keepAliveTabs, activeTab } = useMemo(() => {
    const active = center.tabs.find((t: TabState) => t.tabId === center.activeTabId) ?? null;
    const keepAlive = center.tabs.filter((t: TabState) => {
      const desc = viewRegistry.get(t.viewId);
      return desc?.keepAlive === true;
    });
    return { keepAliveTabs: keepAlive, activeTab: active };
  }, [center.tabs, center.activeTabId]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Tab bar — only shown for file tabs (main tab is controlled by TitleBar) */}
      {fileTabs.length > 0 && mainTab && (
        <DockTabBar
          tabs={fileTabs}
          activeTabId={center.activeTabId}
          onSelectTab={handleSelectTab}
          onCloseTab={handleCloseTab}
          variant="center"
          region="center"
          mainTabActive={center.activeTabId === mainTab.tabId}
          mainTabViewId={mainTab.viewId}
          onSelectMainTab={() => handleSelectTab(mainTab.tabId)}
        />
      )}

      {/* Tab content area */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {/* Keep-alive tabs: always mounted, hidden when not active.
            Terminal views use visibility+absolute so xterm can measure. */}
        {keepAliveTabs.map((tab: TabState) => {
          const descriptor = viewRegistry.get(tab.viewId);
          if (!descriptor) return null;
          const isActive = tab.tabId === center.activeTabId;
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

        {/* Empty state */}
        {center.tabs.length === 0 && (
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
