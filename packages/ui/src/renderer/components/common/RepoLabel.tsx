import React from "react";
import { FolderGit2, GitBranch } from "lucide-react";
import { colors } from "../../utils/colors";
import { type LabelSize, type LabelVariant, sizeMap, boxedIconMap } from "./labelConstants";
import { ScrollableText } from "./ScrollableText";
import { Tag } from "./Tag";

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
    <ScrollableText
      style={{
        fontSize: s.font,
        fontWeight: 600,
        color: colors.text,
      }}
    >
      {name}
    </ScrollableText>
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

// Branch-tag colour is owned by the unified `Tag` primitive (tone="branch").
// Non-badge variant still needs a text/icon colour to match, so we read
// the same --branch-fg token (defined in colours.css) for the inline layout.
const BRANCH_INLINE_COLOR = colors.branchFg;

type BranchLabelProps = {
  name: string;
  size?: LabelSize;
  /** Preserved for back-compat; currently has no visual effect since
   *  the cyan palette works on both light and dark backgrounds. */
  variant?: LabelVariant;
  /** Show as an inline badge instead of plain text. Default: true */
  badge?: boolean;
  /** Extra inline styles on the outer span */
  style?: React.CSSProperties;
};

function BranchLabelComponent({
  name,
  size = "sm",
  badge = true,
  style,
}: BranchLabelProps): React.ReactElement {
  const s = sizeMap[size];

  if (badge) {
    return (
      <Tag
        tone="branch"
        size={size === "xs" ? "xs" : "sm"}
        fontSize={s.font - 1}
        icon={<GitBranch size={s.icon - 2} strokeWidth={2} />}
        style={style}
      >
        {name}
      </Tag>
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
        color={BRANCH_INLINE_COLOR}
        strokeWidth={1.5}
        style={{ flexShrink: 0 }}
      />
      <ScrollableText
        style={{
          fontSize: s.font,
          color: BRANCH_INLINE_COLOR,
        }}
      >
        {name}
      </ScrollableText>
    </span>
  );
}

export const BranchLabel = React.memo(BranchLabelComponent);
