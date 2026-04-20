/**
 * DockTabBar — shared tab bar component used by TabView (center) and PanelContainer (bottom).
 *
 * Renders horizontal scrollable tabs with drag-to-move support.
 * Each tab shows title + optional close button.
 * Active tab gets primary-colored bottom border.
 * Drag a tab to initiate cross-region move via useDockDrag.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { X, Terminal, ChevronDown, Copy, GitBranch } from "lucide-react";
import { colors } from "../../utils/colors";
import { viewRegistry } from "./ViewRegistry";
import { useDockDrag } from "./useDockDrag";
import { ProviderIcon } from "../common/ProviderIcon";
import { ScrollableText } from "../common/ScrollableText";
import { ContextMenu, useContextMenu } from "../common/ContextMenu";
import type { ContextMenuAction } from "../common/ContextMenu";
import { openWithVsCodeAction } from "../../utils/contextMenuActions";
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
  /** Callback to duplicate an agent-session tab */
  onDuplicateTab?: (tab: TabState) => void;
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

/**
 * Extract the branch/workspace label from a tab's props for agent-session tabs.
 */
function resolveTabBranchLabel(tab: TabState): string | null {
  if (tab.viewId !== "agent-session") return null;
  return (tab.props?.branchLabel as string | null | undefined) ?? null;
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
  onDuplicateTab,
}: DockTabBarProps): React.ReactElement | null {
  if (tabs.length === 0 && !mainTabViewId) return null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Context menu for tab right-click
  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();
  const contextMenuTabRef = useRef<TabState | null>(null);

  // Detect overflow
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const check = () => {
      setIsOverflowing(el.scrollWidth > el.clientWidth);
    };

    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [tabs.length]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  // Build context menu items for the right-clicked tab
  const buildTabContextMenuItems = useCallback(
    (tab: TabState): ContextMenuAction[] => {
      const items: ContextMenuAction[] = [];

      // "Duplicate Session" — only for agent-session tabs
      if (tab.viewId === "agent-session" && onDuplicateTab) {
        items.push({
          label: "Duplicate Session",
          Icon: Copy,
          action: () => onDuplicateTab(tab),
        });
      }

      // "Open with Code" — only for agent-session tabs with a cwd
      if (tab.viewId === "agent-session") {
        const cwd = tab.props?.cwd as string | undefined;
        items.push(
          openWithVsCodeAction(cwd ?? "", {
            label: "Open with Code",
            disabled: !cwd,
            variant: "visual-studio",
          }),
        );
      }

      // "Close" — available for all closable tabs
      const descriptor = viewRegistry.get(tab.viewId);
      if (descriptor?.closable !== false && onCloseTab) {
        items.push({
          label: "Close",
          Icon: X,
          separator: items.length > 0,
          action: () => onCloseTab(tab.tabId),
        });

        // "Close Others"
        const otherClosable = tabs.filter(
          (t) => t.tabId !== tab.tabId && viewRegistry.get(t.viewId)?.closable !== false
        );
        if (otherClosable.length > 0) {
          items.push({
            label: "Close Others",
            action: () => {
              for (const t of otherClosable) onCloseTab(t.tabId);
            },
          });
        }
      }

      return items;
    },
    [tabs, onCloseTab, onDuplicateTab]
  );

  const handleTabContextMenu = useCallback(
    (e: React.MouseEvent, tab: TabState) => {
      contextMenuTabRef.current = tab;
      openContextMenu(e);
    },
    [openContextMenu]
  );

  // Resolve main tab descriptor for the back-to-main pill
  const mainDescriptor = mainTabViewId ? viewRegistry.get(mainTabViewId) : null;

  return (
    <div
      style={{
        display: "flex",
        borderBottom: variant === "center" ? `1px solid ${colors.border}` : "none",
        borderTop: variant === "bottom" ? `1px solid ${colors.border}` : "none",
        background: "transparent",
        flexShrink: 0,
        minHeight: 30,
        position: "relative",
      }}
    >
      <div
        ref={scrollRef}
        className="dock-tab-bar-no-scrollbar"
        style={{
          display: "flex",
          padding: "0 4px",
          overflowX: "auto",
          flex: 1,
          minWidth: 0,
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
          const branchLabel = resolveTabBranchLabel(tab);

          return (
            <TabItem
              key={tab.tabId}
              tabId={tab.tabId}
              viewId={tab.viewId}
              title={title}
              icon={icon}
              branchLabel={branchLabel}
              isActive={isActive}
              closable={closable}
              onSelect={onSelectTab}
              onClose={onCloseTab}
              region={region}
              onContextMenu={(e) => handleTabContextMenu(e, tab)}
            />
          );
        })}
      </div>

      {/* Overflow dropdown trigger */}
      {isOverflowing && (
        <div ref={dropdownRef} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          <TabOverflowButton
            tabs={tabs}
            activeTabId={activeTabId}
            mainTabViewId={mainTabViewId}
            mainTabActive={mainTabActive}
            open={dropdownOpen}
            onToggle={() => setDropdownOpen((v) => !v)}
            onSelectTab={(tabId) => {
              onSelectTab(tabId);
              setDropdownOpen(false);
            }}
            onSelectMainTab={onSelectMainTab ? () => {
              onSelectMainTab();
              setDropdownOpen(false);
            } : undefined}
          />
        </div>
      )}

      {/* Tab right-click context menu */}
      {contextMenu && contextMenuTabRef.current && (
        <ContextMenu
          position={contextMenu}
          items={buildTabContextMenuItems(contextMenuTabRef.current)}
          onClose={closeContextMenu}
        />
      )}
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
        gap: 4,
        padding: "4px 8px",
        fontSize: 11,
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
  branchLabel,
  isActive,
  closable,
  onSelect,
  onClose,
  region,
  onContextMenu,
}: {
  tabId: string;
  viewId: string;
  title: string;
  icon?: React.ReactNode;
  branchLabel?: string | null;
  isActive: boolean;
  closable: boolean;
  onSelect: (tabId: string) => void;
  onClose?: (tabId: string) => void;
  region?: DockRegion;
  onContextMenu?: (e: React.MouseEvent) => void;
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
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 8px",
        fontSize: 11,
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
      <ScrollableText style={{ maxWidth: 120 }}>
        {title}
      </ScrollableText>
      {branchLabel && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
            opacity: isActive ? 0.65 : 0.5,
            flexShrink: 0,
            maxWidth: 100,
            overflow: "hidden",
          }}
        >
          <GitBranch size={10} strokeWidth={2} style={{ flexShrink: 0 }} />
          <ScrollableText style={{ fontSize: 10 }}>
            {branchLabel}
          </ScrollableText>
        </span>
      )}
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

