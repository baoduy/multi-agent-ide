import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, ArrowLeft } from "lucide-react";

import { useAISessionStore } from "../../store/aiSessionStore";
import { AISessionListItem } from "./AISessionListItem";
import { NewAISessionDialog } from "../dialogs/NewAISessionDialog";
import { MagentaTerminal } from "../common/MagentaTerminal";
import { AIStatusBar } from "./AIStatusBar";
import { RepoLabel, BranchLabel } from "../common/RepoLabel";
import { WorkspaceLabel } from "../common/WorkspaceLabel";
import { ProviderBadge } from "../common/ProviderBadge";
import { colors } from "../../utils/colors";
import type { AISessionRecord } from "@magenta/shared/aiTerminal";

type AISessionsViewProps = {
  repoPath?: string;
  repoName: string | null;
};

/**
 * Main view for AI terminal sessions.
 *
 * Has two states:
 * 1. Session list (activeSessionId === null) — shows list of sessions with "New Session" button
 * 2. Active terminal (activeSessionId !== null) — shows interactive terminal for the active session
 */
export function AISessionsView({
  repoPath,
  repoName,
}: AISessionsViewProps): React.ReactElement {
  const sessions = useAISessionStore((s) => s.sessions);
  const activeSessionId = useAISessionStore((s) => s.activeSessionId);
  const liveOutput = useAISessionStore((s) => s.liveOutput);
  const fetchSessions = useAISessionStore((s) => s.fetchSessions);
  const initializeSubscriptions = useAISessionStore((s) => s.initializeSubscriptions);
  const setActiveSession = useAISessionStore((s) => s.setActiveSession);
  const resumeSession = useAISessionStore((s) => s.resumeSession);
  const deleteSession = useAISessionStore((s) => s.deleteSession);

  const [newSessionDialogOpen, setNewSessionDialogOpen] = useState(false);

  // Initialize subscriptions and fetch sessions on mount
  useEffect(() => {
    initializeSubscriptions();
    void fetchSessions();
  }, [initializeSubscriptions, fetchSessions]);

  // Handlers with useCallback
  const handleNewSession = useCallback(() => {
    setNewSessionDialogOpen(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setNewSessionDialogOpen(false);
  }, []);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (session && session.status === "idle") {
        // Session has no live PTY — auto-resume it so the terminal isn't blank
        void resumeSession(sessionId, 80, 24);
      } else {
        setActiveSession(sessionId);
      }
    },
    [sessions, setActiveSession, resumeSession],
  );

  const handleResumeSession = useCallback(
    (sessionId: string) => {
      // Resume the session process via IPC (reconnects PTY), using default terminal dimensions
      void resumeSession(sessionId, 80, 24);
    },
    [resumeSession],
  );

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      void deleteSession(sessionId);
    },
    [deleteSession],
  );

  const handleBackFromTerminal = useCallback(() => {
    setActiveSession(null);
  }, [setActiveSession]);

  // Find active session
  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId),
    [sessions, activeSessionId],
  );

  // Sort sessions by lastActiveAt descending
  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.lastActiveAt - a.lastActiveAt),
    [sessions],
  );

  // ─────────────────────────────────────────────────────────
  // State A: Session list (activeSessionId === null)
  // ─────────────────────────────────────────────────────────
  if (!activeSession) {
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

        {/* Sessions list or empty state */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {sessions.length === 0 ? (
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
          ) : (
            sortedSessions.map((session) => (
              <AISessionListItem
                key={session.id}
                session={session}
                onSelect={handleSelectSession}
                onResume={handleResumeSession}
                onDelete={handleDeleteSession}
              />
            ))
          )}
        </div>

        {/* New session dialog */}
        <NewAISessionDialog
          open={newSessionDialogOpen}
          onClose={handleCloseDialog}
          repoPath={repoPath}
          repoName={repoName}
        />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  // State B: Active terminal (activeSessionId !== null)
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
      {/* Header with back button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          borderBottom: "1px solid #3c3c3c",
          background: "#252526",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={handleBackFromTerminal}
          title="Back to session list"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: 4,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "#d4d4d4",
            transition: "color 0.12s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#ffffff"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#d4d4d4"; }}
        >
          <ArrowLeft size={16} strokeWidth={2} />
        </button>

        {/* Provider badge */}
        <ProviderBadge provider={activeSession.provider} iconSize={16} fontSize={12} color="#d4d4d4" />

        {/* Repo / branch info */}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          {activeSession.repoName ? (
            <>
              <RepoLabel name={activeSession.repoName} size="sm" variant="dark" />
              {(activeSession.worktreeName || activeSession.branch) && (
                <BranchLabel
                  name={activeSession.worktreeName || activeSession.branch || ""}
                  size="sm"
                  variant="dark"
                />
              )}
            </>
          ) : (
            <WorkspaceLabel size="sm" variant="dark" />
          )}
        </span>

        {/* New Session button — always accessible */}
        <button
          type="button"
          onClick={handleNewSession}
          title="New AI Session"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 10px",
            borderRadius: 5,
            border: "1px solid #555",
            background: "transparent",
            color: "#d4d4d4",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 500,
            flexShrink: 0,
            transition: "background 0.12s, color 0.12s, border-color 0.12s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#3c3c3c";
            e.currentTarget.style.color = "#ffffff";
            e.currentTarget.style.borderColor = "#777";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "#d4d4d4";
            e.currentTarget.style.borderColor = "#555";
          }}
        >
          <Plus size={12} strokeWidth={2} />
          New Session
        </button>
      </div>

      {/* Terminal area (fills remaining space) */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          padding: 12,
        }}
      >
        <MagentaTerminal
          readonly={false}
          cwd={activeSession.cwd}
          mode="ai-agent"
          aiSessionId={activeSession.id}
          aiProvider={activeSession.provider}
          maxHeight={undefined}
          fontSize={12}
          fontFamily="'SF Mono', 'Fira Code', ui-monospace, monospace"
          enableTabs={false}
        />
      </div>

      {/* Status bar */}
      <AIStatusBar session={activeSession} />

      {/* New session dialog (accessible from terminal view too) */}
      <NewAISessionDialog
        open={newSessionDialogOpen}
        onClose={handleCloseDialog}
        repoPath={repoPath}
        repoName={repoName}
      />
    </div>
  );
}
