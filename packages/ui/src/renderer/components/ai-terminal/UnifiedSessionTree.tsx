import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  Clock,
  Pin,
  PinOff,
} from "lucide-react";
import type { AISessionRecord } from "@magenta/shared/aiTerminal";
import type { SyncedSessionRecord } from "@magenta/shared/syncedSession";
import type { Repository } from "@magenta/shared/models";
import { AISessionListItem } from "./AISessionListItem";
import { ProviderBadge } from "../common/ProviderBadge";
import { RepoLabel, BranchLabel } from "../common/RepoLabel";
import {
  ContextMenu,
  useContextMenu,
  type ContextMenuAction,
} from "../common/ContextMenu";
import { colors } from "../../utils/colors";
import { formatRelativeTime, formatTokens } from "../../utils/formatters";
import { pathExists } from "../../utils/ipc";
import { openWithVsCodeAction } from "../../utils/contextMenuActions";
import { ScrollableText } from "../common/ScrollableText";
import { getRepoBadge } from "../../utils/repoBadge";
import { Tag } from "../common/Tag";
import { usePinnedSessionsStore } from "../../store/pinnedSessionsStore";
import { syncedPinKey } from "../../utils/sessionPinKey";
import type { SessionGroupNode, BranchGroup, HistoryItem } from "../../utils/sessionTreeBuilder";
export { buildUnifiedGroups, type SessionGroupNode, type BranchGroup } from "../../utils/sessionTreeBuilder";

/**
 * Derive the on-disk "session directory" for a synced session record — the
 * folder that holds the session's JSONL file(s). For both Claude Code (the
 * main session JSONL sits in `<projectsDir>/<slug>/`) and Copilot (the
 * `events.jsonl` sits in `<session-state>/<sessionId>/`) the parent directory
 * of `syncedFilePath` is the right thing to reveal in Finder / Explorer.
 *
 * Returns `null` for legacy rows that predate the `syncedFilePath` column so
 * the caller can mark the context-menu item unavailable.
 */
function getSessionDirectory(session: SyncedSessionRecord): string | null {
  if (!session.syncedFilePath) return null;
  // Match on both POSIX and Windows separators — the daemon records the
  // platform-native absolute path, but we must not assume it's POSIX.
  const lastSlash = Math.max(
    session.syncedFilePath.lastIndexOf("/"),
    session.syncedFilePath.lastIndexOf("\\"),
  );
  if (lastSlash <= 0) return null;
  return session.syncedFilePath.slice(0, lastSlash);
}

/* ── Components ── */

/* ── Repo-style group header (matches sidebar RepoItem look) ── */

type RepoGroupHeaderProps = {
  repo: Repository;
  activeCount: number;
  totalCount: number;
  expanded: boolean;
  onToggle: () => void;
  onCreateSession?: () => void;
};

const RepoGroupHeader = React.memo(function RepoGroupHeader({
  repo,
  activeCount,
  totalCount,
  expanded,
  onToggle,
  onCreateSession,
}: RepoGroupHeaderProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const badge = getRepoBadge(repo);
  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();

  const contextMenuItems = useMemo<ContextMenuAction[]>(() => [
    {
      label: "New AI Session…",
      emoji: "✨",
      action: onCreateSession,
      disabled: !onCreateSession,
    },
    openWithVsCodeAction(repo.path),
  ], [onCreateSession, repo.path]);

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        onContextMenu={openContextMenu}
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

        <RepoLabel
          name={repo.name}
          repoPath={repo.path}
          size="md"
          boxed
          style={{ flex: 1, minWidth: 0 }}
        >
          <Tag tone={badge.tone} size="xs" fontWeight={500}>
            {badge.label}
          </Tag>
          <BranchLabel name={repo.branch} size="xs" />
        </RepoLabel>

        {/* Active indicator */}
        {activeCount > 0 && (
          <Tag tone="success" size="xs" fontWeight={700}>
            {activeCount} active
          </Tag>
        )}

        {/* Total session count — borderless muted chip */}
        <Tag tone="neutral" size="xs" fontSize={10} borderColor={null}>
          {totalCount}
        </Tag>
      </button>

      {contextMenu && (
        <ContextMenu
          position={contextMenu}
          items={contextMenuItems}
          onClose={closeContextMenu}
        />
      )}
    </>
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
        <Tag tone="success" size="xs" fontWeight={700}>
          {activeCount} active
        </Tag>
      )}

      {/* Total session count — borderless muted chip */}
      <Tag tone="neutral" size="xs" fontSize={10} borderColor={null}>
        {totalCount}
      </Tag>

      {/* Latest time */}
      {latestTimestamp > 0 && (
        <span style={{ fontSize: 10, color: colors.textTertiary, flexShrink: 0 }}>
          {formatRelativeTime(latestTimestamp)}
        </span>
      )}
    </button>
  );
});

