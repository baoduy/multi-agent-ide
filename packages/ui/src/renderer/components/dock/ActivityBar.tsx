/**
 * ActivityBar — thin icon rail on the far left (VS Code style).
 *
 * Each icon represents a **view group** — a bundle of left-sidebar
 * sections shown together. Clicking the active group's icon toggles
 * the left sidebar collapse; clicking a different group switches which
 * sections are visible in the left sidebar.
 *
 * Currently there is one group ("Explorer" → repos + specs).
 * More groups can be added by extending DEFAULT_LAYOUT.activityBar.groups.
 */

import React, { useCallback, useState } from "react";
import { useLayoutStore } from "./layoutStore";
import { viewRegistry } from "./ViewRegistry";
import { colors } from "../../utils/colors";
import { Settings } from "lucide-react";
import type { ActivityBarGroup } from "./types";

type ActivityBarProps = {
  onSettingsClick?: () => void;
};

export const ActivityBar = React.memo(function ActivityBar({
  onSettingsClick,
}: ActivityBarProps): React.ReactElement | null {
  const activityBar = useLayoutStore((s) => s.layout.activityBar);
  const setActiveGroup = useLayoutStore((s) => s.setActiveGroup);
  const toggleLeft = useLayoutStore((s) => s.toggleRegionCollapse);
  const leftCollapsed = useLayoutStore((s) => s.layout.left.collapsed);

  const handleGroupClick = useCallback(
    (groupId: string) => {
      if (activityBar.activeGroupId === groupId) {
        // Toggle sidebar collapse
        toggleLeft("left");
      } else {
        setActiveGroup(groupId);
        if (leftCollapsed) {
          toggleLeft("left");
        }
      }
    },
    [activityBar.activeGroupId, setActiveGroup, toggleLeft, leftCollapsed]
  );

  if (!activityBar.visible) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 36,
        minWidth: 36,
        background: colors.bgPanel,
        borderRight: `1px solid ${colors.border}`,
        alignItems: "center",
        paddingTop: 4,
        flexShrink: 0,
      }}
    >
      {/* View group icons (top) */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          flex: 1,
        }}
      >
        {activityBar.groups.map((group: ActivityBarGroup) => {
          const descriptor = viewRegistry.get(group.iconViewId);
          if (!descriptor) return null;

          return (
            <ActivityBarItem
              key={group.id}
              icon={descriptor.icon}
              title={group.title}
              isActive={activityBar.activeGroupId === group.id && !leftCollapsed}
              onClick={() => handleGroupClick(group.id)}
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
          paddingBottom: 4,
        }}
      >
        {onSettingsClick && (
          <ActivityBarItem
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
  icon: React.ReactNode;
  title: string;
  isActive: boolean;
  onClick: () => void;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        aria-label={title}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: 4,
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
      {hovered && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            left: "calc(100% + 6px)",
            top: "50%",
            transform: "translateY(-50%)",
            background: colors.bgPanel,
            color: colors.textStrong,
            border: `1px solid ${colors.border}`,
            borderRadius: 4,
            padding: "4px 8px",
            fontSize: 11,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            zIndex: 1000,
          }}
        >
          {title}
        </div>
      )}
    </div>
  );
});
