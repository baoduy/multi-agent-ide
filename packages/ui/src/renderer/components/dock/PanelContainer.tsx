/**
 * PanelContainer — bottom panel (tabbed stack of DockViews).
 *
 * Similar to TabView but positioned at the bottom, with maximize/minimize controls.
 * Shows Problems, Output, Terminal, Agent Logs, etc.
 */

import React, { useCallback, createElement, useState } from "react";
import { Minus, Maximize2, Minimize2, X } from "lucide-react";
import { useLayoutStore } from "./layoutStore";
import { viewRegistry } from "./ViewRegistry";
import { DockTabBar } from "./DockTabBar";
import type { PanelContainerState, TabState } from "./types";
import { colors } from "../../utils/colors";

type PanelContainerProps = {
  /** Extra props to pass down to individual view components by viewId */
  viewProps?: Record<string, Record<string, unknown>>;
};

export const PanelContainer = React.memo(function PanelContainer({
  viewProps,
}: PanelContainerProps): React.ReactElement | null {
  const container: PanelContainerState = useLayoutStore((s) => s.layout.bottom);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const closeTab = useLayoutStore((s) => s.closeTab);
  const toggleCollapse = useLayoutStore((s) => s.toggleRegionCollapse);

  const [maximized, setMaximized] = useState(false);

  const handleSelectTab = useCallback(
    (tabId: string) => {
      setActiveTab("bottom", tabId);
      // If collapsed, expand when a tab is clicked
      const current = useLayoutStore.getState().layout.bottom;
      if (current.collapsed) {
        toggleCollapse("bottom");
      }
    },
    [setActiveTab, toggleCollapse]
  );

  const handleCloseTab = useCallback(
    (tabId: string) => closeTab("bottom", tabId),
    [closeTab]
  );

  const handleToggleCollapse = useCallback(() => {
    toggleCollapse("bottom");
  }, [toggleCollapse]);

  const handleMaximize = useCallback(() => {
    setMaximized((prev) => !prev);
  }, []);

  // Don't render if no tabs
  if (container.tabs.length === 0) return null;

  const activeTab = container.tabs.find(
    (t: TabState) => t.tabId === container.activeTabId
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: container.collapsed ? "auto" : "100%",
        overflow: "hidden",
      }}
    >
      {/* Header: tab bar + action buttons */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          borderTop: `1px solid ${colors.border}`,
        }}
      >
        <div style={{ flex: 1, overflow: "hidden" }}>
          <DockTabBar
            tabs={container.tabs}
            activeTabId={container.activeTabId}
            onSelectTab={handleSelectTab}
            onCloseTab={handleCloseTab}
            variant="bottom"
            region="bottom"
          />
        </div>

        {/* Action buttons */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            padding: "0 8px",
            flexShrink: 0,
          }}
        >
          <PanelActionButton
            icon={maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            title={maximized ? "Restore" : "Maximize"}
            onClick={handleMaximize}
          />
          <PanelActionButton
            icon={<Minus size={13} />}
            title={container.collapsed ? "Expand" : "Minimize"}
            onClick={handleToggleCollapse}
          />
        </div>
      </div>

      {/* Body — hidden when collapsed */}
      {!container.collapsed && activeTab && (
        <div style={{ flex: 1, overflow: "auto" }}>
          {(() => {
            const descriptor = viewRegistry.get(activeTab.viewId);
            if (!descriptor) return null;
            const extraProps = {
              ...viewProps?.[activeTab.viewId],
              ...(activeTab.props ?? {}),
            };
            return createElement(descriptor.component, extraProps);
          })()}
        </div>
      )}
    </div>
  );
});

/* ── Small action button ── */

function PanelActionButton({
  icon,
  title,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 22,
        height: 22,
        borderRadius: 4,
        border: "none",
        background: hovered ? colors.bgHover : "transparent",
        color: colors.textTertiary,
        cursor: "pointer",
        transition: "background 0.1s",
      }}
    >
      {icon}
    </button>
  );
}
