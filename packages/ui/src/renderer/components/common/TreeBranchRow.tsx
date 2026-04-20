import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { BranchLabel } from "./RepoLabel";
import { ScrollableText } from "./ScrollableText";
import { colors } from "../../utils/colors";
import { useDensityTokens } from "../../hooks/useComponentSize";

/* ══════════════════════════════════════════
 * TreeBranchRow — shared level-2 row for repo-grouped tree views.
 *
 * Renders a chevron + BranchLabel + optional secondary name + right-hand slot.
 * When `expanded` is true and `children` is provided, children are rendered
 * inline below the row with a soft panel background and a left accent border
 * (matching the Worktrees view inline panel).
 * ══════════════════════════════════════════ */

export type TreeBranchRowProps = {
  /** Primary branch/worktree name. */
  name: string;
  /** Optional secondary label shown when it differs from the primary one. */
  secondaryName?: string;
  expanded: boolean;
  onToggle: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  /** Right-aligned content (tags, timestamp, count chip). */
  rightSlot?: React.ReactNode;
  /** Content rendered inline under the row when expanded. */
  children?: React.ReactNode;
  /** Tooltip (e.g. full worktree path). */
  title?: string;
  /**
   * When true, the row itself gets the soft panel background while expanded
   * (used by WorktreesView to make the expanded worktree visually distinct).
   * The inline `children` wrapper always gets that background if children are
   * provided — this flag only controls the row itself.
   */
  highlightWhenExpanded?: boolean;
};

export const TreeBranchRow = React.memo(function TreeBranchRow({
  name,
  secondaryName,
  expanded,
  onToggle,
  onContextMenu,
  rightSlot,
  children,
  title,
  highlightWhenExpanded = false,
}: TreeBranchRowProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const d = useDensityTokens();

  const showSecondary = !!secondaryName && secondaryName !== name;
  const rowBg = expanded && highlightWhenExpanded
    ? colors.bgPanelSoft
    : hovered
      ? colors.bgHover
      : "transparent";

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        onContextMenu={onContextMenu}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={title}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: d.rowGap,
          padding: `${d.rowPadY}px ${d.rowPadX}px ${d.rowPadY}px ${d.indentStep}px`,
          borderBottom: `1px solid ${colors.borderLight}`,
          background: rowBg,
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          transition: "background 0.12s",
        }}
      >
        {expanded ? (
          <ChevronDown size={d.iconMd} color={colors.textTertiary} style={{ flexShrink: 0 }} />
        ) : (
          <ChevronRight size={d.iconMd} color={colors.textTertiary} style={{ flexShrink: 0 }} />
        )}

        <BranchLabel
          name={name}
          size="md"
          badge={false}
          style={{ flexShrink: 0, minWidth: 0, maxWidth: showSecondary ? "50%" : undefined }}
        />

        {showSecondary ? (
          <ScrollableText
            style={{
              fontSize: d.smallFont,
              fontWeight: 400,
              color: colors.textTertiary,
              minWidth: 0,
              flex: 1,
            }}
          >
            {secondaryName}
          </ScrollableText>
        ) : (
          <span style={{ flex: 1, minWidth: 0 }} />
        )}

        {rightSlot}
      </button>

      {expanded && children && (
        <div
          style={{
            marginLeft: d.indentStep,
            borderLeft: `2px solid ${colors.primary}`,
            background: colors.bgPanelSoft,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
});
