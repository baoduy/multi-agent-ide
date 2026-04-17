import React, { useMemo } from "react";
import { Play, Trash2, Pin, PinOff } from "lucide-react";
import type { AISessionRecord } from "@magenta/shared/aiTerminal";
import { ContextMenu, useContextMenu, type ContextMenuAction } from "../common/ContextMenu";
import { ProviderBadge } from "../common/ProviderBadge";
import { ClickableRow } from "../common/ClickableRow";
import { StatusBadge } from "../common/StatusBadge";
import { BranchLabel } from "../common/RepoLabel";
import { colors } from "../../utils/colors";
import { formatRelativeTime } from "../../utils/formatters";
import { getStatusColor, isActiveStatus } from "../../utils/sessionStatus";
import { ScrollableText } from "../common/ScrollableText";
import { usePinnedSessionsStore } from "../../store/pinnedSessionsStore";
import { livePinKey } from "../../utils/sessionPinKey";

type AISessionListItemProps = {
  session: AISessionRecord;
  onSelect: (sessionId: string) => void;
  onResume: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  /** Render a branch/worktree label next to the title. Used for rows rendered
   *  outside a BranchGroup (Active + Pinned sections), where the branch is
   *  otherwise not visible on the row. */
  showBranch?: boolean;
};


/**
 * Formats the status for display.
 */
function formatStatus(status: AISessionRecord["status"]): string {
  switch (status) {
    case "active":
      return "Processing";
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
  showBranch = false,
}: AISessionListItemProps): React.ReactElement {
  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();
  const pinKey = livePinKey(session);
  const isPinned = usePinnedSessionsStore((s) => s.pinnedKeys.has(pinKey));
  const togglePin = usePinnedSessionsStore((s) => s.togglePin);

  const contextMenuItems: ContextMenuAction[] = useMemo(
    () => [
      {
        label: isPinned ? "Unpin" : "Pin",
        Icon: isPinned ? PinOff : Pin,
        action: () => togglePin(pinKey),
      },
      {
        label: "Resume",
        Icon: Play,
        separator: true,
        action: () => onResume(session.id),
      },
      {
        label: "Delete",
        Icon: Trash2,
        action: () => onDelete(session.id),
      },
    ],
    [isPinned, pinKey, togglePin, onResume, onDelete, session.id],
  );

  const showStatus = isActiveStatus(session.status);
  const statusColor = showStatus ? getStatusColor(session.status) : "";
  const timeDisplay = formatRelativeTime(session.lastActiveAt);
  const statusText = showStatus ? formatStatus(session.status) : "";
  const sessionTitle = session.title || `Session ${session.id.slice(0, 8)}`;
  const branchName = session.worktreeName || session.branch || null;

  return (
    <>
      <ClickableRow
        onClick={() => onSelect(session.id)}
        onContextMenu={openContextMenu}
        padding="10px 16px"
        gap={12}
        borderBottom={`1px solid ${colors.border}`}
        defaultBackground={colors.bgSurface}
        hoverBackground={colors.bgHover}
      >
        <ProviderBadge provider={session.provider} iconSize={14} fontSize={12} color={colors.text} />
        {sessionTitle && (
          <>
            <span style={{ color: colors.textTertiary, fontSize: 11, flexShrink: 0 }}>·</span>
            <ScrollableText
              style={{
                fontSize: 12,
                color: colors.textSecondary,
                minWidth: 0,
                flex: 1,
              }}
            >
              {sessionTitle}
            </ScrollableText>
          </>
        )}

        {showBranch && branchName && (
          <BranchLabel name={branchName} size="xs" style={{ flexShrink: 0 }} />
        )}

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

        {showStatus && (
          <StatusBadge
            text={statusText}
            color={statusColor}
            background={`${statusColor}12`}
            borderColor={`${statusColor}40`}
            style={{ flexShrink: 0, minWidth: 80, textAlign: "center" }}
          />
        )}
      </ClickableRow>

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
