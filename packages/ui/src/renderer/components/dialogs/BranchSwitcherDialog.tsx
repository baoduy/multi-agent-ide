import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GitBranch } from "lucide-react";

import { colors } from "../../utils/colors";
import { sendOrThrow } from "../../services/ipcClient";
import { useRepoStore } from "../../store/repoStore";
import { BaseDialog } from "../common/BaseDialog";
import { BranchRow } from "../common/BranchRow";
import { CancelButton } from "../common/DialogButtons";
import { FormInput, FormError } from "../common/FormControls";
import { InlineLoadingRow } from "../common/InlineLoadingRow";

type BranchSwitcherDialogProps = {
  repoPath: string;
  currentBranch: string;
  onClose: () => void;
};

/**
 * Searchable dialog to switch the checked-out branch of a repository.
 * Uses the existing branch:list and branch:checkout IPC endpoints.
 */
export function BranchSwitcherDialog({ repoPath, currentBranch, onClose }: BranchSwitcherDialogProps): React.ReactElement {
  const [branches, setBranches] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fetchRepos = useRepoStore((s) => s.fetchRepos);

  useEffect(() => {
    let cancelled = false;
    sendOrThrow({ type: "branch:list", repoPath })
      .then((res) => { if (!cancelled) { setBranches(res.branches); setIsLoading(false); } })
      .catch((err) => { if (!cancelled) { setError(err instanceof Error ? err.message : String(err)); setIsLoading(false); } });
    return () => { cancelled = true; };
  }, [repoPath]);

  useEffect(() => {
    if (!isLoading) searchRef.current?.focus();
  }, [isLoading]);

  const filtered = useMemo(() => {
    if (!search) return branches;
    const q = search.toLowerCase();
    return branches.filter((b) => b.toLowerCase().includes(q));
  }, [branches, search]);

  const handleCheckout = useCallback(async (branch: string) => {
    if (branch === currentBranch) return;
    setSwitching(branch);
    setError(null);
    try {
      await sendOrThrow({ type: "branch:checkout", repoPath, branch });
      await fetchRepos();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSwitching(null);
    }
  }, [repoPath, currentBranch, fetchRepos, onClose]);

  return (
    <BaseDialog
      title="Switch Branch"
      icon={<GitBranch size={16} color={colors.primary} strokeWidth={2} />}
      width={400}
      scrollable
      maxHeight="60vh"
      onClose={onClose}
      footer={<CancelButton onClick={onClose} />}
    >
      {isLoading ? (
        <InlineLoadingRow label="Loading branches..." size={16} fontSize={13} color={colors.textSecondary} />
      ) : (
        <>
          <FormInput
            inputRef={searchRef}
            value={search}
            onChange={(v) => { setSearch(v); setError(null); }}
            placeholder="Filter branches..."
          />

          <div style={{ marginTop: 10, maxHeight: 280, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <p style={{ fontSize: 13, color: colors.textTertiary, padding: "8px 0" }}>No matching branches.</p>
            ) : (
              filtered.map((branch) => (
                <BranchRow
                  key={branch}
                  name={branch}
                  isCurrent={branch === currentBranch}
                  disabled={branch === currentBranch}
                  isBusy={switching === branch}
                  onSelect={handleCheckout}
                />
              ))
            )}
          </div>

          <FormError message={error} />
        </>
      )}
    </BaseDialog>
  );
}
