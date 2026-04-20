/**
 * registerViews — registers all existing panels as DockView descriptors.
 *
 * Called once at app startup before DockManager renders.
 * Each existing panel component is wrapped as a view descriptor
 * with its default dock location, icon, and metadata.
 */

import React from "react";
import {
  FolderGit2,
  FileText,
  GitBranch,
  GitCompareArrows,
  GitCommit,
  Workflow,
  Bot,
  FileCode,
  List,
  Terminal,
  ScrollText,
  BookText,
  ToolCase,
  Boxes,
  LayoutGrid,
  SquareCheckBig,
  Info,
} from "lucide-react";
import { viewRegistry } from "./ViewRegistry";

// Existing panel components (lazy references — imported at registration time)
import { Sidebar } from "../sidebar/Sidebar";
import { MarkdownFileTree } from "../sidebar/MarkdownFileTree";
import { SpecTree } from "../sidebar/SpecTree";
import { SpecFileList } from "../activity/SpecFileList";
import { RepoFileChanges } from "../activity/RepoFileChanges";
import { SpecsListView } from "../main/SpecsListView";
import { useRepoStore } from "../../store/repoStore";
import { SessionCoordinator } from "../../services/SessionCoordinator";
import { WorktreesView } from "../main/WorktreesView";
import { WorkflowView } from "../main/WorkflowView";
import { FileViewer } from "../main/FileViewer";
import { DiffViewer } from "../main/DiffViewer";
import { AISessionsView } from "../ai-terminal/AISessionsView";
import { MagentaTerminal } from "../common/MagentaTerminal";
import { LogViewer } from "../common/LogViewer";
import { useSpecStore } from "../../store/specStore";
import { colors } from "../../utils/colors";
import { GitChangesView } from "../git/GitChangesView";
import { CommitComposerTab } from "../git/CommitComposerTab";
import { ExtensionsNavView } from "../extensions/ExtensionsNavView";
import { ExtensionsSummaryView } from "../extensions/ExtensionsSummaryView";
import { ExtensionsBrowserView } from "../extensions/ExtensionsBrowserView";
import { ExtensionInspectorView } from "../extensions/ExtensionInspectorView";

/**
 * Thin wrapper components that adapt existing panels to the DockView system.
 * These receive props via the viewProps mechanism in DockManager.
 */

// Sidebar renders just the repo list + search (specs split into own view)
function ReposSidebarView(): React.ReactElement {
  return <Sidebar />;
}

/* ── Left Sidebar: Specs Tree ── */

function SpecsSidebarView(): React.ReactElement {
  const activeRepoPath = useRepoStore((state) => state.activeRepoPath);
  const specs = useSpecStore((state) => state.specs);
  const selectedSpecPath = useSpecStore((state) => state.selectedSpecPath);
  const isLoading = useSpecStore((state) => state.isLoading);

  const handleSelectSpec = React.useCallback((specPath: string) => {
    SessionCoordinator.selectSpec(specPath);
  }, []);

  if (!activeRepoPath) {
    return (
      <div style={{ padding: "8px 12px", color: colors.textTertiary, fontSize: 11 }}>
        Select a repository to see specs.
      </div>
    );
  }

  return (
    <SpecTree
      specs={specs}
      isLoading={isLoading}
      selectedSpecPath={selectedSpecPath}
      onSelectSpec={handleSelectSpec}
    />
  );
}

/* ── Left Sidebar: Markdown File Tree ── */

function MarkdownFileTreeView(props: {
  onOpenFile?: (filePath: string) => void;
}): React.ReactElement {
  return <MarkdownFileTree onOpenFile={props.onOpenFile} />;
}

/* ── Git Management: Repositories ── */

function GitReposSidebarView(): React.ReactElement {
  // Reuse the existing Sidebar — same repo list, same behavior.
  return <Sidebar />;
}

/* ── Git Management: Working tree changes + push/pull/fetch/commit buttons ── */

function GitChangesCenterView(props: {
  onOpenDiff?: (filePath: string, fileStatus: string) => void;
  onOpenRefDiff?: (args: { repoPath: string; fromRef?: string; toRef: string; path: string; oldPath?: string }) => void;
  onOpenCommitComposer?: (repoPath: string) => void;
}): React.ReactElement {
  const activeRepoPath = useRepoStore((state) => state.activeRepoPath);
  return (
    <GitChangesView
      repoPath={activeRepoPath ?? undefined}
      onOpenDiff={props.onOpenDiff}
      onOpenRefDiff={props.onOpenRefDiff}
      onOpenCommitComposer={props.onOpenCommitComposer}
    />
  );
}

