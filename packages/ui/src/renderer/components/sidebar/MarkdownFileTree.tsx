/**
 * MarkdownFileTree — left sidebar view for the Markdown Manager dock group.
 *
 * Shows a repo + branch picker at top, then a FileTree of all *.md files
 * found in the selected repo/branch. Clicking a file opens it in the center
 * file-viewer tab.
 */

import React, { useCallback, useEffect, useMemo } from "react";
import { FolderGit2, GitBranch } from "lucide-react";

import { useRepoStore } from "../../store/repoStore";
import { useMarkdownManagerStore } from "../../store/markdownManagerStore";
import { useViewSearchStore } from "../../store/viewSearchStore";
import { DoublePicker, type DoublePickerOption } from "../common/DoublePicker";
import { FileTree, type TreeEntry } from "../common/FileTree";
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

/* ── Component ── */

type MarkdownFileTreeProps = {
  onOpenFile?: (filePath: string) => void;
};

export function MarkdownFileTree({ onOpenFile }: MarkdownFileTreeProps): React.ReactElement {
  const repos = useRepoStore((s) => s.repos);

  const selectedRepoPath = useMarkdownManagerStore((s) => s.selectedRepoPath);
  const selectedBranch = useMarkdownManagerStore((s) => s.selectedBranch);
  const branches = useMarkdownManagerStore((s) => s.branches);
  const currentBranch = useMarkdownManagerStore((s) => s.currentBranch);
  const mdFiles = useMarkdownManagerStore((s) => s.mdFiles);
  const isLoadingBranches = useMarkdownManagerStore((s) => s.isLoadingBranches);
  const isLoadingFiles = useMarkdownManagerStore((s) => s.isLoadingFiles);
  const selectRepo = useMarkdownManagerStore((s) => s.selectRepo);
  const selectBranch = useMarkdownManagerStore((s) => s.selectBranch);

  const searchQuery = useViewSearchStore((s) => s.queries["md-file-tree"] ?? "");

  // Auto-fetch on mount if we have a persisted selection
  useEffect(() => {
    if (selectedRepoPath && branches.length === 0 && !isLoadingBranches) {
      void useMarkdownManagerStore.getState().fetchBranches(selectedRepoPath);
    }
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Picker options
  const repoOptions = useMemo(
    (): readonly DoublePickerOption<string>[] =>
      repos.map((r) => ({
        value: r.path,
        label: r.name,
        description: r.path,
        icon: <FolderGit2 size={14} color={colors.textTertiary} />,
      })),
    [repos],
  );

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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Repo + Branch picker */}
      <div style={{ padding: "8px 8px 4px", flexShrink: 0 }}>
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

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 4px 4px" }}>
        {!selectedRepoPath && (
          <p style={{ padding: "12px 8px", color: colors.textTertiary, fontSize: 12, margin: 0 }}>
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

        {selectedRepoPath && !isLoadingBranches && !isLoadingFiles && mdFiles.length === 0 && (
          <p style={{ padding: "12px 8px", color: colors.textTertiary, fontSize: 12, margin: 0 }}>
            No markdown files found.
          </p>
        )}

        {selectedRepoPath && !isLoadingFiles && treeEntries.length > 0 && (
          <FileTree
            entries={treeEntries}
            onFileClick={handleFileClick}
            showFileIcons
            showExtensionBadge={false}
          />
        )}
      </div>
    </div>
  );
}
