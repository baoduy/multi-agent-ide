/**
 * ActivityBar — thin icon rail on the far left (VS Code style).
 *
 * Each icon toggles visibility of its associated sidebar section.
 * Primary items at the top, secondary items at the bottom.
 */

import React, { useCallback, useState } from "react";
import { useLayoutStore } from "./layoutStore";
import { viewRegistry } from "./ViewRegistry";
import { colors } from "../../utils/colors";
import { Settings } from "lucide-react";

type ActivityBarProps = {
  onSettingsClick?: () => void;
};

export const ActivityBar = React.memo(function ActivityBar({
  onSettingsClick,
}: ActivityBarProps): React.ReactElement | null {
  const activityBar = useLayoutStore((s) => s.layout.activityBar);
  const setActiveItem = useLayoutStore((s) => s.setActiveActivityItem);
  const toggleLeft = useLayoutStore((s) => s.toggleRegionCollapse);
  const leftCollapsed = useLayoutStore((s) => s.layout.left.collapsed);

  const handleItemClick = useCallback(
    (viewId: string) => {
      if (activityBar.activeItem === viewId) {
        // Toggle sidebar collapse
        toggleLeft("left");
      } else {
        setActiveItem(viewId);
        if (leftCollapsed) {
          toggleLeft("left");
        }
      }
    },
    [activityBar.activeItem, setActiveItem, toggleLeft, leftCollapsed]
  );

  if (!activityBar.visible) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 48,
        minWidth: 48,
        background: colors.bgPanel,
        borderRight: `1px solid ${colors.border}`,
        alignItems: "center",
        paddingTop: 4,
        flexShrink: 0,
      }}
    >
      {/* Primary items (top) */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          flex: 1,
        }}
      >
        {activityBar.primaryItems.map((viewId) => {
          const descriptor = viewRegistry.get(viewId);
          if (!descriptor) return null;

          return (
            <ActivityBarItem
              key={viewId}
              viewId={viewId}
              icon={descriptor.icon}
              title={descriptor.title}
              isActive={activityBar.activeItem === viewId && !leftCollapsed}
              onClick={() => handleItemClick(viewId)}
            />
          );
        })}
      </div>

      {/* Secondary items (bottom) */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          paddingBottom: 8,
        }}
      >
        {onSettingsClick && (
          <ActivityBarItem
            viewId="settings"
            icon={<Settings size={20} strokeWidth={1.5} />}
            title="Settings"
            isActive={false}
            onClick={onSettingsClick}
          />
        )}
      </div>
    </div>
  );
});

/* ── Individual activity bar icon ── */

const ActivityBarItem = React.memo(function ActivityBarItem({
  icon,
  title,
  isActive,
  onClick,
}: {
  viewId: string;
  icon: React.ReactNode;
  title: string;
  isActive: boolean;
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
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 40,
        height: 40,
        borderRadius: 6,
        border: "none",
        background: hovered ? colors.bgHover : "transparent",
        color: isActive ? colors.textStrong : colors.textTertiary,
        cursor: "pointer",
        transition: "background 0.1s, color 0.1s",
        position: "relative",
        opacity: isActive ? 1 : 0.7,
      }}
    >
      {/* Active indicator bar (left edge) */}
      {isActive && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 8,
            bottom: 8,
            width: 2,
            borderRadius: 1,
            background: colors.primary,
          }}
        />
      )}
      {icon}
    </button>
  );
});
