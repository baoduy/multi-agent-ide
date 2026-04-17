import React from "react";
import { FilePlus, FileEdit, FileX, FileQuestion, ArrowRight } from "lucide-react";

import type { WorktreeFileStatus } from "../../store/worktreeStore";
import { colors } from "../../utils/colors";

const STATUS_CONFIG: Record<
  WorktreeFileStatus["status"],
  { label: string; color: string; Icon: React.ElementType }
> = {
  added:     { label: "Added",     color: colors.success,       Icon: FilePlus },
  modified:  { label: "Modified",  color: colors.warningText,   Icon: FileEdit },
  deleted:   { label: "Deleted",   color: colors.error,         Icon: FileX },
  renamed:   { label: "Renamed",   color: colors.textTertiary,  Icon: ArrowRight },
  copied:    { label: "Copied",    color: colors.textTertiary,  Icon: FilePlus },
  untracked: { label: "Untracked", color: colors.textTertiary,  Icon: FileQuestion },
};

export function FileStatusBadge({ status }: { status: WorktreeFileStatus["status"] }): React.ReactElement {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      title={cfg.label}
      aria-label={cfg.label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 16,
        height: 16,
        flexShrink: 0,
        color: cfg.color,
      }}
    >
      <cfg.Icon size={14} strokeWidth={2} />
    </span>
  );
}
