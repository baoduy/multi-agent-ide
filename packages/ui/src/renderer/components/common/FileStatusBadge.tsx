import React from "react";
import { FilePlus, FileEdit, FileX, FileQuestion, ArrowRight } from "lucide-react";

import type { WorktreeFileStatus } from "../../store/worktreeStore";
import { colors } from "../../utils/colors";
import { StatusBadge } from "./StatusBadge";

const STATUS_CONFIG: Record<
  WorktreeFileStatus["status"],
  { label: string; color: string; bg: string; Icon: React.ElementType }
> = {
  added: { label: "Added", color: colors.textTertiary, bg: colors.bgMuted, Icon: FilePlus },
  modified: { label: "Modified", color: colors.textTertiary, bg: colors.bgMuted, Icon: FileEdit },
  deleted: { label: "Deleted", color: colors.error, bg: colors.errorSoft, Icon: FileX },
  renamed: { label: "Renamed", color: colors.textTertiary, bg: colors.bgMuted, Icon: ArrowRight },
  copied: { label: "Copied", color: colors.textTertiary, bg: colors.bgMuted, Icon: FilePlus },
  untracked: { label: "Untracked", color: colors.textTertiary, bg: colors.bgMuted, Icon: FileQuestion },
};

export function FileStatusBadge({ status }: { status: WorktreeFileStatus["status"] }): React.ReactElement {
  const cfg = STATUS_CONFIG[status];
  return (
    <StatusBadge
      text={cfg.label}
      color={cfg.color}
      background={cfg.bg}
      icon={<cfg.Icon size={10} strokeWidth={2} />}
      uppercase
      letterSpacing="0.04em"
    />
  );
}
