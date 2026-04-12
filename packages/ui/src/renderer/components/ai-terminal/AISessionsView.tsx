import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { useAISessionStore } from "../../store/aiSessionStore";
import { useSyncedSessionStore } from "../../store/syncedSessionStore";
import { useRepoStore } from "../../store/repoStore";
import { buildUnifiedGroups, SessionGroupNodeView } from "./UnifiedSessionTree";
import { NewAISessionDialog } from "../dialogs/NewAISessionDialog";
import { MagentaTerminal } from "../common/MagentaTerminal";
import { AIStatusBar } from "./AIStatusBar";
import { ProviderBadge } from "../common/ProviderBadge";
import { colors } from "../../utils/colors";
import type { AISessionRecord } from "@magenta/shared/aiTerminal";
import type { SyncedSessionRecord } from "@magenta/shared/syncedSession";

type AISessionsViewProps = {
  repoPath?: string;
  repoName: string | null;
};

/**
 * Main view for AI terminal sessions.
 *
 * Has two states:
 * 1. Session list (openTabIds is empty) — shows list of sessions with "New Session" button
 * 2. Multi-tab terminal (openTabIds is non-empty) — shows tab bar + interactive terminals,
 *    one per open session; all terminals stay mounted, only the active one is visible.
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

  // Synced sessions (scanned from ~/.claude + ~/.copilot)
  const syncedGroups = useSyncedSessionStore((s) => s.groups);
  const syncedIsLoading = useSyncedSessionStore((s) => s.isLoading);
  const fetchSyncedSessions = useSyncedSessionStore((s) => s.fetchSessions);
  const initSyncedSubscriptions = useSyncedSessionStore((s) => s.initializeSubscriptions);

  // Repos from the database (for matching session dirs to repos)
  const repos = useRepoStore((s) => s.repos);

  const [newSessionDialogOpen, setNewSessionDialogOpen] = useState(false);

  // Multi-tab state — session IDs currently open as tabs
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Initialize subscriptions and fetch sessions on mount
  useEffect(() => {
    initializeSubscriptions();
    initSyncedSubscriptions();
    void fetchSessions();
    void fetchSyncedSessions();
  }, [initializeSubscriptions, initSyncedSubscriptions, fetchSessions, fetchSyncedSessions]);

  // ── Tab helpers ──────────────────────────────────────────────

  const openSessionAsTab = useCallback((sessionId: string) => {
    setOpenTabIds((prev) => (prev.includes(sessionId) ? prev : [...prev, sessionId]));
    setActiveTabId(sessionId);
  }, []);

  const handleCloseTab = useCallback((sessionId: string) => {
    setOpenTabIds((prev) => {
      const next = prev.filter((id) => id !== sessionId);
      setActiveTabId((current) => {
        if (current !== sessionId) return current;
        // Prefer the tab at the same position (next sibling), fall back to previous
        const idx = prev.indexOf(sessionId);
        return next[idx] ?? next[idx - 1] ?? null;
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
      openSessionAsTab(session.id);
    },
    [openSessionAsTab],
  );

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (session && session.status === "idle") {
        void resumeSession(sessionId, 80, 24)
          .then((s) => openSessionAsTab(s.id))
          .catch(console.error);
      } else {
        openSessionAsTab(sessionId);
      }
    },
    [sessions, resumeSession, openSessionAsTab],
  );

  const handleResumeSession = useCallback(
    (sessionId: string) => {
      void resumeSession(sessionId, 80, 24)
        .then((s) => openSessionAsTab(s.id))
        .catch(console.error);
    },
    [resumeSession, openSessionAsTab],
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
      void createSession(
        {
          provider,
          repoPath: cwd,
          branch: syncedSession.gitBranch ?? undefined,
          args: ["--resume", syncedSession.sessionId],
        },
        80,
        24,
      ).then((s) => openSessionAsTab(s.id)).catch(console.error);
    },
    [createSession, openSessionAsTab],
  );

  // Build unified groups: merge live sessions + synced history, grouped by repo/dir
  const unifiedGroups = useMemo(
    () => buildUnifiedGroups(sessions, syncedGroups, repos),
    [sessions, syncedGroups, repos],
  );

  // Find active session for status bar
  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeTabId),
    [sessions, activeTabId],
  );

  // ─────────────────────────────────────────────────────────
  // State A: Session list (no tabs open)
  // ─────────────────────────────────────────────────────────
  if (openTabIds.length === 0) {
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
            borderBottom: `1px solid ${colors.border}`,
            background: colors.bgSurface,
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
            AI Sessions
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
              background: colors.primary,
              color: "#ffffff",
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
                  No AI sessions yet.
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
        <NewAISessionDialog
          open={newSessionDialogOpen}
          onClose={handleCloseDialog}
          onSessionCreated={handleSessionCreated}
          repoPath={repoPath}
          repoName={repoName}
        />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  // State B: Multi-tab terminal (openTabIds is non-empty)
  // ─────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#1e1e1e",
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          background: "#252526",
          borderBottom: "1px solid #3c3c3c",
          flexShrink: 0,
          overflowX: "auto",
          minHeight: 36,
        }}
      >
        {openTabIds.map((tabId, index) => {
          const session = sessions.find((s) => s.id === tabId);
          const isActive = tabId === activeTabId;
          const tabLabel = session?.title ?? session?.repoName ?? "Session";

          return (
            <div
              key={tabId}
              style={{
                display: "flex",
                alignItems: "center",
                background: isActive ? "#1e1e1e" : "transparent",
                borderBottom: isActive ? "2px solid #c15f3c" : "2px solid transparent",
                borderRight: index < openTabIds.length - 1 ? "1px solid #3c3c3c" : "none",
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                onClick={() => setActiveTabId(tabId)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 10px 6px 12px",
                  background: "transparent",
                  border: "none",
                  color: isActive ? "#d4d4d4" : "#9a958c",
                  cursor: "pointer",
                  fontSize: 12,
                  whiteSpace: "nowrap",
                  transition: "color 0.12s",
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = "#c0bdb7"; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = "#9a958c"; }}
              >
                {session && (
                  <ProviderBadge
                    provider={session.provider}
                    iconSize={12}
                    fontSize={11}
                    color={isActive ? "#d4d4d4" : "#9a958c"}
                  />
                )}
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
                  handleCloseTab(tabId);
                }}
                style={{
                  padding: "4px 8px",
                  background: "transparent",
                  border: "none",
                  color: "#9a958c",
                  cursor: "pointer",
                  fontSize: 10,
                  display: "flex",
                  alignItems: "center",
                  transition: "color 0.12s",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#d4d4d4"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#9a958c"; }}
                title="Close tab"
              >
                ✕
              </button>
            </div>
          );
        })}

        {/* "+" button to create a new session */}
        <button
          type="button"
          onClick={handleNewSession}
          title="New AI Session"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            background: "transparent",
            border: "none",
            borderRight: "1px solid #3c3c3c",
            color: "#9a958c",
            cursor: "pointer",
            flexShrink: 0,
            transition: "color 0.12s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#d4d4d4"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#9a958c"; }}
        >
          <Plus size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Terminal panels — all mounted, only the active one is visible */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {openTabIds.map((tabId) => {
          const session = sessions.find((s) => s.id === tabId);
          if (!session) return null;
          return (
            <div
              key={tabId}
              style={{
                display: tabId === activeTabId ? "flex" : "none",
                flexDirection: "column",
                height: "100%",
                padding: 12,
              }}
            >
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
              />
            </div>
          );
        })}
      </div>

      {/* Status bar — shows active session info */}
      {activeSession && <AIStatusBar session={activeSession} />}

      {/* New session dialog */}
      <NewAISessionDialog
        open={newSessionDialogOpen}
        onClose={handleCloseDialog}
        onSessionCreated={handleSessionCreated}
        repoPath={repoPath}
        repoName={repoName}
      />
    </div>
  );
}
