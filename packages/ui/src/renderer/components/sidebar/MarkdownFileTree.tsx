/**
 * MarkdownFileTree — left sidebar view for the Markdown Manager dock group.
 *
 * Shows a repo + branch picker at top, then a FileTree of all *.md files
 * found in the selected repo/branch. Clicking a file opens it in the center
 * file-viewer tab.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderGit2, GitBranch, FilePlus, Pencil, Trash2, Pin } from "lucide-react";

import { useRepoStore } from "../../store/repoStore";
import { useMarkdownManagerStore } from "../../store/markdownManagerStore";
import { useSessionStore } from "../../store/sessionStore";
import { useViewSearchStore } from "../../store/viewSearchStore";
import { sendOrThrow } from "../../services/ipcClient";
import { DoublePicker, type DoublePickerOption } from "../common/DoublePicker";
import { FileTree, type TreeEntry } from "../common/FileTree";
import type { ContextMenuAction } from "../common/ContextMenu";
import { InlineLoadingRow } from "../common/InlineLoadingRow";
import { colors } from "../../utils/colors";

/* ── Flat-to-tree conversion ── */

/** Build a TreeEntry[] hierarchy from a flat list of relative file paths. */
function buildFromFlat(files: string[]): TreeEntry[] {
  const rootChildren: TreeEntry[] = [];
  const dirMap = new Map<string, TreeEntry>();

  for (const filePath of files) {
    const segments = filePath.split("/");

    // Ensure all ancestor directories exist
    for (let depth = 0; depth < segments.length - 1; depth++) {
      const dirPath = segments.slice(0, depth + 1).join("/");
      if (!dirMap.has(dirPath)) {
        const dirEntry: TreeEntry = {
          id: dirPath,
          name: segments[depth],
          path: dirPath,
          isDirectory: true,
          children: [],
        };
        dirMap.set(dirPath, dirEntry);

        // Attach to parent
        if (depth === 0) {
          rootChildren.push(dirEntry);
        } else {
          const parentPath = segments.slice(0, depth).join("/");
          dirMap.get(parentPath)!.children!.push(dirEntry);
        }
      }
    }

    // Create the file entry
    const fileEntry: TreeEntry = {
      id: filePath,
      name: segments[segments.length - 1],
      path: filePath,
      isDirectory: false,
    };

    if (segments.length === 1) {
      rootChildren.push(fileEntry);
    } else {
      const parentPath = segments.slice(0, -1).join("/");
      dirMap.get(parentPath)!.children!.push(fileEntry);
    }
  }

  return rootChildren;
}

/** Sort entries: directories first, then alphabetically. Recurse into children. */
function sortEntries(entries: TreeEntry[]): TreeEntry[] {
  const sorted = [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const entry of sorted) {
    if (entry.children && entry.children.length > 0) {
      entry.children = sortEntries(entry.children);
    }
  }
  return sorted;
}

/** Filter tree entries by search query (case-insensitive match on file name). */
function filterTree(entries: TreeEntry[], query: string): TreeEntry[] {
  const lower = query.toLowerCase();
  const result: TreeEntry[] = [];

  for (const entry of entries) {
    if (entry.isDirectory) {
      const filteredChildren = filterTree(entry.children ?? [], query);
      if (filteredChildren.length > 0) {
        result.push({ ...entry, children: filteredChildren });
      }
    } else if (entry.name.toLowerCase().includes(lower)) {
      result.push(entry);
    }
  }

  return result;
}

/* ── Inline input for new file / rename ── */

function InlineInput({
  defaultValue,
  placeholder,
  onConfirm,
  onCancel,
}: {
  defaultValue?: string;
  placeholder?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue ?? "");

  useEffect(() => {
    // Focus and select file name without extension
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const dotIdx = value.lastIndexOf(".");
    el.setSelectionRange(0, dotIdx > 0 ? dotIdx : value.length);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) {
      onConfirm(trimmed);
    } else {
      onCancel();
    }
  }, [value, onConfirm, onCancel]);

  return (
    <input
      ref={inputRef}
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") onCancel();
      }}
      onBlur={submit}
      style={{
        width: "100%",
        boxSizing: "border-box",
        padding: "3px 6px",
        fontSize: 11,
        fontFamily: "inherit",
        border: `1px solid ${colors.primary}`,
        borderRadius: 3,
        background: colors.bgSurface,
        color: colors.text,
        outline: "none",
      }}
    />
  );
}

/* ── Component ── */

type MarkdownFileTreeProps = {
  onOpenFile?: (filePath: string) => void;
};