/* ── Git Management: Commit composer center tab ── */

function CommitComposerTabView(props: {
  repoPath?: string;
}): React.ReactElement {
  const activeRepoPath = useRepoStore((state) => state.activeRepoPath);
  return <CommitComposerTab repoPath={props.repoPath ?? activeRepoPath ?? undefined} />;
}

/* ── Right Sidebar: Repo File Changes ── */

function RepoChangesView(props: {
  repoPath?: string;
  worktreePath?: string | null;
  onOpenFile?: (filePath: string) => void;
  onOpenDiff?: (filePath: string, fileStatus: string) => void;
}): React.ReactElement {
  if (!props.repoPath) {
    return (
      <div style={{ padding: "8px 12px", color: colors.textTertiary, fontSize: 11 }}>
        No repository selected.
      </div>
    );
  }
  return (
    <div style={{ padding: "8px 12px" }}>
      <RepoFileChanges
        repoPath={props.repoPath}
        worktreePath={props.worktreePath}
        onOpenFile={props.onOpenFile}
        onOpenDiff={props.onOpenDiff}
      />
    </div>
  );
}

/* ── Right Sidebar: Spec Files ── */

function SpecFilesView(props: {
  onOpenFile?: (filePath: string) => void;
}): React.ReactElement {
  const selectedSpecPath = useSpecStore((state) => state.selectedSpecPath);
  const specs = useSpecStore((state) => state.specs);
  const selectedSpec = React.useMemo(
    () => specs.find((s) => s.path === selectedSpecPath) ?? null,
    [specs, selectedSpecPath],
  );

  if (!selectedSpec || selectedSpec.files.length === 0) {
    return (
      <div style={{ padding: "8px 12px", color: colors.textTertiary, fontSize: 11 }}>
        {selectedSpec ? "No files in this spec." : "No spec selected."}
      </div>
    );
  }
  return (
    <div style={{ padding: "8px 12px" }}>
      <SpecFileList files={selectedSpec.files} onOpenFile={props.onOpenFile} />
    </div>
  );
}

function SpecsListTabView(props: {
  specs?: any[];
  selectedSpecPath?: string | null;
  onSelectSpec?: (path: string) => void;
  onOpenSpec?: (path: string) => void;
}): React.ReactElement {
  return (
    <SpecsListView
      specs={props.specs ?? []}
      selectedSpecPath={props.selectedSpecPath ?? null}
      onSelectSpec={props.onSelectSpec ?? (() => {})}
      onOpenSpec={props.onOpenSpec ?? (() => {})}
    />
  );
}

function WorktreesTabView(props: {
  repoName?: string | null;
  onOpenFile?: (filePath: string) => void;
}): React.ReactElement {
  return (
    <WorktreesView
      repoName={props.repoName ?? null}
      onOpenFile={props.onOpenFile ?? (() => {})}
    />
  );
}

function WorkflowTabView(props: {
  spec?: any;
  repoName?: string | null;
  repoPath?: string;
  onOpenFile?: (filePath: string) => void;
  onSpecChanged?: () => void;
}): React.ReactElement {
  return (
    <WorkflowView
      spec={props.spec ?? null}
      repoName={props.repoName ?? null}
      repoPath={props.repoPath}
      onOpenFile={props.onOpenFile ?? (() => {})}
      onSpecChanged={props.onSpecChanged ?? (() => {})}
    />
  );
}

function AISessionsTabView(props: {
  repoPath?: string;
  repoName?: string | null;
  onOpenAgentSession?: (session: any) => void;
  onOpenTerminalSession?: (cwd: string) => void;
}): React.ReactElement {
  return (
    <AISessionsView
      repoPath={props.repoPath}
      repoName={props.repoName ?? null}
      onOpenAgentSession={props.onOpenAgentSession}
      onOpenTerminalSession={props.onOpenTerminalSession}
    />
  );
}

function FileViewerTabView(props: {
  filePath?: string;
  repoPath?: string;
}): React.ReactElement {
  if (!props.filePath) {
    return <div style={{ padding: 12, color: colors.textTertiary, fontSize: 11 }}>No file selected</div>;
  }
  return <FileViewer filePath={props.filePath} repoPath={props.repoPath} />;
}

