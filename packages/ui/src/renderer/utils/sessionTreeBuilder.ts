import type { AISessionRecord } from "@magenta/shared/aiTerminal";
import type { SyncedSessionRecord, SyncedSessionGroup } from "@magenta/shared/syncedSession";
import type { Repository } from "@magenta/shared/models";
import { extractDisplayName } from "./formatters";

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
  /** Live sessions (from Magenta PTY) */
  liveSessions: AISessionRecord[];
  /** Synced sessions (from disk history) */
  syncedSessions: SyncedSessionRecord[];
  /** Total session count */
  totalCount: number;
  /** Active live session count */
  activeCount: number;
  /** Most recent activity timestamp across all sessions */
  latestTimestamp: number;
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
): SessionGroupNode[] {
  // Build repo lookup by normalised path
  const repoByPath = new Map<string, Repository>();
  // Also build a lookup by repo name (for fuzzy matching synced dirs)
  const repoByName = new Map<string, Repository>();
  for (const repo of repos) {
    repoByPath.set(normalisePath(repo.path), repo);
    repoByName.set(repo.name.toLowerCase(), repo);
  }

  // Track which group keys we've already created
  const groupMap = new Map<string, SessionGroupNode>();

  // Helper to get or create a group node
  function getOrCreateGroup(
    key: string,
    path: string,
    name: string,
    repo: Repository | null,
  ): SessionGroupNode {
    let node = groupMap.get(key);
    if (!node) {
      node = {
        key,
        name,
        path,
        repo,
        liveSessions: [],
        syncedSessions: [],
        totalCount: 0,
        activeCount: 0,
        latestTimestamp: 0,
      };
      groupMap.set(key, node);
    }
    return node;
  }

  // 1) Group live sessions by repoPath or cwd
  for (const session of liveSessions) {
    const dirPath = normalisePath(session.repoPath || session.cwd || "/Workspace");
    const repo = repoByPath.get(dirPath) ?? null;
    const name = repo?.name ?? extractDisplayName(dirPath);
    const group = getOrCreateGroup(dirPath, dirPath, name, repo);
    group.liveSessions.push(session);
  }

  // 2) Merge synced session groups
  for (const syncedGroup of syncedGroups) {
    const syncedPath = normalisePath(syncedGroup.path);

    // Try direct path match to a repo
    let matchedRepo = repoByPath.get(syncedPath) ?? null;
    let groupKey = syncedPath;

    // If not found, try resolving hyphenated Claude Code paths
    if (!matchedRepo && syncedPath.startsWith("-")) {
      const resolved = resolveHyphenatedPath(syncedPath);
      matchedRepo = repoByPath.get(normalisePath(resolved)) ?? null;
      if (matchedRepo) {
        groupKey = normalisePath(matchedRepo.path);
      }
    }

    // Fuzzy match by folder name as last resort
    if (!matchedRepo) {
      const folderName = extractDisplayName(syncedPath).toLowerCase();
      matchedRepo = repoByName.get(folderName) ?? null;
      if (matchedRepo) {
        groupKey = normalisePath(matchedRepo.path);
      }
    }

    const name = matchedRepo?.name ?? syncedGroup.name;
    const group = getOrCreateGroup(groupKey, matchedRepo?.path ?? syncedPath, name, matchedRepo);

    // Append synced sessions
    for (const s of syncedGroup.sessions) {
      group.syncedSessions.push(s);
    }
  }

  // 3) Compute aggregate stats for each group
  for (const group of groupMap.values()) {
    // Sort live sessions: active first, then by lastActiveAt DESC
    group.liveSessions.sort((a, b) => {
      const aActive = a.status === "active" || a.status === "waiting-input" ? 1 : 0;
      const bActive = b.status === "active" || b.status === "waiting-input" ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return b.lastActiveAt - a.lastActiveAt;
    });
    // Sort synced sessions: active first, then by startedAt DESC
    group.syncedSessions.sort((a, b) => {
      const aActive = a.status === "active" ? 1 : 0;
      const bActive = b.status === "active" ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return b.startedAt - a.startedAt;
    });

    group.totalCount = group.liveSessions.length + group.syncedSessions.length;
    group.activeCount = group.liveSessions.filter(
      (s) => s.status === "active" || s.status === "waiting-input",
    ).length;

    const latestLive = group.liveSessions[0]?.lastActiveAt ?? 0;
    const latestSynced = group.syncedSessions[0]?.startedAt ?? 0;
    group.latestTimestamp = Math.max(latestLive, latestSynced);
  }

  // 4) Sort groups: repos first (alphabetical), then non-repos (by latest timestamp)
  const result = [...groupMap.values()];
  result.sort((a, b) => {
    // Repos first
    if (a.repo && !b.repo) return -1;
    if (!a.repo && b.repo) return 1;
    // Within same category, by most recent activity
    return b.latestTimestamp - a.latestTimestamp;
  });

  return result;
}
