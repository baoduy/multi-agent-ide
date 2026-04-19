import React, { useCallback, useEffect, useRef, useState } from "react";
import { GitCommit, Download, ArrowDown, ArrowUp, Loader2, FolderPlus, Archive, Globe, RotateCcw } from "lucide-react";

import { colors } from "../../utils/colors";
import { ipc } from "../../utils/ipc";
import { sendOrThrow } from "../../services/ipcClient";
import { useRepoStore } from "../../store/repoStore";
import { useGitHistoryStore } from "../../store/gitHistoryStore";
import { localStore } from "../../services/localStorage";
import { CommitDialog } from "../dialogs/CommitDialog";
import { CloneRepoDialog } from "../dialogs/CloneRepoDialog";
import { StashDialog } from "../dialogs/StashDialog";
import { RemoteDialog } from "../dialogs/RemoteDialog";
import { ResetConfirmDialog } from "../dialogs/ResetConfirmDialog";
import { ResizeHandle } from "../dock/ResizeHandle";
import { CommitGraphList, type SelectedRow } from "./CommitGraphList";
import { ChangedFilesPanel } from "./ChangedFilesPanel";

/* ── Persisted width for the left (graph) column so the user's preferred
 * graph-vs-files ratio survives reloads. Files panel always gets the
 * remaining width via flex: 1. ── */
const GRAPH_WIDTH_MIN = 260;
const GRAPH_WIDTH_MAX = 560;
const GRAPH_WIDTH_DEFAULT = 340;

const graphWidthStore = localStore<number>({
  key: "magenta:git-graph-width",
  fallback: GRAPH_WIDTH_DEFAULT,
  validate: (raw) => (typeof raw === "number" && Number.isFinite(raw) ? raw : undefined),
});

function clampGraphWidth(w: number): number {
  return Math.max(GRAPH_WIDTH_MIN, Math.min(GRAPH_WIDTH_MAX, Math.round(w)));
}

type GitChangesViewProps = {
  repoPath?: string;
  /** Open a working-tree diff tab (file vs HEAD) — reuses the existing diff-viewer. */
  onOpenDiff?: (filePath: string, fileStatus: string) => void;
  /** Open a ref-vs-ref diff tab for a commit-level file change (same diff-viewer, refs mode). */
  onOpenRefDiff?: (args: {
    repoPath: string;
    fromRef?: string;
    toRef: string;
    path: string;
    oldPath?: string;
  }) => void;
  onOpenCommitComposer?: (repoPath: string) => void;
};

type BusyOp = null | "fetch" | "pull" | "push";

type ToastState = { kind: "success" | "error"; text: string } | null;

const spin: React.CSSProperties = { animation: "spin 1s linear infinite" };

/** Delay before persisting a new graph width to localStorage. Resize drags
 *  fire many times per second; a trailing debounce keeps us off the
 *  synchronous storage path during the drag. */
const GRAPH_WIDTH_PERSIST_DEBOUNCE_MS = 200;

