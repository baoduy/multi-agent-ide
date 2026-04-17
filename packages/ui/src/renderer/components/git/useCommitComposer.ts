import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { GitFileStatus } from "@magenta/shared/ipc";
import { sendOrThrow } from "../../services/ipcClient";
import { useRepoStore } from "../../store/repoStore";

export type FileGroup = { title: string; files: GitFileStatus[] };

export function fileKey(f: GitFileStatus): string {
  return `${f.staged ? "s" : "u"}:${f.path}`;
}

export function groupFiles(files: GitFileStatus[]): FileGroup[] {
  const staged: GitFileStatus[] = [];
  const unstaged: GitFileStatus[] = [];
  const untracked: GitFileStatus[] = [];
  for (const f of files) {
    if (f.status === "untracked") untracked.push(f);
    else if (f.staged) staged.push(f);
    else unstaged.push(f);
  }
  const out: FileGroup[] = [];
  if (staged.length) out.push({ title: `Staged (${staged.length})`, files: staged });
  if (unstaged.length) out.push({ title: `Changes (${unstaged.length})`, files: unstaged });
  if (untracked.length) out.push({ title: `Untracked (${untracked.length})`, files: untracked });
  return out;
}

type UseCommitComposerOptions = {
  repoPath: string;
  onAfterCommit?: () => void;
};

export type UseCommitComposerResult = {
  files: GitFileStatus[];
  groups: FileGroup[];
  isLoading: boolean;
  loadError: string | null;
  commitError: string | null;
  hasUpstream: boolean;
  ahead: number;
  behind: number;
  branch: string;
  selected: Set<string>;
  message: string;
  isCommitting: boolean;
  pushIntent: React.MutableRefObject<boolean>;
  allSelected: boolean;
  primaryDisabled: boolean;
  setMessage: (m: string) => void;
  toggleFile: (key: string) => void;
  toggleAll: () => void;
  reload: () => Promise<void>;
  doCommit: (push: boolean) => Promise<void>;
};

export function useCommitComposer({ repoPath, onAfterCommit }: UseCommitComposerOptions): UseCommitComposerResult {
  const [files, setFiles] = useState<GitFileStatus[]>([]);
  const [branch, setBranch] = useState("");
  const [ahead, setAhead] = useState(0);
  const [behind, setBehind] = useState(0);
  const [hasUpstream, setHasUpstream] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const pushIntent = useRef(true);

  const fetchRepos = useRepoStore((s) => s.fetchRepos);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await sendOrThrow({ type: "git:status", repoPath });
      setFiles(res.files);
      setBranch(res.branch);
      setAhead(res.ahead);
      setBehind(res.behind);
      setHasUpstream(res.hasUpstream);
      const next = new Set<string>();
      for (const f of res.files) if (f.staged) next.add(fileKey(f));
      setSelected(next);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const groups = useMemo(() => groupFiles(files), [files]);
  const allKeys = useMemo(() => files.map(fileKey), [files]);
  const allSelected = selected.size === allKeys.length && allKeys.length > 0;

  const toggleFile = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setCommitError(null);
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => (prev.size === allKeys.length ? new Set() : new Set(allKeys)));
    setCommitError(null);
  }, [allKeys]);

  const doCommit = useCallback(async (push: boolean) => {
    pushIntent.current = push;
    const trimmed = message.trim();
    if (!trimmed) { setCommitError("Commit message cannot be empty."); return; }
    if (selected.size === 0) { setCommitError("Select at least one file to commit."); return; }
    const paths = Array.from(new Set(
      files.filter((f) => selected.has(fileKey(f))).map((f) => f.path),
    ));
    setIsCommitting(true);
    setCommitError(null);
    try {
      await sendOrThrow({ type: "git:commit", repoPath, message: trimmed, files: paths, push });
      setMessage("");
      await fetchRepos();
      await reload();
      onAfterCommit?.();
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCommitting(false);
    }
  }, [message, selected, files, repoPath, fetchRepos, reload, onAfterCommit]);

  const primaryDisabled = !message.trim() || selected.size === 0 || isLoading || isCommitting;

  return {
    files,
    groups,
    isLoading,
    loadError,
    commitError,
    hasUpstream,
    ahead,
    behind,
    branch,
    selected,
    message,
    isCommitting,
    pushIntent,
    allSelected,
    primaryDisabled,
    setMessage,
    toggleFile,
    toggleAll,
    reload,
    doCommit,
  };
}
