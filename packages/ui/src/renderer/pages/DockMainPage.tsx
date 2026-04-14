/**
 * DockMainPage — the new dock-based main page.
 *
 * Replaces MainPage when the dock layout feature flag is enabled.
 * Uses DockManager instead of MainLayout. All the same store subscriptions,
 * snapshot persistence, and navigation logic from Main.tsx are preserved.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DockManager, useLayoutStore } from "../components/dock";
import { StatusBar } from "../components/dock/StatusBar";
import { useKeyboardShortcuts } from "../components/dock/useKeyboardShortcuts";
import { registerAllViews } from "../components/dock/registerViews";
import { TitleBar } from "../components/titlebar/TitleBar";
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
import { SettingsDialog } from "../components/settings/SettingsDialog";
import { NewSessionDialog } from "../components/dialogs/NewSessionDialog";

import type { ActiveTab, BuiltinTabId } from "../types/tabs";
import type { AISessionRecord } from "@magenta/shared/aiTerminal";

/* ── Register views once at module load ── */
registerAllViews();

/* ── Builtin view mapping ── */

/** Maps each TitleBar builtin tab to its center view id. */
const BUILTIN_VIEW_MAP: Record<BuiltinTabId, string> = {
  specs: "specs-list",
  workflow: "workflow",
  worktrees: "worktrees",
  ai: "ai-sessions",
};

/** Reverse lookup: viewId → BuiltinTabId */
function viewIdToBuiltinId(viewId: string): BuiltinTabId | null {
  for (const [bid, vid] of Object.entries(BUILTIN_VIEW_MAP)) {
    if (vid === viewId) return bid as BuiltinTabId;
  }
  return null;
}

/** The pinned main tab id — always the first tab in center. */
const MAIN_TAB_ID = "tab-main";

/* ── Navigation history hook (same as Main.tsx) ── */

