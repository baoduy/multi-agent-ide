import React, { useCallback, useEffect, useMemo } from "react";

import { useRepoStore } from "../../store/repoStore";
import { useConfigStore } from "../../store/configStore";
import { useViewSearchStore } from "../../store/viewSearchStore";
import { SessionCoordinator } from "../../services/SessionCoordinator";
import { RepoItem } from "./RepoItem";
import { DirectoryTree } from "./DirectoryTree";
import { colors } from "../../utils/colors";

export function RepoList(): React.ReactElement {
  const repos = useRepoStore((state) => state.repos);
  const activeRepoPath = useRepoStore((state) => state.activeRepoPath);
  const pinnedPaths = useRepoStore((state) => state.pinnedPaths);
  const error = useRepoStore((state) => state.error);
  const initializeSubscriptions = useRepoStore((state) => state.initializeSubscriptions);
  const togglePin = useRepoStore((state) => state.togglePin);
  const workingDirs = useConfigStore((state) => state.workingDirs);
  const searchQuery = useViewSearchStore((s) => s.queries["repos"] ?? "");

  useEffect(() => {
    initializeSubscriptions();
  }, [initializeSubscriptions]);

  const filteredRepos = useMemo(() => {
    // Exclude repos whose folder no longer exists on disk
    const activeRepos = repos.filter((r) => r.status !== "missing");
    if (!searchQuery.trim()) return activeRepos;
    const q = searchQuery.toLowerCase().trim();
    return activeRepos.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.branch.toLowerCase().includes(q) ||
        r.path.toLowerCase().includes(q)
    );
  }, [repos, searchQuery]);

  const { pinned, unpinned } = useMemo(() => {
    const p: typeof filteredRepos = [];
    const u: typeof filteredRepos = [];
    for (const repo of filteredRepos) {
      if (pinnedPaths.has(repo.path)) {
        p.push(repo);
      } else {
        u.push(repo);
      }
    }
    return { pinned: p, unpinned: u };
  }, [filteredRepos, pinnedPaths]);

  const handleSelectRepo = useCallback((path: string | null) => {
    SessionCoordinator.selectRepo(path);
  }, []);

  return (
    <section style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {error ? (
        <div style={{ color: colors.errorDark, padding: "4px 10px", fontSize: 11, background: colors.errorSoft }}>
          {error}
        </div>
      ) : null}

      <div style={{ flex: 1, overflowY: "auto" }}>
        {repos.length === 0 ? (
          <div style={{ color: colors.textTertiary, fontSize: 11, padding: "6px 10px" }}>
            No repositories found.
          </div>
        ) : filteredRepos.length === 0 ? (
          <div style={{ color: colors.textTertiary, fontSize: 11, padding: "6px 10px" }}>
            No matches for &ldquo;{searchQuery}&rdquo;
          </div>
        ) : (
          <>
            {/* Pinned repos */}
            {pinned.length > 0 && (
              <>
                <div
                  style={{
                    padding: "5px 12px 2px",
                    fontSize: 9,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: colors.primary,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 10 }}>{"\u2605"}</span>
                  Pinned
                </div>
                {pinned.map((repo) => (
                  <RepoItem
                    key={repo.id}
                    repo={repo}
                    active={repo.path === activeRepoPath}
                    pinned
                    onSelect={handleSelectRepo}
                    onTogglePin={togglePin}
                  />
                ))}
                <div style={{ height: 1, background: colors.border, margin: "2px 12px 1px" }} />
              </>
            )}

            {/* Directory tree */}
            <DirectoryTree
              repos={unpinned}
              workingDirs={workingDirs}
              activeRepoPath={activeRepoPath}
              pinnedPaths={pinnedPaths}
              onSelectRepo={handleSelectRepo}
              onTogglePin={togglePin}
            />
          </>
        )}
      </div>
    </section>
  );
}
