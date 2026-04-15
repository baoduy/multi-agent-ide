import React, { useMemo } from "react";
import { Play, Trash2 } from "lucide-react";
import type { AISessionRecord } from "@magenta/shared/aiTerminal";
import { ContextMenu, useContextMenu, type ContextMenuAction } from "../common/ContextMenu";
import { BranchLabel } from "../common/RepoLabel";
import { ProviderBadge } from "../common/ProviderBadge";
import { ClickableRow } from "../common/ClickableRow";
import { StatusBadge } from "../common/StatusBadge";
import { colors } from "../../utils/colors";
import { formatRelativeTime } from "../../utils/formatters";
import { getStatusColor, isActiveStatus } from "../../utils/sessionStatus";
import { ScrollableText } from "../common/ScrollableText";

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
  const branchDisplayName = session.worktreeName || session.branch || null;
  const timeDisplay = formatRelativeTime(session.lastActiveAt);
  const statusText = showStatus ? formatStatus(session.status) : "";
  const sessionTitle = session.title || `Session ${session.id.slice(0, 8)}`;

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
        {branchDisplayName && <BranchLabel name={branchDisplayName} size="xs" />}
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

        {showStatus && (
          <StatusBadge
            text={statusText}
            color={statusColor}
            background={`${statusColor}12`}
            borderColor={`${statusColor}40`}
            style={{ flexShrink: 0 }}
          />
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