export function MarkdownFileTree({ onOpenFile }: MarkdownFileTreeProps): React.ReactElement {
  const repos = useRepoStore((s) => s.repos);
  const pinnedPaths = useRepoStore((s) => s.pinnedPaths);

  const selectedRepoPath = useMarkdownManagerStore((s) => s.selectedRepoPath);
  const selectedBranch = useMarkdownManagerStore((s) => s.selectedBranch);
  const branches = useMarkdownManagerStore((s) => s.branches);
  const currentBranch = useMarkdownManagerStore((s) => s.currentBranch);
  const mdFiles = useMarkdownManagerStore((s) => s.mdFiles);
  const isLoadingBranches = useMarkdownManagerStore((s) => s.isLoadingBranches);
  const isLoadingFiles = useMarkdownManagerStore((s) => s.isLoadingFiles);
  const selectRepo = useMarkdownManagerStore((s) => s.selectRepo);
  const selectBranch = useMarkdownManagerStore((s) => s.selectBranch);
  const refreshFiles = useMarkdownManagerStore((s) => s.refreshFiles);

  const explorerRepoPath = useSessionStore((s) => s.selectedRepoPath);
  const searchQuery = useViewSearchStore((s) => s.queries["md-file-tree"] ?? "");

  // Inline editing state
  const [newFileDir, setNewFileDir] = useState<string | null>(null); // relative dir path or "" for root
  const [renamingPath, setRenamingPath] = useState<string | null>(null); // relative file path being renamed

  const isCurrentBranch = selectedBranch === currentBranch;

  // Auto-select from Explorer group when no persisted selection exists
  useEffect(() => {
    if (!selectedRepoPath && explorerRepoPath) {
      selectRepo(explorerRepoPath);
    }
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-fetch on mount if we have a persisted selection
  useEffect(() => {
    if (selectedRepoPath && branches.length === 0 && !isLoadingBranches) {
      void useMarkdownManagerStore.getState().fetchBranches(selectedRepoPath);
    }
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Picker options — pinned repos first, then the rest alphabetically
  const repoOptions = useMemo((): readonly DoublePickerOption<string>[] => {
    const pinned: DoublePickerOption<string>[] = [];
    const unpinned: DoublePickerOption<string>[] = [];
    for (const r of repos) {
      const isPinned = pinnedPaths.has(r.path);
      const opt: DoublePickerOption<string> = {
        value: r.path,
        label: r.name,
        description: r.path,
        icon: <FolderGit2 size={14} color={colors.textTertiary} />,
        suffix: isPinned ? <Pin size={10} color={colors.primary} strokeWidth={2} /> : undefined,
      };
      if (isPinned) {
        pinned.push(opt);
      } else {
        unpinned.push(opt);
      }
    }
    return [...pinned, ...unpinned];
  }, [repos, pinnedPaths]);

  const branchOptions = useMemo(
    (): readonly DoublePickerOption<string>[] =>
      branches.map((b) => ({
        value: b,
        label: b,
        suffix: b === currentBranch ? "(current)" : undefined,
        icon: <GitBranch size={13} color={colors.textTertiary} />,
      })),
    [branches, currentBranch],
  );

  // Build tree from flat file list
  const treeEntries = useMemo(() => {
    const tree = sortEntries(buildFromFlat(mdFiles));
    return searchQuery ? filterTree(tree, searchQuery) : tree;
  }, [mdFiles, searchQuery]);

  const handleFileClick = useCallback(
    (entry: TreeEntry) => {
      if (!onOpenFile || !selectedRepoPath || !selectedBranch) return;

      // Current branch → open absolute path; other branch → gitref:// protocol
      if (selectedBranch === currentBranch) {
        onOpenFile(`${selectedRepoPath}/${entry.path}`);
      } else {
        onOpenFile(`gitref://${selectedBranch}/${entry.path}`);
      }
    },
    [onOpenFile, selectedRepoPath, selectedBranch, currentBranch],
  );

  const handleRepoChange = useCallback(
    (repoPath: string) => selectRepo(repoPath),
    [selectRepo],
  );

  const handleBranchChange = useCallback(
    (branch: string) => selectBranch(branch),
    [selectBranch],
  );

  // ── File CRUD handlers ──

  const handleNewFile = useCallback(
    async (name: string, dir: string) => {
      if (!selectedRepoPath) return;
      // Ensure .md extension
      const fileName = name.endsWith(".md") ? name : `${name}.md`;
      const relativePath = dir ? `${dir}/${fileName}` : fileName;
      const absPath = `${selectedRepoPath}/${relativePath}`;
      try {
        await sendOrThrow({ type: "file:write", filePath: absPath, content: "" });
        refreshFiles();
        onOpenFile?.(absPath);
      } catch { /* ignore — gateway throws on validation errors */ }
      setNewFileDir(null);
    },
    [selectedRepoPath, refreshFiles, onOpenFile],
  );

  const handleRename = useCallback(
    async (oldRelPath: string, newName: string) => {
      if (!selectedRepoPath) return;
      const dir = oldRelPath.includes("/") ? oldRelPath.substring(0, oldRelPath.lastIndexOf("/")) : "";
      const newRelPath = dir ? `${dir}/${newName}` : newName;
      const oldAbs = `${selectedRepoPath}/${oldRelPath}`;
      const newAbs = `${selectedRepoPath}/${newRelPath}`;
      try {
        await sendOrThrow({ type: "file:rename", oldPath: oldAbs, newPath: newAbs });
        refreshFiles();
      } catch { /* ignore */ }
      setRenamingPath(null);
    },
    [selectedRepoPath, refreshFiles],
  );

  const handleDelete = useCallback(
    async (relPath: string) => {
      if (!selectedRepoPath) return;
      const absPath = `${selectedRepoPath}/${relPath}`;
      // eslint-disable-next-line no-restricted-globals
      if (!confirm(`Delete "${relPath}"?`)) return;
      try {
        await sendOrThrow({ type: "file:delete", filePath: absPath });
        refreshFiles();
      } catch { /* ignore */ }
    },
    [selectedRepoPath, refreshFiles],
  );

  // Context menu builder
  const buildContextMenu = useCallback(
    (entry: TreeEntry): ContextMenuAction[] => {
      if (!isCurrentBranch) return [];

      if (entry.isDirectory) {
        return [
          { label: "New File", Icon: FilePlus, action: () => setNewFileDir(entry.path) },
        ];
      }

      return [
        { label: "Rename", Icon: Pencil, action: () => setRenamingPath(entry.path) },
        { label: "Delete", Icon: Trash2, action: () => void handleDelete(entry.path), separator: true },
      ];
    },
    [isCurrentBranch, handleDelete],
  );

  // Custom item renderer for inline rename — returns undefined for non-renaming
  // entries so FileTree falls back to its default name rendering.
  const renderItemContent = useCallback(
    (entry: TreeEntry, _depth: number): React.ReactNode | undefined => {
      if (!entry.isDirectory && renamingPath === entry.path) {
        return (
          <InlineInput
            defaultValue={entry.name}
            onConfirm={(newName) => void handleRename(entry.path, newName)}
            onCancel={() => setRenamingPath(null)}
          />
        );
      }
      return undefined;
    },
    [renamingPath, handleRename],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Repo + Branch picker + New file button */}
      <div style={{ padding: "8px 8px 4px", flexShrink: 0, display: "flex", gap: 4, alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <DoublePicker<string, string>
            left={{
              options: repoOptions,
              value: selectedRepoPath ?? "",
              onChange: handleRepoChange,
              placeholder: "Select repository",
              searchable: repos.length > 5,
              searchPlaceholder: "Search repositories...",
              minPanelWidth: 260,
            }}
            right={{
              options: branchOptions,
              value: selectedBranch ?? "",
              onChange: handleBranchChange,
              placeholder: "Branch",
              searchable: branches.length > 5,
              searchPlaceholder: "Search branches...",
              minPanelWidth: 220,
              disabled: !selectedRepoPath || isLoadingBranches,
            }}
          />
        </div>
        {selectedRepoPath && isCurrentBranch && (
          <button
            type="button"
            title="New markdown file"
            onClick={() => setNewFileDir("")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              padding: 0,
              border: `1px solid ${colors.border}`,
              borderRadius: 5,
              background: colors.bgMuted,
              color: colors.textMuted,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <FilePlus size={14} />
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 4px 4px" }}>
        {/* Inline new-file input */}
        {newFileDir !== null && (
          <div style={{ padding: "4px 8px" }}>
            <InlineInput
              placeholder="filename.md"
              onConfirm={(name) => void handleNewFile(name, newFileDir)}
              onCancel={() => setNewFileDir(null)}
            />
          </div>
        )}

        {!selectedRepoPath && (
          <p style={{ padding: "8px 6px", color: colors.textTertiary, fontSize: 11, margin: 0 }}>
            Select a repository to browse markdown files.
          </p>
        )}

        {selectedRepoPath && (isLoadingBranches || isLoadingFiles) && (
          <InlineLoadingRow
            label={isLoadingBranches ? "Loading branches..." : "Loading files..."}
            padding="12px 8px"
            color={colors.textSecondary}
          />
        )}

        {selectedRepoPath && !isLoadingBranches && !isLoadingFiles && mdFiles.length === 0 && newFileDir === null && (
          <p style={{ padding: "8px 6px", color: colors.textTertiary, fontSize: 11, margin: 0 }}>
            No markdown files found.
          </p>
        )}

        {selectedRepoPath && !isLoadingFiles && treeEntries.length > 0 && (
          <FileTree
            entries={treeEntries}
            onFileClick={handleFileClick}
            contextMenuItems={buildContextMenu}
            renderItemContent={renderItemContent}
            showFileIcons
            showExtensionBadge={false}
          />
        )}
      </div>
    </div>
  );
}
