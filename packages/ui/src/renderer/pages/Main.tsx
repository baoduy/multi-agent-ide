import React, { useEffect, useState } from "react";

import { MainLayout } from "../components/layouts/MainLayout";
import { Sidebar } from "../components/sidebar/Sidebar";
import { TabBar } from "../components/main/TabBar";
import { PlanTasksView } from "../components/main/PlanTasksView";
import { WorktreesView } from "../components/main/WorktreesView";
import { SpecEditorView } from "../components/main/SpecEditorView";
import { ActivityPanel } from "../components/activity/ActivityPanel";
import { useSpecStore } from "../store/specStore";
import { useSessionRestoration } from "../hooks/useSessionRestoration";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { useRepoStore } from "../store/repoStore";
import { useSessionStore } from "../store/sessionStore";
import { useConfigStore } from "../store/configStore";
import { WelcomePage } from "./Welcome";

import type { TabId } from "../components/main/TabBar";

export function MainPage(): React.ReactElement {
  // Initialize session on mount
  useSessionRestoration();

  // ── Initialize all store subscriptions at the top level ──
  // This ensures push events from the daemon (scan progress, config updates, etc.)
  // are always received, even when WelcomePage is shown instead of the full layout.
  const initRepoSubscriptions = useRepoStore((state) => state.initializeSubscriptions);
  const fetchRepos = useRepoStore((state) => state.fetchRepos);
  const initConfigSubscriptions = useConfigStore((state) => state.initializeSubscriptions);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);

  useEffect(() => {
    initRepoSubscriptions();
    initConfigSubscriptions();
    void fetchRepos();
    void fetchConfig();
  }, [initRepoSubscriptions, initConfigSubscriptions, fetchRepos, fetchConfig]);

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>("plan");

  // Get state from stores
  const sessionInitialized = useSessionStore((state) => state.initialized);
  const isLoading = useSessionStore((state) => state.isLoading);
  const repos = useRepoStore((state) => state.repos);
  const activeRepoPath = useRepoStore((state) => state.activeRepoPath);
  const selectedSpecPath = useSpecStore((state) => state.selectedSpecPath);
  const specs = useSpecStore((state) => state.specs);

  // Show loading spinner during initialization
  if (!sessionInitialized || isLoading) {
    return <LoadingSpinner message="Loading your workspace..." />;
  }

  // Show welcome page if no repos
  if (repos.length === 0) {
    return <WelcomePage />;
  }

  // Find selected spec and active repo name
  const selectedSpec = specs.find((s) => s.path === selectedSpecPath) || null;
  const activeRepo = repos.find((r) => r.path === activeRepoPath);
  const repoName = activeRepo?.name ?? null;

  // Render the active tab content
  function renderTabContent(): React.ReactElement {
    switch (activeTab) {
      case "plan":
        return <PlanTasksView specs={specs} />;
      case "worktrees":
        return <WorktreesView repoName={repoName} />;
      case "spec":
        return <SpecEditorView spec={selectedSpec} repoName={repoName} />;
      default:
        return <PlanTasksView specs={specs} />;
    }
  }

  return (
    <MainLayout
      sidebar={<Sidebar />}
      main={
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
          <div style={{ flex: 1, overflowY: "auto" }}>
            {renderTabContent()}
          </div>
        </div>
      }
      activity={<ActivityPanel />}
    />
  );
}
