import React, { useCallback, useEffect, useRef, useState } from "react";

import { MainLayout } from "../components/layouts/MainLayout";
import { Sidebar } from "../components/sidebar/Sidebar";
import { TabBar } from "../components/main/TabBar";
import { SpecsListView } from "../components/main/SpecsListView";
import { WorktreesView } from "../components/main/WorktreesView";
import { WorkflowView } from "../components/main/WorkflowView";
import { FileViewer } from "../components/main/FileViewer";
import { ActivityPanel } from "../components/activity/ActivityPanel";
import { useSpecStore } from "../store/specStore";
import { useSessionRestoration } from "../hooks/useSessionRestoration";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { useRepoStore } from "../store/repoStore";
import { useSessionStore } from "../store/sessionStore";
import { useConfigStore } from "../store/configStore";
import { WelcomePage } from "./Welcome";

import type { ActiveTab, BuiltinTabId, OpenFileTab } from "../components/main/TabBar";

/**
 * Per-repo snapshot of open file tabs and the active tab.
 * Stored in a Map keyed by repo path so we can restore when
 * the user switches back to a previously visited repo.
 */
type RepoTabSnapshot = {
  openFiles: OpenFileTab[];
  activeTab: ActiveTab;
};

export function MainPage(): React.ReactElement {
  // Initialize session on mount
  useSessionRestoration();

  // ── Initialize all store subscriptions at the top level ──
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
  const [activeTab, setActiveTab] = useState<ActiveTab>({ kind: "builtin", id: "specs" });
  const [openFiles, setOpenFiles] = useState<OpenFileTab[]>([]);

  // Per-repo tab snapshots — survives across repo switches within the session
  const repoTabSnapshots = useRef<Map<string, RepoTabSnapshot>>(new Map());
  // Track the previous repo so we can snapshot on switch
  const prevRepoPath = useRef<string | null>(null);

  // Get state from stores
  const sessionInitialized = useSessionStore((state) => state.initialized);
  const isLoading = useSessionStore((state) => state.isLoading);
  const repos = useRepoStore((state) => state.repos);
  const activeRepoPath = useRepoStore((state) => state.activeRepoPath);
  const selectedSpecPath = useSpecStore((state) => state.selectedSpecPath);
  const setSelectedSpecPath = useSpecStore((state) => state.setSelectedSpecPath);
  const specs = useSpecStore((state) => state.specs);
  const fetchSpecs = useSpecStore((state) => state.fetchSpecs);

  // ── Save / restore open file tabs when the active repo changes ──
  useEffect(() => {
    const prev = prevRepoPath.current;

    // Save snapshot for the repo we're leaving
    if (prev && prev !== activeRepoPath) {
      repoTabSnapshots.current.set(prev, {
        openFiles: openFiles,
        activeTab: activeTab,
      });
    }

    // Restore snapshot for the repo we're entering (or reset)
    if (activeRepoPath && activeRepoPath !== prev) {
      const snapshot = repoTabSnapshots.current.get(activeRepoPath);
      if (snapshot) {
        setOpenFiles(snapshot.openFiles);
        setActiveTab(snapshot.activeTab);
      } else {
        // First visit — clear file tabs, go back to specs
        setOpenFiles([]);
        setActiveTab({ kind: "builtin", id: "specs" });
      }
    }

    prevRepoPath.current = activeRepoPath;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to activeRepoPath changes
  }, [activeRepoPath]);

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

  /* ── File tab management ── */

  const handleOpenFile = (filePath: string) => {
    const already = openFiles.find((f) => f.filePath === filePath);
    if (!already) {
      const fileName = filePath.split("/").pop() ?? filePath;
      setOpenFiles((prev) => [...prev, { filePath, fileName }]);
    }
    setActiveTab({ kind: "file", filePath });
  };

  const handleCloseFileTab = (filePath: string) => {
    setOpenFiles((prev) => {
      const filtered = prev.filter((f) => f.filePath !== filePath);

      if (activeTab.kind === "file" && activeTab.filePath === filePath) {
        if (filtered.length > 0) {
          setActiveTab({ kind: "file", filePath: filtered[filtered.length - 1].filePath });
        } else {
          setActiveTab({ kind: "builtin", id: "specs" });
        }
      }

      return filtered;
    });
  };

  const handleSelectBuiltinTab = (id: BuiltinTabId) => {
    setActiveTab({ kind: "builtin", id });
  };

  const handleSelectFileTab = (filePath: string) => {
    setActiveTab({ kind: "file", filePath });
  };

  /* ── Spec selection from SpecsListView ── */
  const handleSelectSpec = (specPath: string) => {
    setSelectedSpecPath(specPath);
  };

  const handleOpenSpec = (specPath: string) => {
    setSelectedSpecPath(specPath);
    setActiveTab({ kind: "builtin", id: "workflow" });
  };

  /* ── Refresh specs after approval ── */
  const handleSpecChanged = () => {
    if (activeRepoPath) {
      void fetchSpecs(activeRepoPath);
    }
  };

  /* ── Render active tab content ── */

  function renderTabContent(): React.ReactElement {
    if (activeTab.kind === "file") {
      return <FileViewer filePath={activeTab.filePath} repoPath={activeRepoPath ?? undefined} />;
    }

    switch (activeTab.id) {
      case "specs":
        return (
          <SpecsListView
            specs={specs}
            selectedSpecPath={selectedSpecPath}
            onSelectSpec={handleSelectSpec}
            onOpenSpec={handleOpenSpec}
          />
        );
      case "worktrees":
        return <WorktreesView repoName={repoName} />;
      case "workflow":
        return (
          <WorkflowView
            spec={selectedSpec}
            repoName={repoName}
            repoPath={activeRepoPath ?? undefined}
            onOpenFile={handleOpenFile}
            onSpecChanged={handleSpecChanged}
          />
        );
      default:
        return (
          <SpecsListView
            specs={specs}
            selectedSpecPath={selectedSpecPath}
            onSelectSpec={handleSelectSpec}
            onOpenSpec={handleOpenSpec}
          />
        );
    }
  }

  return (
    <MainLayout
      sidebar={<Sidebar />}
      main={
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <TabBar
            activeTab={activeTab}
            openFiles={openFiles}
            onSelectBuiltinTab={handleSelectBuiltinTab}
            onSelectFileTab={handleSelectFileTab}
            onCloseFileTab={handleCloseFileTab}
          />
          <div style={{ flex: 1, overflowY: "auto" }}>
            {renderTabContent()}
          </div>
        </div>
      }
      activity={
        selectedSpec && selectedSpec.files.length > 0
          ? <ActivityPanel onOpenFile={handleOpenFile} />
          : null
      }
    />
  );
}
