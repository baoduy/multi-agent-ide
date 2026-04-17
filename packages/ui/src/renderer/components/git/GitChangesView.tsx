import React, { useCallback, useState } from "react";
import { GitCommit, Download, ArrowDown, ArrowUp, Loader2, FolderPlus, Archive, Globe, RotateCcw } from "lucide-react";

import { colors } from "../../utils/colors";
import { sendOrThrow } from "../../services/ipcClient";
import { useRepoStore } from "../../store/repoStore";
import { RepoFileChanges } from "../activity/RepoFileChanges";
import { CommitDialog } from "../dialogs/CommitDialog";
import { CloneRepoDialog } from "../dialogs/CloneRepoDialog";
import { StashDialog } from "../dialogs/StashDialog";
import { RemoteDialog } from "../dialogs/RemoteDialog";
import { ResetConfirmDialog } from "../dialogs/ResetConfirmDialog";

type GitChangesViewProps = {
  repoPath?: string;
  onOpenDiff?: (filePath: string, fileStatus: string) => void;
  onOpenCommitComposer?: (repoPath: string) => void;
};

type BusyOp = null | "fetch" | "pull" | "push";

type ToastState = { kind: "success" | "error"; text: string } | null;

const spin: React.CSSProperties = { animation: "spin 1s linear infinite" };

export function GitChangesView({ repoPath, onOpenDiff, onOpenCommitComposer }: GitChangesViewProps): React.ReactElement {
  const repos = useRepoStore((s) => s.repos);
  const fetchRepos = useRepoStore((s) => s.fetchRepos);
  const [busy, setBusy] = useState<BusyOp>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [showCommit, setShowCommit] = useState(false);
  const [showClone, setShowClone] = useState(false);
  const [showStash, setShowStash] = useState(false);
  const [showRemotes, setShowRemotes] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const repo = repoPath ? repos.find((r) => r.path === repoPath) : undefined;
  const currentBranch = repo?.branch ?? "";

  const showToast = useCallback((kind: "success" | "error", text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const runOp = useCallback(async (op: Exclude<BusyOp, null>) => {
    if (!repoPath) return;
    setBusy(op);
    try {
      let message = "";
      if (op === "fetch") {
        const res = await sendOrThrow({ type: "git:fetch", repoPath });
        message = res.message;
      } else if (op === "pull") {
        const res = await sendOrThrow({ type: "git:pull", repoPath });
        message = res.message;
      } else {
        const res = await sendOrThrow({ type: "git:push", repoPath });
        message = res.message;
      }
      await fetchRepos();
      showToast("success", message);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [repoPath, fetchRepos, showToast]);

  const handleCommit = useCallback(() => {
    if (!repoPath) return;
    if (onOpenCommitComposer) onOpenCommitComposer(repoPath);
    else setShowCommit(true);
  }, [repoPath, onOpenCommitComposer]);

  if (!repoPath) {
    return (
      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ color: colors.textTertiary, fontSize: 12 }}>
          No repository selected.
        </div>
        <div>
          <ActionButton
            icon={<FolderPlus size={12} strokeWidth={2} />}
            label="Clone repository…"
            onClick={() => setShowClone(true)}
          />
        </div>
        {showClone && <CloneRepoDialog onClose={() => setShowClone(false)} />}
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <ActionButton icon={<GitCommit size={12} strokeWidth={2} />} label="Commit" onClick={handleCommit} primary />
        <ActionButton icon={<FolderPlus size={12} strokeWidth={2} />} label="Clone…" onClick={() => setShowClone(true)} />
        <ActionButton icon={busy === "fetch" ? <Loader2 size={12} style={spin} /> : <Download size={12} strokeWidth={2} />} label="Fetch" onClick={() => runOp("fetch")} disabled={busy !== null} />
        <ActionButton icon={busy === "pull" ? <Loader2 size={12} style={spin} /> : <ArrowDown size={12} strokeWidth={2} />} label="Pull" onClick={() => runOp("pull")} disabled={busy !== null} />
        <ActionButton icon={busy === "push" ? <Loader2 size={12} style={spin} /> : <ArrowUp size={12} strokeWidth={2} />} label="Push" onClick={() => runOp("push")} disabled={busy !== null} />
        <ActionButton icon={<Archive size={12} strokeWidth={2} />} label="Stash" onClick={() => setShowStash(true)} />
        <ActionButton icon={<Globe size={12} strokeWidth={2} />} label="Remotes" onClick={() => setShowRemotes(true)} />
        <ActionButton icon={<RotateCcw size={12} strokeWidth={2} />} label="Reset…" onClick={() => setShowReset(true)} />
      </div>

      {toast && (
        <div
          style={{
            fontSize: 11,
            color: toast.kind === "error" ? colors.error : colors.successText,
            background: toast.kind === "error" ? colors.errorSoft : colors.successSoft,
            border: `1px solid ${toast.kind === "error" ? colors.errorSoftBorder : colors.successSoftBorder}`,
            borderRadius: 4,
            padding: "4px 8px",
            lineHeight: 1.4,
          }}
        >
          {toast.text}
        </div>
      )}

      <RepoFileChanges repoPath={repoPath} onOpenDiff={onOpenDiff} />

      {showCommit && (
        <CommitDialog
          repoPath={repoPath}
          currentBranch={currentBranch}
          onClose={() => setShowCommit(false)}
        />
      )}

      {showClone && <CloneRepoDialog onClose={() => setShowClone(false)} />}

      {showStash && (
        <StashDialog repoPath={repoPath} onClose={() => setShowStash(false)} />
      )}

      {showRemotes && (
        <RemoteDialog repoPath={repoPath} onClose={() => setShowRemotes(false)} />
      )}

      {showReset && (
        <ResetConfirmDialog repoPath={repoPath} onClose={() => setShowReset(false)} />
      )}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}): React.ReactElement {
  const [hover, setHover] = useState(false);
  const bg = primary
    ? (disabled ? colors.textTertiary : colors.primary)
    : (hover && !disabled ? colors.bgHover : "transparent");
  const fg = primary ? colors.textWhite : colors.text;
  const border = primary ? "none" : `1px solid ${colors.border}`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 9px",
        fontSize: 11,
        fontWeight: 600,
        color: fg,
        background: bg,
        border,
        borderRadius: 5,
        cursor: disabled ? "default" : "pointer",
        fontFamily: "inherit",
      }}
    >
      {icon}
      {label}
    </button>
  );
}
