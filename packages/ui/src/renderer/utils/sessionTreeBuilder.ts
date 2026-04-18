import type { AISessionRecord } from "@magenta/shared/aiTerminal";
import type { SyncedSessionRecord, SyncedSessionGroup } from "@magenta/shared/syncedSession";
import type { Repository } from "@magenta/shared/models";
import { extractDisplayName, resolveWorktreeParent } from "./formatters";
import { itemPinKey, livePinKey } from "./sessionPinKey";

/**
 * One row under a branch group. Discriminated so the renderer knows
 * which component to render (live PTY row vs synced disk row).
 */
export type HistoryItem =
  | { kind: "live"; session: AISessionRecord; timestamp: number }
  | { kind: "synced"; session: SyncedSessionRecord; timestamp: number };

/**
 * A collapsible group of sessions sharing the same branch/worktree,
 * rendered as a sub-section under a repo group.
 */
export interface BranchGroup {
  /** Branch or worktree display name */
  branchName: string;
  /** Sessions in this branch group, sorted by timestamp DESC */
  items: HistoryItem[];
  /** Most recent activity timestamp in this group */
  latestTimestamp: number;
}

/** A unified group node in the session tree */
export interface SessionGroupNode {
  /** Unique key for React */
  key: string;
  /** Display name (repo name or folder name) */
  name: string;
  /** Absolute path this group represents */
  path: string;
  /** Whether this maps to a registered repo in the DB */
  repo: Repository | null;
  /**
   * Currently-running PTY sessions (status "active" or "waiting-input"),
   * minus any that the user has pinned (those live in `pinnedActive`).
   * Rendered at the repo level (above branch groups). Always sorted by lastActiveAt DESC.
   */
  activeLiveSessions: AISessionRecord[];
  /**
   * Synced sessions whose agent is currently producing output (`activity === "processing"`),
   * hoisted out of their branch groups so they surface in the active section.
   * Excludes any that the user has pinned. Sorted by startedAt/endedAt DESC.
   */
  activeSyncedSessions: SyncedSessionRecord[];
  /**
   * Pinned running sessions, hoisted above the "active" section. Kept separate
   * from `pinnedItems` so we don't lose the live-row affordances (status badge,
   * resume flow) when a pinned session is currently executing.
   */
  pinnedActive: AISessionRecord[];
  /**
   * Pinned idle / synced sessions, hoisted above active + branch groups.
   * Sorted by timestamp DESC. Items here are removed from their branch group.
   */
  pinnedItems: HistoryItem[];
  /**
   * History sessions grouped by branch/worktree. Each branch group is
   * collapsible and contains sessions sorted by timestamp DESC.
   * Branch groups themselves are sorted by latest activity DESC.
   */
  branchGroups: BranchGroup[];
  /**
   * @deprecated Use branchGroups instead. Kept for backward compatibility.
   * Flat list of all history items across all branches.
   */
  history: HistoryItem[];
  /** Total session count (active + history, post-dedup) */
  totalCount: number;
  /** Count of rows above the divider */
  activeCount: number;
  /** Most recent activity timestamp across all rows */
  latestTimestamp: number;
}

/**
 * Filter session groups by a search query. Matches against repo name, branch
 * names, session titles, slugs, and provider names. Returns only groups (and
 * within them only branch groups / active sessions) that contain matches.
 */
