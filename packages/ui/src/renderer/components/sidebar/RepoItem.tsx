import React, { useCallback, useState } from "react";
import {
  Star, Clipboard, Rocket, ArrowUpCircle, RefreshCw, GitFork,
  GitBranch, ArrowDown, ArrowUp, Download, GitCommit,
} from "lucide-react";

import type { Repository } from "@magenta/shared/models";
import { ContextMenu, useContextMenu } from "../common/ContextMenu";
import type { ContextMenuAction } from "../common/ContextMenu";
import { RepoLabel, BranchLabel } from "../common/RepoLabel";
import { openInVscode } from "../../utils/ipc";
import { VsCodeIcon } from "../common/VsCodeIcon";
import { sendOrThrow } from "../../services/ipcClient";
import { useOnboardStore } from "../../store/onboardStore";
import { useRepoStore } from "../../store/repoStore";
import { BranchSwitcherDialog } from "../dialogs/BranchSwitcherDialog";
import { CreateBranchOrWorktreeDialog, type CreateKind } from "../dialogs/CreateBranchOrWorktreeDialog";
import { CommitDialog } from "../dialogs/CommitDialog";
import { getRepoBadge } from "../../utils/repoBadge";
import { colors } from "../../utils/colors";
import { Tag } from "../common/Tag";

/* ── RepoItem ── */

type RepoItemProps = {
  repo: Repository;
  active: boolean;
  pinned: boolean;
  onSelect: (repoPath: string) => void;
  onTogglePin: (repoPath: string) => void;
};

