import React from "react";
import { FolderGit2, GitBranch } from "lucide-react";
import { colors } from "../../utils/colors";
import { type LabelSize, type LabelVariant, sizeMap, boxedIconMap } from "./labelConstants";

/* ══════════════════════════════════════════
 * RepoLabel — folder-git icon + repository name
 *
 * Single source of truth for rendering a repository label across the app.
 * Icon always uses the neutral "default" color palette (muted gray box,
 * secondary-text icon) — no per-context color variants.
 *
 * Variants:
 *   - boxed: wraps the icon in a rounded muted-background square (sidebar style)
 *   - children: optional subtitle row rendered below the name (for badges)
 * ══════════════════════════════════════════ */

type RepoLabelProps = {
  name: string;
  size?: LabelSize;
  /** Render the icon inside a rounded muted-background box. Default: false */
  boxed?: boolean;
  /** Optional content rendered as a second line below the name (badges, branch). */
  children?: React.ReactNode;
  /** Extra inline styles on the outer element */
  style?: React.CSSProperties;
};

function RepoLabelComponent({
  name,
  size = "sm",
  boxed = false,
  children,
  style,
}: RepoLabelProps): React.ReactElement {
  const s = sizeMap[size];
  const b = boxedIconMap[size];

  const iconNode = boxed ? (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: b.box,
        height: b.box,
        borderRadius: b.radius,
        background: colors.bgMuted,
        flexShrink: 0,
      }}
    >
      <FolderGit2 size={b.icon} color={colors.textSecondary} strokeWidth={1.8} />
    </span>
  ) : (
    <FolderGit2
      size={s.icon}
      color={colors.textSecondary}
      strokeWidth={1.8}
      style={{ flexShrink: 0 }}
    />
  );

  const nameNode = (
    <span
      style={{
        fontSize: s.font,
        fontWeight: 600,
        color: colors.text,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        display: "block",
      }}
    >
      {name}
    </span>
  );

  // Two-line layout when children (subtitle row) provided
  if (children) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: boxed ? 10 : s.gap,
          minWidth: 0,
          ...style,
        }}
      >
        {iconNode}
        <span style={{ flex: 1, minWidth: 0 }}>
          {nameNode}
          <span
            style={{
              fontSize: 10,
              color: colors.textTertiary,
              marginTop: 2,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {children}
          </span>
        </span>
      </span>
    );
  }

  // Single-line layout
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: boxed ? 10 : s.gap,
        minWidth: 0,
        ...style,
      }}
    >
      {iconNode}
      {nameNode}
    </span>
  );
}

export const RepoLabel = React.memo(RepoLabelComponent);

/* ══════════════════════════════════════════
 * BranchLabel — git-branch icon + branch/worktree name
 * ══════════════════════════════════════════ */

const branchColors: Record<LabelVariant, { icon: string; text: string; bg: string; border: string }> = {
  light: { icon: colors.success, text: colors.success, bg: colors.successSoft, border: colors.successSoftBorder },
  dark: { icon: colors.success, text: colors.success, bg: colors.successSoft, border: colors.successSoftBorder },
};

type BranchLabelProps = {
  name: string;
  size?: LabelSize;
  variant?: LabelVariant;
  /** Show as an inline badge (green bg) instead of plain text. Default: true */
  badge?: boolean;
  /** Extra inline styles on the outer span */
  style?: React.CSSProperties;
};

function BranchLabelComponent({
  name,
  size = "sm",
  variant = "light",
  badge = true,
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
