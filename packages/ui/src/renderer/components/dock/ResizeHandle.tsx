/**
 * ResizeHandle — draggable handle for resizing panels.
 *
 * Supports both vertical (left/right) and horizontal (top/bottom) orientation.
 * Highlights on hover with the primary brand color.
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import { colors } from "../../utils/colors";

const HANDLE_SIZE = 5;

type ResizeHandleProps = {
  orientation: "vertical" | "horizontal";
  onResize: (delta: number) => void;
  onResizeEnd?: () => void;
};

export const ResizeHandle = React.memo(function ResizeHandle({
  orientation,
  onResize,
  onResizeEnd,
}: ResizeHandleProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const draggingRef = useRef(false);
  const lastPosRef = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      lastPosRef.current = orientation === "vertical" ? e.clientX : e.clientY;
      document.body.style.cursor = orientation === "vertical" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [orientation]
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const current = orientation === "vertical" ? e.clientX : e.clientY;
      const delta = current - lastPosRef.current;
      lastPosRef.current = current;
      onResize(delta);
    };

    const onMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      onResizeEnd?.();
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [orientation, onResize, onResizeEnd]);

  const isVertical = orientation === "vertical";

  return (
    <div
      role="separator"
      aria-orientation={isVertical ? "vertical" : "horizontal"}
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        [isVertical ? "width" : "height"]: HANDLE_SIZE,
        cursor: isVertical ? "col-resize" : "row-resize",
        position: "relative",
        flexShrink: 0,
        zIndex: 10,
        background: isVertical ? colors.bgPanelSoft : "transparent",
        [isVertical ? "borderRight" : "borderTop"]: `1px solid ${colors.border}`,
      }}
    >
      <div
        style={{
          position: "absolute",
          ...(isVertical
            ? { top: 0, bottom: 0, right: 0, width: 2 }
            : { left: 0, right: 0, top: 0, height: 2 }),
          background: hovered || draggingRef.current ? colors.primary : "transparent",
          transition: "background 0.15s",
          borderRadius: 1,
        }}
      />
    </div>
  );
});
