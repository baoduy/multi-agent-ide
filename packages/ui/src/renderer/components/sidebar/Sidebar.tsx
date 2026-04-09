import React, { useEffect } from "react";

import { useRepoStore } from "../../store/repoStore";
import { useSpecStore } from "../../store/specStore";
import { useConfigStore } from "../../store/configStore";
import { RepoList } from "./RepoList";
import { SpecTree } from "./SpecTree";
import { SettingsDialog } from "../settings/SettingsDialog";

export function Sidebar(): React.ReactElement {
  const activeRepoPath = useRepoStore((state) => state.activeRepoPath);
  const specs = useSpecStore((state) => state.specs);
  const selectedSpecPath = useSpecStore((state) => state.selectedSpecPath);
  const isLoading = useSpecStore((state) => state.isLoading);
  const fetchSpecs = useSpecStore((state) => state.fetchSpecs);
  const setSelectedSpecPath = useSpecStore((state) => state.setSelectedSpecPath);
  const initializeSubscriptions = useSpecStore((state) => state.initializeSubscriptions);

  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const initializeConfigSubscriptions = useConfigStore((state) => state.initializeSubscriptions);
  const [showSettings, setShowSettings] = React.useState(false);

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
      <SettingsDialog isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* Section header */}
      <div
        style={{
          padding: "14px 16px 10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#8b8b96",
          }}
        >
          Repositories
        </span>
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 14,
            color: "#8b8b96",
            padding: "2px 4px",
            borderRadius: 4,
            lineHeight: 1,
            transition: "color 0.15s, background 0.15s",
          }}
          title="Settings"
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#1e1e2e";
            e.currentTarget.style.background = "#e5e5ec";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#8b8b96";
            e.currentTarget.style.background = "none";
          }}
        >
          ⚙
        </button>
      </div>

      {/* Repo list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <RepoList />
      </div>

      {/* Spec tree below repos when a repo is active */}
      {activeRepoPath && (
        <div
          style={{
            borderTop: "1px solid #e5e5ec",
            overflowY: "auto",
            maxHeight: "40%",
          }}
        >
          <SpecTree
            specs={specs}
            isLoading={isLoading}
            selectedSpecPath={selectedSpecPath}
            onSelectSpec={setSelectedSpecPath}
          />
        </div>
      )}
    </div>
  );
}
