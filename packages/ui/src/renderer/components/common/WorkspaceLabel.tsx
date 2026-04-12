import React from "react";
import { Folder } from "lucide-react";

/* ── Size presets (matches RepoLabel / BranchLabel) ── */

type LabelSize = "xs" | "sm" | "md";

const sizeMap: Record<LabelSize, { icon: number; font: number; gap: number }> = {
  xs: { icon: 10, font: 10, gap: 3 },
  sm: { icon: 12, font: 11, gap: 4 },
  md: { icon: 13, font: 12, gap: 5 },
};

/* ── Theme presets ── */

type LabelVariant = "light" | "dark";

const variantColors: Record<LabelVariant, { icon: string; text: string }> = {
  light: { icon: "#9a958c", text: "#9a958c" },
  dark: { icon: "#a0a0a0", text: "#d4d4d4" },
};

/* ══════════════════════════════════════════
 * WorkspaceLabel — folder icon + "Workspace" text
 * Use wherever a session has no repo context.
 * ══════════════════════════════════════════ */

type WorkspaceLabelProps = {
  size?: LabelSize;
  variant?: LabelVariant;
  /** Extra inline styles on the outer span */
  style?: React.CSSProperties;
};

function WorkspaceLabelComponent({
  size = "sm",
  variant = "light",
  style,
}: WorkspaceLabelProps): React.ReactElement {
  const s = sizeMap[size];
  const c = variantColors[variant];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: s.gap,
        minWidth: 0,
        ...style,
      }}
    >
      <Folder
        size={s.icon}
        color={c.icon}
        strokeWidth={1.8}
        style={{ flexShrink: 0 }}
      />
      <span
        style={{
          fontSize: s.font,
          color: c.text,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        Workspace
      </span>
    </span>
  );
}

export const WorkspaceLabel = React.memo(WorkspaceLabelComponent);
