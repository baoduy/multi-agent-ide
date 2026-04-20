import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { GitBranch, Clock, ChevronRight, ChevronDown } from "lucide-react";
import type { Repository } from "@magenta/shared/models";

import { useWorktreeStore, type WorktreeInfo } from "../../store/worktreeStore";
import { useRepoStore } from "../../store/repoStore";
import { onEvent } from "../../services/ipcClient";
import { ScrollableText } from "../common/ScrollableText";
import { RepoLabel, BranchLabel } from "../common/RepoLabel";
import { SearchSyncToolbar } from "../common/SearchSyncToolbar";
import { WorktreeInlinePanel } from "../worktree/WorktreeInlinePanel";
import { colors } from "../../utils/colors";
import { Tag } from "../common/Tag";
import { useDensityTokens } from "../../hooks/useComponentSize";
import { formatRelativeTime } from "../../utils/formatters";
import { getRepoBadge } from "../../utils/repoBadge";

type WorktreesViewProps = {
  repoName: string | null;
  /** Called when user clicks a file in a worktree — opens it in a new tab. */
  onOpenFile?: (filePath: string) => void;
};

/* ══════════════════════════════════════════
 * Level-1 repo group header — matches UnifiedSessionTree.RepoGroupHeader
 * ══════════════════════════════════════════ */

type WorktreeRepoGroupHeaderProps = {
  repo: Repository | null;
  /** Fallback name when the repo is no longer in the repo store. */
  fallbackName: string;
  repoPath: string;
  worktreeCount: number;
  isActive: boolean;
  expanded: boolean;
  onToggle: () => void;
};

const WorktreeRepoGroupHeader = React.memo(function WorktreeRepoGroupHeader({
  repo,
  fallbackName,
  repoPath,
  worktreeCount,
  isActive,
  expanded,
  onToggle,
}: WorktreeRepoGroupHeaderProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const d = useDensityTokens();
  const badge = repo ? getRepoBadge(repo) : null;

  return (
    <button
      type="button"
      onClick={onToggle}
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
        name={repo?.name ?? fallbackName}
        repoPath={repoPath}
        size="md"
        boxed
        uppercase
        style={{ flex: 1, minWidth: 0 }}
      >
        {badge && (
          <Tag tone={badge.tone} fontWeight={500}>
            {badge.label}
          </Tag>
        )}
        {repo?.branch && <BranchLabel name={repo.branch} />}
      </RepoLabel>

      {isActive && (
        <Tag tone="primary" uppercase padding="2px 6px" borderRadius={4}>
          Active
        </Tag>
      )}

      <Tag tone="neutral" fontSize={d.smallFont} borderColor={null}>
        {worktreeCount}
      </Tag>
    </button>
  );
});

/* ══════════════════════════════════════════
 * Level-2 worktree row — compact clickable row (matches SyncedSessionRow)
 * ══════════════════════════════════════════ */

type WorktreeRowProps = {
  wt: WorktreeInfo;
  isExpanded: boolean;
  onToggle: (worktreePath: string) => void;
  onOpenFile?: (filePath: string) => void;
  onDeleted: (worktreePath: string) => void;
};

