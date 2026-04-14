import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Terminal } from "lucide-react";

import { useAISessionStore } from "../../store/aiSessionStore";
import { useTerminalStore } from "../../store/terminalStore";

let terminalTabCounter = 0;
import { useSyncedSessionStore } from "../../store/syncedSessionStore";
import { useRepoStore } from "../../store/repoStore";
import { buildUnifiedGroups, SessionGroupNodeView } from "./UnifiedSessionTree";
import { NewSessionDialog } from "../dialogs/NewSessionDialog";
import { MagentaTerminal } from "../common/MagentaTerminal";
import { ProviderBadge } from "../common/ProviderBadge";
import { AIStatusBar } from "./AIStatusBar";
import type { StatusBarTab } from "./AIStatusBar";
import { colors } from "../../utils/colors";
import { SessionCoordinator } from "../../services/SessionCoordinator";
import type { AISessionRecord } from "@magenta/shared/aiTerminal";
import type { SyncedSessionRecord } from "@magenta/shared/syncedSession";

/* ── Tab descriptor ── */

type AgentTab = {
  kind: "agent";
  id: string; // AISessionRecord.id
};

type TerminalTab = {
  kind: "terminal";
  id: string; // terminalStore sessionId
  cwd: string;
  label: string; // tab display name (derived from cwd)
};

type SessionTab = AgentTab | TerminalTab;

/* ── Props ── */

type AISessionsViewProps = {
  repoPath?: string;
  repoName: string | null;
};

/**
 * Unified session view — AI agents and terminals share the same tab bar.
 *
 * Has two states:
 * 1. Session list (no tabs open) — shows session tree with "New Session" button
 * 2. Multi-tab view (tabs open) — tab bar + terminal panels, one per open session
 */
