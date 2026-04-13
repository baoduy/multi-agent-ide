import React from "react";
import { Folder } from "lucide-react";
import { colors } from "../../utils/colors";
import { type LabelSize, type LabelVariant, sizeMap } from "./labelConstants";

const variantColors: Record<LabelVariant, { icon: string; text: string }> = {
  light: { icon: colors.textTertiary, text: colors.textTertiary },
  dark: { icon: colors.textTertiary, text: colors.textTertiary },
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
