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
  Workflow,
  Bot,
  FileCode,
  List,
  Terminal,
} from "lucide-react";
import { viewRegistry } from "./ViewRegistry";

// Existing panel components (lazy references — imported at registration time)
import { Sidebar } from "../sidebar/Sidebar";
import { SpecTree } from "../sidebar/SpecTree";
import { SpecFileList } from "../activity/SpecFileList";
import { RepoFileChanges } from "../activity/RepoFileChanges";
import { SpecsListView } from "../main/SpecsListView";
import { useRepoStore } from "../../store/repoStore";
import { SessionCoordinator } from "../../services/SessionCoordinator";
import { WorktreesView } from "../main/WorktreesView";
import { WorkflowView } from "../main/WorkflowView";
import { FileViewer } from "../main/FileViewer";
import { AISessionsView } from "../ai-terminal/AISessionsView";
import { MagentaTerminal } from "../common/MagentaTerminal";
import { useSpecStore } from "../../store/specStore";
import { colors } from "../../utils/colors";

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
      <div style={{ padding: "12px 16px", color: colors.textTertiary, fontSize: 12 }}>
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

/* ── Right Sidebar: Repo File Changes ── */

function RepoChangesView(props: {
  repoPath?: string;
  worktreePath?: string | null;
  onOpenFile?: (filePath: string) => void;
}): React.ReactElement {
  if (!props.repoPath) {
    return (
      <div style={{ padding: "12px 16px", color: colors.textTertiary, fontSize: 12 }}>
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
  const selectedSpec = specs.find((s) => s.path === selectedSpecPath) ?? null;

  if (!selectedSpec || selectedSpec.files.length === 0) {
    return (
      <div style={{ padding: "12px 16px", color: colors.textTertiary, fontSize: 12 }}>
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
    return <div style={{ padding: 20, color: "#999" }}>No file selected</div>;
  }
  return <FileViewer filePath={props.filePath} repoPath={props.repoPath} />;
}

/* ── Session Views (multi-instance, opened as center tabs) ── */

function AgentSessionTabView(props: {
  aiSessionId?: string;
  aiProvider?: "claude" | "copilot";
  cwd?: string;
  isVisible?: boolean;
}): React.ReactElement {
  if (!props.aiSessionId || !props.aiProvider) {
    return <div style={{ padding: 20, color: "#999" }}>No session selected</div>;
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
  });

  viewRegistry.register({
    id: "specs",
    title: "Specs",
    icon: <FileText size={14} strokeWidth={1.5} />,
    component: SpecsSidebarView,
    defaultLocation: "left",
    closable: false,
    keepAlive: true,
    activityGroup: "primary",
    activityOrder: 2,
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
  });

  viewRegistry.register({
    id: "spec-files",
    title: "Spec Files",
    icon: <FileText size={14} strokeWidth={1.5} />,
    component: SpecFilesView,
    defaultLocation: "right",
    closable: false,
    keepAlive: true,
    activityGroup: "primary",
    activityOrder: 4,
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

}
