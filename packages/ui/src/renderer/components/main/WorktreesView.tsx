import React, { useState, useMemo, useCallback } from "react";
import { GitBranch, FolderOpen, Clock, ChevronRight, ChevronDown } from "lucide-react";

import { useWorktreeStore, type WorktreeInfo } from "../../store/worktreeStore";
import { useRepoStore } from "../../store/repoStore";
import { ScrollableText } from "../common/ScrollableText";
import { RepoLabel, BranchLabel } from "../common/RepoLabel";
import { WorktreeInlinePanel } from "../worktree/WorktreeInlinePanel";
import { colors } from "../../utils/colors";

type WorktreesViewProps = {
  repoName: string | null;
  /** Called when user clicks a file in a worktree — opens it in a new tab. */
  onOpenFile?: (filePath: string) => void;
};

/* ── Single worktree card (collapsible) ── */

const WorktreeCard = React.memo(function WorktreeCard({
  wt,
  isExpanded,
  onToggle,
  onOpenFile,
  onDeleted,
}: {
  wt: WorktreeInfo;
  isExpanded: boolean;
  onToggle: (worktreePath: string) => void;
  onOpenFile?: (filePath: string) => void;
  onDeleted?: (worktreePath: string) => void;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  const createdDate = new Date(wt.createdAt);
  const dateStr = createdDate.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const handleToggle = useCallback(() => onToggle(wt.worktreePath), [onToggle, wt.worktreePath]);
  const handleDeleted = useCallback(() => onDeleted?.(wt.worktreePath), [onDeleted, wt.worktreePath]);

  return (
    <div>
      {/* Card header (click to expand/collapse) */}
      <div
        onClick={handleToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          background: isExpanded ? colors.bgPanelSoft : hovered ? colors.bgSurface : colors.bgWhite,
          border: "1px solid",
          borderColor: isExpanded ? colors.errorSoftBorder : colors.border,
          borderRadius: isExpanded ? "8px 8px 0 0" : 8,
          transition: "background 0.12s, border-color 0.12s",
          cursor: "pointer",
        }}
      >
        {/* Icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 6,
            background: isExpanded ? colors.errorSoft : colors.bgHover,
            flexShrink: 0,
          }}
        >
          <GitBranch size={16} color={colors.primary} strokeWidth={1.8} />
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <ScrollableText
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: colors.textStrong,
            }}
          >
            {wt.name}
          </ScrollableText>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 3,
              fontSize: 11,
              color: colors.textTertiary,
            }}
          >
            <BranchLabel name={wt.branch} size="xs" style={{ color: colors.textTertiary }} />
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <Clock size={10} strokeWidth={1.5} />
              {dateStr}
            </span>
          </div>
        </div>

        {/* Path (truncated) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10,
            color: colors.textTertiary,
            fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
            maxWidth: 200,
            flexShrink: 0,
            minWidth: 0,
          }}
        >
          <FolderOpen size={10} strokeWidth={1.5} style={{ flexShrink: 0 }} />
          <ScrollableText title={wt.worktreePath}>
            {wt.worktreePath.split("/").slice(-2).join("/")}
          </ScrollableText>
        </div>

        {/* Expand/collapse indicator */}
        {isExpanded ? (
          <ChevronDown
            size={14}
            strokeWidth={1.5}
            color={colors.primary}
            style={{ flexShrink: 0 }}
          />
        ) : (
          <ChevronRight
            size={14}
            strokeWidth={1.5}
            color={hovered ? colors.primary : colors.borderMuted}
            style={{ flexShrink: 0, transition: "color 0.12s" }}
          />
        )}
      </div>

      {/* Expanded: inline panel with file list, merge, delete/keep */}
      {isExpanded && (
        <div
          style={{
            borderLeft: `1px solid ${colors.errorSoftBorder}`,
            borderRight: `1px solid ${colors.errorSoftBorder}`,
            borderBottom: `1px solid ${colors.errorSoftBorder}`,
            borderRadius: "0 0 8px 8px",
            overflow: "hidden",
          }}
        >
          <WorktreeInlinePanel
            worktree={wt}
            onOpenFile={onOpenFile}
            onDeleted={handleDeleted}
          />
        </div>
      )}
    </div>
  );
});

/* ── Repo group section ── */

