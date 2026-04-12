import React, { useCallback, useMemo, useState } from "react";
import { Play, Trash2 } from "lucide-react";
import type { AISessionRecord } from "@magenta/shared/aiTerminal";
import { ContextMenu, useContextMenu, type ContextMenuAction } from "../common/ContextMenu";
import { RepoLabel, BranchLabel } from "../common/RepoLabel";
import { WorkspaceLabel } from "../common/WorkspaceLabel";
import { ProviderBadge } from "../common/ProviderBadge";
import { colors } from "../../utils/colors";
import { formatRelativeTime } from "../../utils/formatters";
import { getStatusColor, isActiveStatus } from "../../utils/sessionStatus";

type AISessionListItemProps = {
  session: AISessionRecord;
  onSelect: (sessionId: string) => void;
  onResume: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
};


/**
 * Formats the status for display.
 */
function formatStatus(status: AISessionRecord["status"]): string {
  switch (status) {
    case "waiting-input":
      return "Waiting for input";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

function AISessionListItemComponent({
  session,
  onSelect,
  onResume,
  onDelete,
}: AISessionListItemProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();

  const contextMenuItems: ContextMenuAction[] = useMemo(
    () => [
      {
        label: "Resume",
        Icon: Play,
        action: () => onResume(session.id),
      },
      {
        label: "Delete",
        Icon: Trash2,
        separator: true,
        action: () => onDelete(session.id),
      },
    ],
    [onResume, onDelete, session.id],
  );

  const showStatus = isActiveStatus(session.status);
  const statusColor = showStatus ? getStatusColor(session.status) : "";
  const repoDisplayName = session.repoName || session.repoPath?.split("/").pop() || null;
  const branchDisplayName = session.worktreeName || session.branch || null;
  const timeDisplay = formatRelativeTime(session.lastActiveAt);
  const statusText = showStatus ? formatStatus(session.status) : "";
  const sessionTitle = session.title;

  return (
    <>
      <button
        type="button"
        onClick={() => onSelect(session.id)}
        onContextMenu={openContextMenu}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: "100%",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderBottom: `1px solid ${colors.border}`,
          background: hovered ? colors.bgHover : colors.bgSurface,
          border: "none",
          cursor: "pointer",
          transition: "background 0.12s",
          textAlign: "left",
        }}
      >
        {/* Main content — two-line layout when title is present */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 3,
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          {/* Top row: provider badge + title */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minWidth: 0,
            }}
          >
            <ProviderBadge provider={session.provider} iconSize={14} fontSize={12} color={colors.text} />
            {sessionTitle && (
              <>
                <span style={{ color: colors.textTertiary, fontSize: 11, flexShrink: 0 }}>·</span>
                <span
                  style={{
                    fontSize: 12,
                    color: colors.textSecondary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                  }}
                >
                  {sessionTitle}
                </span>
              </>
            )}
          </div>

          {/* Bottom row: repo + branch */}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            {repoDisplayName ? (
              <>
                <RepoLabel name={repoDisplayName} size="xs" />
                {branchDisplayName && <BranchLabel name={branchDisplayName} size="xs" />}
              </>
            ) : (
              <WorkspaceLabel size="xs" />
            )}
          </span>
        </div>

        {/* Status badge — only shown for active sessions */}
        {showStatus && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: statusColor,
              padding: "2px 8px",
              borderRadius: 4,
              background: `${statusColor}12`,
              border: `1px solid ${statusColor}40`,
              flexShrink: 0,
            }}
          >
            {statusText}
          </span>
        )}

        {/* Time */}
        <span
          style={{
            fontSize: 11,
            color: colors.textTertiary,
            flexShrink: 0,
            minWidth: 60,
            textAlign: "right",
          }}
        >
          {timeDisplay}
        </span>
      </button>

      {/* Right-click context menu */}
      {contextMenu && (
        <ContextMenu
          position={contextMenu}
          items={contextMenuItems}
          onClose={closeContextMenu}
        />
      )}
    </>
  );
}

export const AISessionListItem = React.memo(AISessionListItemComponent);