function DiffViewerTabView(props: {
  filePath?: string;
  repoPath?: string;
  fileStatus?: string;
}): React.ReactElement {
  if (!props.filePath || !props.repoPath) {
    return <div style={{ padding: 12, color: colors.textTertiary, fontSize: 11 }}>No file selected</div>;
  }
  return (
    <DiffViewer
      filePath={props.filePath}
      repoPath={props.repoPath}
      fileStatus={props.fileStatus ?? "modified"}
    />
  );
}

/* ── Session Views (multi-instance, opened as center tabs) ── */

function AgentSessionTabView(props: {
  aiSessionId?: string;
  aiProvider?: "claude" | "copilot";
  cwd?: string;
  isVisible?: boolean;
}): React.ReactElement {
  if (!props.aiSessionId || !props.aiProvider) {
    return <div style={{ padding: 12, color: colors.textTertiary, fontSize: 11 }}>No session selected</div>;
  }
  return (
    <MagentaTerminal
      readonly={false}
      cwd={props.cwd}
      mode="ai-agent"
      aiSessionId={props.aiSessionId}
      aiProvider={props.aiProvider}
      maxHeight={undefined}
      fontSize={12}
      fontFamily="'SF Mono', 'Fira Code', ui-monospace, monospace"
      enableTabs={false}
      isVisible={props.isVisible !== false}
    />
  );
}

function TerminalSessionTabView(props: {
  cwd?: string;
  isVisible?: boolean;
}): React.ReactElement {
  return (
    <MagentaTerminal
      readonly={false}
      cwd={props.cwd}
      mode="shell"
      maxHeight={undefined}
      fontSize={12}
      fontFamily="'SF Mono', 'Fira Code', ui-monospace, monospace"
      enableTabs={false}
      isVisible={props.isVisible !== false}
    />
  );
}

function LogViewerTabView(): React.ReactElement {
  return <LogViewer />;
}

/* ── Bottom Panel Views ── */

/**
 * Register all views. Call this once during app initialization.
 */
