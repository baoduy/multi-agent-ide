import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, Loader2 } from "lucide-react";

import { colors } from "../../utils/colors";
import { useConfigStore } from "../../store/configStore";
import { useGitCloneStore } from "../../store/gitCloneStore";
import { useRepoStore } from "../../store/repoStore";
import { BaseDialog } from "../common/BaseDialog";
import { CancelButton } from "../common/DialogButtons";
import { FileTree, type TreeEntry } from "../common/FileTree";
import { FolderIconBadge } from "../common/fileIcons";
import { FormLabel, FormInput, FormError, SectionHeader } from "../common/FormControls";

type CloneRepoDialogProps = {
  /** Optional pre-filled parent dir (e.g. when right-clicking a working-dir row). */
  defaultTargetDir?: string;
  onClose: () => void;
};

function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

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
  const clones = useGitCloneStore((s) => s.clones);
  const destinations = useGitCloneStore((s) => s.destinations);
  const fetchDestinations = useGitCloneStore((s) => s.fetchDestinations);
  const fetchRepos = useRepoStore((s) => s.fetchRepos);

  const [url, setUrl] = useState("");
  const [targetDir, setTargetDir] = useState<string>(
    defaultTargetDir ?? destinations[0]?.root ?? workingDirs[0] ?? "",
  );
  const [folderName, setFolderName] = useState("");
  const [userEditedFolder, setUserEditedFolder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cloneId, setCloneId] = useState<string | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  // Load config + destinations on open. Clone subscriptions live at app boot.
  useEffect(() => {
    void fetchConfig();
    void fetchDestinations();
  }, [fetchConfig, fetchDestinations]);

  // Build TreeEntry[] for the FileTree: each root is a directory with its
  // non-git subfolders as pre-loaded leaves (isDirectory=false so the tree
  // renders them as clickable rows rather than expandable empty folders).
  const treeEntries = useMemo<TreeEntry[]>(() => {
    return destinations.map(({ root, children }) => ({
      id: root,
      name: root,
      path: root,
      isDirectory: true,
      children: children.map((c) => ({
        id: c,
        name: basename(c),
        path: c,
        isDirectory: false,
      })),
    }));
  }, [destinations]);

  // Auto-expand every root so subfolders are visible without an extra click.
  const autoExpandPaths = useMemo(
    () => new Set(destinations.map((d) => d.root)),
    [destinations],
  );

  // Keep targetDir valid if destinations arrive late
  useEffect(() => {
    if (!targetDir && destinations.length > 0) {
      setTargetDir(destinations[0]?.root ?? "");
    }
  }, [destinations, targetDir]);

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

  const selectDestination = useCallback((p: string) => {
    setTargetDir(p);
    setError(null);
  }, []);

  const handleClone = useCallback(async () => {
    if (!canSubmit) return;
    setError(null);
    try {
      const id = await startClone({
        url: url.trim(),
        targetDir,
        folderName: folderName.trim(),
      });
      setCloneId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [canSubmit, url, targetDir, folderName, startClone]);

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
              padding: "5px 10px", 
              //fontSize: 11, 
              fontWeight: 600,
              color: colors.textWhite,
              background: !canSubmit ? colors.textTertiary : colors.primary,
              border: "none", borderRadius: 6,
              cursor: canSubmit ? "pointer" : "default",
              display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit",
            }}
          >
            {isRunning ? <Loader2 size={12} className="spin" /> : <Download size={12} strokeWidth={2.2} />}
            {isRunning ? "Cloning…" : "Clone"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
          <FormLabel htmlFor="clone-folder">Folder name</FormLabel>
          <FormInput
            id="clone-folder"
            value={folderName}
            onChange={(v) => { setFolderName(v); setUserEditedFolder(true); }}
            placeholder="my-repo"
          />
        </div>

        <div>
          <FormLabel htmlFor="clone-target">Clone into</FormLabel>
          {workingDirs.length === 0 ? (
            <div
              style={{
                //fontSize: 11,
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
            <div
              style={{
                border: `1px solid ${colors.border}`,
                borderRadius: 6,
                background: colors.bgSurface,
                maxHeight: 200,
                overflowY: "auto",
                padding: 4,
              }}
            >
              <FileTree
                entries={treeEntries}
                autoExpandPaths={autoExpandPaths}
                showFileIcons={false}
                showExtensionBadge={false}
                onFolderClick={(e) => selectDestination(e.path)}
                renderItemContent={(entry, depth) => (
                  <DestinationLabel
                    label={depth === 0 ? entry.path : entry.name}
                    selected={targetDir === entry.path}
                  />
                )}
                renderLeaf={(entry, depth) => (
                  <DestinationLeafRow
                    key={entry.id}
                    label={entry.name}
                    selected={targetDir === entry.path}
                    depth={depth}
                    onClick={() => selectDestination(entry.path)}
                  />
                )}
              />
            </div>
          )}
          <p style={{
            //fontSize: 11,
            color: colors.textTertiary, margin: "5px 0 0", lineHeight: 1.5 }}>
            The repo is cloned as a child folder inside your selected destination.
          </p>
        </div>

        {currentClone && (
          <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: 10 }}>
            <SectionHeader style={{ marginBottom: 6 }}>Progress</SectionHeader>
            <ProgressBar
              percent={currentClone.percent}
              color={failed ? colors.error : colors.primary}
            />
            <p style={{ 
              //fontSize: 11, 
              color: failed ? colors.error : colors.textTertiary, marginTop: 6, fontFamily: "var(--font-sans)" }}>
              {failed ? (currentClone.error ?? "Clone failed.") : currentClone.phase + (currentClone.percent > 0 ? ` · ${currentClone.percent}%` : "")}
            </p>
          </div>
        )}

        <FormError message={error} />
      </div>
    </BaseDialog>
  );
}

/** Name + optional checkmark for a selected folder row inside the FileTree. */
function DestinationLabel({ label, selected }: { label: string; selected: boolean }): React.ReactElement {
  return (
    <span
      style={{
        flex: 1,
        fontWeight: 500,
        color: "var(--foreground)",
        fontFamily: "var(--font-sans)",
        display: "flex",
        alignItems: "center",
        gap: 6,
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {selected && <Check size={12} strokeWidth={2.4} color={colors.primary} />}
    </span>
  );
}

/** Leaf row (non-git direct subfolder) rendered as a folder-styled button. */
function DestinationLeafRow({
  label,
  selected,
  depth,
  onClick,
}: {
  label: string;
  selected: boolean;
  depth: number;
  onClick: () => void;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const indent = depth * 14;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        width: "100%",
        padding: `5px 8px 5px ${22 + indent}px`,
        border: "none",
        borderRadius: 4,
        background: selected ? colors.primaryAlpha : hovered ? colors.bgHover : "transparent",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.1s",
        fontFamily: "var(--font-sans)",
      }}
    >
      <FolderIconBadge isOpen={false} size={14} />
      <DestinationLabel label={label} selected={selected} />
    </button>
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