/* ── Tab overflow dropdown ── */

function TabOverflowButton({
  tabs,
  activeTabId,
  mainTabViewId,
  mainTabActive,
  open,
  onToggle,
  onSelectTab,
  onSelectMainTab,
}: {
  tabs: TabState[];
  activeTabId: string | null;
  mainTabViewId?: string;
  mainTabActive?: boolean;
  open: boolean;
  onToggle: () => void;
  onSelectTab: (tabId: string) => void;
  onSelectMainTab?: () => void;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const mainDescriptor = mainTabViewId ? viewRegistry.get(mainTabViewId) : null;

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title="Open tab list"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 22,
          height: 22,
          margin: "2px 4px 2px 0",
          borderRadius: 4,
          border: `1px solid ${open ? colors.border : "transparent"}`,
          background: open ? colors.bgHover : hovered ? colors.bgHover : "transparent",
          color: colors.textSecondary,
          cursor: "pointer",
          transition: "background 0.1s, border-color 0.1s",
          flexShrink: 0,
        }}
      >
        <ChevronDown size={14} strokeWidth={2} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 2,
            minWidth: 200,
            maxWidth: 320,
            maxHeight: 320,
            overflowY: "auto",
            background: colors.dialogBg,
            border: `1px solid ${colors.border}`,
            borderRadius: 6,
            boxShadow: colors.dialogShadow,
            zIndex: 1000,
            padding: "4px 0",
          }}
        >
          {/* Main tab entry */}
          {mainDescriptor && onSelectMainTab && (
            <DropdownItem
              title={mainDescriptor.title}
              icon={mainDescriptor.icon}
              isActive={mainTabActive ?? false}
              onClick={onSelectMainTab}
            />
          )}
          {/* All tabs */}
          {tabs.map((tab) => {
            const descriptor = viewRegistry.get(tab.viewId);
            const title = tab.title ?? descriptor?.title ?? tab.viewId;
            const icon = resolveTabIcon(tab, descriptor?.icon);
            const isActive = tab.tabId === activeTabId;
            const branchLabel = resolveTabBranchLabel(tab);
            return (
              <DropdownItem
                key={tab.tabId}
                title={title}
                icon={icon}
                branchLabel={branchLabel}
                isActive={isActive}
                onClick={() => onSelectTab(tab.tabId)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function DropdownItem({
  title,
  icon,
  branchLabel,
  isActive,
  onClick,
}: {
  title: string;
  icon?: React.ReactNode;
  branchLabel?: string | null;
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
        gap: 6,
        width: "100%",
        padding: "4px 10px",
        fontSize: 11,
        fontWeight: isActive ? 500 : 400,
        cursor: "pointer",
        border: "none",
        borderLeft: isActive ? `2px solid ${colors.primary}` : "2px solid transparent",
        background: hovered ? colors.bgHover : "transparent",
        color: isActive ? colors.textStrong : colors.textSecondary,
        textAlign: "left",
        transition: "background 0.1s, color 0.1s",
      }}
    >
      {icon && (
        <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
          {icon}
        </span>
      )}
      <ScrollableText
        style={{
          flex: 1,
          minWidth: 0,
        }}
      >
        {title}
      </ScrollableText>
      {branchLabel && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            flexShrink: 0,
            opacity: 0.6,
            fontSize: 10,
            maxWidth: 100,
            overflow: "hidden",
          }}
        >
          <GitBranch size={10} strokeWidth={2} style={{ flexShrink: 0 }} />
          <ScrollableText>
            {branchLabel}
          </ScrollableText>
        </span>
      )}
    </button>
  );
}