/* ── Collapsible branch/worktree sub-group header ── */

type BranchGroupHeaderProps = {
  branchName: string;
  sessionCount: number;
  expanded: boolean;
  onToggle: () => void;
};

const BranchGroupHeader = React.memo(function BranchGroupHeader({
  branchName,
  sessionCount,
  expanded,
  onToggle,
}: BranchGroupHeaderProps): React.ReactElement {
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
        padding: "3px 12px 3px 36px",
        borderBottom: `1px solid ${colors.borderLight}`,
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

      {/* Branch name — plain icon + text, same size as repo label */}
      <BranchLabel name={branchName} size="md" badge={false} style={{ flex: 1, minWidth: 0 }} />

      {/* Session count */}
      <Tag tone="neutral" size="xs" fontSize={10} borderColor={null}>
        {sessionCount}
      </Tag>
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
    <Tag tone="success" size="xs" dot title="Agent is currently producing output">
      Processing
    </Tag>
  );
});

/* ── Synced session row (compact, clickable, inside a group) ── */

type SyncedSessionRowProps = {
  session: SyncedSessionRecord;
  /** Called when the user clicks to resume this synced session */
  onResume: (session: SyncedSessionRecord) => void;
  /** Render a branch label next to the title. Used outside branch groups. */
  showBranch?: boolean;
};

