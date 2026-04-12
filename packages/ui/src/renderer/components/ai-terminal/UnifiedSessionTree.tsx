import React, { useCallback, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderGit2,
  Folder,
  Clock,
} from "lucide-react";
import type { AISessionRecord } from "@magenta/shared/aiTerminal";
import type { SyncedSessionRecord } from "@magenta/shared/syncedSession";
import type { Repository } from "@magenta/shared/models";
import { AISessionListItem } from "./AISessionListItem";
import { ProviderBadge } from "../common/ProviderBadge";
import { BranchLabel } from "../common/RepoLabel";
import { colors } from "../../utils/colors";
import { formatRelativeTime, formatTokens } from "../../utils/formatters";
import { getRepoBadge } from "../../utils/repoBadge";
import type { SessionGroupNode } from "../../utils/sessionTreeBuilder";
export { buildUnifiedGroups, type SessionGroupNode } from "../../utils/sessionTreeBuilder";

/* ── Components ── */

/* ── Repo-style group header (matches sidebar RepoItem look) ── */

type RepoGroupHeaderProps = {
  repo: Repository;
  activeCount: number;
  totalCount: number;
  expanded: boolean;
  onToggle: () => void;
};

const RepoGroupHeader = React.memo(function RepoGroupHeader({
  repo,
  activeCount,
  totalCount,
  expanded,
  onToggle,
}: RepoGroupHeaderProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const badge = getRepoBadge(repo);

  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 16px",
        borderBottom: `1px solid ${colors.border}`,
        background: hovered ? colors.bgHover : colors.bgMuted,
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.12s",
      }}
    >
      {/* Chevron */}
      {expanded ? (
        <ChevronDown size={12} color={colors.textTertiary} style={{ flexShrink: 0 }} />
      ) : (
        <ChevronRight size={12} color={colors.textTertiary} style={{ flexShrink: 0 }} />
      )}

      {/* Git icon in a rounded box — matching RepoItem style */}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 26,
          height: 26,
          borderRadius: 5,
          background: "#C15F3C14",
          flexShrink: 0,
        }}
      >
        <FolderGit2 size={14} color="#C15F3C" strokeWidth={1.8} />
      </span>

      {/* Repo name + meta (badge + branch) */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontWeight: 600,
            fontSize: 12,
            color: colors.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "block",
          }}
        >
          {repo.name}
        </span>
        <div
          style={{
            fontSize: 10,
            color: "#9a958c",
            marginTop: 2,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              display: "inline-block",
              padding: "1px 6px",
              borderRadius: 3,
              fontSize: 9,
              fontWeight: 500,
              background: badge.bg,
              color: badge.color,
              lineHeight: "16px",
            }}
          >
            {badge.label}
          </span>
          <BranchLabel name={repo.branch} size="xs" badge />
        </div>
      </div>

      {/* Active indicator */}
      {activeCount > 0 && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "#3d7a2a",
            padding: "1px 5px",
            borderRadius: 4,
            background: "#3d7a2a14",
            border: "1px solid #3d7a2a40",
            flexShrink: 0,
          }}
        >
          {activeCount} active
        </span>
      )}

      {/* Total session count */}
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: colors.textTertiary,
          padding: "1px 5px",
          borderRadius: 4,
          background: colors.bgHover,
          flexShrink: 0,
        }}
      >
        {totalCount}
      </span>
    </button>
  );
});

/* ── Workspace folder header (no repo in DB) ── */

type WorkspaceGroupHeaderProps = {
  name: string;
  activeCount: number;
  totalCount: number;
  latestTimestamp: number;
  expanded: boolean;
  onToggle: () => void;
};

const WorkspaceGroupHeader = React.memo(function WorkspaceGroupHeader({
  name,
  activeCount,
  totalCount,
  latestTimestamp,
  expanded,
  onToggle,
}: WorkspaceGroupHeaderProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 16px",
        borderBottom: `1px solid ${colors.border}`,
        background: hovered ? colors.bgHover : colors.bgMuted,
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.12s",
      }}
    >
      {/* Chevron */}
      {expanded ? (
        <ChevronDown size={12} color={colors.textTertiary} style={{ flexShrink: 0 }} />
      ) : (
        <ChevronRight size={12} color={colors.textTertiary} style={{ flexShrink: 0 }} />
      )}

      {/* Folder icon */}
      <Folder size={14} color={colors.textSecondary} style={{ flexShrink: 0 }} />

      {/* Name */}
      <span
        style={{
          flex: 1,
          fontSize: 12,
          fontWeight: 600,
          color: colors.text,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>

      {/* Active indicator */}
      {activeCount > 0 && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "#3d7a2a",
            padding: "1px 5px",
            borderRadius: 4,
            background: "#3d7a2a14",
            border: "1px solid #3d7a2a40",
            flexShrink: 0,
          }}
        >
          {activeCount} active
        </span>
      )}

      {/* Total session count */}
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: colors.textTertiary,
          padding: "1px 5px",
          borderRadius: 4,
          background: colors.bgHover,
          flexShrink: 0,
        }}
      >
        {totalCount}
      </span>

      {/* Latest time */}
      {latestTimestamp > 0 && (
        <span style={{ fontSize: 10, color: colors.textTertiary, flexShrink: 0 }}>
          {formatRelativeTime(latestTimestamp)}
        </span>
      )}
    </button>
  );
});

