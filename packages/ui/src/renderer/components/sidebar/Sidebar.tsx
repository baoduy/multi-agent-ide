import React, { useEffect } from "react";

import { ipc } from "../../utils/ipc";
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

  // Initialize subscriptions on mount
  useEffect(() => {
    initializeSubscriptions();
    initializeConfigSubscriptions();
    void fetchConfig();
  }, [initializeSubscriptions, initializeConfigSubscriptions, fetchConfig]);

  // Fetch specs when active repo changes
  useEffect(() => {
    if (activeRepoPath) {
      void fetchSpecs(activeRepoPath);
    }
  }, [activeRepoPath, fetchSpecs]);

  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100%",
  };

  const headerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  };

  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 16,
    fontWeight: 600,
  };

  const buttonStyle: React.CSSProperties = {
    fontSize: 12,
    padding: "6px 12px",
    borderRadius: 4,
    border: "1px solid #e5e7eb",
    backgroundColor: "#f9fafb",
    cursor: "pointer",
  };

  const settingsButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    width: 32,
    height: 32,
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const repoListContainerStyle: React.CSSProperties = {
    flex: 1,
    overflowY: "auto",
    marginBottom: 12,
    borderBottom: "1px solid #e5e7eb",
  };

  const specTreeContainerStyle: React.CSSProperties = {
    flex: 1,
    overflowY: "auto",
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Magenta IDE</h1>
        <button type="button" onClick={() => setShowSettings(true)} style={settingsButtonStyle} title="Settings">
          ⚙️
        </button>
      </div>

      <SettingsDialog isOpen={showSettings} onClose={() => setShowSettings(false)} />

      <div style={repoListContainerStyle}>
        <RepoList />
      </div>

      {activeRepoPath && (
        <div style={specTreeContainerStyle}>
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
