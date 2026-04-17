import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Loader2 } from "lucide-react";

import { colors } from "../../utils/colors";
import { sendOrThrow } from "../../services/ipcClient";
import { useRepoStore } from "../../store/repoStore";
import { BranchRow } from "../common/BranchRow";
import { InlineLoadingRow } from "../common/InlineLoadingRow";
import { useViewSearchStore } from "../../store/viewSearchStore";
import { CreateBranchOrWorktreeDialog } from "../dialogs/CreateBranchOrWorktreeDialog";

type GitBranchListProps = {
  repoPath?: string;
};

export function GitBranchList({ repoPath }: GitBranchListProps): React.ReactElement {
  const [branches, setBranches] = useState<string[]>([]);
  const [current, setCurrent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const searchQuery = useViewSearchStore((s) => s.queries["git-branches"] ?? "");
  const fetchRepos = useRepoStore((s) => s.fetchRepos);

  const load = useCallback(async () => {
    if (!repoPath) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await sendOrThrow({ type: "branch:list", repoPath });
      setBranches(res.branches);
      setCurrent(res.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [repoPath]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((b) => b.toLowerCase().includes(q));
  }, [branches, searchQuery]);

  const handleCheckout = useCallback(async (branch: string) => {
    if (!repoPath || branch === current) return;
    setSwitching(branch);
    setError(null);
    try {
      await sendOrThrow({ type: "branch:checkout", repoPath, branch });
      await fetchRepos();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSwitching(null);
    }
  }, [repoPath, current, fetchRepos, load]);

  if (!repoPath) {
    return (
      <div style={{ padding: "12px 16px", color: colors.textTertiary, fontSize: 12 }}>
        No repository selected.
      </div>
    );
  }

  return (
    <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 4 }}>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          style={btnStyle()}
          title="Create new branch or worktree"
        >
          <Plus size={11} strokeWidth={2.2} /> New
        </button>
        <button
          type="button"
          onClick={() => void load()}
          style={btnStyle()}
          title="Reload branches"
        >
          {isLoading ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={11} strokeWidth={2} />}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 11, color: colors.error, padding: "4px 6px" }}>{error}</div>
      )}

      {isLoading && branches.length === 0 ? (
        <InlineLoadingRow label="Loading branches…" />
      ) : filtered.length === 0 ? (
        <div style={{ fontSize: 12, color: colors.textTertiary, padding: "4px 8px" }}>
          No branches.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {filtered.map((b) => (
            <BranchRow
              key={b}
              name={b}
              isCurrent={b === current}
              isBusy={switching === b}
              disabled={b === current}
              onSelect={() => void handleCheckout(b)}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateBranchOrWorktreeDialog
          kind="branch"
          repoPath={repoPath}
          currentBranch={current}
          onClose={() => { setShowCreate(false); void load(); }}
        />
      )}
    </div>
  );
}

function btnStyle(): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 8px",
    fontSize: 11,
    fontWeight: 600,
    color: colors.text,
    background: "transparent",
    border: `1px solid ${colors.border}`,
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}