/* ── Synced session row (compact, clickable, inside a group) ── */

type SyncedSessionRowProps = {
  session: SyncedSessionRecord;
  /** Called when the user clicks to resume this synced session */
  onResume: (session: SyncedSessionRecord) => void;
};

const SyncedSessionRow = React.memo(function SyncedSessionRow({
  session,
  onResume,
}: SyncedSessionRowProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  const timeDisplay = formatRelativeTime(session.startedAt);

  const tokenDisplay = useMemo(() => {
    if (!session.tokenUsage) return null;
    const total = (session.tokenUsage.inputTokens || 0) + (session.tokenUsage.outputTokens || 0);
    if (total === 0) return null;
    return formatTokens(total);
  }, [session.tokenUsage]);

  const provider = session.provider === "claude-code" ? "claude" : "copilot";

  const handleClick = useCallback(() => {
    onResume(session);
  }, [onResume, session]);

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        padding: "8px 16px 8px 54px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        borderBottom: `1px solid ${colors.borderLight}`,
        background: hovered ? colors.bgHover : colors.bgSurface,
        transition: "background 0.12s",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      {/* Provider badge */}
      <ProviderBadge provider={provider} iconSize={12} fontSize={11} color={colors.textSecondary} />

      {/* Session info */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {/* Title or slug */}
        <span
          style={{
            fontSize: 12,
            color: colors.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {session.title || session.slug || session.sessionId.slice(0, 8)}
        </span>

        {/* Meta row: model + branch + messages */}
        <span
          style={{
            fontSize: 10,
            color: colors.textTertiary,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {session.model && <span>{session.model}</span>}
          {session.gitBranch && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>{session.gitBranch}</span>
            </>
          )}
          {session.messageCount > 0 && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>{session.messageCount} msgs</span>
            </>
          )}
          {session.subagentCount > 0 && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>{session.subagentCount} agents</span>
            </>
          )}
          {tokenDisplay && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>{tokenDisplay} tokens</span>
            </>
          )}
        </span>
      </div>

      {/* Status */}
      {session.status === "active" && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: "#3d7a2a",
            padding: "1px 6px",
            borderRadius: 3,
            background: "#3d7a2a12",
            border: "1px solid #3d7a2a40",
            flexShrink: 0,
          }}
        >
          Active
        </span>
      )}

      {/* Time */}
      <span
        style={{
          fontSize: 10,
          color: colors.textTertiary,
          flexShrink: 0,
          minWidth: 48,
          textAlign: "right",
          display: "flex",
          alignItems: "center",
          gap: 3,
        }}
      >
        <Clock size={10} />
        {timeDisplay}
      </span>
    </button>
  );
});

/* ── Session group node view ── */

type SessionGroupNodeViewProps = {
  node: SessionGroupNode;
  defaultExpanded?: boolean;
  onSelectSession: (sessionId: string) => void;
  onResumeSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  /** Called when user clicks a synced (history) session to resume it */
  onResumeSyncedSession: (session: SyncedSessionRecord) => void;
};

function SessionGroupNodeComponent({
  node,
  defaultExpanded = false,
  onSelectSession,
  onResumeSession,
  onDeleteSession,
  onResumeSyncedSession,
}: SessionGroupNodeViewProps): React.ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const hasLive = node.liveSessions.length > 0;
  const hasSynced = node.syncedSessions.length > 0;

  return (
    <div>
      {/* Group header — different style for repos vs workspace folders */}
      {node.repo ? (
        <RepoGroupHeader
          repo={node.repo}
          activeCount={node.activeCount}
          totalCount={node.totalCount}
          expanded={expanded}
          onToggle={toggleExpanded}
        />
      ) : (
        <WorkspaceGroupHeader
          name={node.name}
          activeCount={node.activeCount}
          totalCount={node.totalCount}
          latestTimestamp={node.latestTimestamp}
          expanded={expanded}
          onToggle={toggleExpanded}
        />
      )}

      {/* Expanded children */}
      {expanded && (
        <>
          {/* Live sessions first */}
          {hasLive && node.liveSessions.map((session) => (
            <div key={session.id} style={{ paddingLeft: 16 }}>
              <AISessionListItem
                session={session}
                onSelect={onSelectSession}
                onResume={onResumeSession}
                onDelete={onDeleteSession}
              />
            </div>
          ))}

          {/* Divider between live and synced if both exist */}
          {hasLive && hasSynced && (
            <div
              style={{
                padding: "4px 16px 4px 54px",
                fontSize: 9,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: colors.textTertiary,
                borderBottom: `1px solid ${colors.borderLight}`,
              }}
            >
              History
            </div>
          )}

          {/* Synced sessions */}
          {hasSynced && node.syncedSessions.map((session) => (
            <SyncedSessionRow key={session.id} session={session} onResume={onResumeSyncedSession} />
          ))}
        </>
      )}
    </div>
  );
}

export const SessionGroupNodeView = React.memo(SessionGroupNodeComponent);

