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
import { CliUpgradeDialog } from "../components/dialogs/CliUpgradeDialog";
import { SettingsDialog } from "../components/settings/SettingsDialog";
import { NewSessionDialog } from "../components/dialogs/NewSessionDialog";
import { CloseWarningDialog } from "../components/dialogs/CloseWarningDialog";
import { useAISessionStore } from "../store/aiSessionStore";

import type { ActiveTab, BuiltinTabId } from "../types/tabs";
import type { AISessionRecord } from "@magenta/shared/aiTerminal";
import type { SavedDockTab } from "../hooks/usePersistedSnapshots";
import type { TabState } from "../components/dock/types";

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
  const fetchWorktreesIfNeeded = useWorktreeStore((s) => s.fetchWorktreesIfNeeded);
  const pinnedPaths = useRepoStore((s) => s.pinnedPaths);

  // Sidebar collapse (mapped to dock layout)
  const leftCollapsed = useLayoutStore((s) => s.layout.left.collapsed);
  const rightCollapsed = useLayoutStore((s) => s.layout.right.collapsed);
  const toggleRegionCollapse = useLayoutStore((s) => s.toggleRegionCollapse);
  const setRegionCollapsed = useLayoutStore((s) => s.setRegionCollapsed);

  // Active dock group — drives right sidebar visibility
  const activeGroupId = useLayoutStore((s) => s.layout.activityBar.activeGroupId);
  const activeGroup = useLayoutStore((s) =>
    s.layout.activityBar.groups.find((g) => g.id === s.layout.activityBar.activeGroupId),
  );
  const hasRightSidebar = (activeGroup?.rightViewIds?.length ?? 0) > 0;
  // Groups that replace the pinned main tab (Markdown, Git) — the title bar's
  // builtin buttons do not apply while one of these is active.
  const titleBarBuiltinsDisabled = activeGroup?.hidesPinnedMain === true;
  const openTab = useLayoutStore((s) => s.openTab);
  const closeTab = useLayoutStore((s) => s.closeTab);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const setMainView = useLayoutStore((s) => s.setMainView);
  const centerActiveTabId = useLayoutStore((s) => s.layout.center.activeTabId);
  const centerTabs = useLayoutStore((s) => s.layout.center.tabs);
  const mainTabId = useLayoutStore((s) => s.layout.center.tabs[0]?.tabId ?? MAIN_TAB_ID);
  const mainViewId = useLayoutStore((s) => s.layout.center.tabs[0]?.viewId ?? "specs-list");

  const [showSettings, setShowSettings] = useState(false);
  const [newSessionDialogOpen, setNewSessionDialogOpen] = useState(false);
  const [closeWarningCount, setCloseWarningCount] = useState(0);

  // Navigation
  const nav = useNavHistory();
  const isNavAction = useRef(false);

  // Track previous repo+spec for snapshots
  const prevRepoPath = useRef<string | null>(null);
  const prevSpecPath = useRef<string | null>(null);

  // Active repo's branch — needed to close diff tabs when the branch changes
  const activeRepoBranch = useRepoStore((s) => {
    if (!s.activeRepoPath) return null;
    return s.repos.find((r) => r.path === s.activeRepoPath)?.branch ?? null;
  });

  // ── Helpers for per-spec dock file tab persistence ──

  /** Collect file tabs (tabId starting with "file-") from the current center region. */
  const collectFileTabs = useCallback((): { fileTabs: SavedDockTab[]; activeFileTabId: string | null } => {
    const layout = useLayoutStore.getState().layout;
    const fileTabs = layout.center.tabs
      .filter((t) => t.tabId.startsWith("file-"))
      .map<SavedDockTab>((t) => ({
        tabId: t.tabId,
        viewId: t.viewId,
        props: t.props,
        title: t.title,
      }));
    const active = layout.center.activeTabId;
    const activeFileTabId = active && active.startsWith("file-") ? active : null;
    return { fileTabs, activeFileTabId };
  }, []);

  /** Close every tab in the center region whose tabId begins with the given prefix. */
  const closeTabsByPrefix = useCallback(
    (prefix: string) => {
      const layout = useLayoutStore.getState().layout;
      const toClose = layout.center.tabs
        .filter((t) => t.tabId.startsWith(prefix))
        .map((t) => t.tabId);
      for (const id of toClose) closeTab("center", id);
    },
    [closeTab]
  );

  /** Restore a saved set of file tabs into the dock (does not disturb the main/builtin tab). */
  const restoreFileTabs = useCallback(
    (saved: SavedDockTab[], activeFileTabId: string | null) => {
      for (const tab of saved) {
        openTab("center", {
          tabId: tab.tabId,
          viewId: tab.viewId,
          props: tab.props,
          title: tab.title,
        });
      }
      // Keep the built-in main tab active after restore so the title bar tab
      // stays as-is. Caller can override if desired.
      if (activeFileTabId) {
        // The last openTab() call made that tab active — reactivate the saved one.
        setActiveTab("center", activeFileTabId);
      }
    },
    [openTab, setActiveTab]
  );

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

  // Title-bar button highlight is driven solely by the pinned main tab's
  // viewId — opening a file/diff/agent/terminal/refdiff/group tab must NOT
  // change which builtin button is lit. Kept separate from `activeTab` so the
  // navigation history below can still record the real active tab.
  const titleBarActiveTab = useMemo((): ActiveTab => {
    const bid = viewIdToBuiltinId(mainViewId);
    return { kind: "builtin", id: bid ?? "specs" };
  }, [mainViewId]);

  // ── Fetch worktrees for pinned repos + active repo once repos are loaded ──
  useEffect(() => {
    if (repos.length === 0) return;
    const paths = new Set(pinnedPaths);
    if (activeRepoPath) paths.add(activeRepoPath);
    if (paths.size > 0) {
      void fetchWorktreesForAll([...paths]);
    }
  }, [repos, pinnedPaths, activeRepoPath, fetchWorktreesForAll]);

  // ── Incrementally fetch worktrees when the active repo changes ──
  useEffect(() => {
    if (activeRepoPath) {
      void fetchWorktreesIfNeeded(activeRepoPath);
    }
  }, [activeRepoPath, fetchWorktreesIfNeeded]);

  // ── Auto-collapse/restore right sidebar when switching dock groups ──
  const prevGroupIdRef = useRef(activeGroupId);
  const savedRightCollapsed = useRef(rightCollapsed);
  useEffect(() => {
    if (prevGroupIdRef.current === activeGroupId) return;
    const prevHadRight =
      (useLayoutStore.getState().layout.activityBar.groups
        .find((g) => g.id === prevGroupIdRef.current)?.rightViewIds?.length ?? 0) > 0;

    // Save current right sidebar state when leaving a group that had a right sidebar
    if (prevHadRight) {
      savedRightCollapsed.current = useLayoutStore.getState().layout.right.collapsed;
    }

    prevGroupIdRef.current = activeGroupId;

    if (!hasRightSidebar) {
      // Entering a group with no right sidebar → collapse
      setRegionCollapsed("right", true);
    } else {
      // Entering a group with a right sidebar → restore saved state
      setRegionCollapsed("right", savedRightCollapsed.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId]);

  // ── Auto-open a group's default center view (e.g. git-changes-center) ──
  //
  // When the user switches to a group that declares `defaultCenterViewId`, make
  // sure that tab exists and is active. This lands the user on the group's
  // primary surface without needing them to open a tab manually.
  useEffect(() => {
    if (!activeGroup?.defaultCenterViewId) return;
    const defaultViewId = activeGroup.defaultCenterViewId;
    const tabs = useLayoutStore.getState().layout.center.tabs;
    const existing = tabs.find((t) => t.viewId === defaultViewId);
    const tabId = existing?.tabId ?? `group-${activeGroup.id}-${defaultViewId}`;
    if (!existing) {
      openTab("center", { tabId, viewId: defaultViewId });
    } else {
      setActiveTab("center", tabId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId]);

  // ── Snapshot persistence on repo switch ──
  // Per-repo memory intentionally excludes the title bar tab — the active
  // builtin view (specs/workflow/worktrees/ai) stays wherever the user has it
  // when switching repos. Only the selected spec and open file tabs are restored.
  // Diff tabs are closed (not restored) on repo switch.
  useEffect(() => {
    const prevRepo = prevRepoPath.current;
    if (prevRepo === activeRepoPath) {
      prevRepoPath.current = activeRepoPath;
      return;
    }

    // Save state for the repo we're leaving
    if (prevRepo) {
      snapshots.saveRepoSnapshot(prevRepo, {
        selectedSpecPath,
        mainTab: activeTab,
      });
      // Capture the file tabs open for (prevRepo, prevSpec) before closing them
      const captured = collectFileTabs();
      snapshots.saveSpecDockTabs(prevRepo, prevSpecPath.current, captured);
    }

    // Close all file tabs and all diff tabs — they belong to the old context
    closeTabsByPrefix("file-");
    closeTabsByPrefix("diff-");

    // Restore state for the repo we're entering
    if (activeRepoPath) {
      const repoSnap = snapshots.getRepoSnapshot(activeRepoPath);
      const nextSpec = repoSnap ? repoSnap.selectedSpecPath : null;
      setSelectedSpecPath(nextSpec);

      // Restore saved file tabs for the new (repo, spec) context
      const savedTabs = snapshots.getSpecDockTabs(activeRepoPath, nextSpec);
      if (savedTabs && savedTabs.fileTabs.length > 0) {
        restoreFileTabs(savedTabs.fileTabs, savedTabs.activeFileTabId);
      }
      // Note: intentionally do NOT call setMainView() here — keep current tab.
    }

    prevRepoPath.current = activeRepoPath;
    prevSpecPath.current = activeRepoPath
      ? (snapshots.getRepoSnapshot(activeRepoPath)?.selectedSpecPath ?? null)
      : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRepoPath]);

  // ── Snapshot persistence on spec switch ──
  // Spec selection changes within a repo should NOT change the title bar tab,
  // but file tabs are per-spec: close the old spec's file tabs and restore the
  // new spec's saved file tabs (if any).
  useEffect(() => {
    const prevSpec = prevSpecPath.current;
    if (prevRepoPath.current !== activeRepoPath) return;
    if (prevSpec === selectedSpecPath) {
      prevSpecPath.current = selectedSpecPath;
      return;
    }

    // Save current file tabs under (activeRepo, prevSpec) before closing
    const captured = collectFileTabs();
    snapshots.saveSpecDockTabs(activeRepoPath, prevSpec, captured);
    snapshots.saveTabSnapshot(activeRepoPath, prevSpec, {
      openFiles: [],
      activeTab,
    });

    // Close the old spec's file tabs (and any stale diff tabs)
    closeTabsByPrefix("file-");

    // Restore the new spec's file tabs (if any were previously saved).
    // If nothing was saved, switch the title bar tab to "Specs" so the user
    // lands on a sensible default for a fresh spec.
    const savedTabs = snapshots.getSpecDockTabs(activeRepoPath, selectedSpecPath);
    if (savedTabs && savedTabs.fileTabs.length > 0) {
      restoreFileTabs(savedTabs.fileTabs, savedTabs.activeFileTabId);
    } else {
      setMainView("specs-list");
    }

    prevSpecPath.current = selectedSpecPath;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSpecPath]);

  // ── Close diff tabs on branch switch ──
  // Diff tabs show comparisons specific to the active repo's current branch.
  // When the branch changes, close them all — they don't need to be reopened.
  const prevBranch = useRef<string | null>(activeRepoBranch);
  useEffect(() => {
    if (prevBranch.current === activeRepoBranch) return;
    if (prevBranch.current !== null) {
      closeTabsByPrefix("diff-");
    }
    prevBranch.current = activeRepoBranch;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRepoBranch]);

  // ── Close diff tabs when the focused worktree changes ──
  // The Worktrees view tracks which worktree the user is focused on via
  // `expandedWorktreePath`. When it changes, any open diff tabs are stale.
  const expandedWorktreePath = useWorktreeStore((s) => s.expandedWorktreePath);
  const prevExpandedWorktree = useRef<string | null>(expandedWorktreePath);
  useEffect(() => {
    if (prevExpandedWorktree.current === expandedWorktreePath) return;
    // Close diffs on any transition between worktrees (including to/from null)
    // once we've seen at least one non-null value.
    if (prevExpandedWorktree.current !== null || expandedWorktreePath !== null) {
      closeTabsByPrefix("diff-");
    }
    prevExpandedWorktree.current = expandedWorktreePath;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedWorktreePath]);

  // Navigation history
  useEffect(() => {
    if (!isNavAction.current) {
      nav.push(activeTab);
    }
    isNavAction.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ── Close warning for running AI sessions ──
  useEffect(() => {
    const cleanup = window.magentaIpc.onBeforeClose(() => {
      const count = useAISessionStore.getState().getRunningSessionCount();
      if (count > 0) {
        setCloseWarningCount(count);
      } else {
        window.magentaIpc.confirmClose();
      }
    });
    return cleanup;
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      // Capture current file tabs under the active (repo, spec) so they can be
      // restored on next launch. Without this, files opened after the last
      // spec/repo switch wouldn't be in the per-spec snapshot.
      if (activeRepoPath) {
        const captured = collectFileTabs();
        snapshots.saveSpecDockTabs(activeRepoPath, selectedSpecPath, captured);
      }
      snapshots.flush();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      snapshots.flush();
    };
  }, [snapshots, activeRepoPath, selectedSpecPath, collectFileTabs]);

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

  const handleOpenRefDiff = useCallback(
    (args: { repoPath: string; fromRef?: string; toRef: string; path: string; oldPath?: string }) => {
      const shortTo = args.toRef.slice(0, 7);
      const shortFrom = args.fromRef ? args.fromRef.slice(0, 7) : "∅";
      const fileName = args.path.split("/").pop() ?? args.path;
      const tabId = `refdiff-${args.toRef}-${args.path}`;
      // Route through the existing diff-viewer — same CodeMirror Merge UI
      // as working-tree diffs. Ref-mode is triggered by supplying both refs.
      openTab("center", {
        tabId,
        viewId: "diff-viewer",
        props: {
          repoPath: args.repoPath,
          filePath: args.path,
          fileStatus: "modified",
          fromRef: args.fromRef,
          toRef: args.toRef,
          oldPath: args.oldPath,
        },
        title: `${fileName} ${shortFrom}→${shortTo}`,
      });
    },
    [openTab]
  );

  const terminalCounter = useRef(0);

  const handleOpenAgentSession = useCallback(
    (session: AISessionRecord) => {
      const tabId = `agent-${session.id}`;
      // Use repo name as the base title so the branch label is the differentiator
      const title = session.repoName ?? session.title ?? `${session.provider} agent`;
      const branchLabel = session.worktreeName ?? session.branch ?? null;
      openTab("center", {
        tabId,
        viewId: "agent-session",
        props: {
          aiSessionId: session.id,
          aiProvider: session.provider,
          cwd: session.cwd,
          branchLabel,
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

  const handleDuplicateTab = useCallback(
    async (tab: TabState) => {
      if (tab.viewId !== "agent-session") return;
      const sessionId = tab.props?.aiSessionId as string | undefined;
      if (!sessionId) return;

      // Look up the existing session to copy its config
      const sessions = useAISessionStore.getState().sessions;
      const source = sessions.find((s) => s.id === sessionId);
      if (!source) return;

      const newSession = await useAISessionStore.getState().createSession(
        {
          provider: source.provider,
          repoPath: source.repoPath ?? undefined,
          branch: source.branch ?? undefined,
          worktreePath: source.worktreePath ?? undefined,
          permissionMode: source.permissionMode,
        },
        80,
        24
      );

      handleOpenAgentSession(newSession);
    },
    [handleOpenAgentSession]
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
    "md-file-tree": {
      onOpenFile: handleOpenFile,
    },
    "ai-sessions": {
      repoPath: activeRepoPath ?? undefined,
      repoName,
      onOpenAgentSession: handleOpenAgentSession,
      onOpenTerminalSession: handleOpenTerminalSession,
    },
    "git-changes-center": {
      onOpenDiff: handleOpenDiff,
      onOpenRefDiff: handleOpenRefDiff,
    },
  };

  return (
    <>
      <OnboardDialogManager />
      <CliUpgradeDialog />
      {closeWarningCount > 0 && (
        <CloseWarningDialog
          runningCount={closeWarningCount}
          onCancel={() => {
            setCloseWarningCount(0);
            window.magentaIpc.cancelClose();
          }}
          onForceQuit={() => {
            setCloseWarningCount(0);
            window.magentaIpc.confirmClose();
          }}
        />
      )}
      <SettingsDialog isOpen={showSettings} onClose={() => setShowSettings(false)} />
      <NewSessionDialog
        open={newSessionDialogOpen}
        onClose={() => setNewSessionDialogOpen(false)}
        onSessionCreated={handleOpenAgentSession}
        repoPath={activeRepoPath ?? undefined}
        repoName={repoName}
      />
      <DockManager
        onDuplicateTab={handleDuplicateTab}
        titleBar={
          <TitleBar
            sidebarCollapsed={leftCollapsed}
            activityCollapsed={rightCollapsed}
            hasActivity={hasRightSidebar}
            onToggleSidebar={handleToggleSidebar}
            onToggleActivity={handleToggleActivity}
            canGoBack={nav.canGoBack}
            canGoForward={nav.canGoForward}
            onGoBack={handleGoBack}
            onGoForward={handleGoForward}
            activeTab={titleBarActiveTab}
            onSelectBuiltinTab={handleSelectBuiltinTab}
            onNewSession={handleNewSession}
            builtinsDisabled={titleBarBuiltinsDisabled}
          />
        }
        viewProps={viewProps}
        onSettingsClick={() => setShowSettings(true)}
        statusBar={<StatusBar onShowRunningSessions={() => { setMainView("ai-sessions"); handleSelectBuiltinTab("ai"); }} />}
      />
    </>
  );
}