const SyncedSessionRow = React.memo(function SyncedSessionRow({
  session,
  onResume,
  showBranch = false,
}: SyncedSessionRowProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();
  const pinKey = syncedPinKey(session);
  const isPinned = usePinnedSessionsStore((s) => s.pinnedKeys.has(pinKey));
  const togglePin = usePinnedSessionsStore((s) => s.togglePin);

  // Availability of the two paths we expose on the context menu. We track
  // `undefined` as "not yet checked" so the items aren't flashed enabled then
  // immediately disabled on first open; they render grey until the IPC round
  // trip resolves. Re-checked every time the menu is opened so stale answers
  // don't linger when the user has just deleted/restored a directory.
  const [sessionDirAvailable, setSessionDirAvailable] = useState<boolean | undefined>(undefined);
  const [workingDirAvailable, setWorkingDirAvailable] = useState<boolean | undefined>(undefined);

  const sessionDir = useMemo(() => getSessionDirectory(session), [session]);
  const workingDir = session.cwd;

  const handleOpenContextMenu = useCallback(
    (e: React.MouseEvent) => {
      // Reset prior results — the paths may have been deleted / recreated
      // since the last right-click.
      setSessionDirAvailable(undefined);
      setWorkingDirAvailable(undefined);
      openContextMenu(e);

      // Fire both existence checks in parallel. If either is missing at the
      // schema level (null) the helper short-circuits to false without hitting
      // the IPC bridge.
      void pathExists(sessionDir).then(setSessionDirAvailable);
      void pathExists(workingDir).then(setWorkingDirAvailable);
    },
    [openContextMenu, sessionDir, workingDir],
  );

  const contextMenuItems = useMemo<ContextMenuAction[]>(() => {
    // When availability is still `undefined` we render the items as disabled
    // so the user never sees a momentary flash of "enabled" state that could
    // lead to a click on a non-existent path. This resolves in a few ms.
    const sessionDirReady = sessionDirAvailable === true;
    const workingDirReady = workingDirAvailable === true;

    const sessionDirTitle = !sessionDir
      ? "Session directory not recorded for this session"
      : sessionDirAvailable === false
        ? `Path no longer exists: ${sessionDir}`
        : sessionDirAvailable === undefined
          ? "Checking availability…"
          : sessionDir;

    const workingDirTitle = !workingDir
      ? "Working directory not recorded for this session"
      : workingDirAvailable === false
        ? `Path no longer exists: ${workingDir}`
        : workingDirAvailable === undefined
          ? "Checking availability…"
          : workingDir;

    return [
      {
        label: isPinned ? "Unpin" : "Pin",
        Icon: isPinned ? PinOff : Pin,
        action: () => togglePin(pinKey),
      },
      {
        ...openWithVsCodeAction(sessionDir ?? "", {
          label: "Open Session With Code",
          variant: "visual-studio",
          disabled: !sessionDirReady,
          title: sessionDirTitle,
        }),
        separator: true,
      },
      openWithVsCodeAction(workingDir ?? "", {
        label: "Open workspace With Code",
        disabled: !workingDirReady,
        title: workingDirTitle,
      }),
    ];
  }, [sessionDir, workingDir, sessionDirAvailable, workingDirAvailable, isPinned, pinKey, togglePin]);

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
    <>
    <button
      type="button"
      onClick={handleClick}
      onContextMenu={handleOpenContextMenu}
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

      {/* Branch label (only rendered outside a BranchGroupSection) */}
      {showBranch && session.gitBranch && (
        <BranchLabel name={session.gitBranch} size="xs" style={{ flexShrink: 0 }} />
      )}

      {/* Time */}
      <span
        style={{
          fontSize: 10,
          color: colors.textTertiary,
          flexShrink: 0,
          minWidth: 60,
          textAlign: "right",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 3,
        }}
      >
        <Clock size={10} />
        {timeDisplay}
      </span>

      {/* Live activity badge — processing / idle. Completed sessions show no badge. */}
      <ActivityBadge activity={session.activity} />
    </button>
    {contextMenu && (
      <ContextMenu
        position={contextMenu}
        items={contextMenuItems}
        onClose={closeContextMenu}
      />
    )}
    </>
  );
});

/* ── Collapsible branch group section ── */

type BranchGroupSectionProps = {
  group: BranchGroup;
  defaultExpanded?: boolean;
  onSelectSession: (sessionId: string) => void;
  onResumeSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onResumeSyncedSession: (session: SyncedSessionRecord) => void;
};