export function GitChangesView({ repoPath, onOpenDiff, onOpenRefDiff, onOpenCommitComposer }: GitChangesViewProps): React.ReactElement {
  const repos = useRepoStore((s) => s.repos);
  const fetchRepos = useRepoStore((s) => s.fetchRepos);
  const [busy, setBusy] = useState<BusyOp>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [showCommit, setShowCommit] = useState(false);
  const [showClone, setShowClone] = useState(false);
  const [showStash, setShowStash] = useState(false);
  const [showRemotes, setShowRemotes] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [selected, setSelected] = useState<SelectedRow>({ kind: "working" });
  const [workingTreeCount, setWorkingTreeCount] = useState<number | null>(null);
  const [graphWidth, setGraphWidth] = useState<number>(() => clampGraphWidth(graphWidthStore.get()));
  const graphWidthRef = useRef(graphWidth);
  graphWidthRef.current = graphWidth;

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleResize = useCallback((delta: number) => {
    const next = clampGraphWidth(graphWidthRef.current + delta);
    graphWidthRef.current = next;
    setGraphWidth(next);
    // Trailing-debounce the storage write so drags don't thrash sync I/O.
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      graphWidthStore.set(graphWidthRef.current);
    }, GRAPH_WIDTH_PERSIST_DEBOUNCE_MS);
  }, []);

  const handleResizeEnd = useCallback(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    graphWidthStore.set(graphWidthRef.current);
  }, []);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

  const repo = repoPath ? repos.find((r) => r.path === repoPath) : undefined;
  const currentBranch = repo?.branch ?? "";

  // ── Keep the Uncommitted row's badge in sync with `git status` ────────
  //
  // The daemon's `GitRepoWatcher` fires `git:repo:changed` within ~150 ms of
  // any `.git/` write (index, HEAD, refs), so the UI no longer polls. The
  // `busy` dependency still triggers a one-shot refresh after fetch to pick
  // up submodule-surfaced changes, and `repo:force-reload:started` (emitted
  // by commit/pull/reset handlers) remains as a belt-and-braces signal.
  const refreshStatus = useCallback(async () => {
    if (!repoPath) return;
    try {
      const res = await sendOrThrow({ type: "git:status", repoPath });
      setWorkingTreeCount(res.files.length);
    } catch {
      // silent — the panel below surfaces errors
    }
  }, [repoPath]);

  useEffect(() => {
    if (!repoPath) { setWorkingTreeCount(null); return; }
    // Initial load + re-fetch when `busy` transitions (end of fetch/pull/push).
    void refreshStatus();
  }, [repoPath, busy, refreshStatus]);

  useEffect(() => {
    if (!repoPath) return;
    const offForce = ipc.on("repo:force-reload:started", (payload) => {
      if (payload.repoPath !== repoPath) return;
      void refreshStatus();
      void useGitHistoryStore.getState().refresh({ repoPath });
    });
    const offChanged = ipc.on("git:repo:changed", (payload) => {
      if (payload.repoPath !== repoPath) return;
      // index → working-tree status; ref/head → commit history moved.
      if (payload.kinds.includes("index")) void refreshStatus();
      if (payload.kinds.includes("ref") || payload.kinds.includes("head")) {
        void useGitHistoryStore.getState().refresh({ repoPath });
      }
    });
    return () => { offForce(); offChanged(); };
  }, [repoPath, refreshStatus]);

  // ── Reset selection when the active repo changes ─────────────────────
  useEffect(() => {
    setSelected({ kind: "working" });
  }, [repoPath]);

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
      <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ color: colors.textTertiary, fontSize: 11 }}>
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          gap: 4,
          flexWrap: "wrap",
          padding: "4px 8px",
          borderBottom: `1px solid ${colors.borderLight}`,
          flexShrink: 0,
        }}
      >
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
            borderBottom: `1px solid ${toast.kind === "error" ? colors.errorSoftBorder : colors.successSoftBorder}`,
            padding: "4px 12px",
            lineHeight: 1.4,
            flexShrink: 0,
          }}
        >
          {toast.text}
        </div>
      )}

      {/* Two-column body: commit graph (fixed, resizable) + files panel (fills remainder). */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "row",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: graphWidth,
            flexShrink: 0,
            minHeight: 0,
            minWidth: 0,
            overflow: "hidden",
            display: "flex",
          }}
        >
          <CommitGraphList
            repoPath={repoPath}
            workingTreeCount={workingTreeCount}
            selected={selected}
            onSelect={setSelected}
          />
        </div>
        <ResizeHandle orientation="vertical" onResize={handleResize} onResizeEnd={handleResizeEnd} />
        <div
          style={{
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            overflow: "hidden",
            display: "flex",
          }}
        >
          <ChangedFilesPanel
            repoPath={repoPath}
            selected={selected}
            onOpenWorkingDiff={(filePath, fileStatus) => onOpenDiff?.(filePath, fileStatus)}
            onOpenRefDiff={onOpenRefDiff}
          />
        </div>
      </div>

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