export function RepoItem({ repo, active, pinned, onSelect, onTogglePin }: RepoItemProps): React.ReactElement {
  const badge = getRepoBadge(repo);
  const [hovered, setHovered] = useState(false);
  const [showBranchSwitcher, setShowBranchSwitcher] = useState(false);
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  /** Unified create dialog — null means hidden; otherwise the mode. */
  const [createDialogKind, setCreateDialogKind] = useState<CreateKind | null>(null);
  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();

  const startProcess = useOnboardStore((s) => s.startProcess);
  const setDialogOpen = useOnboardStore((s) => s.setDialogOpen);
  const existingProcess = useOnboardStore((s) => s.processes[repo.path]);
  const fetchRepos = useRepoStore((s) => s.fetchRepos);

  /** Fire-and-forget git action with post-action repo refresh. */
  const gitAction = useCallback(async (
    request: { type: "git:fetch"; repoPath: string; remote?: string }
      | { type: "git:pull"; repoPath: string; remote?: string; branch?: string }
      | { type: "git:push"; repoPath: string; remote?: string; branch?: string; force?: boolean },
  ) => {
    try {
      await sendOrThrow(request);
      await fetchRepos();
    } catch (err) {
      // Surface errors via console — the daemon already normalises them via AppError.
      // A future iteration can use a toast/notification system.
      console.error(`[git] ${request.type} failed:`, err instanceof Error ? err.message : err);
    }
  }, [fetchRepos]);

  // Git submenu — branch management, worktree, and sync operations grouped together.
  // "Create Worktree" sits next to "Create Branch" because they're both create-new actions.
  const gitSubmenu: ContextMenuAction[] = [
    {
      label: "Commit...",
      Icon: GitCommit,
      action: () => setShowCommitDialog(true),
    },
    {
      label: "Switch Branch...",
      Icon: GitBranch,
      separator: true,
      action: () => setShowBranchSwitcher(true),
    },
    {
      label: "Create Branch...",
      Icon: GitBranch,
      action: () => setCreateDialogKind("branch"),
    },
    {
      label: "Create Worktree...",
      Icon: GitFork,
      action: () => setCreateDialogKind("worktree"),
    },
    {
      label: "Pull",
      Icon: ArrowDown,
      separator: true,
      action: () => void gitAction({ type: "git:pull", repoPath: repo.path }),
    },
    {
      label: "Push",
      Icon: ArrowUp,
      action: () => void gitAction({ type: "git:push", repoPath: repo.path }),
    },
    {
      label: "Fetch",
      Icon: Download,
      action: () => void gitAction({ type: "git:fetch", repoPath: repo.path }),
    },
  ];

  const ctxItems: ContextMenuAction[] = [
    {
      label: pinned ? "Unpin repository" : "Pin to top",
      Icon: Star,
      action: () => onTogglePin(repo.path),
    },
    {
      label: "Open with Code",
      Icon: VsCodeIcon,
      action: () => void openInVscode(repo.path),
    },
    {
      label: "Copy path",
      Icon: Clipboard,
      action: () => void navigator.clipboard.writeText(repo.path),
    },
    {
      label: "Git",
      Icon: GitBranch,
      separator: true,
      submenu: gitSubmenu,
    },
  ];

  // Force reload: rescan repo + refresh spec info
  ctxItems.push({
    label: "Refresh",
    Icon: RefreshCw,
    separator: true,
    action: () => {
      void sendOrThrow({ type: "repo:force-reload", repoPath: repo.path });
    },
  });

  // Show "Onboard to Specify" or "Upgrade Specify" last
  if (!repo.hasSpecs) {
    ctxItems.push({
      label: existingProcess?.phase === "running"
        ? "View Onboarding..."
        : "Onboard to Specify",
      Icon: Rocket,
      action: () => {
        if (existingProcess) {
          setDialogOpen(repo.path, true);
        } else {
          startProcess("onboard", repo.path, repo.name);
        }
      },
    });
  } else {
    ctxItems.push({
      label: existingProcess?.phase === "running"
        ? "View Upgrade..."
        : "Upgrade Specify",
      Icon: ArrowUpCircle,
      action: () => {
        if (existingProcess) {
          setDialogOpen(repo.path, true);
        } else {
          startProcess("upgrade", repo.path, repo.name);
        }
      },
    });
  }

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "stretch",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={() => onSelect(repo.path)}
        onContextMenu={openContextMenu}
        style={{
          flex: 1,
          textAlign: "left",
          border: "none",
          borderLeft: active ? `2px solid ${colors.primary}` : "2px solid transparent",
          background: active ? colors.bgHover : hovered ? colors.bgCodeInline : "transparent",
          padding: "4px 28px 4px 8px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          transition: "background 0.12s",
        }}
      >
        <RepoLabel name={repo.name} size="md" boxed style={{ flex: 1, minWidth: 0 }}>
          <Tag tone={badge.tone} size="xs" fontWeight={500}>
            {badge.label}
          </Tag>
          {/* Current branch — read-only tag */}
          <BranchLabel name={repo.branch} size="xs" />
        </RepoLabel>
      </button>

      {/* Pin toggle */}
      {(hovered || pinned) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(repo.path);
          }}
          title={pinned ? "Unpin repository" : "Pin to top"}
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px 4px",
            borderRadius: 4,
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "center",
            color: pinned ? colors.primary : colors.borderMuted,
            transition: "color 0.12s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = colors.primary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = pinned ? colors.primary : colors.borderMuted;
          }}
        >
          <Star size={12} fill={pinned ? "currentColor" : "none"} strokeWidth={1.8} />
        </button>
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu position={contextMenu} items={ctxItems} onClose={closeContextMenu} />
      )}

      {/* Dialogs */}
      {showBranchSwitcher && (
        <BranchSwitcherDialog
          repoPath={repo.path}
          currentBranch={repo.branch}
          onClose={() => setShowBranchSwitcher(false)}
        />
      )}
      {createDialogKind && (
        <CreateBranchOrWorktreeDialog
          kind={createDialogKind}
          repoPath={repo.path}
          currentBranch={repo.branch}
          onClose={() => setCreateDialogKind(null)}
        />
      )}
      {showCommitDialog && (
        <CommitDialog
          repoPath={repo.path}
          currentBranch={repo.branch}
          onClose={() => setShowCommitDialog(false)}
        />
      )}
    </div>
  );
}
