import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, GitBranch } from "lucide-react";
import type { Repository } from "@magenta/shared/models";

import { RepoLabel } from "./RepoLabel";
import { Tag } from "./Tag";
import { colors } from "../../utils/colors";
import { getRepoBadge } from "../../utils/repoBadge";
import { useDensityTokens } from "../../hooks/useComponentSize";

/* ══════════════════════════════════════════
 * TreeRepoHeader — shared level-1 row for repo-grouped tree views.
 *
 * Used by:
 *   - AI Sessions view  (Repo → Branch/Worktree → Session)
 *   - Worktrees view    (Repo → Worktree → changed file list)
 *
 * Both views render the same repo group header: a chevron, RepoLabel with
 * status + branch chips, optional "N active" tag, trailing count chip, and
 * hover styling identical to the sidebar RepoItem.
 * ══════════════════════════════════════════ */

export type TreeRepoHeaderProps = {
  /** The repo record. Pass `null` when the repo is no longer in the store. */
  repo: Repository | null;
  /** Fallback name when `repo` is null (e.g. derived from path tail). */
  fallbackName?: string;
  /** Absolute repo path (used for RepoLabel title + context menu targets). */
  repoPath: string;
  expanded: boolean;
  onToggle: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  /** Count chip rendered at the far right. Omit to hide. */
  count?: number;
  /** When > 0, shows "{n} active" chip before the count. */
  activeCount?: number;
  /** Extra chips rendered between the "active" tag and the count chip. */
  badgeSlot?: React.ReactNode;
  /** Extra slot after the count chip (rarely needed). */
  rightSlot?: React.ReactNode;
};

export const TreeRepoHeader = React.memo(function TreeRepoHeader({
  repo,
  fallbackName,
  repoPath,
  expanded,
  onToggle,
  onContextMenu,
  count,
  activeCount = 0,
  badgeSlot,
  rightSlot,
}: TreeRepoHeaderProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const d = useDensityTokens();
  const badge = useMemo(() => (repo ? getRepoBadge(repo) : null), [repo]);
  const name = repo?.name ?? fallbackName ?? repoPath;

  return (
    <button
      type="button"
      onClick={onToggle}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: d.rowGap,
        padding: `${d.rowPadY}px ${d.rowPadX}px`,
        borderBottom: `1px solid ${colors.border}`,
        background: hovered ? colors.bgHover : "transparent",
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

      <RepoLabel
        name={name}
        repoPath={repoPath}
        size="md"
        boxed
        uppercase
        style={{ flex: 1, minWidth: 0 }}
      >
        {badge && (
          <Tag
            size="chip"
            tone={badge.tone}
            icon={badge.Icon ? <badge.Icon size={9} strokeWidth={2} /> : undefined}
          >
            {badge.label}
          </Tag>
        )}
        {repo?.branch && (
          <Tag size="chip" tone="branch" icon={<GitBranch size={9} strokeWidth={2} />}>
            {repo.branch}
          </Tag>
        )}
      </RepoLabel>

      {activeCount > 0 && (
        <Tag size="chip" tone="active">{activeCount} active</Tag>
      )}

      {badgeSlot}

      {typeof count === "number" && (
        <Tag size="chip" tone="neutral">{count}</Tag>
      )}

      {rightSlot}
    </button>
  );
});
