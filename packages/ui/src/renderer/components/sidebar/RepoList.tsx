import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Search, X } from "lucide-react";

import { useRepoStore } from "../../store/repoStore";
import { useConfigStore } from "../../store/configStore";
import { SessionCoordinator } from "../../services/SessionCoordinator";
import { RepoItem } from "./RepoItem";
import { DirectoryTree } from "./DirectoryTree";
import { ScanProgress } from "./ScanProgress";

export function RepoList(): React.ReactElement {
  const repos = useRepoStore((state) => state.repos);
  const activeRepoPath = useRepoStore((state) => state.activeRepoPath);
  const pinnedPaths = useRepoStore((state) => state.pinnedPaths);
  const isScanning = useRepoStore((state) => state.isScanning);
  const scanProgress = useRepoStore((state) => state.scanProgress);
  const error = useRepoStore((state) => state.error);
  const initializeSubscriptions = useRepoStore((state) => state.initializeSubscriptions);
  const togglePin = useRepoStore((state) => state.togglePin);
  const workingDirs = useConfigStore((state) => state.workingDirs);
  const searchQuery = useRepoStore((state) => state.searchQuery);
  const setSearchQuery = useRepoStore((state) => state.setSearchQuery);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initializeSubscriptions();
  }, [initializeSubscriptions]);

  const filteredRepos = useMemo(() => {
    if (!searchQuery.trim()) return repos;
    const q = searchQuery.toLowerCase().trim();
    return repos.filter(
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

  const handleClear = useCallback(() => {
    setSearchQuery("");
    inputRef.current?.focus();
  }, [setSearchQuery]);

  const handleSelectRepo = useCallback((path: string | null) => {
    SessionCoordinator.selectRepo(path);
  }, []);

  return (
    <section style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Search input */}
      {repos.length > 0 && (
        <div style={{ padding: "4px 12px 6px", flexShrink: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "#f5f3ef",
              borderRadius: 6,
              padding: "5px 8px",
              border: "1px solid #e5e2da",
              transition: "border-color 0.15s",
            }}
          >
            <Search size={13} color="#9a958c" strokeWidth={1.8} style={{ flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search repositories..."
              style={{
                flex: 1,
                border: "none",
                background: "transparent",
                outline: "none",
                fontSize: 12,
                color: "#2c2c2c",
                padding: 0,
                lineHeight: "18px",
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClear}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "1px",
                  lineHeight: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  color: "#9a958c",
                  borderRadius: 3,
                }}
                title="Clear search"
              >
                <X size={12} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      )}

      {isScanning && scanProgress ? (
        <ScanProgress scanned={scanProgress.scanned} total={scanProgress.total} currentDir={scanProgress.currentDir} />
      ) : null}

      {error ? (
        <div style={{ color: "#a14a2f", padding: "6px 16px", fontSize: 12, background: "#fae8e1" }}>
          {error}
        </div>
      ) : null}

      <div style={{ flex: 1, overflowY: "auto" }}>
        {repos.length === 0 ? (
          <div style={{ color: "#9a958c", fontSize: 12, padding: "12px 16px" }}>
            No repositories found.
          </div>
        ) : filteredRepos.length === 0 ? (
          <div style={{ color: "#9a958c", fontSize: 12, padding: "12px 16px" }}>
            No matches for &ldquo;{searchQuery}&rdquo;
          </div>
        ) : (
          <>
            {/* Pinned repos */}
            {pinned.length > 0 && (
              <>
                <div
                  style={{
                    padding: "8px 16px 4px",
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "#C15F3C",
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
                <div style={{ height: 1, background: "#e5e2da", margin: "4px 16px 2px" }} />
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
