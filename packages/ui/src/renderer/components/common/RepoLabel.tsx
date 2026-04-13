import React from "react";
import { FolderGit2, GitBranch } from "lucide-react";
import { colors } from "../../utils/colors";
import { type LabelSize, type LabelVariant, sizeMap } from "./labelConstants";

const repoColors: Record<LabelVariant, { icon: string; text: string }> = {
  light: { icon: colors.primary, text: colors.text },
  dark: { icon: colors.primary, text: colors.text },
};

const branchColors: Record<LabelVariant, { icon: string; text: string; bg: string; border: string }> = {
  light: { icon: colors.success, text: colors.success, bg: "#dcfce7", border: "#bbf7d0" },
  dark: { icon: colors.success, text: colors.success, bg: "#dcfce7", border: "#bbf7d0" },
};

/* ══════════════════════════════════════════
 * RepoLabel — icon + repository name
 * ══════════════════════════════════════════ */

type RepoLabelProps = {
  name: string;
  size?: LabelSize;
  variant?: LabelVariant;
  /** Extra inline styles on the outer span */
  style?: React.CSSProperties;
};

function RepoLabelComponent({
  name,
  size = "sm",
  variant = "light",
  style,
}: RepoLabelProps): React.ReactElement {
  const s = sizeMap[size];
  const c = repoColors[variant];

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
      <FolderGit2
        size={s.icon}
        color={c.icon}
        strokeWidth={1.8}
        style={{ flexShrink: 0 }}
      />
      <span
        style={{
          fontSize: s.font,
          fontWeight: 600,
          color: c.text,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
    </span>
  );
}

export const RepoLabel = React.memo(RepoLabelComponent);

/* ══════════════════════════════════════════
 * BranchLabel — git-branch icon + branch/worktree name
 * ══════════════════════════════════════════ */

type BranchLabelProps = {
  name: string;
  size?: LabelSize;
  variant?: LabelVariant;
  /** Show as an inline badge (green bg) instead of plain text. Default: false */
  badge?: boolean;
  /** Extra inline styles on the outer span */
  style?: React.CSSProperties;
};

function BranchLabelComponent({
  name,
  size = "sm",
  variant = "light",
  badge = false,
  style,
}: BranchLabelProps): React.ReactElement {
  const s = sizeMap[size];
  const c = branchColors[variant];

  if (badge) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: s.gap,
          padding: "1px 6px",
          borderRadius: 8,
          fontSize: s.font - 1,
          fontWeight: 600,
          background: c.bg,
          color: c.text,
          border: `1px solid ${c.border}`,
          ...style,
        }}
      >
        <GitBranch size={s.icon - 2} strokeWidth={2} />
        {name}
      </span>
    );
  }

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
      <GitBranch
        size={s.icon}
        color={c.icon}
        strokeWidth={1.5}
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
        {name}
      </span>
    </span>
  );
}

export const BranchLabel = React.memo(BranchLabelComponent);