export function filterSessionGroups(
  groups: SessionGroupNode[],
  query: string,
): SessionGroupNode[] {
  // Split query into individual words — every word must match somewhere
  // in the searchable fields for a session to be considered a hit.
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return groups;

  /** Check that every word appears in at least one of the given fields. */
  function matchesAllWords(fields: (string | null | undefined)[]): boolean {
    const haystack = fields.map((f) => (f ?? "").toLowerCase()).join(" ");
    return words.every((w) => haystack.includes(w));
  }

  function matchesLive(s: AISessionRecord): boolean {
    return matchesAllWords([s.title, s.repoName, s.branch, s.worktreeName, s.provider]);
  }

  function matchesSynced(s: SyncedSessionRecord): boolean {
    return matchesAllWords([s.title, s.slug, s.gitBranch, s.provider, s.model]);
  }

  function matchesHistoryItem(item: HistoryItem): boolean {
    return item.kind === "live" ? matchesLive(item.session) : matchesSynced(item.session);
  }

  const result: SessionGroupNode[] = [];

  for (const group of groups) {
    const groupNameMatches = matchesAllWords([group.name]);

    // Filter active live sessions
    const filteredActive = groupNameMatches
      ? group.activeLiveSessions
      : group.activeLiveSessions.filter(matchesLive);

    // Filter active synced (currently processing) sessions
    const filteredActiveSynced = groupNameMatches
      ? group.activeSyncedSessions
      : group.activeSyncedSessions.filter(matchesSynced);

    // Filter pinned rows with the same rules as the rest of the tree
    const filteredPinnedActive = groupNameMatches
      ? group.pinnedActive
      : group.pinnedActive.filter(matchesLive);
    const filteredPinnedItems = groupNameMatches
      ? group.pinnedItems
      : group.pinnedItems.filter(matchesHistoryItem);

    // Filter branch groups
    const filteredBranches: BranchGroup[] = [];
    const filteredHistory: HistoryItem[] = [];

    for (const bg of group.branchGroups) {
      const branchNameMatches = groupNameMatches || matchesAllWords([group.name, bg.branchName]);
      const matchingItems = branchNameMatches ? bg.items : bg.items.filter(matchesHistoryItem);
      if (matchingItems.length > 0) {
        filteredBranches.push({
          branchName: bg.branchName,
          items: matchingItems,
          latestTimestamp: matchingItems[0]?.timestamp ?? 0,
        });
        filteredHistory.push(...matchingItems);
      }
    }

    const pinnedCount = filteredPinnedActive.length + filteredPinnedItems.length;
    if (
      filteredActive.length > 0 ||
      filteredActiveSynced.length > 0 ||
      filteredBranches.length > 0 ||
      pinnedCount > 0
    ) {
      result.push({
        ...group,
        activeLiveSessions: filteredActive,
        activeSyncedSessions: filteredActiveSynced,
        pinnedActive: filteredPinnedActive,
        pinnedItems: filteredPinnedItems,
        branchGroups: filteredBranches,
        history: filteredHistory,
        totalCount:
          filteredActive.length +
          filteredActiveSynced.length +
          filteredHistory.length +
          pinnedCount,
        activeCount:
          filteredActive.length + filteredActiveSynced.length + filteredPinnedActive.length,
      });
    }
  }

  return result;
}

/** Normalise path for matching (strip trailing slash) */
function normalisePath(p: string): string {
  return p.replace(/\/+$/, "");
}

/**
 * Resolve a synced session group path to a possible repo path.
 * Claude Code stores project dirs as hyphenated:
 *   "-Users-steven--CODE-GIT-project" -> "/Users/steven/_CODE/GIT/project"
 * This is approximate -- we match by trailing folder name.
 */
function resolveHyphenatedPath(hyphenated: string): string {
  if (!hyphenated.startsWith("-")) return hyphenated;
  return "/" + hyphenated.slice(1).replace(/--/g, "/").replace(/-/g, "/");
}

/**
 * Build a unified list of session group nodes by merging:
 * 1. Live sessions grouped by repoPath/cwd
 * 2. Synced session groups matched to repos in DB
 */