export function AISessionsView({
  repoPath,
  repoName,
}: AISessionsViewProps): React.ReactElement {
  const sessions = useAISessionStore((s) => s.sessions);
  const fetchSessions = useAISessionStore((s) => s.fetchSessions);
  const initializeSubscriptions = useAISessionStore((s) => s.initializeSubscriptions);
  const resumeSession = useAISessionStore((s) => s.resumeSession);
  const createSession = useAISessionStore((s) => s.createSession);
  const deleteSession = useAISessionStore((s) => s.deleteSession);

  const initTerminalSubscriptions = useTerminalStore((s) => s.initializeSubscriptions);

  // Synced sessions (scanned from ~/.claude + ~/.copilot)
  const syncedGroups = useSyncedSessionStore((s) => s.groups);
  const syncedIsLoading = useSyncedSessionStore((s) => s.isLoading);
  const fetchSyncedSessions = useSyncedSessionStore((s) => s.fetchSessions);
  const initSyncedSubscriptions = useSyncedSessionStore((s) => s.initializeSubscriptions);

  // Repos from the database (for matching session dirs to repos)
  const repos = useRepoStore((s) => s.repos);
  const activeRepoPath = useRepoStore((s) => s.activeRepoPath);

  const [newSessionDialogOpen, setNewSessionDialogOpen] = useState(false);

  // Unified tab state — supports both agent and terminal tabs
  const [openTabs, setOpenTabs] = useState<SessionTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Initialize subscriptions and fetch sessions on mount
  useEffect(() => {
    initializeSubscriptions();
    initTerminalSubscriptions();
    initSyncedSubscriptions();
    void fetchSessions();
    void fetchSyncedSessions();
  }, [initializeSubscriptions, initTerminalSubscriptions, initSyncedSubscriptions, fetchSessions, fetchSyncedSessions]);

  // ── Tab helpers ──────────────────────────────────────────────

  const openTab = useCallback((tab: SessionTab) => {
    setOpenTabs((prev) => {
      if (prev.some((t) => t.id === tab.id)) return prev;
      return [...prev, tab];
    });
    setActiveTabId(tab.id);
  }, []);

  const handleCloseTab = useCallback((tabId: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      setActiveTabId((current) => {
        if (current !== tabId) return current;
        const idx = prev.findIndex((t) => t.id === tabId);
        return next[idx]?.id ?? next[idx - 1]?.id ?? null;
      });
      return next;
    });
  }, []);

  // ── Handlers ────────────────────────────────────────────────

  const handleNewSession = useCallback(() => {
    setNewSessionDialogOpen(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setNewSessionDialogOpen(false);
  }, []);

  const handleSessionCreated = useCallback(
    (session: AISessionRecord) => {
      openTab({ kind: "agent", id: session.id });
    },
    [openTab],
  );

  const handleTerminalCreated = useCallback(
    (cwd: string) => {
      terminalTabCounter += 1;
      const id = `terminal-${terminalTabCounter}`;
      const label = cwd.split("/").pop() ?? "Terminal";
      openTab({ kind: "terminal", id, cwd, label });
    },
    [openTab],
  );

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      const session = sessions.find((s) => s.id === sessionId);
      // Mark this session's repo as globally selected
      if (session?.repoPath) {
        SessionCoordinator.selectRepo(session.repoPath);
      }
      if (session && session.status === "idle") {
        void resumeSession(sessionId, 80, 24)
          .then((s) => openTab({ kind: "agent", id: s.id }))
          .catch(console.error);
      } else {
        openTab({ kind: "agent", id: sessionId });
      }
    },
    [sessions, resumeSession, openTab],
  );

  const handleResumeSession = useCallback(
    (sessionId: string) => {
      // Mark this session's repo as globally selected
      const session = sessions.find((s) => s.id === sessionId);
      if (session?.repoPath) {
        SessionCoordinator.selectRepo(session.repoPath);
      }
      void resumeSession(sessionId, 80, 24)
        .then((s) => openTab({ kind: "agent", id: s.id }))
        .catch(console.error);
    },
    [sessions, resumeSession, openTab],
  );

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      void deleteSession(sessionId);
    },
    [deleteSession],
  );

  const handleResumeSyncedSession = useCallback(
    (syncedSession: SyncedSessionRecord) => {
      const provider = syncedSession.provider === "claude-code" ? "claude" as const : "copilot" as const;
      const cwd = syncedSession.cwd || syncedSession.projectDir || undefined;
      // Mark this session's repo as globally selected
      if (cwd) {
        SessionCoordinator.selectRepo(cwd);
      }
      void createSession(
        {
          provider,
          repoPath: cwd,
          branch: syncedSession.gitBranch ?? undefined,
          args: ["--resume", syncedSession.sessionId],
        },
        80,
        24,
      ).then((s) => openTab({ kind: "agent", id: s.id })).catch(console.error);
    },
    [createSession, openTab],
  );

  // Build unified groups: merge live sessions + synced history, grouped by repo/dir.
  // When a repo is selected globally, hoist its group to the top so the user lands on it.
  const unifiedGroups = useMemo(() => {
    const groups = buildUnifiedGroups(sessions, syncedGroups, repos);
    if (!activeRepoPath) return groups;
    const idx = groups.findIndex((g) => g.repo?.path === activeRepoPath || g.path === activeRepoPath);
    if (idx <= 0) return groups;
    const reordered = [...groups];
    const [active] = reordered.splice(idx, 1);
    reordered.unshift(active);
    return reordered;
  }, [sessions, syncedGroups, repos, activeRepoPath]);

  // Derive status bar info for the active tab (agent or terminal)
  const activeStatusBarTab = useMemo((): StatusBarTab | null => {
    const activeTab = openTabs.find((t) => t.id === activeTabId);
    if (!activeTab) return null;
    if (activeTab.kind === "agent") {
      const session = sessions.find((s) => s.id === activeTab.id);
      if (!session) return null;
      return { kind: "agent", session };
    }
    return { kind: "terminal", label: activeTab.label, cwd: activeTab.cwd };
  }, [openTabs, activeTabId, sessions]);

  // ─────────────────────────────────────────────────────────
  // State A: Session list (no tabs open)
  // ─────────────────────────────────────────────────────────
  if (openTabs.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            // Transparent — inherit the surrounding panel background so the
            // Sessions header blends with the rest of the view instead of
            // looking like a separate strip.
            background: "transparent",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: colors.text,
            }}
          >
            Sessions
          </span>
          <button
            type="button"
            onClick={handleNewSession}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 6,
              border: "none",
              outline: "none",
              boxShadow: "none",
              background: colors.primary,
              color: colors.textWhite,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 500,
              transition: "opacity 0.12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.9"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
          >
            <Plus size={14} strokeWidth={2} />
            New Session
          </button>
        </div>

        {/* Unified session tree grouped by repo/directory */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {unifiedGroups.length > 0 ? (
            unifiedGroups.map((node) => (
              <SessionGroupNodeView
                key={node.key}
                node={node}
                defaultExpanded={node.activeCount > 0 || unifiedGroups.length <= 3}
                activeRepoPath={activeRepoPath}
                onSelectSession={handleSelectSession}
                onResumeSession={handleResumeSession}
                onDeleteSession={handleDeleteSession}
                onResumeSyncedSession={handleResumeSyncedSession}
              />
            ))
          ) : (
            /* Empty state — no live sessions AND no synced sessions */
            !syncedIsLoading && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: 1,
                  padding: 24,
                  textAlign: "center",
                  color: colors.textTertiary,
                }}
              >
                <div style={{ fontSize: 13, marginBottom: 8 }}>
                  No sessions yet.
                </div>
                <button
                  type="button"
                  onClick={handleNewSession}
                  style={{
                    fontSize: 12,
                    color: colors.primary,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 500,
                    textDecoration: "underline",
                  }}
                >
                  Create one to get started
                </button>
              </div>
            )
          )}
        </div>

        {/* New session dialog */}
        <NewSessionDialog
          open={newSessionDialogOpen}
          onClose={handleCloseDialog}
          onSessionCreated={handleSessionCreated}
          onTerminalCreated={handleTerminalCreated}
          repoPath={repoPath}
          repoName={repoName}
        />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  // State B: Multi-tab view (openTabs is non-empty)
  // ─────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--tabbar-active-bg)",
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          background: "var(--tabbar-bg)",
          borderBottom: "1px solid var(--tabbar-border)",
          flexShrink: 0,
          overflowX: "auto",
          minHeight: 36,
        }}
      >
        {openTabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;

          // Resolve label and icon based on tab kind
          let tabLabel: string;
          let tabIcon: React.ReactNode;

          if (tab.kind === "agent") {
            const session = sessions.find((s) => s.id === tab.id);
            tabLabel = session?.title ?? session?.repoName ?? "Agent";
            tabIcon = session ? (
              <ProviderBadge
                provider={session.provider}
                iconSize={12}
                fontSize={11}
                color={isActive ? "var(--tabbar-fg)" : "var(--tabbar-fg-muted)"}
              />
            ) : null;
          } else {
            tabLabel = tab.label;
            tabIcon = (
              <Terminal
                size={12}
                color={isActive ? "var(--tabbar-fg)" : "var(--tabbar-fg-muted)"}
                strokeWidth={1.8}
              />
            );
          }

          return (
            <div
              key={tab.id}
              style={{
                display: "flex",
                alignItems: "center",
                background: isActive ? "var(--tabbar-active-bg)" : "transparent",
                borderBottom: isActive ? "2px solid var(--primary)" : "2px solid transparent",
                borderRight: index < openTabs.length - 1 ? "1px solid var(--tabbar-border)" : "none",
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                onClick={() => setActiveTabId(tab.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 10px 6px 12px",
                  background: "transparent",
                  border: "none",
                  color: isActive ? "var(--tabbar-fg)" : "var(--tabbar-fg-muted)",
                  cursor: "pointer",
                  fontSize: 12,
                  whiteSpace: "nowrap",
                  transition: "color 0.12s",
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = "var(--tabbar-fg)"; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = "var(--tabbar-fg-muted)"; }}
              >
                {tabIcon}
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 140,
                  }}
                >
                  {tabLabel}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseTab(tab.id);
                }}
                style={{
                  padding: "4px 8px",
                  background: "transparent",
                  border: "none",
                  color: "var(--tabbar-fg-muted)",
                  cursor: "pointer",
                  fontSize: 10,
                  display: "flex",
                  alignItems: "center",
                  transition: "color 0.12s",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--tabbar-fg)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--tabbar-fg-muted)"; }}
                title="Close tab"
              >
                ✕
              </button>
            </div>
          );
        })}

        {/* "+" button pinned to the right side of the tab bar */}
        <button
          type="button"
          onClick={handleNewSession}
          title="New Session"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            background: "transparent",
            border: "none",
            borderLeft: "1px solid var(--tabbar-border)",
            color: "var(--tabbar-fg-muted)",
            cursor: "pointer",
            flexShrink: 0,
            marginLeft: "auto",
            transition: "color 0.12s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--tabbar-fg)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--tabbar-fg-muted)"; }}
        >
          <Plus size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Terminal panels — all mounted, only the active one is visible.
           Uses absolute positioning so hidden tabs still have measurable dimensions. */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0 }}>
        {openTabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          // Use visibility + absolute positioning instead of display:none
          // so xterm can measure its container even when the tab isn't active.
          const panelStyle: React.CSSProperties = {
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            visibility: isActive ? "visible" : "hidden",
            zIndex: isActive ? 1 : 0,
          };

          if (tab.kind === "agent") {
            const session = sessions.find((s) => s.id === tab.id);
            if (!session) return null;
            return (
              <div key={tab.id} style={panelStyle}>
                <MagentaTerminal
                  readonly={false}
                  cwd={session.cwd}
                  mode="ai-agent"
                  aiSessionId={session.id}
                  aiProvider={session.provider}
                  maxHeight={undefined}
                  fontSize={12}
                  fontFamily="'SF Mono', 'Fira Code', ui-monospace, monospace"
                  enableTabs={false}
                  isVisible={isActive}
                />
              </div>
            );
          }

          // Terminal tab
          return (
            <div key={tab.id} style={panelStyle}>
              <MagentaTerminal
                readonly={false}
                cwd={tab.cwd}
                mode="shell"
                maxHeight={undefined}
                fontSize={12}
                fontFamily="'SF Mono', 'Fira Code', ui-monospace, monospace"
                enableTabs={false}
                isVisible={isActive}
              />
            </div>
          );
        })}
      </div>

      {/* Status bar — shared across all tabs, shows info for the active tab */}
      {activeStatusBarTab && <AIStatusBar tab={activeStatusBarTab} />}

      {/* New session dialog */}
      <NewSessionDialog
        open={newSessionDialogOpen}
        onClose={handleCloseDialog}
        onSessionCreated={handleSessionCreated}
        onTerminalCreated={handleTerminalCreated}
        repoPath={repoPath}
        repoName={repoName}
      />
    </div>
  );
}
