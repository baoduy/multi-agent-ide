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
    fetchRepos,
    triggerScan,
    setActiveRepoPath,
  } = useRepoStore();

  useEffect(() => {
    initializeSubscriptions();
    void fetchRepos();
  }, [initializeSubscriptions, fetchRepos]);

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 13, letterSpacing: 0.4, textTransform: "uppercase", color: "#6b7280" }}>
          Repositories
        </h2>
        <button type="button" onClick={() => void triggerScan()} style={{ fontSize: 12 }}>
          Rescan
        </button>
      </div>

      {isScanning && scanProgress ? (
        <ScanProgress scanned={scanProgress.scanned} total={scanProgress.total} currentDir={scanProgress.currentDir} />
      ) : null}

      {error ? <div style={{ color: "#b91c1c", marginBottom: 10, fontSize: 12 }}>{error}</div> : null}

      {repos.length === 0 ? (
        <div style={{ color: "#6b7280", fontSize: 13 }}>No repositories found yet.</div>
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
    </section>
  );
}