function useNavHistory() {
  const historyRef = useRef<ActiveTab[]>([]);
  const indexRef = useRef(-1);
  const [, setTick] = useState(0);

  const push = useCallback((tab: ActiveTab) => {
    const current = historyRef.current[indexRef.current];
    if (current && isSameTab(current, tab)) return;
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

/* ── Main Component ── */

export function DockMainPage(): React.ReactElement {
  useSessionRestoration();
  useKeyboardShortcuts();
  const snapshots = usePersistedSnapshots();

  // ── Store subscriptions (same as Main.tsx) ──
  const initRepoSubscriptions = useRepoStore((s) => s.initializeSubscriptions);
  const fetchRepos = useRepoStore((s) => s.fetchRepos);
  const initConfigSubscriptions = useConfigStore((s) => s.initializeSubscriptions);
  const fetchConfig = useConfigStore((s) => s.fetchConfig);

  useEffect(() => {
    initRepoSubscriptions();
    initConfigSubscriptions();
    void fetchRepos();
    void fetchConfig();
  }, [initRepoSubscriptions, initConfigSubscriptions, fetchRepos, fetchConfig]);

  // ── State ──
  const sessionInitialized = useSessionStore((s) => s.initialized);
  const isLoading = useSessionStore((s) => s.isLoading);
  const repos = useRepoStore((s) => s.repos);
  const activeRepoPath = useRepoStore((s) => s.activeRepoPath);
  const selectedSpecPath = useSpecStore((s) => s.selectedSpecPath);
  const setSelectedSpecPath = useSpecStore((s) => s.setSelectedSpecPath);
  const specs = useSpecStore((s) => s.specs);
  const fetchWorktreesForAll = useWorktreeStore((s) => s.fetchWorktreesForAll);
  const fetchWorktrees = useWorktreeStore((s) => s.fetchWorktrees);

  // Sidebar collapse (mapped to dock layout)
  const leftCollapsed = useLayoutStore((s) => s.layout.left.collapsed);
  const rightCollapsed = useLayoutStore((s) => s.layout.right.collapsed);
  const toggleRegionCollapse = useLayoutStore((s) => s.toggleRegionCollapse);
  const openTab = useLayoutStore((s) => s.openTab);
  const setMainView = useLayoutStore((s) => s.setMainView);
  const centerActiveTabId = useLayoutStore((s) => s.layout.center.activeTabId);
  const centerTabs = useLayoutStore((s) => s.layout.center.tabs);
  const mainTabId = useLayoutStore((s) => s.layout.center.tabs[0]?.tabId ?? MAIN_TAB_ID);
  const mainViewId = useLayoutStore((s) => s.layout.center.tabs[0]?.viewId ?? "specs-list");

  const [showSettings, setShowSettings] = useState(false);
  const [newSessionDialogOpen, setNewSessionDialogOpen] = useState(false);

  // Navigation
  const nav = useNavHistory();
  const isNavAction = useRef(false);

  // Track previous repo+spec for snapshots
  const prevRepoPath = useRef<string | null>(null);
  const prevSpecPath = useRef<string | null>(null);

  // ── Derive active tab from dock layout ──
  const activeTab = useMemo((): ActiveTab => {
    if (!centerActiveTabId) return { kind: "builtin", id: "specs" };
    // If the main tab is active, derive from its current viewId
    if (centerActiveTabId === mainTabId) {
      const bid = viewIdToBuiltinId(mainViewId);
      return { kind: "builtin", id: bid ?? "specs" };
    }
    // File tabs
    if (centerActiveTabId.startsWith("file-")) {
      const filePath = centerActiveTabId.replace("file-", "");
      return { kind: "file", filePath };
    }
    return { kind: "builtin", id: "specs" };
  }, [centerActiveTabId, mainTabId, mainViewId]);

  // ── Fetch worktrees ──
  useEffect(() => {
    if (repos.length > 0) {
      void fetchWorktreesForAll(repos.map((r) => r.path));
    }
  }, [repos, fetchWorktreesForAll]);

  useEffect(() => {
    if (activeRepoPath) {
      void fetchWorktrees(activeRepoPath);
    }
  }, [activeRepoPath, fetchWorktrees]);

  // ── Snapshot persistence on repo switch ──
  useEffect(() => {
    const prevRepo = prevRepoPath.current;
    if (prevRepo === activeRepoPath) {
      prevRepoPath.current = activeRepoPath;
      return;
    }

    if (prevRepo) {
      snapshots.saveRepoSnapshot(prevRepo, {
        selectedSpecPath,
        mainTab: activeTab,
      });
    }

    if (activeRepoPath) {
      const repoSnap = snapshots.getRepoSnapshot(activeRepoPath);
      if (repoSnap) {
        setSelectedSpecPath(repoSnap.selectedSpecPath);
        // Restore active builtin view in dock layout
        if (repoSnap.mainTab.kind === "builtin") {
          const viewId = BUILTIN_VIEW_MAP[repoSnap.mainTab.id];
          if (viewId) setMainView(viewId);
        }
      } else {
        setSelectedSpecPath(null);
        setMainView("specs-list");
      }
    }

    prevRepoPath.current = activeRepoPath;
    prevSpecPath.current = activeRepoPath
      ? (snapshots.getRepoSnapshot(activeRepoPath)?.selectedSpecPath ?? null)
      : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRepoPath]);

  // ── Snapshot persistence on spec switch ──
  useEffect(() => {
    const prevSpec = prevSpecPath.current;
    if (prevRepoPath.current !== activeRepoPath) return;
    if (prevSpec === selectedSpecPath) {
      prevSpecPath.current = selectedSpecPath;
      return;
    }

    snapshots.saveTabSnapshot(activeRepoPath, prevSpec, {
      openFiles: [],
      activeTab,
    });

    const tabSnap = snapshots.getTabSnapshot(activeRepoPath, selectedSpecPath);
    if (tabSnap) {
      if (tabSnap.activeTab.kind === "builtin") {
        const viewId = BUILTIN_VIEW_MAP[tabSnap.activeTab.id];
        if (viewId) setMainView(viewId);
      }
    } else {
      setMainView("specs-list");
    }

    prevSpecPath.current = selectedSpecPath;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSpecPath]);

  // Navigation history
  useEffect(() => {
    if (!isNavAction.current) {
      nav.push(activeTab);
    }
    isNavAction.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    const handleBeforeUnload = () => snapshots.flush();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      snapshots.flush();
    };
  }, [snapshots]);

  // ── Handlers ──

  const handleOpenFile = useCallback(
    (filePath: string) => {
      const tabId = `file-${filePath}`;
      const fileName = filePath.split("/").pop() ?? filePath;
      openTab("center", {
        tabId,
        viewId: "file-viewer",
        props: { filePath },
        title: fileName,
      });
    },
    [openTab]
  );

  const handleOpenDiff = useCallback(
    (filePath: string, fileStatus: string) => {
      const tabId = `diff-${filePath}`;
      const fileName = filePath.split("/").pop() ?? filePath;
      openTab("center", {
        tabId,
        viewId: "diff-viewer",
        props: { filePath, repoPath: activeRepoPath, fileStatus },
        title: `${fileName} (diff)`,
      });
    },
    [openTab, activeRepoPath]
  );

  const terminalCounter = useRef(0);

  const handleOpenAgentSession = useCallback(
    (session: AISessionRecord) => {
      const tabId = `agent-${session.id}`;
      const title = session.title ?? session.repoName ?? `${session.provider} agent`;
      openTab("center", {
        tabId,
        viewId: "agent-session",
        props: {
          aiSessionId: session.id,
          aiProvider: session.provider,
          cwd: session.cwd,
        },
        title,
      });
    },
    [openTab]
  );

  const handleOpenTerminalSession = useCallback(
    (cwd: string) => {
      terminalCounter.current += 1;
      const tabId = `terminal-${terminalCounter.current}`;
      const label = cwd.split("/").pop() ?? "Terminal";
      openTab("center", {
        tabId,
        viewId: "terminal-session",
        props: { cwd },
        title: label,
      });
    },
    [openTab]
  );

  const handleSelectBuiltinTab = useCallback(
    (id: BuiltinTabId) => {
      const viewId = BUILTIN_VIEW_MAP[id];
      if (viewId) {
        setMainView(viewId);
      }
    },
    [setMainView]
  );

  const handleSelectSpec = useCallback(
    (specPath: string) => {
      setSelectedSpecPath(specPath);
    },
    [setSelectedSpecPath]
  );

  const handleOpenSpec = useCallback(
    (specPath: string) => {
      setSelectedSpecPath(specPath);
      setMainView("workflow");
    },
    [setSelectedSpecPath, setMainView]
  );

  const handleSpecChanged = useCallback(() => {
    // no-op — let spec:sync:complete handle the refresh
  }, []);

  const handleNewSession = useCallback(() => {
    setNewSessionDialogOpen(true);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    toggleRegionCollapse("left");
  }, [toggleRegionCollapse]);

  const handleToggleActivity = useCallback(() => {
    toggleRegionCollapse("right");
  }, [toggleRegionCollapse]);

  const handleGoBack = useCallback(() => {
    const tab = nav.goBack();
    if (tab) {
      isNavAction.current = true;
      if (tab.kind === "builtin") {
        const viewId = BUILTIN_VIEW_MAP[tab.id];
        if (viewId) setMainView(viewId);
      } else {
        handleOpenFile(tab.filePath);
      }
    }
  }, [nav, setMainView, handleOpenFile]);

  const handleGoForward = useCallback(() => {
    const tab = nav.goForward();
    if (tab) {
      isNavAction.current = true;
      if (tab.kind === "builtin") {
        const viewId = BUILTIN_VIEW_MAP[tab.id];
        if (viewId) setMainView(viewId);
      } else {
        handleOpenFile(tab.filePath);
      }
    }
  }, [nav, setMainView, handleOpenFile]);

  // Derive the active terminal's worktree path (if any)
  // NOTE: these hooks MUST be before the early returns to keep hook order stable.
  const activeTerminalCwd = useMemo(() => {
    if (!centerActiveTabId) return null;
    const tab = centerTabs.find((t) => t.tabId === centerActiveTabId);
    if (!tab) return null;
    if (tab.viewId === "agent-session" || tab.viewId === "terminal-session") {
      return (tab.props?.cwd as string) ?? null;
    }
    return null;
  }, [centerActiveTabId, centerTabs]);

  // If the terminal cwd differs from the repo root, it's a worktree
  const worktreePathForChanges = useMemo(() => {
    if (!activeTerminalCwd || !activeRepoPath) return null;
    return activeTerminalCwd !== activeRepoPath ? activeTerminalCwd : null;
  }, [activeTerminalCwd, activeRepoPath]);

  // ── Loading / Welcome gates ──

  if (!sessionInitialized || isLoading) {
    return <LoadingSpinner message="Loading your workspace..." />;
  }

  if (repos.length === 0) {
    return <WelcomePage />;
  }

  // ── Derive view props ──

  const selectedSpec = specs.find((s) => s.path === selectedSpecPath) || null;
  const activeRepo = repos.find((r) => r.path === activeRepoPath);
  const repoName = activeRepo?.name ?? null;

  const viewProps: Record<string, Record<string, unknown>> = {
    "repo-changes": {
      repoPath: activeRepoPath ?? undefined,
      worktreePath: worktreePathForChanges,
      onOpenFile: handleOpenFile,
      onOpenDiff: handleOpenDiff,
    },
    "spec-files": {
      onOpenFile: handleOpenFile,
    },
    "specs-list": {
      specs,
      selectedSpecPath,
      onSelectSpec: handleSelectSpec,
      onOpenSpec: handleOpenSpec,
    },
    workflow: {
      spec: selectedSpec,
      repoName,
      repoPath: activeRepoPath ?? undefined,
      onOpenFile: handleOpenFile,
      onSpecChanged: handleSpecChanged,
    },
    worktrees: {
      repoName,
      onOpenFile: handleOpenFile,
    },
    "ai-sessions": {
      repoPath: activeRepoPath ?? undefined,
      repoName,
      onOpenAgentSession: handleOpenAgentSession,
      onOpenTerminalSession: handleOpenTerminalSession,
    },
  };

  return (
    <>
      <OnboardDialogManager />
      <SettingsDialog isOpen={showSettings} onClose={() => setShowSettings(false)} />
      <NewSessionDialog
        open={newSessionDialogOpen}
        onClose={() => setNewSessionDialogOpen(false)}
        onSessionCreated={handleOpenAgentSession}
        onTerminalCreated={handleOpenTerminalSession}
        repoPath={activeRepoPath ?? undefined}
        repoName={repoName}
      />
      <DockManager
        titleBar={
          <TitleBar
            sidebarCollapsed={leftCollapsed}
            activityCollapsed={rightCollapsed}
            hasActivity={true}
            onToggleSidebar={handleToggleSidebar}
            onToggleActivity={handleToggleActivity}
            canGoBack={nav.canGoBack}
            canGoForward={nav.canGoForward}
            onGoBack={handleGoBack}
            onGoForward={handleGoForward}
            activeTab={activeTab}
            onSelectBuiltinTab={handleSelectBuiltinTab}
            onNewSession={handleNewSession}
          />
        }
        viewProps={viewProps}
        onSettingsClick={() => setShowSettings(true)}
        statusBar={<StatusBar />}
      />
    </>
  );
}