export function buildUnifiedGroups(
  liveSessions: AISessionRecord[],
  syncedGroups: SyncedSessionGroup[],
  repos: Repository[],
  pinnedKeys: Set<string> = new Set(),
  pinnedRepoPaths: Set<string> = new Set(),
): SessionGroupNode[] {
  // Build repo lookup by normalised path
  const repoByPath = new Map<string, Repository>();
  // Also build a lookup by repo name (for fuzzy matching synced dirs)
  const repoByName = new Map<string, Repository>();
  for (const repo of repos) {
    repoByPath.set(normalisePath(repo.path), repo);
    repoByName.set(repo.name.toLowerCase(), repo);
  }

  /** Accumulator: live + synced buckets per group, pre-sort. */
  type GroupAcc = {
    key: string;
    name: string;
    path: string;
    repo: Repository | null;
    live: AISessionRecord[];
    synced: SyncedSessionRecord[];
  };
  const groupAcc = new Map<string, GroupAcc>();

  function getOrCreateAcc(
    key: string,
    path: string,
    name: string,
    repo: Repository | null,
  ): GroupAcc {
    let acc = groupAcc.get(key);
    if (!acc) {
      acc = { key, name, path, repo, live: [], synced: [] };
      groupAcc.set(key, acc);
    }
    return acc;
  }

  // 1) Group live sessions by repoPath or cwd
  for (const session of liveSessions) {
    const dirPath = normalisePath(session.repoPath || session.cwd || "/Workspace");
    const repo = repoByPath.get(dirPath) ?? null;
    const name = repo?.name ?? extractDisplayName(dirPath);
    const acc = getOrCreateAcc(dirPath, dirPath, name, repo);
    acc.live.push(session);
  }

  // 2) Merge synced session groups, matching to repos where possible.
  for (const syncedGroup of syncedGroups) {
    const syncedPath = normalisePath(syncedGroup.path);

    let matchedRepo = repoByPath.get(syncedPath) ?? null;
    let groupKey = syncedPath;

    if (!matchedRepo && syncedPath.startsWith("-")) {
      const resolved = resolveHyphenatedPath(syncedPath);
      matchedRepo = repoByPath.get(normalisePath(resolved)) ?? null;
      if (matchedRepo) {
        groupKey = normalisePath(matchedRepo.path);
      }
    }

    // Worktree path match: strip /.worktrees/<name> and check against repos
    if (!matchedRepo) {
      const parentPath = resolveWorktreeParent(syncedPath);
      if (parentPath !== syncedPath) {
        matchedRepo = repoByPath.get(normalisePath(parentPath)) ?? null;
        if (matchedRepo) {
          groupKey = normalisePath(matchedRepo.path);
        }
      }
    }

    if (!matchedRepo) {
      const folderName = extractDisplayName(syncedPath).toLowerCase();
      matchedRepo = repoByName.get(folderName) ?? null;
      if (matchedRepo) {
        groupKey = normalisePath(matchedRepo.path);
      }
    }

    const name = matchedRepo?.name ?? syncedGroup.name;
    const acc = getOrCreateAcc(groupKey, matchedRepo?.path ?? syncedPath, name, matchedRepo);
    for (const s of syncedGroup.sessions) {
      acc.synced.push(s);
    }
  }

  // 3) For each group, split live into running vs idle, dedup synced
  //    against live by agent session UUID, then merge idle-live + synced
  //    into a single history list sorted DESC.
  const isRunning = (s: AISessionRecord): boolean =>
    s.status === "active" || s.status === "waiting-input";

  const groupMap = new Map<string, SessionGroupNode>();
  for (const acc of groupAcc.values()) {
    // Collect all known live session UUIDs (live.id + live.providerSessionId)
    // so we can drop duplicates that also appear in the synced list.
    const liveIds = new Set<string>();
    for (const s of acc.live) {
      liveIds.add(s.id);
      if (s.providerSessionId) liveIds.add(s.providerSessionId);
    }
    const dedupedSynced = acc.synced.filter((s) => !liveIds.has(s.sessionId));

    // Active rows (top section). Sort by lastActiveAt DESC.
    const allActive = acc.live
      .filter(isRunning)
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt);

    // Split active into pinned vs not. Pinned running sessions render in the
    // dedicated "Pinned" section above the "Active" section.
    const pinnedActive: AISessionRecord[] = [];
    const activeLiveSessions: AISessionRecord[] = [];
    for (const s of allActive) {
      if (pinnedKeys.has(livePinKey(s))) pinnedActive.push(s);
      else activeLiveSessions.push(s);
    }

    // History rows: idle live + non-processing synced, tagged, then sorted DESC.
    // Processing synced sessions are hoisted into `activeSyncedSessions` so they
    // surface in the active section regardless of branch-group collapse state.
    const history: HistoryItem[] = [];
    const processingSynced: SyncedSessionRecord[] = [];
    for (const s of acc.live) {
      if (isRunning(s)) continue;
      history.push({ kind: "live", session: s, timestamp: s.lastActiveAt });
    }
    for (const s of dedupedSynced) {
      if (s.activity === "processing") {
        processingSynced.push(s);
        continue;
      }
      // Prefer endedAt (last activity) over startedAt when available.
      const timestamp = s.endedAt ?? s.startedAt;
      history.push({ kind: "synced", session: s, timestamp });
    }
    history.sort((a, b) => b.timestamp - a.timestamp);
    processingSynced.sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt));

    // Extract pinned history items before branch grouping so they don't also
    // render inside their branch group (no duplicate display).
    const pinnedItems: HistoryItem[] = [];
    const unpinnedHistory: HistoryItem[] = [];
    for (const item of history) {
      if (pinnedKeys.has(itemPinKey(item))) pinnedItems.push(item);
      else unpinnedHistory.push(item);
    }

    // Pinned processing synced sessions move to pinnedItems so the pinned
    // section still owns them; the active-synced list is only the unpinned ones.
    const activeSyncedSessions: SyncedSessionRecord[] = [];
    for (const s of processingSynced) {
      const item: HistoryItem = { kind: "synced", session: s, timestamp: s.endedAt ?? s.startedAt };
      if (pinnedKeys.has(itemPinKey(item))) pinnedItems.push(item);
      else activeSyncedSessions.push(s);
    }

    // Group unpinned history items by branch/worktree name
    const branchMap = new Map<string, HistoryItem[]>();
    for (const item of unpinnedHistory) {
      let branch: string;
      if (item.kind === "live") {
        branch = item.session.worktreeName || item.session.branch || "default";
      } else {
        branch = item.session.gitBranch || "default";
      }
      let bucket = branchMap.get(branch);
      if (!bucket) {
        bucket = [];
        branchMap.set(branch, bucket);
      }
      bucket.push(item);
    }

    // Build sorted branch groups (by latest timestamp DESC)
    const branchGroups: BranchGroup[] = [];
    for (const [branchName, items] of branchMap) {
      // Items are already sorted DESC from the history sort above
      branchGroups.push({
        branchName,
        items,
        latestTimestamp: items[0]?.timestamp ?? 0,
      });
    }
    branchGroups.sort((a, b) => b.latestTimestamp - a.latestTimestamp);

    const totalCount =
      activeLiveSessions.length +
      activeSyncedSessions.length +
      history.length +
      pinnedActive.length;
    const activeCount =
      activeLiveSessions.length + activeSyncedSessions.length + pinnedActive.length;
    const latestTimestamp = Math.max(
      allActive[0]?.lastActiveAt ?? 0,
      activeSyncedSessions[0]?.endedAt ?? activeSyncedSessions[0]?.startedAt ?? 0,
      history[0]?.timestamp ?? 0,
      pinnedItems[0]?.timestamp ?? 0,
    );

    groupMap.set(acc.key, {
      key: acc.key,
      name: acc.name,
      path: acc.path,
      repo: acc.repo,
      activeLiveSessions,
      activeSyncedSessions,
      pinnedActive,
      pinnedItems,
      branchGroups,
      history,
      totalCount,
      activeCount,
      latestTimestamp,
    });
  }

  // 4) Sort groups: pinned repos first, then active/processing groups, then repos,
  //    then by latest activity. "Active" here means any running live PTY, any
  //    processing synced session, or any pinned running session.
  const result = [...groupMap.values()];
  result.sort((a, b) => {
    // Pinned repos always float to the top (workspace groups have no repo → never pinned)
    const aPin = a.repo && pinnedRepoPaths.has(a.repo.path) ? 1 : 0;
    const bPin = b.repo && pinnedRepoPaths.has(b.repo.path) ? 1 : 0;
    if (aPin !== bPin) return bPin - aPin;
    const aActive = a.activeCount > 0 ? 1 : 0;
    const bActive = b.activeCount > 0 ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    // Repos first
    if (a.repo && !b.repo) return -1;
    if (!a.repo && b.repo) return 1;
    // Within same category, by most recent activity
    return b.latestTimestamp - a.latestTimestamp;
  });

  return result;
}