export function registerAllViews(): void {
  // ── Left Sidebar Views ──

  viewRegistry.register({
    id: "repos",
    title: "Repositories",
    icon: <FolderGit2 size={20} strokeWidth={1.5} />,
    component: ReposSidebarView,
    defaultLocation: "left",
    closable: false,
    keepAlive: true,
    activityGroup: "primary",
    activityOrder: 1,
    searchable: true,
    searchPlaceholder: "Search repositories…",
  });

  viewRegistry.register({
    id: "specs",
    title: "Specs",
    icon: <ToolCase size={14} strokeWidth={1.5} />,
    component: SpecsSidebarView,
    defaultLocation: "left",
    closable: false,
    keepAlive: true,
    activityGroup: "primary",
    activityOrder: 2,
    searchable: true,
    searchPlaceholder: "Search specs…",
  });

  viewRegistry.register({
    id: "md-file-tree",
    title: "Markdown Files",
    icon: <BookText size={20} strokeWidth={1.5} />,
    component: MarkdownFileTreeView,
    defaultLocation: "left",
    closable: false,
    keepAlive: true,
    activityGroup: "primary",
    activityOrder: 10,
    searchable: true,
    searchPlaceholder: "Filter markdown files…",
  });

  // ── Git Management views (Phase 1) ──

  viewRegistry.register({
    id: "git-repos",
    title: "Repositories",
    icon: <FolderGit2 size={20} strokeWidth={1.5} />,
    component: GitReposSidebarView,
    defaultLocation: "left",
    closable: false,
    keepAlive: true,
    activityGroup: "primary",
    activityOrder: 20,
    searchable: true,
    searchPlaceholder: "Search repositories…",
  });

  viewRegistry.register({
    id: "git-changes-center",
    title: "Changes",
    icon: <GitBranch size={14} strokeWidth={1.8} />,
    component: GitChangesCenterView,
    defaultLocation: "center",
    closable: false,
    keepAlive: true,
  });

  viewRegistry.register({
    id: "git-commit-composer",
    title: "Commit",
    icon: <GitCommit size={14} strokeWidth={1.8} />,
    component: CommitComposerTabView,
    defaultLocation: "center",
    canHaveMultiple: true,
    closable: true,
    keepAlive: false,
  });

  // ── Right Sidebar Views ──

  viewRegistry.register({
    id: "repo-changes",
    title: "Changes",
    icon: <GitCompareArrows size={14} strokeWidth={1.5} />,
    component: RepoChangesView,
    defaultLocation: "right",
    closable: false,
    keepAlive: true,
    activityGroup: "primary",
    activityOrder: 3,
    searchable: true,
    searchPlaceholder: "Search changes…",
  });

  viewRegistry.register({
    id: "spec-files",
    title: "Spec Files",
    icon: <ToolCase size={14} strokeWidth={1.5} />,
    component: SpecFilesView,
    defaultLocation: "right",
    closable: false,
    keepAlive: true,
    activityGroup: "primary",
    activityOrder: 4,
    searchable: true,
    searchPlaceholder: "Search files…",
  });

  // ── Center Tab Views ──

  viewRegistry.register({
    id: "specs-list",
    title: "Specs",
    icon: <List size={14} strokeWidth={1.8} />,
    component: SpecsListTabView,
    defaultLocation: "center",
    closable: false,
    keepAlive: true,
  });

  viewRegistry.register({
    id: "workflow",
    title: "Workflow",
    icon: <Workflow size={14} strokeWidth={1.8} />,
    component: WorkflowTabView,
    defaultLocation: "center",
    closable: false,
    keepAlive: true,
  });

  viewRegistry.register({
    id: "worktrees",
    title: "Worktrees",
    icon: <GitBranch size={14} strokeWidth={1.8} />,
    component: WorktreesTabView,
    defaultLocation: "center",
    closable: false,
    keepAlive: true,
  });

  viewRegistry.register({
    id: "ai-sessions",
    title: "AI Sessions",
    icon: <Bot size={14} strokeWidth={1.8} />,
    component: AISessionsTabView,
    defaultLocation: "center",
    closable: false,
    keepAlive: true,
  });

  viewRegistry.register({
    id: "file-viewer",
    title: "File",
    icon: <FileCode size={14} strokeWidth={1.8} />,
    component: FileViewerTabView,
    defaultLocation: "center",
    canHaveMultiple: true,
    closable: true,
    keepAlive: false,
  });

  viewRegistry.register({
    id: "diff-viewer",
    title: "Diff",
    icon: <GitCompareArrows size={14} strokeWidth={1.8} />,
    component: DiffViewerTabView,
    defaultLocation: "center",
    canHaveMultiple: true,
    closable: true,
    keepAlive: false,
  });

  // ── Session Views (multi-instance center tabs) ──

  viewRegistry.register({
    id: "agent-session",
    title: "Agent",
    icon: <Bot size={14} strokeWidth={1.8} />,
    component: AgentSessionTabView,
    defaultLocation: "center",
    canHaveMultiple: true,
    closable: true,
    keepAlive: true,
  });

  viewRegistry.register({
    id: "terminal-session",
    title: "Terminal",
    icon: <Terminal size={14} strokeWidth={1.8} />,
    component: TerminalSessionTabView,
    defaultLocation: "center",
    canHaveMultiple: true,
    closable: true,
    keepAlive: true,
  });

  // ── Extensions Manager views (mockup phase) ──

  viewRegistry.register({
    id: "extensions-nav",
    title: "Scope",
    icon: <Boxes size={20} strokeWidth={1.5} />,
    component: ExtensionsNavView,
    defaultLocation: "left",
    closable: false,
    keepAlive: true,
    activityGroup: "primary",
    activityOrder: 30,
  });

  viewRegistry.register({
    id: "extensions-summary",
    title: "Summary",
    icon: <LayoutGrid size={14} strokeWidth={1.5} />,
    component: ExtensionsSummaryView,
    defaultLocation: "left",
    closable: false,
    keepAlive: true,
  });

  viewRegistry.register({
    id: "extensions-browser",
    title: "Extensions",
    icon: <SquareCheckBig size={14} strokeWidth={1.8} />,
    component: ExtensionsBrowserView,
    defaultLocation: "center",
    closable: false,
    keepAlive: true,
  });

  viewRegistry.register({
    id: "extensions-inspector",
    title: "Inspector",
    icon: <Info size={14} strokeWidth={1.5} />,
    component: ExtensionInspectorView,
    defaultLocation: "right",
    closable: false,
    keepAlive: true,
  });

  // ── Bottom Panel Views ──

  viewRegistry.register({
    id: "log-viewer",
    title: "Log",
    icon: <ScrollText size={14} strokeWidth={1.8} />,
    component: LogViewerTabView,
    defaultLocation: "bottom",
    canHaveMultiple: false,
    closable: true,
    keepAlive: false,
  });

}
