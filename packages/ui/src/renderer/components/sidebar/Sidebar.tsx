import React, { useEffect } from "react";

import { useRepoStore } from "../../store/repoStore";
import { useSpecStore } from "../../store/specStore";
import { useConfigStore } from "../../store/configStore";
import { RepoList } from "./RepoList";

export function Sidebar(): React.ReactElement {
  const activeRepoPath = useRepoStore((state) => state.activeRepoPath);
  const fetchSpecs = useSpecStore((state) => state.fetchSpecs);
  const initializeSubscriptions = useSpecStore((state) => state.initializeSubscriptions);

  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const initializeConfigSubscriptions = useConfigStore((state) => state.initializeSubscriptions);

  useEffect(() => {
    initializeSubscriptions();
    initializeConfigSubscriptions();
    void fetchConfig();
  }, [initializeSubscriptions, initializeConfigSubscriptions, fetchConfig]);

  useEffect(() => {
    if (activeRepoPath) {
      void fetchSpecs(activeRepoPath);
    }
  }, [activeRepoPath, fetchSpecs]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflowY: "auto", minHeight: 80 }}>
        <RepoList />
      </div>
    </div>
  );
}
