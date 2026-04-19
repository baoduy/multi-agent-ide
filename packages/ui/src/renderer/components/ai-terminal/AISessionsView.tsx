import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAISessionStore } from "../../store/aiSessionStore";
import { useSyncedSessionStore } from "../../store/syncedSessionStore";
import { useRepoStore } from "../../store/repoStore";
import { usePinnedSessionsStore } from "../../store/pinnedSessionsStore";
import { buildUnifiedGroups, SessionGroupNodeView } from "./UnifiedSessionTree";
import { filterSessionGroups } from "../../utils/sessionTreeBuilder";
import { NewSessionDialog } from "../dialogs/NewSessionDialog";
import { SearchSyncToolbar } from "../common/SearchSyncToolbar";
import { colors } from "../../utils/colors";
import { resolveWorktreeParent } from "../../utils/formatters";
import { sendOrThrow } from "../../services/ipcClient";
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
  const triggerSync = useSyncedSessionStore((s) => s.triggerSync);
  const initSyncedSubscriptions = useSyncedSessionStore((s) => s.initializeSubscriptions);

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Repos from the database (for matching session dirs to repos)
  const repos = useRepoStore((s) => s.repos);
  const activeRepoPath = useRepoStore((s) => s.activeRepoPath);
  const pinnedPaths = useRepoStore((s) => s.pinnedPaths);
  const pinnedSessionKeys = usePinnedSessionsStore((s) => s.pinnedKeys);

  const [searchQuery, setSearchQuery] = useState("");
  const [newSessionDialogOpen, setNewSessionDialogOpen] = useState(false);
  const [newSessionRepoPath, setNewSessionRepoPath] = useState<string | undefined>(repoPath);
  const [resumeContext, setResumeContext] = useState<{
    providerSessionId: string;
    provider: "claude" | "copilot";
    branch?: string;
  } | undefined>(undefined);

  // Guard: only trigger the first-launch sync once per mount lifetime
  const hasTriggeredInitialSync = useRef(false);

  // Initialize subscriptions and fetch sessions on mount.
  // If both live and synced sessions are empty after the initial fetch,
  // immediately trigger a full sync so the user sees results on first launch.
  // BackgroundJobManager deduplicates — if a sync is already queued/running
  // (e.g. from setAITabActive), this is a harmless no-op.
  useEffect(() => {
    initializeSubscriptions();
    initSyncedSubscriptions();

    void Promise.all([fetchSessions(), fetchSyncedSessions()]).then(() => {
      if (hasTriggeredInitialSync.current) return;
      const liveEmpty = useAISessionStore.getState().sessions.length === 0;
      const syncedEmpty = useSyncedSessionStore.getState().sessions.length === 0;
      if (liveEmpty && syncedEmpty) {
        hasTriggeredInitialSync.current = true;
        void triggerSync();
      }
    });
  }, [initializeSubscriptions, initSyncedSubscriptions, fetchSessions, fetchSyncedSessions, triggerSync]);

  // Clear the refreshing spinner once the synced loading cycle completes.
  // triggerSync is fire-and-forget; the syncedSessionStore auto-fetches
  // when the daemon emits synced-session:sync:complete, which in turn
  // toggles syncedIsLoading. We use that (plus a minimum spin time) to
  // drive the UI state.
  useEffect(() => {
    if (!isRefreshing) return;
    if (syncedIsLoading) return;
    // Wait one tick to avoid flashing when the sync completes very fast
    const timeout = setTimeout(() => setIsRefreshing(false), 300);
    return () => clearTimeout(timeout);
  }, [isRefreshing, syncedIsLoading]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    if (!activeRepoPath) return; // Button is disabled in this state.
    setIsRefreshing(true);
    try {
      await Promise.all([
        triggerSync(activeRepoPath),
        fetchSessions(),
        fetchSyncedSessions(),
      ]);
    } catch (err) {
      console.error("[AISessionsView] Refresh failed:", err);
      setIsRefreshing(false);
    }
  }, [isRefreshing, activeRepoPath, triggerSync, fetchSessions, fetchSyncedSessions]);

  // ── Handlers ────────────────────────────────────────────────

  const handleNewSession = useCallback(() => {
    setNewSessionRepoPath(repoPath);
    setResumeContext(undefined);
    setNewSessionDialogOpen(true);
  }, [repoPath]);

  const handleCloseDialog = useCallback(() => {
    setNewSessionDialogOpen(false);
    setNewSessionRepoPath(repoPath);
    setResumeContext(undefined);
  }, [repoPath]);

  const handleCreateSessionForRepo = useCallback((targetRepoPath: string) => {
    setNewSessionRepoPath(targetRepoPath);
    setResumeContext(undefined);
    setNewSessionDialogOpen(true);
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
    async (syncedSession: SyncedSessionRecord) => {
      const provider = syncedSession.provider === "claude-code" ? "claude" as const : "copilot" as const;
      const cwd = syncedSession.cwd || syncedSession.projectDir || undefined;

      // Resolve worktree paths to their parent repo for correct grouping
      const resolvedRepoPath = cwd ? resolveWorktreeParent(cwd) : undefined;
      const resolvedWorktreePath = cwd && resolvedRepoPath !== cwd ? cwd : undefined;

      // Mark this session's repo as globally selected
      if (resolvedRepoPath) {
        SessionCoordinator.selectRepo(resolvedRepoPath);
      }
      // If a live session already mirrors this synced row (same agent UUID),
      // open it instead of creating a duplicate.
      const existingLive = sessions.find(
        (s) => s.id === syncedSession.sessionId || s.providerSessionId === syncedSession.sessionId,
      );
      if (existingLive) {
        if (existingLive.status === "idle") {
          void resumeSession(existingLive.id, 80, 24)
            .then((s) => onOpenAgentSession?.(s))
            .catch(console.error);
        } else {
          onOpenAgentSession?.(existingLive);
        }
        return;
      }

      // Pre-flight: if this is a worktree session, verify the worktree still exists
      if (resolvedWorktreePath && resolvedRepoPath) {
        try {
          const check = await sendOrThrow({
            type: "ai-session:check-worktree",
            worktreePath: resolvedWorktreePath,
            repoPath: resolvedRepoPath,
          });
          if (!check.valid) {
            // Worktree is missing — open the dialog so the user can pick
            // a new or existing branch/worktree to resume into.
            setNewSessionRepoPath(check.repoPath);
            setResumeContext({
              providerSessionId: syncedSession.sessionId,
              provider,
              branch: syncedSession.gitBranch ?? undefined,
            });
            setNewSessionDialogOpen(true);
            return;
          }
        } catch (err) {
          console.error("[AISessionsView] Worktree check failed:", err);
          // Fall through — let createSession handle any errors
        }
      }

      // Pass providerSessionId so the daemon reuses the synced agent UUID:
      //   - Claude:  --resume <id>  (live.providerSessionId === synced.sessionId)
      //   - Copilot: --resume=<id>  (live.providerSessionId === synced.sessionId)
      // The tree dedup collapses live + synced into one row via providerSessionId.
      void createSession(
        {
          provider,
          repoPath: resolvedRepoPath,
          worktreePath: resolvedWorktreePath,
          branch: syncedSession.gitBranch ?? undefined,
          providerSessionId: syncedSession.sessionId,
        },
        80,
        24,
      ).then((s) => onOpenAgentSession?.(s)).catch(console.error);
    },
    [createSession, resumeSession, onOpenAgentSession, sessions],
  );

  // Build unified groups: merge live sessions + synced history, grouped by repo/dir.
  // `buildUnifiedGroups` already sorts pinned repos to the very top.
  const unifiedGroups = useMemo(() => {
    let groups = buildUnifiedGroups(sessions, syncedGroups, repos, pinnedSessionKeys, pinnedPaths);

    // Apply search filter
    if (searchQuery.trim()) {
      groups = filterSessionGroups(groups, searchQuery.trim());
    }

    // Hoist the currently-selected repo, but never above pinned repos.
    if (!activeRepoPath) return groups;
    const idx = groups.findIndex((g) => g.repo?.path === activeRepoPath || g.path === activeRepoPath);
    if (idx < 0) return groups;
    const isActivePinned = groups[idx].repo ? pinnedPaths.has(groups[idx].repo!.path) : false;
    if (isActivePinned) return groups; // already in the pinned block
    const firstUnpinnedIdx = groups.findIndex((g) => !(g.repo && pinnedPaths.has(g.repo.path)));
    if (idx === firstUnpinnedIdx) return groups;
    const reordered = [...groups];
    const [active] = reordered.splice(idx, 1);
    reordered.splice(firstUnpinnedIdx === -1 ? 0 : firstUnpinnedIdx, 0, active);
    return reordered;
  }, [sessions, syncedGroups, repos, activeRepoPath, searchQuery, pinnedPaths, pinnedSessionKeys]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <SearchSyncToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSync={handleRefresh}
        isSyncing={isRefreshing}
        syncEnabled={!!activeRepoPath}
        searchPlaceholder="Search sessions…"
        syncTitle="Re-sync AI sessions for the selected repo"
        syncAriaLabel="Sync AI sessions"
      />
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
              defaultExpanded={!!searchQuery.trim() || node.activeCount > 0 || unifiedGroups.length <= 3}
              activeRepoPath={activeRepoPath}
              forceExpandBranches={!!searchQuery.trim()}
              onSelectSession={handleSelectSession}
              onResumeSession={handleResumeSession}
              onDeleteSession={handleDeleteSession}
              onResumeSyncedSession={handleResumeSyncedSession}
              onCreateSession={handleCreateSessionForRepo}
            />
          ))
        ) : searchQuery.trim() ? (
          /* No search results */
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              padding: 12,
              textAlign: "center",
              color: colors.textTertiary,
              fontSize: 11,
            }}
          >
            No sessions matching &ldquo;{searchQuery.trim()}&rdquo;
          </div>
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
                padding: 12,
                textAlign: "center",
                color: colors.textTertiary,
              }}
            >
              <div style={{ fontSize: 11, marginBottom: 6 }}>
                No sessions yet.
              </div>
              <button
                type="button"
                onClick={handleNewSession}
                style={{
                  fontSize: 11,
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
        repoPath={newSessionRepoPath}
        repoName={repoName}
        resumeContext={resumeContext}
      />
    </div>
  );
}
