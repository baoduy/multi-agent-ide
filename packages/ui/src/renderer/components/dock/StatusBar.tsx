/**
 * StatusBar — bottom status bar with toggles for bottom panel views.
 *
 * Shows: branch info, view toggles (Agent Logs, Output), layout reset.
 * Clicking a toggle opens the corresponding bottom panel tab.
 */

import React, { useState, useCallback } from "react";
import { ScrollText, RotateCcw, PanelBottom } from "lucide-react";
import { useLayoutStore } from "./layoutStore";
import { colors } from "../../utils/colors";
import type { TabState } from "./types";

export const StatusBar = React.memo(function StatusBar(): React.ReactElement {
  const bottomTabs = useLayoutStore((s) => s.layout.bottom.tabs);
  const bottomCollapsed = useLayoutStore((s) => s.layout.bottom.collapsed);
  const openTab = useLayoutStore((s) => s.openTab);
  const toggleRegionCollapse = useLayoutStore((s) => s.toggleRegionCollapse);
  const setRegionCollapsed = useLayoutStore((s) => s.setRegionCollapsed);
  const resetLayout = useLayoutStore((s) => s.resetLayout);

  const hasOutput = bottomTabs.some((t: TabState) => t.viewId === "output");

  const toggleBottomView = useCallback(
    (viewId: string, tabId: string) => {
      const exists = bottomTabs.some((t: TabState) => t.viewId === viewId);
      if (exists) {
        // Toggle bottom panel visibility
        toggleRegionCollapse("bottom");
      } else {
        // Open the tab and make sure bottom is visible
        openTab("bottom", { tabId, viewId });
        setRegionCollapsed("bottom", false);
      }
    },
    [bottomTabs, openTab, toggleRegionCollapse, setRegionCollapsed]
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: 24,
        padding: "0 8px",
        background: colors.bgPanel,
        borderTop: `1px solid ${colors.border}`,
        fontSize: 11,
        color: colors.textTertiary,
        gap: 2,
        flexShrink: 0,
      }}
    >
      {/* Left section */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, flex: 1 }}>
        <StatusBarButton
          icon={<PanelBottom size={12} />}
          label="Panel"
          active={!bottomCollapsed && bottomTabs.length > 0}
          onClick={() => {
            if (bottomTabs.length === 0) {
              openTab("bottom", { tabId: "tab-output", viewId: "output" });
              setRegionCollapsed("bottom", false);
            } else {
              toggleRegionCollapse("bottom");
            }
          }}
        />
      </div>

      {/* Right section — view toggles */}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <StatusBarButton
          icon={<ScrollText size={12} />}
          label="Output"
          active={hasOutput && !bottomCollapsed}
          onClick={() => toggleBottomView("output", "tab-output")}
        />

        <div style={{ width: 1, height: 14, background: colors.border, margin: "0 4px" }} />

        <StatusBarButton
          icon={<RotateCcw size={11} />}
          label="Reset Layout"
          active={false}
          onClick={resetLayout}
        />
      </div>
    </div>
  );
});

/* ── Small status bar button ── */

function StatusBarButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 3,
        padding: "1px 6px",
        borderRadius: 3,
        border: "none",
        background: hovered ? colors.bgHover : "transparent",
        color: active ? colors.textStrong : colors.textTertiary,
        cursor: "pointer",
        fontSize: 11,
        transition: "background 0.1s, color 0.1s",
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
