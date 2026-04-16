import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  Clock,
} from "lucide-react";
import type { AISessionRecord } from "@magenta/shared/aiTerminal";
import type { SyncedSessionRecord } from "@magenta/shared/syncedSession";
import type { Repository } from "@magenta/shared/models";
import { AISessionListItem } from "./AISessionListItem";
import { ProviderBadge } from "../common/ProviderBadge";
import { RepoLabel, BranchLabel } from "../common/RepoLabel";
import { colors } from "../../utils/colors";
import { formatRelativeTime, formatTokens } from "../../utils/formatters";
import { ScrollableText } from "../common/ScrollableText";
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
        gap: 8,
        padding: "5px 12px",
        borderBottom: `1px solid ${colors.border}`,
        background: hovered ? colors.bgHover : "transparent",
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

      <RepoLabel name={repo.name} size="md" boxed style={{ flex: 1, minWidth: 0 }}>
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
        <BranchLabel name={repo.branch} size="xs" />
      </RepoLabel>

      {/* Active indicator */}
      {activeCount > 0 && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: colors.success,
            padding: "1px 5px",
            borderRadius: 4,
            background: colors.successSoft,
            border: `1px solid ${colors.successSoftBorder}`,
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
        gap: 6,
        padding: "5px 12px",
        borderBottom: `1px solid ${colors.border}`,
        background: hovered ? colors.bgHover : "transparent",
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
      <ScrollableText
        style={{
          flex: 1,
          fontSize: 12,
          fontWeight: 600,
          color: colors.text,
        }}
      >
        {name}
      </ScrollableText>

      {/* Active indicator */}
      {activeCount > 0 && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: colors.success,
            padding: "1px 5px",
            borderRadius: 4,
            background: colors.successSoft,
            border: `1px solid ${colors.successSoftBorder}`,
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

/* ── Activity badge for synced sessions ── */

type ActivityBadgeProps = {
  activity: SyncedSessionRecord["activity"];
};

const ActivityBadge = React.memo(function ActivityBadge({
  activity,
}: ActivityBadgeProps): React.ReactElement | null {
  // Only surface the badge when the agent is actively producing output.
  // `idle` and `completed` are both resting states from the user's
  // perspective — no badge avoids the row turning into a wall of yellow
  // pills for every historic conversation.
  if (activity !== "processing") return null;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 9,
        fontWeight: 600,
        color: colors.success,
        padding: "1px 6px",
        borderRadius: 3,
        background: colors.successSoft,
        border: `1px solid ${colors.successSoftBorder}`,
        flexShrink: 0,
      }}
      title="Agent is currently producing output"
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: colors.success,
          // Pulse the dot while processing for a clear "live" cue.
          // Reuses the existing provider-pulse @keyframes from globals.css.
          animation: "provider-pulse 1.2s ease-in-out infinite",
        }}
      />
      Processing
    </span>
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
        padding: "4px 12px 4px 48px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        borderBottom: `1px solid ${colors.borderLight}`,
        background: hovered ? colors.bgHover : "transparent",
        transition: "background 0.12s",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      {/* Provider badge */}
      <ProviderBadge provider={provider} iconSize={12} fontSize={11} color={colors.textSecondary} />

      {/* Branch badge */}
      {session.gitBranch && <BranchLabel name={session.gitBranch} size="xs" />}

      {/* Separator */}
      <span style={{ color: colors.textTertiary, fontSize: 11, flexShrink: 0 }}>·</span>

      {/* Title or slug */}
      <ScrollableText
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12,
          color: colors.text,
        }}
      >
        {session.title || session.slug || session.sessionId.slice(0, 8)}
      </ScrollableText>

      {/* Live activity badge — processing / idle. Completed sessions show no badge. */}
      <ActivityBadge activity={session.activity} />


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
  /** When this matches the group's repo path, force-expand and scroll into view. */
  activeRepoPath?: string | null;
  onSelectSession: (sessionId: string) => void;
  onResumeSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  /** Called when user clicks a synced (history) session to resume it */
  onResumeSyncedSession: (session: SyncedSessionRecord) => void;
};

function SessionGroupNodeComponent({
  node,
  defaultExpanded = false,
  activeRepoPath,
  onSelectSession,
  onResumeSession,
  onDeleteSession,
  onResumeSyncedSession,
}: SessionGroupNodeViewProps): React.ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const isActive =
    !!activeRepoPath &&
    (node.repo?.path === activeRepoPath || node.path === activeRepoPath);

  // Auto-expand and scroll into view when this group becomes the active repo.
  useEffect(() => {
    if (!isActive) return;
    setExpanded(true);
    const id = requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [isActive]);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const hasActive = node.activeLiveSessions.length > 0;
  const hasHistory = node.history.length > 0;

  return (
    <div ref={rootRef}>
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

      {/* Expanded children — currently-running sessions first, then HISTORY */}
      {expanded && (
        <>
          {hasActive && node.activeLiveSessions.map((session) => (
            <div key={session.id} style={{ paddingLeft: 16 }}>
              <AISessionListItem
                session={session}
                onSelect={onSelectSession}
                onResume={onResumeSession}
                onDelete={onDeleteSession}
              />
            </div>
          ))}

          {/* HISTORY divider — always shown when there's any history to report. */}
          {hasHistory && (
            <div
              style={{
                padding: "3px 12px 3px 48px",
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

          {/* Unified history list — idle live sessions + synced-from-disk rows,
              sorted by timestamp DESC, each rendered with the component that
              matches its kind. */}
          {hasHistory && node.history.map((item) => {
            if (item.kind === "live") {
              return (
                <div key={`live:${item.session.id}`} style={{ paddingLeft: 16 }}>
                  <AISessionListItem
                    session={item.session}
                    onSelect={onSelectSession}
                    onResume={onResumeSession}
                    onDelete={onDeleteSession}
                  />
                </div>
              );
            }
            return (
              <SyncedSessionRow
                key={`synced:${item.session.id}`}
                session={item.session}
                onResume={onResumeSyncedSession}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

export const SessionGroupNodeView = React.memo(SessionGroupNodeComponent);

