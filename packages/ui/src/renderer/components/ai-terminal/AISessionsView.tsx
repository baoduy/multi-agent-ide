import React, { useCallback, useEffect, useMemo, useState } from "react";

import { useAISessionStore } from "../../store/aiSessionStore";
import { useSyncedSessionStore } from "../../store/syncedSessionStore";
import { useRepoStore } from "../../store/repoStore";
import { buildUnifiedGroups, SessionGroupNodeView } from "./UnifiedSessionTree";
import { NewSessionDialog } from "../dialogs/NewSessionDialog";
import { colors } from "../../utils/colors";
import { SessionCoordinator } from "../../services/SessionCoordinator";
import type { AISessionRecord } from "@magenta/shared/aiTerminal";
import type { SyncedSessionRecord } from "@magenta/shared/syncedSession";

/* ── Props ── */

type AISessionsViewProps = {
  repoPath?: string;
  repoName: string | null;
  /** Called when an agent session should be opened as a center tab. */
  onOpenAgentSession?: (session: AISessionRecord) => void;
  /** Called when a terminal session should be opened as a center tab. */
  onOpenTerminalSession?: (cwd: string) => void;
};

/**
 * Session list view — shows all AI agent and synced sessions grouped by repo.
 *
 * Does NOT manage sub-tabs anymore. When a session is opened or created,
 * it calls the parent's callbacks so the DockManager opens a center tab.
 */
export function AISessionsView({
  repoPath,
  repoName,
  onOpenAgentSession,
  onOpenTerminalSession,
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
  const activeRepoPath = useRepoStore((s) => s.activeRepoPath);

  const [newSessionDialogOpen, setNewSessionDialogOpen] = useState(false);

  // Initialize subscriptions and fetch sessions on mount
  useEffect(() => {
    initializeSubscriptions();
    initSyncedSubscriptions();
    void fetchSessions();
    void fetchSyncedSessions();
  }, [initializeSubscriptions, initSyncedSubscriptions, fetchSessions, fetchSyncedSessions]);

  // ── Handlers ────────────────────────────────────────────────

  const handleNewSession = useCallback(() => {
    setNewSessionDialogOpen(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setNewSessionDialogOpen(false);
  }, []);

  const handleSessionCreated = useCallback(
    (session: AISessionRecord) => {
      onOpenAgentSession?.(session);
    },
    [onOpenAgentSession],
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
          .then((s) => onOpenAgentSession?.(s))
          .catch(console.error);
      } else if (session) {
        onOpenAgentSession?.(session);
      }
    },
    [sessions, resumeSession, onOpenAgentSession],
  );

  const handleResumeSession = useCallback(
    (sessionId: string) => {
      // Mark this session's repo as globally selected
      const session = sessions.find((s) => s.id === sessionId);
      if (session?.repoPath) {
        SessionCoordinator.selectRepo(session.repoPath);
      }
      void resumeSession(sessionId, 80, 24)
        .then((s) => onOpenAgentSession?.(s))
        .catch(console.error);
    },
    [sessions, resumeSession, onOpenAgentSession],
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
      ).then((s) => onOpenAgentSession?.(s)).catch(console.error);
    },
    [createSession, onOpenAgentSession],
  );

  // Build unified groups: merge live sessions + synced history, grouped by repo/dir.
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

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
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
          /* Empty state */
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
        repoPath={repoPath}
        repoName={repoName}
      />
    </div>
  );
}