const BranchGroupSection = React.memo(function BranchGroupSection({
  group,
  defaultExpanded = false,
  onSelectSession,
  onResumeSession,
  onDeleteSession,
  onResumeSyncedSession,
}: BranchGroupSectionProps): React.ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    if (defaultExpanded) setExpanded(true);
  }, [defaultExpanded]);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <div>
      <BranchGroupHeader
        branchName={group.branchName}
        sessionCount={group.items.length}
        expanded={expanded}
        onToggle={toggleExpanded}
      />
      {expanded && group.items.map((item) => {
        if (item.kind === "live") {
          return (
            <div key={`live:${item.session.id}`} style={{ paddingLeft: 32 }}>
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
    </div>
  );
});

/* ── Session group node view ── */

type SessionGroupNodeViewProps = {
  node: SessionGroupNode;
  defaultExpanded?: boolean;
  /** When this matches the group's repo path, force-expand and scroll into view. */
  activeRepoPath?: string | null;
  /** When true, auto-expand branch groups (used during search) */
  forceExpandBranches?: boolean;
  onSelectSession: (sessionId: string) => void;
  onResumeSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  /** Called when user clicks a synced (history) session to resume it */
  onResumeSyncedSession: (session: SyncedSessionRecord) => void;
  /** Called when user right-clicks a repo group header and picks "New AI Session" */
  onCreateSession?: (repoPath: string) => void;
};

function SessionGroupNodeComponent({
  node,
  defaultExpanded = false,
  activeRepoPath,
  forceExpandBranches = false,
  onSelectSession,
  onResumeSession,
  onDeleteSession,
  onResumeSyncedSession,
  onCreateSession,
}: SessionGroupNodeViewProps): React.ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const isActive =
    !!activeRepoPath &&
    (node.repo?.path === activeRepoPath || node.path === activeRepoPath);

  // Force-expand when defaultExpanded flips to true (e.g. search is active)
  useEffect(() => {
    if (defaultExpanded) setExpanded(true);
  }, [defaultExpanded]);

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
  const hasBranchGroups = node.branchGroups.length > 0;
  const hasPinned = node.pinnedActive.length > 0 || node.pinnedItems.length > 0;

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
          onCreateSession={onCreateSession ? () => onCreateSession(node.repo!.path) : undefined}
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

      {/* Expanded children — pinned, then active sessions at repo level, then branch groups */}
      {expanded && (
        <>
          {/* Pinned section — hoisted above active + branch groups */}
          {hasPinned && (
            <PinnedSection
              pinnedActive={node.pinnedActive}
              pinnedItems={node.pinnedItems}
              onSelectSession={onSelectSession}
              onResumeSession={onResumeSession}
              onDeleteSession={onDeleteSession}
              onResumeSyncedSession={onResumeSyncedSession}
            />
          )}

          {/* Active sessions rendered directly under the repo header */}
          {hasActive && node.activeLiveSessions.map((session) => (
            <div key={session.id} style={{ paddingLeft: 16 }}>
              <AISessionListItem
                session={session}
                onSelect={onSelectSession}
                onResume={onResumeSession}
                onDelete={onDeleteSession}
                showBranch
              />
            </div>
          ))}

          {/* Branch groups — collapsible sections grouping history sessions by branch */}
          {hasBranchGroups && node.branchGroups.map((group) => (
            <BranchGroupSection
              key={`branch:${group.branchName}`}
              group={group}
              defaultExpanded={forceExpandBranches}
              onSelectSession={onSelectSession}
              onResumeSession={onResumeSession}
              onDeleteSession={onDeleteSession}
              onResumeSyncedSession={onResumeSyncedSession}
            />
          ))}
        </>
      )}
    </div>
  );
}

/* ── Pinned section (hoisted above Active + branch groups) ── */

type PinnedSectionProps = {
  pinnedActive: AISessionRecord[];
  pinnedItems: HistoryItem[];
  onSelectSession: (sessionId: string) => void;
  onResumeSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onResumeSyncedSession: (session: SyncedSessionRecord) => void;
};

const PinnedSection = React.memo(function PinnedSection({
  pinnedActive,
  pinnedItems,
  onSelectSession,
  onResumeSession,
  onDeleteSession,
  onResumeSyncedSession,
}: PinnedSectionProps): React.ReactElement {
  const total = pinnedActive.length + pinnedItems.length;
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 12px 3px 36px",
          borderBottom: `1px solid ${colors.borderLight}`,
          color: colors.textSecondary,
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        <Pin size={11} color={colors.primary} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1 }}>Pinned</span>
        <Tag tone="neutral" size="xs" fontSize={10} borderColor={null}>
          {total}
        </Tag>
      </div>
      {pinnedActive.map((session) => (
        <div key={`pin-live:${session.id}`} style={{ paddingLeft: 16 }}>
          <AISessionListItem
            session={session}
            onSelect={onSelectSession}
            onResume={onResumeSession}
            onDelete={onDeleteSession}
            showBranch
          />
        </div>
      ))}
      {pinnedItems.map((item) => {
        if (item.kind === "live") {
          return (
            <div key={`pin-live:${item.session.id}`} style={{ paddingLeft: 16 }}>
              <AISessionListItem
                session={item.session}
                onSelect={onSelectSession}
                onResume={onResumeSession}
                onDelete={onDeleteSession}
                showBranch
              />
            </div>
          );
        }
        return (
          <SyncedSessionRow
            key={`pin-synced:${item.session.id}`}
            session={item.session}
            onResume={onResumeSyncedSession}
            showBranch
          />
        );
      })}
    </div>
  );
});

export const SessionGroupNodeView = React.memo(SessionGroupNodeComponent);

