/**
 * StatusBar — bottom status bar with toggles for bottom panel views
 * and active agent session info.
 *
 * Left section: Panel toggle + active agent info (provider, repo, branch, status).
 * Right section: Output toggle, layout reset.
 */

import React, { useState, useCallback, useMemo } from "react";
import { ScrollText, RotateCcw, PanelBottom, Terminal } from "lucide-react";
import { useLayoutStore } from "./layoutStore";
import { useAISessionStore } from "../../store/aiSessionStore";
import { colors } from "../../utils/colors";
import { getStatusColor } from "../../utils/sessionStatus";
import { ProviderBadge } from "../common/ProviderBadge";
import { RepoLabel, BranchLabel } from "../common/RepoLabel";
import { WorkspaceLabel } from "../common/WorkspaceLabel";
import type { TabState } from "./types";
import type { AISessionRecord } from "@magenta/shared/aiTerminal";

/** Format status text for display in the status bar. */
function formatStatus(status: AISessionRecord["status"]): string {
  switch (status) {
    case "waiting-input":
      return "Waiting";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

export const StatusBar = React.memo(function StatusBar(): React.ReactElement {
  const bottomTabs = useLayoutStore((s) => s.layout.bottom.tabs);
  const bottomCollapsed = useLayoutStore((s) => s.layout.bottom.collapsed);
  const openTab = useLayoutStore((s) => s.openTab);
  const toggleRegionCollapse = useLayoutStore((s) => s.toggleRegionCollapse);
  const setRegionCollapsed = useLayoutStore((s) => s.setRegionCollapsed);
  const resetLayout = useLayoutStore((s) => s.resetLayout);

  // ── Active center tab detection ──
  const centerTabs = useLayoutStore((s) => s.layout.center.tabs);
  const activeTabId = useLayoutStore((s) => s.layout.center.activeTabId);

  const activeTab = useMemo(
    () => centerTabs.find((t: TabState) => t.tabId === activeTabId) ?? null,
    [centerTabs, activeTabId],
  );

  // ── Agent session info for the active tab ──
  const aiSessionId = activeTab?.viewId === "agent-session"
    ? (activeTab.props?.aiSessionId as string | undefined) ?? null
    : null;

  const isTerminalTab = activeTab?.viewId === "terminal-session";
  const terminalCwd = isTerminalTab
    ? (activeTab?.props?.cwd as string | undefined) ?? null
    : null;

  const session = useAISessionStore(
    useCallback(
      (s) => (aiSessionId ? s.sessions.find((sess) => sess.id === aiSessionId) ?? null : null),
      [aiSessionId],
    ),
  );

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
      {/* Left section — panel toggle + active session info */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, minWidth: 0 }}>
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

        {/* ── Active agent session info ── */}
        {session && (
          <>
            <Separator />
            <ProviderBadge provider={session.provider} iconSize={11} fontSize={11} color={colors.textTertiary} />
            <Separator />
            {session.repoName ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0, overflow: "hidden" }}>
                <RepoLabel name={session.repoName} size="xs" />
                {(session.worktreeName || session.branch) && (
                  <BranchLabel name={session.worktreeName || session.branch || ""} size="xs" />
                )}
              </span>
            ) : (
              <WorkspaceLabel size="xs" />
            )}
            <Separator />
            <span style={{ color: getStatusColor(session.status), fontWeight: 500, fontSize: 11, flexShrink: 0 }}>
              {formatStatus(session.status)}
            </span>
          </>
        )}

        {/* ── Active terminal tab info ── */}
        {!session && isTerminalTab && (
          <>
            <Separator />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Terminal size={11} strokeWidth={1.8} color={colors.textTertiary} />
              <span style={{ fontWeight: 500, fontSize: 11 }}>Shell</span>
            </span>
            {terminalCwd && (
              <>
                <Separator />
                <span
                  style={{
                    fontSize: 11,
                    color: colors.textTertiary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 200,
                  }}
                  title={terminalCwd}
                >
                  {terminalCwd.split("/").pop() || terminalCwd}
                </span>
              </>
            )}
            <Separator />
            <span style={{ color: colors.success, fontWeight: 500, fontSize: 11 }}>Running</span>
          </>
        )}
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

/* ── Dot separator ── */

function Separator(): React.ReactElement {
  return (
    <span style={{ color: colors.borderMuted, fontSize: 11, margin: "0 3px", flexShrink: 0 }}>·</span>
  );
}

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
