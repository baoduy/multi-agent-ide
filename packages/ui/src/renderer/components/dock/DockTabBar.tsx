/**
 * DockTabBar — shared tab bar component used by TabView (center) and PanelContainer (bottom).
 *
 * Renders horizontal scrollable tabs with drag-to-move support.
 * Each tab shows title + optional close button.
 * Active tab gets primary-colored bottom border.
 * Drag a tab to initiate cross-region move via useDockDrag.
 */

import React, { useState, useCallback, useRef } from "react";
import { X, Terminal } from "lucide-react";
import { colors } from "../../utils/colors";
import { viewRegistry } from "./ViewRegistry";
import { useDockDrag } from "./useDockDrag";
import { ProviderIcon } from "../common/ProviderIcon";
import type { TabState, DockRegion } from "./types";

type DockTabBarProps = {
  tabs: TabState[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
  /** Style variant */
  variant?: "center" | "bottom";
  /** Region this tab bar belongs to (for drag source tracking) */
  region?: DockRegion;
  /** Whether the pinned main tab (controlled by TitleBar) is active */
  mainTabActive?: boolean;
  /** Current viewId of the pinned main tab (for title/icon display) */
  mainTabViewId?: string;
  /** Callback to re-activate the main tab */
  onSelectMainTab?: () => void;
};

const TabCloseButton = React.memo(function TabCloseButton({
  onClick,
}: {
  onClick: (e: React.MouseEvent) => void;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <span
      role="button"
      tabIndex={-1}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 16,
        height: 16,
        borderRadius: 3,
        fontSize: 11,
        lineHeight: 1,
        color: hovered ? colors.textStrong : colors.textTertiary,
        background: hovered ? colors.border : "transparent",
        cursor: "pointer",
        marginLeft: 4,
        transition: "all 0.1s",
      }}
    >
      <X size={10} strokeWidth={2} />
    </span>
  );
});

/**
 * Resolve the icon for a tab, preferring dynamic provider icons for session tabs.
 * - agent-session tabs: show Claude or Copilot brand icon based on aiProvider prop
 * - terminal-session tabs: show Terminal icon (already matches registry, but explicit)
 * - all others: fall back to the static ViewRegistry icon
 */
function resolveTabIcon(tab: TabState, registryIcon?: React.ReactNode): React.ReactNode {
  if (tab.viewId === "agent-session") {
    const provider = tab.props?.aiProvider as "claude" | "copilot" | undefined;
    if (provider) {
      return <ProviderIcon provider={provider} size={14} />;
    }
  }
  if (tab.viewId === "terminal-session") {
    return <Terminal size={14} strokeWidth={1.8} />;
  }
  return registryIcon;
}

export const DockTabBar = React.memo(function DockTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  variant = "center",
  region,
  mainTabActive,
  mainTabViewId,
  onSelectMainTab,
}: DockTabBarProps): React.ReactElement | null {
  if (tabs.length === 0 && !mainTabViewId) return null;

  // Resolve main tab descriptor for the back-to-main pill
  const mainDescriptor = mainTabViewId ? viewRegistry.get(mainTabViewId) : null;

  return (
    <div
      className="dock-tab-bar-no-scrollbar"
      style={{
        display: "flex",
        borderBottom: variant === "center" ? `1px solid ${colors.border}` : "none",
        borderTop: variant === "bottom" ? `1px solid ${colors.border}` : "none",
        background: "transparent",
        padding: "0 4px",
        overflowX: "auto",
        flexShrink: 0,
        minHeight: 35,
      }}
    >
      {/* Main tab pill (back to TitleBar-controlled view) — only in center variant */}
      {variant === "center" && mainDescriptor && onSelectMainTab && (
        <MainTabPill
          title={mainDescriptor.title}
          icon={mainDescriptor.icon}
          isActive={mainTabActive ?? false}
          onClick={onSelectMainTab}
        />
      )}

      {tabs.map((tab) => {
        const isActive = tab.tabId === activeTabId;
        const descriptor = viewRegistry.get(tab.viewId);
        const title = tab.title ?? descriptor?.title ?? tab.viewId;
        const closable = descriptor?.closable !== false;
        const icon = resolveTabIcon(tab, descriptor?.icon);

        return (
          <TabItem
            key={tab.tabId}
            tabId={tab.tabId}
            viewId={tab.viewId}
            title={title}
            icon={icon}
            isActive={isActive}
            closable={closable}
            onSelect={onSelectTab}
            onClose={onCloseTab}
            region={region}
          />
        );
      })}
    </div>
  );
});

