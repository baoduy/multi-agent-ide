/**
 * DockManager — root container for the VS Code-style dock layout.
 *
 * Owns the layout tree and orchestrates:
 * - ActivityBar (far left icon rail)
 * - Left SideContainer (accordion)
 * - Center TabView + Bottom PanelContainer (split vertically)
 * - Right SideContainer (accordion)
 * - Resize handles between all regions
 *
 * Renders: ActivityBar | Left | [Center / Bottom] | Right
 */

import React, { useCallback, useRef } from "react";
import { useLayoutStore } from "./layoutStore";
import { ActivityBar } from "./ActivityBar";
import { SideContainer } from "./SideContainer";
import { TabView } from "./TabView";
import { PanelContainer } from "./PanelContainer";
import { ResizeHandle } from "./ResizeHandle";
import { DockDragOverlay } from "./DragOverlay";
import { useDockDrag } from "./useDockDrag";
import { colors } from "../../utils/colors";
import type { DockRegion } from "./types";

const MIN_SIDE_WIDTH = 180;
const MIN_BOTTOM_HEIGHT = 100;
const MAX_SIDE_RATIO = 0.4;

type DockManagerProps = {
  /** Slot for the title bar (rendered above everything) */
  titleBar?: React.ReactNode;
  /** Slot for the status bar (rendered below everything) */
  statusBar?: React.ReactNode;
  /** Extra props passed to individual view components by viewId */
  viewProps?: Record<string, Record<string, unknown>>;
  /** Callback when settings is clicked in activity bar */
  onSettingsClick?: () => void;
};

export const DockManager = React.memo(function DockManager({
  titleBar,
  statusBar,
  viewProps,
  onSettingsClick,
}: DockManagerProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);

  // Layout state slices
  const leftWidth = useLayoutStore((s) => s.layout.left.width);
  const leftCollapsed = useLayoutStore((s) => s.layout.left.collapsed);
  const rightWidth = useLayoutStore((s) => s.layout.right.width);
  const rightCollapsed = useLayoutStore((s) => s.layout.right.collapsed);
  const bottomHeight = useLayoutStore((s) => s.layout.bottom.height);
  const bottomCollapsed = useLayoutStore((s) => s.layout.bottom.collapsed);
  const bottomTabs = useLayoutStore((s) => s.layout.bottom.tabs);

  const setRegionWidth = useLayoutStore((s) => s.setRegionWidth);
  const setRegionHeight = useLayoutStore((s) => s.setRegionHeight);

  // Clamp helpers
  const clampSideWidth = useCallback(
    (width: number) => {
      const container = containerRef.current;
      if (!container) return Math.max(MIN_SIDE_WIDTH, width);
      const maxWidth = Math.floor(container.offsetWidth * MAX_SIDE_RATIO);
      return Math.max(MIN_SIDE_WIDTH, Math.min(width, maxWidth));
    },
    []
  );

  const clampBottomHeight = useCallback(
    (height: number) => {
      const container = containerRef.current;
      if (!container) return Math.max(MIN_BOTTOM_HEIGHT, height);
      const maxHeight = Math.floor(container.offsetHeight * 0.6);
      return Math.max(MIN_BOTTOM_HEIGHT, Math.min(height, maxHeight));
    },
    []
  );

  // Resize handlers
  const handleLeftResize = useCallback(
    (delta: number) => {
      const newWidth = clampSideWidth(leftWidth + delta);
      setRegionWidth("left", newWidth);
    },
    [leftWidth, clampSideWidth, setRegionWidth]
  );

  const handleRightResize = useCallback(
    (delta: number) => {
      // Right side: dragging left = smaller (negative delta = bigger)
      const newWidth = clampSideWidth(rightWidth - delta);
      setRegionWidth("right", newWidth);
    },
    [rightWidth, clampSideWidth, setRegionWidth]
  );

  const handleBottomResize = useCallback(
    (delta: number) => {
      // Bottom: dragging up = bigger (negative delta = bigger)
      const newHeight = clampBottomHeight(bottomHeight - delta);
      setRegionHeight("bottom", newHeight);
    },
    [bottomHeight, clampBottomHeight, setRegionHeight]
  );

  // Drag-and-drop state
  const isDragging = useDockDrag((s) => s.isDragging);
  const dragViewId = useDockDrag((s) => s.dragViewId);
  const fromRegion = useDockDrag((s) => s.fromRegion);
  const endDrag = useDockDrag((s) => s.endDrag);
  const moveView = useLayoutStore((s) => s.moveView);

  const handleDrop = useCallback(
    (toRegion: DockRegion) => {
      if (dragViewId && fromRegion && fromRegion !== toRegion) {
        moveView(dragViewId, fromRegion, toRegion);
      }
      endDrag();
    },
    [dragViewId, fromRegion, moveView, endDrag]
  );

  const handleDragCancel = useCallback(() => {
    endDrag();
  }, [endDrag]);

  const showBottom = bottomTabs.length > 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, Roboto, 'Helvetica Neue', sans-serif",
        fontSize: 13,
        color: colors.text,
        background: colors.bgSurface,
      }}
    >
      {/* Title bar */}
      {titleBar}

      {/* Main content area */}
      <div
        ref={containerRef}
        style={{
          display: "flex",
          flex: 1,
          overflow: "hidden",
        }}
      >
        {/* Activity Bar (far left icon rail) */}
        <ActivityBar onSettingsClick={onSettingsClick} />

        {/* Left Sidebar */}
        {!leftCollapsed && (
          <>
            <aside
              style={{
                width: leftWidth,
                minWidth: MIN_SIDE_WIDTH,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                background: colors.bgPanelSoft,
                overflow: "hidden",
              }}
            >
              <SideContainer region="left" viewProps={viewProps} />
            </aside>
            <ResizeHandle orientation="vertical" onResize={handleLeftResize} />
          </>
        )}

        {/* Center + Bottom (stacked vertically) */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            minWidth: 200,
          }}
        >
          {/* Center TabView */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              minHeight: 100,
            }}
          >
            <TabView viewProps={viewProps} />
          </div>

          {/* Bottom Panel */}
          {showBottom && (
            <>
              {!bottomCollapsed && (
                <ResizeHandle orientation="horizontal" onResize={handleBottomResize} />
              )}
              <div
                style={{
                  height: bottomCollapsed ? "auto" : bottomHeight,
                  minHeight: bottomCollapsed ? 0 : MIN_BOTTOM_HEIGHT,
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <PanelContainer viewProps={viewProps} />
              </div>
            </>
          )}
        </div>

        {/* Right Sidebar */}
        {!rightCollapsed && (
          <>
            <ResizeHandle orientation="vertical" onResize={handleRightResize} />
            <aside
              style={{
                width: rightWidth,
                minWidth: MIN_SIDE_WIDTH,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                background: colors.bgPanelSoft,
                overflow: "hidden",
              }}
            >
              <SideContainer region="right" viewProps={viewProps} />
            </aside>
          </>
        )}
      </div>

      {/* Status bar */}
      {statusBar}

      {/* Drag overlay — shown when dragging a view between regions */}
      <DockDragOverlay
        active={isDragging}
        dragViewId={dragViewId}
        onDrop={handleDrop}
        onCancel={handleDragCancel}
      />
    </div>
  );
});
