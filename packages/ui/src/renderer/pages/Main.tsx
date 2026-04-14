import React, { useCallback, useEffect, useRef, useState } from "react";

import { MainLayout } from "../components/layouts/MainLayout";
import { TitleBar } from "../components/titlebar/TitleBar";
import { Sidebar } from "../components/sidebar/Sidebar";
import { TabBar } from "../components/main/TabBar";
import { SpecsListView } from "../components/main/SpecsListView";
import { WorktreesView } from "../components/main/WorktreesView";
import { WorkflowView } from "../components/main/WorkflowView";
import { FileViewer } from "../components/main/FileViewer";
import { ActivityPanel } from "../components/activity/ActivityPanel";
import { useSpecStore } from "../store/specStore";
import { useSessionRestoration } from "../hooks/useSessionRestoration";
import { usePersistedSnapshots } from "../hooks/usePersistedSnapshots";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { useRepoStore } from "../store/repoStore";
import { useSessionStore } from "../store/sessionStore";
import { useConfigStore } from "../store/configStore";
import { useWorktreeStore } from "../store/worktreeStore";
import { WelcomePage } from "./Welcome";
import { OnboardDialogManager } from "../components/dialogs/OnboardDialogManager";
import { AISessionsView } from "../components/ai-terminal/AISessionsView";
import { NewSessionDialog } from "../components/dialogs/NewSessionDialog";

import type { ActiveTab, BuiltinTabId, OpenFileTab } from "../components/main/TabBar";

/**
 * Simple navigation history for back/forward tab navigation.
 */
function useNavHistory() {
  const historyRef = useRef<ActiveTab[]>([]);
  const indexRef = useRef(-1);
  const [, setTick] = useState(0);

  const push = useCallback((tab: ActiveTab) => {
    const current = historyRef.current[indexRef.current];
    // Don't push duplicates
    if (current && isSameTab(current, tab)) return;

    // Trim forward history
    historyRef.current = historyRef.current.slice(0, indexRef.current + 1);
    historyRef.current.push(tab);
    indexRef.current = historyRef.current.length - 1;
    setTick((t) => t + 1);
  }, []);

  const goBack = useCallback((): ActiveTab | null => {
    if (indexRef.current <= 0) return null;
    indexRef.current -= 1;
    setTick((t) => t + 1);
    return historyRef.current[indexRef.current];
  }, []);

  const goForward = useCallback((): ActiveTab | null => {
    if (indexRef.current >= historyRef.current.length - 1) return null;
    indexRef.current += 1;
    setTick((t) => t + 1);
    return historyRef.current[indexRef.current];
  }, []);

  return {
    push,
    goBack,
    goForward,
    canGoBack: indexRef.current > 0,
    canGoForward: indexRef.current < historyRef.current.length - 1,
  };
}

function isSameTab(a: ActiveTab, b: ActiveTab): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "builtin" && b.kind === "builtin") return a.id === b.id;
  if (a.kind === "file" && b.kind === "file") return a.filePath === b.filePath;
  return false;
}

