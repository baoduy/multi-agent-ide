import React from "react";
import { FilePlus, FileEdit, FileX, FileQuestion, ArrowRight } from "lucide-react";

import type { WorktreeFileStatus } from "../../store/worktreeStore";

const STATUS_CONFIG: Record<
  WorktreeFileStatus["status"],
  { label: string; color: string; bg: string; Icon: React.ElementType }
> = {
  added: { label: "Added", color: "#16A34A", bg: "#f0fdf4", Icon: FilePlus },
  modified: { label: "Modified", color: "#ca8a04", bg: "#fefce8", Icon: FileEdit },
  deleted: { label: "Deleted", color: "#dc2626", bg: "#fef2f2", Icon: FileX },
  renamed: { label: "Renamed", color: "#7c3aed", bg: "#f5f3ff", Icon: ArrowRight },
  copied: { label: "Copied", color: "#0284c7", bg: "#f0f9ff", Icon: FilePlus },
  untracked: { label: "Untracked", color: "#6b7280", bg: "#f9fafb", Icon: FileQuestion },
};

export function FileStatusBadge({ status }: { status: WorktreeFileStatus["status"] }): React.ReactElement {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        fontWeight: 600,
        color: cfg.color,
        background: cfg.bg,
        padding: "2px 8px",
        borderRadius: 4,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      <cfg.Icon size={10} strokeWidth={2} />
      {cfg.label}
    </span>
  );
}
