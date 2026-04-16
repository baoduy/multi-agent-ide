/**
 * AccordionSection — a single collapsible section inside a SideContainer.
 *
 * Renders a clickable header with chevron + title, and a body that
 * collapses to zero height. Used in left/right sidebars.
 *
 * Supports drag initiation: long-press or drag the grip handle to start
 * a cross-region move via useDockDrag.
 */

import React, { useState, useCallback, useRef } from "react";
import { ChevronRight, ChevronDown, GripVertical } from "lucide-react";
import { colors } from "../../utils/colors";
import { ScrollableText } from "../common/ScrollableText";
import { useDockDrag } from "./useDockDrag";
import type { DockRegion } from "./types";

type AccordionSectionProps = {
  viewId: string;
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  /** The region this section belongs to (for drag source tracking) */
  region?: DockRegion;
  /** Whether this section is currently being dragged over */
  isDragOver?: boolean;
};

export const AccordionSection = React.memo(function AccordionSection({
  viewId,
  title,
  icon,
  expanded,
  onToggle,
  children,
  region,
  isDragOver,
}: AccordionSectionProps): React.ReactElement {
  const [headerHovered, setHeaderHovered] = useState(false);
  const [gripHovered, setGripHovered] = useState(false);
  const startDrag = useDockDrag((s) => s.startDrag);
  const isDragging = useDockDrag((s) => s.isDragging);
  const dragViewId = useDockDrag((s) => s.dragViewId);

  // Track mouse down on grip to distinguish click from drag
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const dragStarted = useRef(false);

  const handleGripMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      dragStartPos.current = { x: e.clientX, y: e.clientY };
      dragStarted.current = false;

      const onMouseMove = (me: MouseEvent) => {
        if (!dragStartPos.current || dragStarted.current) return;
        const dx = me.clientX - dragStartPos.current.x;
        const dy = me.clientY - dragStartPos.current.y;
        // Start drag after 5px movement threshold
        if (Math.abs(dx) + Math.abs(dy) > 5) {
          dragStarted.current = true;
          if (region) {
            startDrag(viewId, region);
          }
        }
      };

      const onMouseUp = () => {
        dragStartPos.current = null;
        dragStarted.current = false;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [viewId, region, startDrag]
  );

  const isBeingDragged = isDragging && dragViewId === viewId;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        overflow: "hidden",
        borderTop: `1px solid ${colors.border}`,
        opacity: isBeingDragged ? 0.4 : 1,
        transition: "opacity 0.15s",
        ...(isDragOver
          ? { outline: `2px solid ${colors.primary}`, outlineOffset: -2 }
          : {}),
      }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 6px",
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          cursor: "pointer",
          border: "none",
          background: headerHovered ? colors.bgHover : "transparent",
          color: colors.textTertiary,
          transition: "background 0.12s, color 0.12s",
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        {/* Drag handle */}
        {region && (
          <span
            onMouseDown={handleGripMouseDown}
            onMouseEnter={() => setGripHovered(true)}
            onMouseLeave={() => setGripHovered(false)}
            style={{
              display: "inline-flex",
              cursor: "grab",
              color: colors.textTertiary,
              opacity: headerHovered || gripHovered ? 0.7 : 0,
              transition: "opacity 0.15s",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={12} strokeWidth={1.5} />
          </span>
        )}

        {/* Chevron */}
        {expanded ? (
          <ChevronDown size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
        ) : (
          <ChevronRight size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
        )}

        {/* Icon */}
        <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
          {icon}
        </span>

        {/* Title */}
        <ScrollableText style={{ flex: 1 }}>
          {title}
        </ScrollableText>
      </button>

      {/* Body — collapse via height */}
      {expanded && (
        <div
          style={{
            flex: 1,
            overflow: "auto",
            minHeight: 0,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
});