/* ── Main tab pill — clickable indicator to return to the TitleBar-controlled view ── */

const MainTabPill = React.memo(function MainTabPill({
  title,
  icon,
  isActive,
  onClick,
}: {
  title: string;
  icon?: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "7px 10px",
        fontSize: 12,
        fontWeight: isActive ? 500 : 400,
        cursor: "pointer",
        border: "none",
        borderBottom: isActive
          ? `2px solid ${colors.primary}`
          : "2px solid transparent",
        background: "transparent",
        color: isActive || hovered ? colors.textStrong : colors.textTertiary,
        transition: "color 0.12s, border-color 0.12s",
        marginBottom: -1,
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}
    >
      {icon && (
        <span style={{ display: "inline-flex", alignItems: "center" }}>
          {icon}
        </span>
      )}
      <span>{title}</span>
    </button>
  );
});

/* ── Individual tab item (memoized) with drag support ── */

const TabItem = React.memo(function TabItem({
  tabId,
  viewId,
  title,
  icon,
  isActive,
  closable,
  onSelect,
  onClose,
  region,
}: {
  tabId: string;
  viewId: string;
  title: string;
  icon?: React.ReactNode;
  isActive: boolean;
  closable: boolean;
  onSelect: (tabId: string) => void;
  onClose?: (tabId: string) => void;
  region?: DockRegion;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const startDrag = useDockDrag((s) => s.startDrag);
  const isDragging = useDockDrag((s) => s.isDragging);
  const dragViewId = useDockDrag((s) => s.dragViewId);

  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const dragStarted = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only left click, don't interfere with close button
      if (e.button !== 0) return;
      dragStartPos.current = { x: e.clientX, y: e.clientY };
      dragStarted.current = false;

      const onMouseMove = (me: MouseEvent) => {
        if (!dragStartPos.current || dragStarted.current) return;
        const dx = me.clientX - dragStartPos.current.x;
        const dy = me.clientY - dragStartPos.current.y;
        if (Math.abs(dx) + Math.abs(dy) > 8) {
          dragStarted.current = true;
          if (region) {
            startDrag(viewId, region);
          }
        }
      };

      const onMouseUp = () => {
        if (!dragStarted.current) {
          // It was a click, not a drag
          onSelect(tabId);
        }
        dragStartPos.current = null;
        dragStarted.current = false;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [tabId, viewId, region, startDrag, onSelect]
  );

  const isBeingDragged = isDragging && dragViewId === viewId;

  return (
    <button
      type="button"
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "7px 10px",
        fontSize: 12,
        fontWeight: isActive ? 500 : 400,
        cursor: "pointer",
        border: "none",
        borderBottom: isActive
          ? `2px solid ${colors.primary}`
          : "2px solid transparent",
        background: "transparent",
        color: isActive || hovered ? colors.textStrong : colors.textTertiary,
        transition: "color 0.12s, border-color 0.12s, opacity 0.15s",
        marginBottom: -1,
        flexShrink: 0,
        whiteSpace: "nowrap",
        opacity: isBeingDragged ? 0.4 : 1,
      }}
    >
      {icon && (
        <span style={{ display: "inline-flex", alignItems: "center" }}>
          {icon}
        </span>
      )}
      <span style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }}>
        {title}
      </span>
      {closable && onClose && (
        <TabCloseButton
          onClick={(e) => {
            e.stopPropagation();
            onClose(tabId);
          }}
        />
      )}
    </button>
  );
});
