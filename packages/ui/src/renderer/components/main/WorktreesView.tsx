import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { GitBranch, FolderOpen, Clock, ChevronRight, ChevronDown } from "lucide-react";

import { useWorktreeStore, type WorktreeInfo } from "../../store/worktreeStore";
import { useRepoStore } from "../../store/repoStore";
import { ScrollableText } from "../common/ScrollableText";
import { RepoLabel, BranchLabel } from "../common/RepoLabel";
import { WorktreeInlinePanel } from "../worktree/WorktreeInlinePanel";
import { SessionCoordinator } from "../../services/SessionCoordinator";
import { colors } from "../../utils/colors";
import { Tag } from "../common/Tag";

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

        {/* Info — single-line: name + date. The branch is intentionally
            omitted here because in the common case the worktree is named
            after its branch, which produced a visible duplicate row. If the
            branch differs from the worktree name we surface it inline after
            the name. */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <ScrollableText
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: colors.textStrong,
              minWidth: 0,
            }}
          >
            {wt.name}
          </ScrollableText>
          {wt.branch && wt.branch !== wt.name && (
            <BranchLabel
              name={wt.branch}
              size="xs"
              badge={false}
              style={{ color: colors.textTertiary, flexShrink: 0 }}
            />
          )}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              fontSize: 11,
              color: colors.textTertiary,
              flexShrink: 0,
            }}
          >
            <Clock size={10} strokeWidth={1.5} />
            {dateStr}
          </span>
        </div>

        {/* Path (truncated) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10,
            color: colors.textTertiary,
            fontFamily: "var(--font-mono)",
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
          repoPath={repoPath}
          size="sm"
          style={{ color: isActive ? colors.primary : colors.textMuted }}
        />
        {isActive && (
          <Tag tone="primary" size="xs" uppercase padding="2px 6px" borderRadius={4}>
            Active
          </Tag>
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
  const setRepoExpanded = useWorktreeStore((state) => state.setRepoExpanded);
  const setExpandedWorktreePath = useWorktreeStore((state) => state.setExpandedWorktreePath);

  // Ref to the active repo group so we can scroll it into view when selection changes.
  const activeGroupRef = useRef<HTMLDivElement | null>(null);

  // When the selected repo changes (or worktrees first load for the active repo),
  // collapse all non-active repos, expand the active one, and scroll it into view.
  useEffect(() => {
    if (!activeRepoPath) return;
    const hasAny = allWorktrees.some((w) => w.repoPath === activeRepoPath);
    if (!hasAny) return;

    // Collapse every repo except the active one
    const repoPathsWithWorktrees = new Set(allWorktrees.map((w) => w.repoPath));
    for (const rp of repoPathsWithWorktrees) {
      setRepoExpanded(rp, rp === activeRepoPath);
    }

    // Defer scroll until after the expand re-render has committed.
    const id = requestAnimationFrame(() => {
      activeGroupRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [activeRepoPath, allWorktrees, setRepoExpanded]);

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

  // Sort repos for the fallback list: active first, then alphabetical by name.
  const sortedRepos = useMemo(() => {
    return [...repos].sort((a, b) => {
      if (a.path === activeRepoPath) return -1;
      if (b.path === activeRepoPath) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [repos, activeRepoPath]);

  const handleSelectRepo = useCallback((path: string) => {
    SessionCoordinator.selectRepo(path);
  }, []);

  return (
    <div style={{ padding: 10 }}>
      {/* Section header */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: colors.textTertiary,
          marginBottom: 8,
        }}
      >
        {allWorktrees.length === 0 ? "Repositories" : "Worktrees by repository"}
      </div>

      {allWorktrees.length === 0 ? (
        repos.length === 0 ? (
          <div
            style={{
              color: colors.textTertiary,
              fontSize: 13,
              padding: "16px 0",
            }}
          >
            No repositories added yet. Add a repository to get started.
          </div>
        ) : (
          <>
            <div
              style={{
                color: colors.textTertiary,
                fontSize: 13,
                marginBottom: 12,
              }}
            >
              No worktrees yet. Approve a file from a remote branch to create one.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sortedRepos.map((r) => {
                const isActive = r.path === activeRepoPath;
                return (
                  <button
                    key={r.path}
                    type="button"
                    onClick={() => handleSelectRepo(r.path)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "10px 12px",
                      border: "1px solid",
                      borderColor: isActive ? colors.errorSoftBorder : colors.border,
                      borderRadius: 8,
                      background: isActive ? colors.bgPanelSoft : colors.bgWhite,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "left",
                      transition: "background 0.12s, border-color 0.12s",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        background: isActive ? colors.errorSoft : colors.bgHover,
                        flexShrink: 0,
                      }}
                    >
                      <FolderOpen size={14} color={colors.primary} strokeWidth={1.8} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <RepoLabel
                        name={r.name}
                        repoPath={r.path}
                        size="sm"
                        style={{
                          color: isActive ? colors.primary : colors.textStrong,
                          fontWeight: 600,
                        }}
                      />
                      <ScrollableText
                        title={r.path}
                        style={{
                          fontSize: 10,
                          color: colors.textTertiary,
                          fontFamily: "var(--font-mono)",
                          marginTop: 2,
                        }}
                      >
                        {r.path}
                      </ScrollableText>
                    </div>
                    {isActive && (
                      <Tag
                        tone="primary"
                        size="xs"
                        uppercase
                        padding="2px 6px"
                        borderRadius={4}
                      >
                        Active
                      </Tag>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )
      ) : (
        sortedEntries.map(([repoPath, wts]) => {
          const name = repoNameByPath.get(repoPath) ?? repoPath.split("/").pop() ?? repoPath;
          const isActive = repoPath === activeRepoPath;

          return (
            <div key={repoPath} ref={isActive ? activeGroupRef : undefined}>
              <RepoGroup
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
            </div>
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