const WorktreeRow = React.memo(function WorktreeRow({
  wt,
  isExpanded,
  onToggle,
  onOpenFile,
  onDeleted,
}: WorktreeRowProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const d = useDensityTokens();

  const handleToggle = useCallback(() => onToggle(wt.worktreePath), [onToggle, wt.worktreePath]);
  const handleDeleted = useCallback(() => onDeleted(wt.worktreePath), [onDeleted, wt.worktreePath]);

  const rowPadLeft = d.indentStep;

  // A worktree's name, branch, and path-tail are often derived from the same
  // identifier (e.g. name "feature-x", branch "feature-x", path ".../feature-x").
  // Pick a single primary label (branch if available, else name) and only show
  // the secondary label when it adds new information.
  const primaryLabel = wt.branch || wt.name;
  const showSecondaryName = !!wt.name && wt.name !== primaryLabel;

  return (
    <div>
      <button
        type="button"
        onClick={handleToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={wt.worktreePath}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: d.rowGap,
          padding: `${d.rowPadY}px ${d.rowPadX}px ${d.rowPadY}px ${rowPadLeft}px`,
          borderBottom: `1px solid ${colors.borderLight}`,
          background: isExpanded
            ? colors.bgPanelSoft
            : hovered
              ? colors.bgHover
              : "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          transition: "background 0.12s",
        }}
      >
        {isExpanded ? (
          <ChevronDown size={d.iconMd} color={colors.textTertiary} style={{ flexShrink: 0 }} />
        ) : (
          <ChevronRight size={d.iconMd} color={colors.textTertiary} style={{ flexShrink: 0 }} />
        )}

        <BranchLabel
          name={primaryLabel}
          size="xs"
          style={{
            flexShrink: 0,
            opacity: isExpanded ? 1 : 0.95,
          }}
        />

        {showSecondaryName && (
          <ScrollableText
            style={{
              fontSize: d.smallFont,
              fontWeight: 400,
              color: colors.textTertiary,
              minWidth: 0,
              flex: 1,
            }}
          >
            {wt.name}
          </ScrollableText>
        )}

        {!showSecondaryName && <span style={{ flex: 1, minWidth: 0 }} />}

        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            fontSize: d.smallFont,
            color: colors.textTertiary,
            flexShrink: 0,
          }}
        >
          <Clock size={d.iconSm} strokeWidth={1.5} />
          {formatRelativeTime(wt.createdAt)}
        </span>
      </button>

      {isExpanded && (
        <div
          style={{
            marginLeft: rowPadLeft,
            borderLeft: `2px solid ${colors.primary}`,
            background: colors.bgPanelSoft,
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

/* ══════════════════════════════════════════
 * Main view
 * ══════════════════════════════════════════ */

export function WorktreesView({ onOpenFile }: WorktreesViewProps): React.ReactElement {
  const activeRepoPath = useRepoStore((state) => state.activeRepoPath);
  const allWorktrees = useWorktreeStore((state) => state.worktrees);
  const repos = useRepoStore((state) => state.repos);
  const pinnedPaths = useRepoStore((state) => state.pinnedPaths);
  const triggerSync = useWorktreeStore((state) => state.triggerSync);
  const d = useDensityTokens();

  const [searchQuery, setSearchQuery] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  // Persisted UI state from worktreeStore (survives tab switches)
  const expandedRepos = useWorktreeStore((state) => state.expandedRepos);
  const expandedWorktreePath = useWorktreeStore((state) => state.expandedWorktreePath);
  const toggleRepoExpanded = useWorktreeStore((state) => state.toggleRepoExpanded);
  const setRepoExpanded = useWorktreeStore((state) => state.setRepoExpanded);
  const setExpandedWorktreePath = useWorktreeStore((state) => state.setExpandedWorktreePath);

  const activeGroupRef = useRef<HTMLDivElement | null>(null);

  const handleRefresh = useCallback(() => {
    if (isSyncing) return;
    if (!activeRepoPath) return; // Button is disabled in this state.
    setIsSyncing(true);
    void triggerSync(activeRepoPath);
  }, [isSyncing, activeRepoPath, triggerSync]);

  // Clear the sync spinner once the daemon emits worktree:sync:complete.
  // Short minimum spin time so very fast syncs don't just flash.
  useEffect(() => {
    if (!isSyncing) return;
    const unsubscribe = onEvent("worktree:sync:complete", () => {
      setTimeout(() => setIsSyncing(false), 300);
    });
    return () => unsubscribe();
  }, [isSyncing]);

  // When the selected repo changes (or worktrees first load for the active repo),
  // collapse all non-active repos, expand the active one, and scroll it into view.
  useEffect(() => {
    if (!activeRepoPath) return;
    const hasAny = allWorktrees.some((w) => w.repoPath === activeRepoPath);
    if (!hasAny) return;

    const repoPathsWithWorktrees = new Set(allWorktrees.map((w) => w.repoPath));
    for (const rp of repoPathsWithWorktrees) {
      setRepoExpanded(rp, rp === activeRepoPath);
    }

    const id = requestAnimationFrame(() => {
      activeGroupRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [activeRepoPath, allWorktrees, setRepoExpanded]);

  const handleToggleWorktree = useCallback((worktreePath: string) => {
    const current = useWorktreeStore.getState().expandedWorktreePath;
    setExpandedWorktreePath(current === worktreePath ? null : worktreePath);
  }, [setExpandedWorktreePath]);

  const handleWorktreeDeleted = useCallback((worktreePath: string) => {
    if (useWorktreeStore.getState().expandedWorktreePath === worktreePath) {
      setExpandedWorktreePath(null);
    }
  }, [setExpandedWorktreePath]);

  // O(1) repo lookup by path — for header name/badge/branch enrichment
  const repoByPath = useMemo(() => {
    const map = new Map<string, Repository>();
    for (const r of repos) {
      map.set(r.path, r);
    }
    return map;
  }, [repos]);

  // Apply search filter across name / branch / path, keeping repos that match
  // either by their own name or by containing a matching worktree.
  const filteredWorktrees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allWorktrees;
    return allWorktrees.filter((wt) => {
      const repoName = repoByPath.get(wt.repoPath)?.name ?? "";
      return (
        wt.name.toLowerCase().includes(q) ||
        wt.branch.toLowerCase().includes(q) ||
        wt.worktreePath.toLowerCase().includes(q) ||
        repoName.toLowerCase().includes(q)
      );
    });
  }, [allWorktrees, searchQuery, repoByPath]);

  // Group filtered worktrees by repo path — only repos with ≥1 worktree end up here
  const byRepo = useMemo(() => {
    const map = new Map<string, WorktreeInfo[]>();
    for (const wt of filteredWorktrees) {
      const list = map.get(wt.repoPath) ?? [];
      list.push(wt);
      map.set(wt.repoPath, list);
    }
    return map;
  }, [filteredWorktrees]);

  // Sort: pinned → active → alphabetical by name.
  // Matches the Sessions tree order (sessionTreeBuilder.ts ~L427) so that
  // repository grouping behaves consistently across views.
  const sortedEntries = useMemo(() => {
    return Array.from(byRepo.entries()).sort(([pathA], [pathB]) => {
      const aPin = pinnedPaths.has(pathA) ? 1 : 0;
      const bPin = pinnedPaths.has(pathB) ? 1 : 0;
      if (aPin !== bPin) return bPin - aPin;

      const aActive = pathA === activeRepoPath ? 1 : 0;
      const bActive = pathB === activeRepoPath ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;

      const nameA = repoByPath.get(pathA)?.name ?? pathA;
      const nameB = repoByPath.get(pathB)?.name ?? pathB;
      return nameA.localeCompare(nameB);
    });
  }, [byRepo, activeRepoPath, pinnedPaths, repoByPath]);

  const handleToggleRepo = useCallback((repoPath: string) => {
    toggleRepoExpanded(repoPath);
  }, [toggleRepoExpanded]);

  const hasSearch = searchQuery.trim().length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <SearchSyncToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSync={handleRefresh}
        isSyncing={isSyncing}
        syncEnabled={!!activeRepoPath}
        searchPlaceholder="Search worktrees…"
        syncTitle="Re-scan worktrees for the selected repo"
        syncAriaLabel="Sync worktrees"
      />

      {allWorktrees.length === 0 ? (
        <div
          style={{
            color: colors.textTertiary,
            fontSize: d.font,
            padding: `${d.rowPadY * 4}px ${d.rowPadX}px`,
            textAlign: "center",
          }}
        >
          No worktrees yet. Approve a file from a remote branch or create one
          from the Sessions dialog.
        </div>
      ) : filteredWorktrees.length === 0 ? (
        <div
          style={{
            color: colors.textTertiary,
            fontSize: d.font,
            padding: `${d.rowPadY * 4}px ${d.rowPadX}px`,
            textAlign: "center",
          }}
        >
          No worktrees matching &ldquo;{searchQuery.trim()}&rdquo;
        </div>
      ) : (
        sortedEntries.map(([repoPath, wts]) => {
          const repo = repoByPath.get(repoPath) ?? null;
          const fallbackName = repoPath.split("/").pop() ?? repoPath;
          const isActive = repoPath === activeRepoPath;
          // When searching, force every matching repo open so hits are visible.
          const isExpanded = hasSearch ? true : !!expandedRepos[repoPath];

          return (
            <div key={repoPath} ref={isActive ? activeGroupRef : undefined}>
              <WorktreeRepoGroupHeader
                repo={repo}
                fallbackName={fallbackName}
                repoPath={repoPath}
                worktreeCount={wts.length}
                isActive={isActive}
                expanded={isExpanded}
                onToggle={() => handleToggleRepo(repoPath)}
              />

              {isExpanded &&
                wts.map((wt) => (
                  <WorktreeRow
                    key={wt.worktreePath}
                    wt={wt}
                    isExpanded={expandedWorktreePath === wt.worktreePath}
                    onToggle={handleToggleWorktree}
                    onOpenFile={onOpenFile}
                    onDeleted={handleWorktreeDeleted}
                  />
                ))}
            </div>
          );
        })
      )}

      {allWorktrees.length > 0 && (
        <div
          style={{
            padding: `${d.rowPadY * 2}px ${d.rowPadX}px`,
            borderTop: `1px solid ${colors.bgHover}`,
            fontSize: d.smallFont,
            color: colors.textTertiary,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <GitBranch size={d.iconSm} strokeWidth={1.5} />
          {hasSearch
            ? `${filteredWorktrees.length} of ${allWorktrees.length}`
            : `${allWorktrees.length} worktree${allWorktrees.length !== 1 ? "s" : ""}`}{" "}
          across {byRepo.size} repo{byRepo.size !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
