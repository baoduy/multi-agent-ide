/**
 * StatusBar — bottom status bar with toggles for bottom panel views
 * and active agent session info.
 *
 * Left section: Panel toggle + active agent info (provider, repo, branch, status).
 * Right section: Terminal toggle, layout reset.
 */

import React, { useState, useCallback, useMemo } from "react";
import { RotateCcw, Terminal, ScrollText, Bot } from "lucide-react";
import { useLayoutStore } from "./layoutStore";
import { useAISessionStore } from "../../store/aiSessionStore";
import { useRepoStore } from "../../store/repoStore";
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

export const StatusBar = React.memo(function StatusBar({
  onShowRunningSessions,
}: {
  onShowRunningSessions?: () => void;
}): React.ReactElement {
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

  // ── Resolve terminal cwd ──
  // Priority: selected repo > active AI agent session's repoPath > active terminal tab's cwd
  const activeRepoPath = useRepoStore((s) => s.activeRepoPath);
  const agentRepoPath = session?.repoPath ?? null;
  const resolvedTerminalCwd = activeRepoPath ?? agentRepoPath ?? terminalCwd;

  // ── Running AI sessions count ──
  const runningCount = useAISessionStore(
    useCallback((s) => s.sessions.filter(
      (sess) => sess.status === "active" || sess.status === "waiting-input"
    ).length, []),
  );

  const hasTerminal = bottomTabs.some((t: TabState) => t.viewId === "terminal-session");
  const hasLog = bottomTabs.some((t: TabState) => t.viewId === "log-viewer");

  const toggleTerminal = useCallback(() => {
    if (!resolvedTerminalCwd) return;
    const exists = bottomTabs.some((t: TabState) => t.viewId === "terminal-session");
    if (exists) {
      toggleRegionCollapse("bottom");
    } else {
      openTab("bottom", {
        tabId: "tab-bottom-terminal",
        viewId: "terminal-session",
        props: { cwd: resolvedTerminalCwd },
      });
      setRegionCollapsed("bottom", false);
    }
  }, [resolvedTerminalCwd, bottomTabs, openTab, toggleRegionCollapse, setRegionCollapsed]);

  const toggleLog = useCallback(() => {
    const exists = bottomTabs.some((t: TabState) => t.viewId === "log-viewer");
    if (exists) {
      toggleRegionCollapse("bottom");
    } else {
      openTab("bottom", {
        tabId: "tab-bottom-log",
        viewId: "log-viewer",
        props: {},
      });
      setRegionCollapsed("bottom", false);
    }
  }, [bottomTabs, openTab, toggleRegionCollapse, setRegionCollapsed]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: 20,
        padding: "0 6px",
        background: colors.bgPanel,
        borderTop: `1px solid ${colors.border}`,
        fontSize: 11,
        color: colors.textTertiary,
        gap: 2,
        flexShrink: 0,
      }}
    >
      {/* Left section — reset layout + active session info */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, minWidth: 0 }}>
        <StatusBarButton
          icon={<RotateCcw size={11} />}
          label="Reset"
          active={false}
          onClick={resetLayout}
        />
        <VerticalDivider />

        {/* ── Active agent session info ── */}
        {session && (
          <>
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
        <VerticalDivider />
        <StatusBarButton
          icon={<Terminal size={12} />}
          label="Terminal"
          active={hasTerminal && !bottomCollapsed}
          disabled={!resolvedTerminalCwd}
          onClick={toggleTerminal}
        />
        <VerticalDivider />
        <StatusBarButton
          icon={<ScrollText size={12} />}
          label="Log"
          active={hasLog && !bottomCollapsed}
          onClick={toggleLog}
        />
        {runningCount > 0 && (<>
          <VerticalDivider />
          <StatusBarButton
            icon={
              <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                <Bot size={12} />
                <span
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -6,
                    minWidth: 12,
                    height: 12,
                    borderRadius: 6,
                    background: colors.primary,
                    color: colors.textWhite,
                    fontSize: 8,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 2px",
                    lineHeight: 1,
                  }}
                >
                  {runningCount}
                </span>
              </span>
            }
            label=""
            active={false}
            onClick={() => onShowRunningSessions?.()}
          />
        </>)}
      </div>
    </div>
  );
});

function VerticalDivider(): React.ReactElement {
  return <div style={{ width: 1, height: 14, background: colors.border, margin: "0 4px" }} />;
}

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
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      title={disabled ? `${label} (no repository selected)` : label}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 3,
        padding: "0 5px",
        borderRadius: 3,
        border: "none",
        background: !disabled && hovered ? colors.bgHover : "transparent",
        color: disabled ? colors.textMuted : active ? colors.textStrong : colors.textTertiary,
        cursor: disabled ? "default" : "pointer",
        fontSize: 11,
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.1s, color 0.1s, opacity 0.1s",
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
