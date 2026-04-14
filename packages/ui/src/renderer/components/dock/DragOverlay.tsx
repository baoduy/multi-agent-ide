/**
 * DragOverlay — global drag overlay showing drop zones during DnD.
 *
 * When a DockView is being dragged, this overlay shows over the DockManager
 * with drop zone indicators for each region (left, right, center, bottom).
 */

import React, { useState } from "react";
import { colors } from "../../utils/colors";
import type { DockRegion } from "./types";

type DragOverlayProps = {
  /** Whether the overlay is currently visible */
  active: boolean;
  /** The view ID being dragged */
  dragViewId: string | null;
  /** Callback when dropped on a region */
  onDrop: (region: DockRegion) => void;
  /** Callback when drag is cancelled */
  onCancel: () => void;
};

export const DockDragOverlay = React.memo(function DockDragOverlay({
  active,
  dragViewId,
  onDrop,
  onCancel,
}: DragOverlayProps): React.ReactElement | null {
  if (!active || !dragViewId) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        pointerEvents: "all",
      }}
      onClick={onCancel}
    >
      {/* Drop zones rendered as quadrants */}
      <div
        style={{
          position: "absolute",
          top: 48,
          left: 48,
          right: 0,
          bottom: 0,
          display: "grid",
          gridTemplateColumns: "200px 1fr 200px",
          gridTemplateRows: "1fr 200px",
          gap: 4,
          padding: 8,
        }}
      >
        <DropZone region="left" label="Left Sidebar" onDrop={onDrop} />
        <DropZone region="center" label="Center (Tab)" onDrop={onDrop} />
        <DropZone region="right" label="Right Sidebar" onDrop={onDrop} />
        <div /> {/* empty cell */}
        <DropZone region="bottom" label="Bottom Panel" onDrop={onDrop} />
        <div /> {/* empty cell */}
      </div>
    </div>
  );
});

/* ── Individual drop zone ── */

function DropZone({
  region,
  label,
  onDrop,
}: {
  region: DockRegion;
  label: string;
  onDrop: (region: DockRegion) => void;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onDrop(region);
      }}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        border: `2px dashed ${hovered ? colors.primary : colors.border}`,
        background: hovered ? `color-mix(in srgb, ${colors.primary} 10%, transparent)` : `color-mix(in srgb, ${colors.border} 24%, transparent)`,
        color: hovered ? colors.primary : colors.textTertiary,
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {label}
    </div>
  );
}
