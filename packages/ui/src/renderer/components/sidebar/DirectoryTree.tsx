import React, { useMemo } from "react";
import { FolderOpen, Clipboard } from "lucide-react";

import type { Repository } from "@magenta/shared/models";
import { FileTree } from "../common/FileTree";
import type { TreeEntry } from "../common/FileTree";
import type { ContextMenuAction } from "../common/ContextMenu";
import { openInFileManager } from "../../utils/ipc";
import { RepoItem } from "./RepoItem";

/* ── Internal tree node (for building the tree from flat repos) ── */

type InternalNode = {
  name: string;
  fullPath: string;
  children: InternalNode[];
  repos: Repository[];
};

/* ── Build the tree from flat repo list ── */

function normalise(p: string): string {
  return p.replace(/\/+$/, "");
}

function buildTree(repos: Repository[], workingDirs: string[]): InternalNode[] {
  const roots: InternalNode[] = [];
  const rootMap = new Map<string, InternalNode>();

  for (const dir of workingDirs) {
    const dirName = dir.split("/").filter(Boolean).pop() ?? dir;
    const node: InternalNode = { name: dirName, fullPath: dir, children: [], repos: [] };
    rootMap.set(normalise(dir), node);
    roots.push(node);
  }

  for (const repo of repos) {
    const repoDir = normalise(repo.path);

    let matchedRoot: InternalNode | null = null;
    let matchedRootPath = "";
    for (const [dirPath, node] of rootMap) {
      if (repoDir.startsWith(dirPath + "/") || repoDir === dirPath) {
        if (dirPath.length > matchedRootPath.length) {
          matchedRoot = node;
          matchedRootPath = dirPath;
        }
      }
    }

    if (!matchedRoot) {
      const dirName = repo.path.split("/").filter(Boolean).pop() ?? repo.path;
      const orphan: InternalNode = { name: dirName, fullPath: repo.path, children: [], repos: [repo] };
      roots.push(orphan);
      continue;
    }

    const relativePath = repoDir.slice(matchedRootPath.length + 1);
    const segments = relativePath.split("/").filter(Boolean);

    if (segments.length === 0) {
      matchedRoot.repos.push(repo);
      continue;
    }

    let current = matchedRoot;
    const intermediateSegments = segments.slice(0, -1);

    for (const seg of intermediateSegments) {
      let child = current.children.find((c) => c.name === seg);
      if (!child) {
        child = { name: seg, fullPath: current.fullPath + "/" + seg, children: [], repos: [] };
        current.children.push(child);
      }
      current = child;
    }

    current.repos.push(repo);
  }

  sortInternalTree(roots);
  return roots;
}

function sortInternalTree(nodes: InternalNode[]): void {
  nodes.sort((a, b) => a.name.localeCompare(b.name));
  for (const node of nodes) {
    node.repos.sort((a, b) => a.name.localeCompare(b.name));
    sortInternalTree(node.children);
  }
}

/* ── Convert InternalNode tree → TreeEntry tree ── */

/**
 * Repos become "leaf" entries (isDirectory = false) with a special id prefix
 * so they can be identified in renderLeaf.
 */

const REPO_PREFIX = "repo::";

function toTreeEntries(nodes: InternalNode[]): TreeEntry[] {
  const result: TreeEntry[] = [];

  for (const node of nodes) {
    const childEntries = toTreeEntries(node.children);
    const repoEntries: TreeEntry[] = node.repos.map((repo) => ({
      id: REPO_PREFIX + repo.id,
      name: repo.name,
      path: repo.path,
      isDirectory: false,
      children: undefined,
    }));

    result.push({
      id: `dir::${node.fullPath}`,
      name: node.name,
      path: node.fullPath,
      isDirectory: true,
      children: [...childEntries, ...repoEntries],
    });
  }

  return result;
}

function countReposInEntries(entry: TreeEntry): number {
  if (!entry.isDirectory) return entry.id.startsWith(REPO_PREFIX) ? 1 : 0;
  let count = 0;
  if (entry.children) {
    for (const child of entry.children) {
      count += countReposInEntries(child);
    }
  }
  return count;
}

/* ── Compute which paths should be auto-expanded to reveal active repo ── */

function computeExpandedPaths(
  entries: TreeEntry[],
  activeRepoPath: string | null,
): Set<string> {
  const expanded = new Set<string>();
  if (!activeRepoPath) return expanded;

  function walk(entry: TreeEntry): boolean {
    if (!entry.isDirectory) {
      return entry.path === activeRepoPath;
    }
    let found = false;
    if (entry.children) {
      for (const child of entry.children) {
        if (walk(child)) found = true;
      }
    }
    if (found) {
      expanded.add(entry.path);
    }
    return found;
  }

  for (const e of entries) {
    walk(e);
  }
  return expanded;
}

/* ── Repo lookup map ── */

function buildRepoMap(repos: Repository[]): Map<string, Repository> {
  const map = new Map<string, Repository>();
  for (const r of repos) {
    map.set(REPO_PREFIX + r.id, r);
  }
  return map;
}

/* ── Main component ── */

type DirectoryTreeProps = {
  repos: Repository[];
  workingDirs: string[];
  activeRepoPath: string | null;
  pinnedPaths: Set<string>;
  onSelectRepo: (path: string) => void;
  onTogglePin: (path: string) => void;
};

export function DirectoryTree({
  repos,
  workingDirs,
  activeRepoPath,
  pinnedPaths,
  onSelectRepo,
  onTogglePin,
}: DirectoryTreeProps): React.ReactElement {
  const internalTree = useMemo(
    () => buildTree(repos, workingDirs),
    [repos, workingDirs],
  );

  const treeEntries = useMemo(() => toTreeEntries(internalTree), [internalTree]);

  const autoExpandPaths = useMemo(
    () => computeExpandedPaths(treeEntries, activeRepoPath),
    [treeEntries, activeRepoPath],
  );

  const repoMap = useMemo(() => buildRepoMap(repos), [repos]);

  /* Context menu for folder nodes */
  const contextMenuItems = useMemo(() => {
    return (entry: TreeEntry): ContextMenuAction[] => {
      if (!entry.isDirectory) return []; // repos have their own context menu in RepoItem
      return [
        {
          label: "Open in File Explorer",
          Icon: FolderOpen,
          action: () => void openInFileManager(entry.path),
        },
        {
          label: "Copy path",
          Icon: Clipboard,
          action: () => void navigator.clipboard.writeText(entry.path),
        },
      ];
    };
  }, []);

  /* Render repo leaf items using the existing RepoItem component */
  const renderLeaf = useMemo(() => {
    return (entry: TreeEntry, depth: number) => {
      const repo = repoMap.get(entry.id);
      if (!repo) return null;
      return (
        <div style={{ paddingLeft: depth * 14 + 8 }}>
          <RepoItem
            repo={repo}
            active={repo.path === activeRepoPath}
            pinned={pinnedPaths.has(repo.path)}
            onSelect={onSelectRepo}
            onTogglePin={onTogglePin}
          />
        </div>
      );
    };
  }, [repoMap, activeRepoPath, pinnedPaths, onSelectRepo, onTogglePin]);

  return (
    <FileTree
      entries={treeEntries}
      autoExpandPaths={autoExpandPaths}
      contextMenuItems={contextMenuItems}
      renderLeaf={renderLeaf}
      showFileIcons
      showExtensionBadge={false}
      showCountBadge
      countItems={countReposInEntries}
      indentPx={12}
    />
  );
}
