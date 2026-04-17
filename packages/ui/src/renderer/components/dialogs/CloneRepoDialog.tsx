import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Folder, Loader2 } from "lucide-react";

import { colors } from "../../utils/colors";
import { selectFolder } from "../../utils/ipc";
import { useConfigStore } from "../../store/configStore";
import { useGitCloneStore } from "../../store/gitCloneStore";
import { useRepoStore } from "../../store/repoStore";
import { BaseDialog } from "../common/BaseDialog";
import { CancelButton } from "../common/DialogButtons";
import { FormLabel, FormInput, FormError, SectionHeader } from "../common/FormControls";

type CloneRepoDialogProps = {
  /** Optional pre-filled parent dir (e.g. when right-clicking a working-dir row). */
  defaultTargetDir?: string;
  onClose: () => void;
};

const spin: React.CSSProperties = { animation: "spin 1s linear infinite" };

/** Pull the last path segment out of a typical git URL to suggest a folder name. */
function deriveFolderName(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  const last = trimmed.replace(/\.git\/?$/i, "").split(/[\/:]/).filter(Boolean).pop() ?? "";
  return last.replace(/[^A-Za-z0-9._\-]/g, "");
}

export function CloneRepoDialog({ defaultTargetDir, onClose }: CloneRepoDialogProps): React.ReactElement {
  const workingDirs = useConfigStore((s) => s.workingDirs);
  const fetchConfig = useConfigStore((s) => s.fetchConfig);
  const startClone = useGitCloneStore((s) => s.startClone);
  const clearClone = useGitCloneStore((s) => s.clearClone);
  const initializeCloneSubs = useGitCloneStore((s) => s.initializeSubscriptions);
  const clones = useGitCloneStore((s) => s.clones);
  const fetchRepos = useRepoStore((s) => s.fetchRepos);

  const [url, setUrl] = useState("");
  const [targetDir, setTargetDir] = useState<string>(
    defaultTargetDir ?? workingDirs[0] ?? "",
  );
  const [folderName, setFolderName] = useState("");
  const [userEditedFolder, setUserEditedFolder] = useState(false);
  const [depth, setDepth] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [cloneId, setCloneId] = useState<string | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  // Load config (for workingDirs) + subscriptions on open
  useEffect(() => {
    void fetchConfig();
    initializeCloneSubs();
  }, [fetchConfig, initializeCloneSubs]);

  // Keep targetDir valid if workingDirs arrives late
  useEffect(() => {
    if (!targetDir && workingDirs.length > 0) {
      setTargetDir(workingDirs[0] ?? "");
    }
  }, [workingDirs, targetDir]);

  // Auto-focus URL input on open
  useEffect(() => {
    urlRef.current?.focus();
  }, []);

  // Auto-suggest folder name unless user typed one manually
  useEffect(() => {
    if (userEditedFolder) return;
    setFolderName(deriveFolderName(url));
  }, [url, userEditedFolder]);

  const currentClone = cloneId ? clones.get(cloneId) ?? null : null;
  const isRunning = currentClone?.status === "running";

  // Auto-close + refresh on success (after a brief pause so the user sees 100%)
  useEffect(() => {
    if (currentClone?.status !== "success") return;
    const t = setTimeout(() => {
      void fetchRepos();
      if (cloneId) clearClone(cloneId);
      onClose();
    }, 800);
    return () => clearTimeout(t);
  }, [currentClone?.status, cloneId, clearClone, fetchRepos, onClose]);

  const canSubmit = useMemo(() => {
    return (
      !!url.trim() &&
      !!targetDir.trim() &&
      !!folderName.trim() &&
      /^[A-Za-z0-9._\-]+$/.test(folderName) &&
      !isRunning
    );
  }, [url, targetDir, folderName, isRunning]);

  const handleBrowse = useCallback(async () => {
    const chosen = await selectFolder();
    if (!chosen) return;
    // Must be one of the allowlisted working dirs — the daemon will reject otherwise,
    // but fail fast with a clear message here.
    const match = workingDirs.find((wd) => wd === chosen);
    if (!match) {
      setError(
        "Selected folder is not a configured working directory. Pick one from the dropdown, " +
          "or add this folder under Settings → Working directories first.",
      );
      return;
    }
    setTargetDir(match);
    setError(null);
  }, [workingDirs]);

  const handleClone = useCallback(async () => {
    if (!canSubmit) return;
    setError(null);
    try {
      const parsedDepth = depth.trim() ? parseInt(depth.trim(), 10) : undefined;
      const id = await startClone({
        url: url.trim(),
        targetDir,
        folderName: folderName.trim(),
        depth: Number.isFinite(parsedDepth) ? parsedDepth : undefined,
      });
      setCloneId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [canSubmit, url, targetDir, folderName, depth, startClone]);

  const failed = currentClone?.status === "error";

  return (
    <BaseDialog
      title="Clone repository"
      icon={<Download size={16} color={colors.primary} strokeWidth={2} />}
      width={560}
      scrollable
      maxHeight="82vh"
      onClose={() => {
        // Clear the clone state if it's terminal; if still running, keep it so the user
        // can re-open the dialog later (could be shown via a notification center later).
        if (cloneId && !isRunning) clearClone(cloneId);
        onClose();
      }}
      footer={
        <>
          <CancelButton onClick={onClose} />
          <button
            type="button"
            onClick={() => void handleClone()}
            disabled={!canSubmit}
            style={{
              padding: "7px 14px", fontSize: 12, fontWeight: 600,
              color: colors.textWhite,
              background: !canSubmit ? colors.textTertiary : colors.primary,
              border: "none", borderRadius: 6,
              cursor: canSubmit ? "pointer" : "default",
              display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit",
            }}
          >
            {isRunning ? <Loader2 size={12} style={spin} /> : <Download size={12} strokeWidth={2.2} />}
            {isRunning ? "Cloning…" : "Clone"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <FormLabel htmlFor="clone-url">Remote URL</FormLabel>
          <FormInput
            id="clone-url"
            inputRef={urlRef}
            value={url}
            onChange={setUrl}
            placeholder="git@github.com:user/repo.git"
          />
        </div>

        <div>
          <FormLabel htmlFor="clone-target">Clone into</FormLabel>
          {workingDirs.length === 0 ? (
            <div
              style={{
                fontSize: 12,
                color: colors.warningText,
                background: colors.warningSoft,
                border: `1px solid ${colors.warningBorderSoft}`,
                padding: "6px 10px",
                borderRadius: 6,
              }}
            >
              No working directories configured. Add one in Settings first, then retry.
            </div>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <select
                id="clone-target"
                value={targetDir}
                onChange={(e) => setTargetDir(e.target.value)}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  fontSize: 13,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 6,
                  background: colors.bgSurface,
                  color: colors.text,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {workingDirs.map((wd) => (
                  <option key={wd} value={wd}>{wd}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void handleBrowse()}
                title="Browse… (must be an existing working directory)"
                style={{
                  padding: "7px 10px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: colors.text,
                  background: "transparent",
                  border: `1px solid ${colors.border}`,
                  borderRadius: 6,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontFamily: "inherit",
                }}
              >
                <Folder size={12} strokeWidth={2} /> Browse…
              </button>
            </div>
          )}
          <p style={{ fontSize: 11, color: colors.textTertiary, margin: "5px 0 0", lineHeight: 1.5 }}>
            The repo is cloned as a child folder inside one of your configured working directories.
          </p>
        </div>

        <div>
          <FormLabel htmlFor="clone-folder">Folder name</FormLabel>
          <FormInput
            id="clone-folder"
            value={folderName}
            onChange={(v) => { setFolderName(v); setUserEditedFolder(true); }}
            placeholder="my-repo"
          />
        </div>

        <div>
          <FormLabel htmlFor="clone-depth">Shallow clone depth (optional)</FormLabel>
          <FormInput
            id="clone-depth"
            value={depth}
            onChange={setDepth}
            placeholder="(empty = full history)"
          />
        </div>

        {currentClone && (
          <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: 10 }}>
            <SectionHeader style={{ marginBottom: 6 }}>Progress</SectionHeader>
            <ProgressBar
              percent={currentClone.percent}
              color={failed ? colors.error : colors.primary}
            />
            <p style={{ fontSize: 11, color: failed ? colors.error : colors.textTertiary, marginTop: 6, fontFamily: "var(--font-mono)" }}>
              {failed ? (currentClone.error ?? "Clone failed.") : currentClone.phase + (currentClone.percent > 0 ? ` · ${currentClone.percent}%` : "")}
            </p>
          </div>
        )}

        <FormError message={error} />
      </div>
    </BaseDialog>
  );
}

function ProgressBar({ percent, color }: { percent: number; color: string }): React.ReactElement {
  const p = Math.min(100, Math.max(0, percent));
  return (
    <div
      style={{
        width: "100%",
        height: 8,
        borderRadius: 4,
        background: colors.bgMuted,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${p}%`,
          height: "100%",
          background: color,
          transition: "width 0.2s ease-out",
        }}
      />
    </div>
  );
}
