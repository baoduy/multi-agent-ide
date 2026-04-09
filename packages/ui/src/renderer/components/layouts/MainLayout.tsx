import React, { useCallback, useEffect, useRef, useState } from "react";

import { useSessionStore } from "../../store/sessionStore";

/* ── Constants ── */

const MIN_PANEL_WIDTH = 180;
const DEFAULT_SIDEBAR_WIDTH = 280;
const DEFAULT_ACTIVITY_WIDTH = 260;
const HANDLE_WIDTH = 5;

type MainLayoutProps = {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  activity: React.ReactNode | null;
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
          ? { marginLeft: -1, borderRight: "1px solid #e5e2da" }
          : { marginRight: -1, borderLeft: "1px solid #e5e2da" }),
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
          background: hovered ? "#C15F3C" : "transparent",
          transition: "background 0.15s",
          borderRadius: 1,
        }}
      />
    </div>
  );
}

/* ── Main layout ── */

export function MainLayout({ sidebar, main, activity }: MainLayoutProps): React.ReactElement {
  const storedSidebarWidth = useSessionStore((s) => s.sidebarWidth);
  const storedActivityWidth = useSessionStore((s) => s.activityPanelWidth);
  const updateSidebarWidth = useSessionStore((s) => s.updateSidebarWidth);
  const updateActivityPanelWidth = useSessionStore((s) => s.updateActivityPanelWidth);

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
      void updateSidebarWidth(sidebarWidth);
    } else {
      void updateActivityPanelWidth(activityWidth);
    }

    draggingRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, [sidebarWidth, activityWidth, updateSidebarWidth, updateActivityPanelWidth]);

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

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, Roboto, 'Helvetica Neue', sans-serif",
        fontSize: 13,
        color: "#2c2c2c",
        background: "#faf9f5",
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: sidebarWidth,
          minWidth: MIN_PANEL_WIDTH,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          background: "#f5f4ed",
          overflow: "hidden",
        }}
      >
        {sidebar}
      </aside>

      {/* Left resize handle */}
      <ResizeHandle onDragStart={startDrag("sidebar")} side="left" />

      {/* Main content */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 200 }}>
        {main}
      </main>

      {/* Right resize handle + Activity panel (only when activity content exists) */}
      {activity != null && (
        <>
          <ResizeHandle onDragStart={startDrag("activity")} side="right" />
          <section
            style={{
              width: activityWidth,
              minWidth: MIN_PANEL_WIDTH,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              background: "#f5f4ed",
              overflow: "hidden",
            }}
          >
            {activity}
          </section>
        </>
      )}
    </div>
  );
}