export function MainPage(): React.ReactElement {
  // Initialize session on mount (reads from localStorage)
  useSessionRestoration();

  // Persisted snapshots — localStorage-backed per-repo and per-spec tab state
  const snapshots = usePersistedSnapshots();

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

  // Navigation history
  const nav = useNavHistory();
  const isNavAction = useRef(false);

  // Track the previous repo+spec so we can snapshot on switch
  const prevRepoPath = useRef<string | null>(null);
  const prevSpecPath = useRef<string | null>(null);

  // Get state from stores
  const sessionInitialized = useSessionStore((state) => state.initialized);
  const isLoading = useSessionStore((state) => state.isLoading);
  const repos = useRepoStore((state) => state.repos);
  const activeRepoPath = useRepoStore((state) => state.activeRepoPath);
  const selectedSpecPath = useSpecStore((state) => state.selectedSpecPath);
  const setSelectedSpecPath = useSpecStore((state) => state.setSelectedSpecPath);
  const specs = useSpecStore((state) => state.specs);
  const fetchWorktreesForAll = useWorktreeStore((state) => state.fetchWorktreesForAll);
  const fetchWorktrees = useWorktreeStore((state) => state.fetchWorktrees);

  // Sidebar collapse state
  const sidebarCollapsed = useSessionStore((state) => state.sidebarCollapsed);
  const activityCollapsed = useSessionStore((state) => state.activityCollapsed);
  const patchSession = useSessionStore((state) => state.patchSession);

  // New session dialog state (lifted to MainPage so TitleBar can trigger it)
  const [newSessionDialogOpen, setNewSessionDialogOpen] = useState(false);
  const handleTitleBarNewSession = useCallback(() => {
    setNewSessionDialogOpen(true);
  }, []);

  // ── Fetch worktrees for all repos once repos are loaded ──
  useEffect(() => {
    if (repos.length > 0) {
      void fetchWorktreesForAll(repos.map((r) => r.path));
    }
  }, [repos, fetchWorktreesForAll]);

  // ── Refresh worktrees when the active repo changes ──
  useEffect(() => {
    if (activeRepoPath) {
      void fetchWorktrees(activeRepoPath);
    }
  }, [activeRepoPath, fetchWorktrees]);

  // ── Save / restore per-repo state when the active repo changes ──
  useEffect(() => {
    const prevRepo = prevRepoPath.current;

    if (prevRepo === activeRepoPath) {
      prevRepoPath.current = activeRepoPath;
      return;
    }

    // Save snapshot for the repo we're leaving
    if (prevRepo) {
      snapshots.saveRepoSnapshot(prevRepo, {
        selectedSpecPath: selectedSpecPath,
        mainTab: activeTab,
      });
      // Also save the tab snapshot for the current spec context
      snapshots.saveTabSnapshot(prevRepo, selectedSpecPath, {
        openFiles,
        activeTab,
      });
    }

    // Restore snapshot for the repo we're entering (or reset)
    if (activeRepoPath) {
      const repoSnap = snapshots.getRepoSnapshot(activeRepoPath);
      if (repoSnap) {
        // Restore the selected spec
        setSelectedSpecPath(repoSnap.selectedSpecPath);

        // Restore the active tab / screen
        setActiveTab(repoSnap.mainTab);

        // Restore the open files for the current spec context
        const tabSnap = snapshots.getTabSnapshot(activeRepoPath, repoSnap.selectedSpecPath);
        if (tabSnap) {
          setOpenFiles(tabSnap.openFiles);
          setActiveTab(tabSnap.activeTab);
        } else {
          setOpenFiles([]);
        }
      } else {
        // First visit to this repo — clear everything
        setSelectedSpecPath(null);
        setOpenFiles([]);
        setActiveTab({ kind: "builtin", id: "specs" });
      }
    }

    prevRepoPath.current = activeRepoPath;
    prevSpecPath.current = activeRepoPath
      ? (snapshots.getRepoSnapshot(activeRepoPath)?.selectedSpecPath ?? null)
      : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to activeRepoPath changes
  }, [activeRepoPath]);

  // ── Save / restore open file tabs when the selected spec changes (within the same repo) ──
  useEffect(() => {
    const prevSpec = prevSpecPath.current;

    // Only handle spec changes within the same repo
    if (prevRepoPath.current !== activeRepoPath) return;
    if (prevSpec === selectedSpecPath) {
      prevSpecPath.current = selectedSpecPath;
      return;
    }

    // Save snapshot for the spec we're leaving
    snapshots.saveTabSnapshot(activeRepoPath, prevSpec, {
      openFiles,
      activeTab,
    });

    // Restore snapshot for the spec we're entering (or reset)
    const tabSnap = snapshots.getTabSnapshot(activeRepoPath, selectedSpecPath);
    if (tabSnap) {
      setOpenFiles(tabSnap.openFiles);
      setActiveTab(tabSnap.activeTab);
    } else {
      // First visit — clear file tabs, go back to specs
      setOpenFiles([]);
      setActiveTab({ kind: "builtin", id: "specs" });
    }

    prevSpecPath.current = selectedSpecPath;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to selectedSpecPath changes
  }, [selectedSpecPath]);

  // Push active tab changes into navigation history (but not when navigating via back/forward)
  useEffect(() => {
    if (!isNavAction.current) {
      nav.push(activeTab);
    }
    isNavAction.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Flush pending localStorage writes on unmount / page unload
  useEffect(() => {
    const handleBeforeUnload = () => snapshots.flush();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      snapshots.flush();
    };
  }, [snapshots]);

  /* ── Refresh specs after approval ── */
  // NOTE: We intentionally do NOT call fetchSpecs() here.
  // The optimistic update in specStore already reflects the change immediately.
  // A premature fetchSpecs() would overwrite the optimistic update with stale data
  // if the daemon hasn't picked up the file change yet.
  // The background spec:sync:complete event will handle eventual consistency.
  const handleSpecChanged = useCallback(() => {
    // no-op — let spec:sync:complete handle the refresh
  }, []);

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

  /* ── Navigation ── */

  const handleGoBack = () => {
    const tab = nav.goBack();
    if (tab) {
      isNavAction.current = true;
      setActiveTab(tab);
    }
  };

  const handleGoForward = () => {
    const tab = nav.goForward();
    if (tab) {
      isNavAction.current = true;
      setActiveTab(tab);
    }
  };

  /* ── Sidebar toggles ── */

  const handleToggleSidebar = () => {
    patchSession({ sidebarCollapsed: !sidebarCollapsed });
  };

  const handleToggleActivity = () => {
    patchSession({ activityCollapsed: !activityCollapsed });
  };

  /* ── Spec selection from SpecsListView ── */
  const handleSelectSpec = (specPath: string) => {
    setSelectedSpecPath(specPath);
  };

  const handleOpenSpec = (specPath: string) => {
    setSelectedSpecPath(specPath);
    setActiveTab({ kind: "builtin", id: "workflow" });
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
        return <WorktreesView repoName={repoName} onOpenFile={handleOpenFile} />;
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
      case "ai":
        return (
          <AISessionsView
            repoPath={activeRepoPath ?? undefined}
            repoName={repoName}
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
    <>
    <OnboardDialogManager />
    <MainLayout
      titleBar={
        <TitleBar
          sidebarCollapsed={sidebarCollapsed}
          activityCollapsed={activityCollapsed}
          hasActivity={true}
          onToggleSidebar={handleToggleSidebar}
          onToggleActivity={handleToggleActivity}
          canGoBack={nav.canGoBack}
          canGoForward={nav.canGoForward}
          onGoBack={handleGoBack}
          onGoForward={handleGoForward}
          activeTab={activeTab}
          onSelectBuiltinTab={handleSelectBuiltinTab}
          onNewSession={handleTitleBarNewSession}
        />
      }
      sidebar={<Sidebar />}
      sidebarCollapsed={sidebarCollapsed}
      activityCollapsed={activityCollapsed}
      main={
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          {/*
            File tab bar is only rendered when a file tab is active.
            Built-in views (AI, Specs, Workflow, Worktrees) own their own
            headers, so the file tab bar must not stack above them — the
            top strip should always show exactly one tab bar. Open file
            tabs remain in state and reappear the moment the user navigates
            back to a file (back/forward, sidebar, or re-opens a file).
          */}
          {activeTab.kind === "file" && (
            <TabBar
              activeTab={activeTab}
              openFiles={openFiles}
              onSelectFileTab={handleSelectFileTab}
              onCloseFileTab={handleCloseFileTab}
            />
          )}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {renderTabContent()}
          </div>
        </div>
      }
      activity={
        <ActivityPanel
          onOpenFile={handleOpenFile}
          activeBuiltinTab={activeTab.kind === "builtin" ? activeTab.id : null}
        />
      }
    />
      {/* New session dialog triggered from title bar */}
      <NewSessionDialog
        open={newSessionDialogOpen}
        onClose={() => setNewSessionDialogOpen(false)}
        onSessionCreated={() => {}}
        onTerminalCreated={() => {}}
        repoPath={activeRepoPath ?? undefined}
        repoName={repoName}
      />
    </>
  );
}
