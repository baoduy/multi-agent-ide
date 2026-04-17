import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";

import { colors } from "../../utils/colors";
import { sendOrThrow } from "../../services/ipcClient";
import { useRepoStore } from "../../store/repoStore";
import { BaseDialog } from "../common/BaseDialog";
import { CancelButton } from "../common/DialogButtons";
import { FormLabel, FormInput, FormError, SectionHeader } from "../common/FormControls";
import { InlineLoadingRow } from "../common/InlineLoadingRow";

type ResetMode = "soft" | "mixed" | "hard";

type ResetConfirmDialogProps = {
  repoPath: string;
  defaultRef?: string;
  onClose: () => void;
};

const spin: React.CSSProperties = { animation: "spin 1s linear infinite" };

export function ResetConfirmDialog({ repoPath, defaultRef, onClose }: ResetConfirmDialogProps): React.ReactElement {
  const fetchRepos = useRepoStore((s) => s.fetchRepos);
  const [mode, setMode] = useState<ResetMode>("mixed");
  const [ref, setRef] = useState(defaultRef ?? "HEAD~1");
  const [confirm, setConfirm] = useState("");
  const [dirtyFileCount, setDirtyFileCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    sendOrThrow({ type: "git:status", repoPath })
      .then((res) => { if (!cancelled) setDirtyFileCount(res.files.length); })
      .catch(() => { if (!cancelled) setDirtyFileCount(null); });
    return () => { cancelled = true; };
  }, [repoPath]);

  const needsConfirm = mode === "hard";
  const canSubmit = !!ref.trim() && !busy && (!needsConfirm || confirm === "HARD");

  const handleReset = useCallback(async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await sendOrThrow({
        type: "git:reset",
        repoPath,
        mode,
        ref: ref.trim(),
        confirmHard: needsConfirm ? true : undefined,
      });
      await fetchRepos();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [canSubmit, repoPath, mode, ref, needsConfirm, fetchRepos, onClose]);

  return (
    <BaseDialog
      title="Reset branch"
      icon={<RotateCcw size={16} color={colors.primary} strokeWidth={2} />}
      width={500}
      scrollable
      maxHeight="82vh"
      onClose={onClose}
      footer={
        <>
          <CancelButton onClick={onClose} />
          <button
            type="button"
            onClick={() => void handleReset()}
            disabled={!canSubmit}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", fontSize: 12, fontWeight: 600,
              color: colors.textWhite,
              background: !canSubmit
                ? colors.textTertiary
                : (mode === "hard" ? colors.error : colors.primary),
              border: "none", borderRadius: 6,
              cursor: canSubmit ? "pointer" : "default", fontFamily: "inherit",
            }}
          >
            {busy ? <Loader2 size={12} style={spin} /> : <RotateCcw size={12} strokeWidth={2.2} />}
            Reset
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <FormLabel htmlFor="reset-ref">Reset to ref</FormLabel>
          <FormInput id="reset-ref" value={ref} onChange={setRef} placeholder="HEAD~1 or a commit sha" />
          <p style={{ fontSize: 11, color: colors.textTertiary, marginTop: 5, lineHeight: 1.5 }}>
            Accepts any git ref: branch, tag, HEAD~n, full/short sha.
          </p>
        </div>

        <div>
          <SectionHeader>Mode</SectionHeader>
          <label style={radioLabel()}>
            <input type="radio" checked={mode === "mixed"} onChange={() => setMode("mixed")} style={{ accentColor: colors.primary }} />
            <div>
              <strong style={{ color: colors.text }}>Mixed</strong> <span style={{ color: colors.textTertiary, fontSize: 11 }}>(default)</span>
              <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                Resets the index but keeps your working-tree changes. Most common.
              </div>
            </div>
          </label>
          <label style={radioLabel()}>
            <input type="radio" checked={mode === "soft"} onChange={() => setMode("soft")} style={{ accentColor: colors.primary }} />
            <div>
              <strong style={{ color: colors.text }}>Soft</strong>
              <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                Keeps both the index and working tree. Just moves the branch pointer.
              </div>
            </div>
          </label>
          <label style={radioLabel(mode === "hard")}>
            <input type="radio" checked={mode === "hard"} onChange={() => setMode("hard")} style={{ accentColor: colors.error }} />
            <div>
              <strong style={{ color: colors.error }}>HARD</strong>{" "}
              <AlertTriangle size={11} color={colors.error} style={{ verticalAlign: "middle" }} />
              <div style={{ fontSize: 11, color: colors.error, marginTop: 2 }}>
                Discards ALL uncommitted changes. Destructive.
              </div>
            </div>
          </label>
        </div>

        {mode === "hard" && (
          <div
            style={{
              background: colors.errorSoft,
              border: `1px solid ${colors.errorSoftBorder}`,
              borderRadius: 6,
              padding: 10,
              fontSize: 12,
              color: colors.errorDark,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠ HARD reset will permanently lose:</div>
            {dirtyFileCount === null ? (
              <InlineLoadingRow label="Reading working tree…" />
            ) : dirtyFileCount === 0 ? (
              <div>No uncommitted changes — nothing will be lost.</div>
            ) : (
              <div>{dirtyFileCount} uncommitted change(s) in working tree / index.</div>
            )}

            <div style={{ marginTop: 10 }}>
              <FormLabel htmlFor="reset-confirm" style={{ color: colors.errorDark }}>
                Type <strong>HARD</strong> to confirm
              </FormLabel>
              <FormInput id="reset-confirm" value={confirm} onChange={setConfirm} placeholder="HARD" error={needsConfirm && confirm !== "" && confirm !== "HARD"} />
            </div>
          </div>
        )}

        <FormError message={error} />
      </div>
    </BaseDialog>
  );
}

function radioLabel(highlight?: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 6,
    border: `1px solid ${highlight ? colors.errorSoftBorder : colors.border}`,
    background: highlight ? colors.errorSoft : "transparent",
    cursor: "pointer",
    marginBottom: 6,
  };
}
