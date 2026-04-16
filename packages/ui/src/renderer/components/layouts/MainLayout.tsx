/**
 * @deprecated Use DockManager from components/dock/ instead.
 * Kept for the legacy layout code path (feature flag off).
 * Will be removed once dock layout becomes the default.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";

import { colors } from "../../utils/colors";
import { useSessionStore } from "../../store/sessionStore";

/* ── Constants ── */

const MIN_PANEL_WIDTH = 160;
const DEFAULT_SIDEBAR_WIDTH = 220;
const DEFAULT_ACTIVITY_WIDTH = 260;
const HANDLE_WIDTH = 5;
const COLLAPSE_TRANSITION = "width 0.2s ease, min-width 0.2s ease, opacity 0.15s ease";

type MainLayoutProps = {
  titleBar: React.ReactNode;
  sidebar: React.ReactNode;
  main: React.ReactNode;
  activity: React.ReactNode | null;
  sidebarCollapsed: boolean;
  activityCollapsed: boolean;
};

/* ── Resize handle ── */

function ResizeHandle({
  onDragStart,
  side,
}: {
  onDragStart: (e: React.MouseEvent) => void;
  side: "left" | "right";
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onDragStart}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: HANDLE_WIDTH,
        cursor: "col-resize",
        position: "relative",
        flexShrink: 0,
        zIndex: 10,
        // Slight overlap to make the grab area generous
        ...(side === "left"
          ? { marginLeft: -1, borderRight: `1px solid ${colors.border}` }
          : { marginRight: -1, borderLeft: `1px solid ${colors.border}` }),
      }}
    >
      {/* Highlight bar on hover/drag */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: side === "left" ? "auto" : 0,
          right: side === "left" ? 0 : "auto",
          width: 2,
          background: hovered ? colors.primary : "transparent",
          transition: "background 0.15s",
          borderRadius: 1,
        }}
      />
    </div>
  );
}

/* ── Main layout ── */

export function MainLayout({
  titleBar,
  sidebar,
  main,
  activity,
  sidebarCollapsed,
  activityCollapsed,
}: MainLayoutProps): React.ReactElement {
  const storedSidebarWidth = useSessionStore((s) => s.sidebarWidth);
  const storedActivityWidth = useSessionStore((s) => s.activityPanelWidth);
  const patchSession = useSessionStore((s) => s.patchSession);

  const [sidebarWidth, setSidebarWidth] = useState(storedSidebarWidth ?? DEFAULT_SIDEBAR_WIDTH);
  const [activityWidth, setActivityWidth] = useState(storedActivityWidth ?? DEFAULT_ACTIVITY_WIDTH);

  // Sync from store on initial load
  useEffect(() => {
    if (storedSidebarWidth !== null) setSidebarWidth(storedSidebarWidth);
  }, [storedSidebarWidth]);

  useEffect(() => {
    if (storedActivityWidth !== null) setActivityWidth(storedActivityWidth);
  }, [storedActivityWidth]);

  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<"sidebar" | "activity" | null>(null);

  const clampWidth = useCallback((width: number): number => {
    const container = containerRef.current;
    if (!container) return width;
    const maxWidth = Math.floor(container.offsetWidth * 0.5);
    return Math.max(MIN_PANEL_WIDTH, Math.min(width, maxWidth));
  }, []);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container || !draggingRef.current) return;

      const rect = container.getBoundingClientRect();

      if (draggingRef.current === "sidebar") {
        const newWidth = clampWidth(e.clientX - rect.left);
        setSidebarWidth(newWidth);
      } else {
        const newWidth = clampWidth(rect.right - e.clientX);
        setActivityWidth(newWidth);
      }
    },
    [clampWidth],
  );

  const onMouseUp = useCallback(() => {
    if (!draggingRef.current) return;

    // Persist final widths
    if (draggingRef.current === "sidebar") {
      void patchSession({ sidebarWidth });
    } else {
      void patchSession({ activityPanelWidth: activityWidth });
    }

    draggingRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, [sidebarWidth, activityWidth, patchSession]);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const startDrag = useCallback((which: "sidebar" | "activity") => {
    return (_e: React.MouseEvent) => {
      draggingRef.current = which;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    };
  }, []);

  const showActivity = activity != null && !activityCollapsed;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        fontFamily: "var(--font-sans)",
        fontSize: 12,
        color: colors.text,
        background: colors.bgSurface,
      }}
    >
      {/* Title bar */}
      {titleBar}

      {/* Content area below title bar */}
      <div
        ref={containerRef}
        style={{
          display: "flex",
          flex: 1,
          overflow: "hidden",
        }}
      >
        {/* Sidebar */}
        <aside
          style={{
            width: sidebarCollapsed ? 0 : sidebarWidth,
            minWidth: sidebarCollapsed ? 0 : MIN_PANEL_WIDTH,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            background: colors.bgPanel,
            overflow: "hidden",
            transition: COLLAPSE_TRANSITION,
            opacity: sidebarCollapsed ? 0 : 1,
          }}
        >
          {sidebar}
        </aside>

        {/* Left resize handle (hidden when sidebar collapsed) */}
        {!sidebarCollapsed && (
          <ResizeHandle onDragStart={startDrag("sidebar")} side="left" />
        )}

        {/* Main content */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 200 }}>
          {main}
        </main>

        {/* Right resize handle + Activity panel */}
        {activity != null && (
          <>
            {!activityCollapsed && (
              <ResizeHandle onDragStart={startDrag("activity")} side="right" />
            )}
            <section
              style={{
                width: activityCollapsed ? 0 : activityWidth,
                minWidth: activityCollapsed ? 0 : MIN_PANEL_WIDTH,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                background: colors.bgPanel,
                overflow: "hidden",
                transition: COLLAPSE_TRANSITION,
                opacity: activityCollapsed ? 0 : 1,
              }}
            >
              {activity}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
