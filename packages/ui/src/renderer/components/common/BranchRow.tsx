import React, { useState } from "react";
import { Check, GitBranch, GitFork, type LucideIcon } from "lucide-react";

import { colors } from "../../utils/colors";
import { ScrollableText } from "./ScrollableText";

/* ══════════════════════════════════════════
 * BranchRow — standard selectable row for a branch or worktree.
 *
 * Single source of truth for rendering a clickable branch/worktree row
 * across dialogs, pickers, and lists. Keeps icon, spacing, hover,
 * selected, and current-branch styling consistent everywhere.
 *
 * Variants:
 *   - kind="branch" (default)  → GitBranch icon
 *   - kind="worktree"          → GitFork  icon
 *   - icon={Custom}            → override with any lucide icon
 *
 * States:
 *   - isCurrent:  shows a checkmark + primary color (for "active" branch)
 *   - isSelected: highlighted background (for picker selection)
 *   - isBusy:     dims the row and disables interaction
 *   - disabled:   dims + non-interactive (e.g. same branch already checked out)
 * ══════════════════════════════════════════ */

export type BranchRowKind = "branch" | "worktree";

type BranchRowProps = {
  name: string;
  onSelect: (name: string) => void;
  kind?: BranchRowKind;
  /** Override the icon — takes precedence over `kind` */
  icon?: LucideIcon;
  /** The row represents the currently-checked-out branch — shows checkmark */
  isCurrent?: boolean;
  /** The row is highlighted as selected in a picker */
  isSelected?: boolean;
  /** Operation in progress — dim and disable */
  isBusy?: boolean;
  /** Fully disabled (non-interactive, e.g. same branch) */
  disabled?: boolean;
  /** Optional trailing element (subtitle, badges, right-side meta) */
  trailing?: React.ReactNode;
};

const iconForKind: Record<BranchRowKind, LucideIcon> = {
  branch: GitBranch,
  worktree: GitFork,
};

function BranchRowComponent({
  name,
  onSelect,
  kind = "branch",
  icon,
  isCurrent = false,
  isSelected = false,
  isBusy = false,
  disabled = false,
  trailing,
}: BranchRowProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const Icon = icon ?? iconForKind[kind];

  // Non-interactive when busy or explicitly disabled.
  // `isCurrent` alone is visual — callers decide whether to also disable
  // (e.g. BranchSwitcher disables the row; a picker may still allow selection).
  const nonInteractive = disabled || isBusy;

  // Background priority: selected > hovered > transparent
  const background = isSelected
    ? colors.bgPanelSoft
    : hovered && !nonInteractive
      ? colors.bgHover
      : "transparent";

  // Text color priority: current > selected > default
  const textColor = isCurrent ? colors.primary : isSelected ? colors.primary : colors.text;
  const fontWeight = isCurrent || isSelected ? 600 : 400;

  return (
    <button
      type="button"
      disabled={nonInteractive}
      onClick={() => onSelect(name)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "8px 10px",
        border: "none",
        borderRadius: 6,
        background,
        cursor: nonInteractive ? "default" : "pointer",
        fontSize: 11,
        fontFamily: "var(--font-mono)",
        color: textColor,
        fontWeight,
        textAlign: "left",
        opacity: isBusy ? 0.5 : 1,
        transition: "background 0.08s",
      }}
    >
      {/* Leading icon — branch/worktree/custom */}
      <Icon
        size={13}
        color={isCurrent || isSelected ? colors.primary : colors.textMuted}
        strokeWidth={1.8}
        style={{ flexShrink: 0 }}
      />

      {/* Name takes remaining space */}
      <ScrollableText style={{ flex: 1, minWidth: 0 }}>
        {name}
      </ScrollableText>

      {/* Trailing: caller-supplied meta OR a checkmark for current */}
      {trailing ?? (isCurrent && (
        <Check size={14} color={colors.primary} strokeWidth={2.5} style={{ flexShrink: 0 }} />
      ))}
    </button>
  );
}

export const BranchRow = React.memo(BranchRowComponent);