const RepoGroup = React.memo(function RepoGroup({
  repoPath,
  repoName,
  worktrees,
  isActive,
  isExpanded,
  onToggleRepo,
  expandedWorktree,
  onToggleWorktree,
  onOpenFile,
  onWorktreeDeleted,
}: {
  repoPath: string;
  repoName: string;
  worktrees: WorktreeInfo[];
  isActive: boolean;
  isExpanded: boolean;
  onToggleRepo: (repoPath: string) => void;
  expandedWorktree: string | null;
  onToggleWorktree: (worktreePath: string) => void;
  onOpenFile?: (filePath: string) => void;
  onWorktreeDeleted: (worktreePath: string) => void;
}): React.ReactElement {
  return (
    <div style={{ marginBottom: 16 }}>
      {/* Repo header */}
      <button
        type="button"
        onClick={() => onToggleRepo(repoPath)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "6px 0",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <ChevronRight
          size={12}
          strokeWidth={2}
          color={colors.textTertiary}
          style={{
            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}
        />
        <RepoLabel
          name={repoName}
          size="sm"
          style={{ color: isActive ? colors.primary : colors.textMuted }}
        />
        {isActive && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: colors.primary,
              background: colors.bgPanelSoft,
              padding: "2px 6px",
              borderRadius: 4,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Active
          </span>
        )}
        <span
          style={{
            fontSize: 11,
            color: colors.textTertiary,
            marginLeft: "auto",
          }}
        >
          {worktrees.length} worktree{worktrees.length !== 1 ? "s" : ""}
        </span>
      </button>

      {/* Worktree cards */}
      {isExpanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
          {worktrees.map((wt) => (
            <WorktreeCard
              key={wt.worktreePath}
              wt={wt}
              isExpanded={expandedWorktree === wt.worktreePath}
              onToggle={onToggleWorktree}
              onOpenFile={onOpenFile}
              onDeleted={onWorktreeDeleted}
            />
          ))}
        </div>
      )}
    </div>
  );
});

/* ── Main view ── */

export function WorktreesView({ repoName, onOpenFile }: WorktreesViewProps): React.ReactElement {
  const activeRepoPath = useRepoStore((state) => state.activeRepoPath);
  const allWorktrees = useWorktreeStore((state) => state.worktrees);
  const repos = useRepoStore((state) => state.repos);

  // Persisted UI state from worktreeStore (survives tab switches)
  const expandedRepos = useWorktreeStore((state) => state.expandedRepos);
  const expandedWorktreePath = useWorktreeStore((state) => state.expandedWorktreePath);
  const toggleRepoExpanded = useWorktreeStore((state) => state.toggleRepoExpanded);
  const setExpandedWorktreePath = useWorktreeStore((state) => state.setExpandedWorktreePath);

  // Stable callbacks — read expandedWorktreePath from store at call time
  // to avoid closing over a reactive value that changes identity.
  const handleToggleWorktree = useCallback((worktreePath: string) => {
    const current = useWorktreeStore.getState().expandedWorktreePath;
    setExpandedWorktreePath(current === worktreePath ? null : worktreePath);
  }, [setExpandedWorktreePath]);

  const handleWorktreeDeleted = useCallback((worktreePath: string) => {
    if (useWorktreeStore.getState().expandedWorktreePath === worktreePath) {
      setExpandedWorktreePath(null);
    }
  }, [setExpandedWorktreePath]);

  // O(1) repo-name lookup map — replaces repeated .find() calls
  const repoNameByPath = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of repos) {
      map.set(r.path, r.name);
    }
    return map;
  }, [repos]);

  // Group ALL worktrees by repo path (memoized)
  const byRepo = useMemo(() => {
    const map = new Map<string, WorktreeInfo[]>();
    for (const wt of allWorktrees) {
      const list = map.get(wt.repoPath) ?? [];
      list.push(wt);
      map.set(wt.repoPath, list);
    }
    return map;
  }, [allWorktrees]);

  // Sort: active repo first, then alphabetical by name (memoized)
  const sortedEntries = useMemo(() => {
    return Array.from(byRepo.entries()).sort(([pathA], [pathB]) => {
      if (pathA === activeRepoPath) return -1;
      if (pathB === activeRepoPath) return 1;
      const nameA = repoNameByPath.get(pathA) ?? pathA;
      const nameB = repoNameByPath.get(pathB) ?? pathB;
      return nameA.localeCompare(nameB);
    });
  }, [byRepo, activeRepoPath, repoNameByPath]);

  if (!repoName) {
    return (
      <div style={{ padding: 20, color: colors.textTertiary, fontSize: 13 }}>
        Select a repository to view worktrees.
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      {/* Section header */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: colors.textTertiary,
          marginBottom: 16,
        }}
      >
        Worktrees by repository
      </div>

      {allWorktrees.length === 0 ? (
        <div
          style={{
            color: colors.textTertiary,
            fontSize: 13,
            padding: "16px 0",
          }}
        >
          No worktrees yet. Approve a file from a remote branch to create one.
        </div>
      ) : (
        sortedEntries.map(([repoPath, wts]) => {
          const name = repoNameByPath.get(repoPath) ?? repoPath.split("/").pop() ?? repoPath;
          const isActive = repoPath === activeRepoPath;

          return (
            <RepoGroup
              key={repoPath}
              repoPath={repoPath}
              repoName={name}
              worktrees={wts}
              isActive={isActive}
              isExpanded={!!expandedRepos[repoPath]}
              onToggleRepo={toggleRepoExpanded}
              expandedWorktree={expandedWorktreePath}
              onToggleWorktree={handleToggleWorktree}
              onOpenFile={onOpenFile}
              onWorktreeDeleted={handleWorktreeDeleted}
            />
          );
        })
      )}

      {/* Summary */}
      {allWorktrees.length > 0 && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 12,
            borderTop: `1px solid ${colors.bgHover}`,
            fontSize: 11,
            color: colors.textTertiary,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <GitBranch size={11} strokeWidth={1.5} />
          {allWorktrees.length} worktree{allWorktrees.length !== 1 ? "s" : ""} across{" "}
          {byRepo.size} repo{byRepo.size !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
