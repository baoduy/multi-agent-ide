import React, { useEffect } from "react";

import { useRepoStore } from "../../store/repoStore";
import { RepoItem } from "./RepoItem";
import { ScanProgress } from "./ScanProgress";

export function RepoList(): React.ReactElement {
  const {
    repos,
    activeRepoPath,
    isScanning,
    scanProgress,
    error,
    initializeSubscriptions,
    setActiveRepoPath,
  } = useRepoStore();

  useEffect(() => {
    initializeSubscriptions();
  }, [initializeSubscriptions]);

  return (
    <section style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {isScanning && scanProgress ? (
        <ScanProgress scanned={scanProgress.scanned} total={scanProgress.total} currentDir={scanProgress.currentDir} />
      ) : null}

      {error ? (
        <div style={{ color: "#c93c37", padding: "6px 16px", fontSize: 12, background: "#fef2f2" }}>
          {error}
        </div>
      ) : null}

      <div style={{ flex: 1, overflowY: "auto" }}>
        {repos.length === 0 ? (
          <div style={{ color: "#8b8b96", fontSize: 12, padding: "12px 16px" }}>
            No repositories found.
          </div>
        ) : (
          repos.map((repo) => (
            <RepoItem
              key={repo.id}
              repo={repo}
              active={repo.path === activeRepoPath}
              onSelect={setActiveRepoPath}
            />
          ))
        )}
      </div>
    </section>
  );
}
