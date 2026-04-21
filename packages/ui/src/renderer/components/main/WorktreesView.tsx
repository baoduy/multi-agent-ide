import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { GitBranch, Clock } from "lucide-react";
import type { Repository } from "@magenta/shared/models";

import { useWorktreeStore, type WorktreeInfo } from "../../store/worktreeStore";
import { useRepoStore } from "../../store/repoStore";
import { onEvent } from "../../services/ipcClient";
import { ViewToolbar } from "../common/ViewToolbar";
import { WorktreeInlinePanel } from "../worktree/WorktreeInlinePanel";
import { colors } from "../../utils/colors";
import { TreeRepoHeader } from "../common/TreeRepoHeader";
import { TreeBranchRow } from "../common/TreeBranchRow";
import { Tag } from "../common/Tag";
import { useDensityTokens } from "../../hooks/useComponentSize";
import { formatRelativeTime } from "../../utils/formatters";

type WorktreesViewProps = {
  repoName: string | null;
  /** Called when user clicks a file in a worktree — opens it in a new tab. */
  onOpenFile?: (filePath: string) => void;
};

/* ══════════════════════════════════════════
 * Level-2 worktree row — thin wrapper over the shared TreeBranchRow.
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
  const d = useDensityTokens();

  const handleToggle = useCallback(() => onToggle(wt.worktreePath), [onToggle, wt.worktreePath]);
  const handleDeleted = useCallback(() => onDeleted(wt.worktreePath), [onDeleted, wt.worktreePath]);

  // A worktree's name, branch, and path-tail are often derived from the same
  // identifier. Pick a single primary label (branch if available, else name)
  // and only show the secondary label when it adds new information.
  const primaryLabel = wt.branch || wt.name;

  return (
    <TreeBranchRow
      name={primaryLabel}
      secondaryName={wt.name}
      expanded={isExpanded}
      onToggle={handleToggle}
      title={wt.worktreePath}
      highlightWhenExpanded
      rightSlot={
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
      }
    >
      <WorktreeInlinePanel
        worktree={wt}
        onOpenFile={onOpenFile}
        onDeleted={handleDeleted}
      />
    </TreeBranchRow>
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
      <ViewToolbar
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
              <TreeRepoHeader
                repo={repo}
                fallbackName={fallbackName}
                repoPath={repoPath}
                expanded={isExpanded}
                onToggle={() => handleToggleRepo(repoPath)}
                count={wts.length}
                badgeSlot={
                  isActive ? (
                    <Tag size="chip" tone="active">active</Tag>
                  ) : undefined
                }
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
