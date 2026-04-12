import React, { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react";
import type { AISessionRecord } from "@magenta/shared/aiTerminal";
import { AISessionListItem } from "./AISessionListItem";
import { colors } from "../../utils/colors";

/* ── Tree node type ── */

export interface DirectoryTreeNode {
  /** Display label for this segment (e.g. "projects" or "magenta-ide") */
  label: string;
  /** Full absolute path this node represents */
  fullPath: string;
  /** Child directories */
  children: DirectoryTreeNode[];
  /** Sessions attached directly to this directory */
  sessions: AISessionRecord[];
  /** Depth in the tree (0 = root) */
  depth: number;
}

/* ── Tree builder ── */

/**
 * Builds a directory tree from live sessions, grouped by their
 * repoPath or cwd. Compresses single-child intermediate nodes
 * (Patricia trie style) so the tree stays shallow and readable.
 *
 * Example:
 *   /Users/steven/projects/app-a  (2 sessions)
 *   /Users/steven/projects/app-b  (1 session)
 *   /Users/steven/work/client     (1 session)
 *
 * Produces:
 *   ~/projects
 *     app-a  (2)
 *     app-b  (1)
 *   ~/work
 *     client (1)
 */
export function buildSessionTree(sessions: AISessionRecord[]): DirectoryTreeNode[] {
  if (sessions.length === 0) return [];

  // Group sessions by directory path
  const groupMap = new Map<string, AISessionRecord[]>();
  for (const session of sessions) {
    const key = session.repoPath || session.cwd || "/Workspace";
    const existing = groupMap.get(key);
    if (existing) {
      existing.push(session);
    } else {
      groupMap.set(key, [session]);
    }
  }

  // Build a raw trie from paths
  interface RawNode {
    segment: string;
    fullPath: string;
    children: Map<string, RawNode>;
    sessions: AISessionRecord[];
  }

  const root: RawNode = { segment: "", fullPath: "", children: new Map(), sessions: [] };

  for (const [dirPath, dirSessions] of groupMap) {
    const segments = dirPath.replace(/\\/g, "/").split("/").filter(Boolean);
    let current = root;
    let accumulated = "";

    for (const seg of segments) {
      accumulated += "/" + seg;
      let child = current.children.get(seg);
      if (!child) {
        child = { segment: seg, fullPath: accumulated, children: new Map(), sessions: [] };
        current.children.set(seg, child);
      }
      current = child;
    }

    // Sort sessions within this leaf by lastActiveAt DESC
    dirSessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
    current.sessions = dirSessions;
  }

  // Compress the trie: merge single-child intermediates with no sessions
  function compress(node: RawNode): RawNode {
    // First compress all children
    const compressedChildren = new Map<string, RawNode>();
    for (const [key, child] of node.children) {
      compressedChildren.set(key, compress(child));
    }
    node.children = compressedChildren;

    // If this node has exactly one child and no sessions, merge downward
    if (node.children.size === 1 && node.sessions.length === 0) {
      const [, onlyChild] = [...node.children.entries()][0];
      const merged: RawNode = {
        segment: node.segment ? `${node.segment}/${onlyChild.segment}` : onlyChild.segment,
        fullPath: onlyChild.fullPath,
        children: onlyChild.children,
        sessions: onlyChild.sessions,
      };
      return merged;
    }

    return node;
  }

  const compressedRoot = compress(root);

  // Convert RawNode → DirectoryTreeNode
  function toTreeNode(raw: RawNode, depth: number): DirectoryTreeNode {
    const childNodes = [...raw.children.values()]
      .map((c) => toTreeNode(c, depth + 1))
      .sort((a, b) => a.label.localeCompare(b.label));

    return {
      label: raw.segment || "Workspace",
      fullPath: raw.fullPath || "/Workspace",
      children: childNodes,
      sessions: raw.sessions,
      depth,
    };
  }

  // If compressed root has no sessions and just wraps children, return children as top-level
  if (compressedRoot.sessions.length === 0 && compressedRoot.children.size > 0) {
    return [...compressedRoot.children.values()]
      .map((c) => toTreeNode(c, 0))
      .sort((a, b) => {
        // Sort by most-recently-active session across entire subtree
        const latestA = getLatestTimestamp(a);
        const latestB = getLatestTimestamp(b);
        return latestB - latestA;
      });
  }

  return [toTreeNode(compressedRoot, 0)];
}

/** Get the latest lastActiveAt in a tree node and all descendants */
function getLatestTimestamp(node: DirectoryTreeNode): number {
  let latest = 0;
  for (const s of node.sessions) {
    if (s.lastActiveAt > latest) latest = s.lastActiveAt;
  }
  for (const child of node.children) {
    const childLatest = getLatestTimestamp(child);
    if (childLatest > latest) latest = childLatest;
  }
  return latest;
}

/** Count total sessions in a tree node and all descendants */
function countSessions(node: DirectoryTreeNode): number {
  let total = node.sessions.length;
  for (const child of node.children) {
    total += countSessions(child);
  }
  return total;
}

/** Count active sessions (running/waiting-input) in the subtree */
function countActiveSessions(node: DirectoryTreeNode): number {
  let count = node.sessions.filter(
    (s) => s.status === "active" || s.status === "waiting-input",
  ).length;
  for (const child of node.children) {
    count += countActiveSessions(child);
  }
  return count;
}

/* ── Components ── */

type DirectoryTreeNodeViewProps = {
  node: DirectoryTreeNode;
  defaultExpanded?: boolean;
  onSelect: (sessionId: string) => void;
  onResume: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
};

function DirectoryTreeNodeComponent({
  node,
  defaultExpanded = true,
  onSelect,
  onResume,
  onDelete,
}: DirectoryTreeNodeViewProps): React.ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const totalSessions = useMemo(() => countSessions(node), [node]);
  const activeCount = useMemo(() => countActiveSessions(node), [node]);
  const hasChildren = node.children.length > 0 || node.sessions.length > 0;
  const indent = node.depth * 16;

  return (
    <div>
      {/* Directory row */}
      <button
        type="button"
        onClick={toggleExpanded}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 16px",
          paddingLeft: 16 + indent,
          borderBottom: `1px solid ${colors.border}`,
          background: node.depth === 0 ? colors.bgMuted : colors.bgSurface,
          border: "none",
          cursor: hasChildren ? "pointer" : "default",
          textAlign: "left",
          transition: "background 0.12s",
        }}
      >
        {/* Expand/collapse chevron */}
        {hasChildren ? (
          expanded ? (
            <ChevronDown size={12} color={colors.textTertiary} style={{ flexShrink: 0 }} />
          ) : (
            <ChevronRight size={12} color={colors.textTertiary} style={{ flexShrink: 0 }} />
          )
        ) : (
          <span style={{ width: 12, flexShrink: 0 }} />
        )}

        {/* Folder icon */}
        {expanded && hasChildren ? (
          <FolderOpen size={13} color={colors.textSecondary} style={{ flexShrink: 0 }} />
        ) : (
          <Folder size={13} color={colors.textTertiary} style={{ flexShrink: 0 }} />
        )}

        {/* Label */}
        <span
          style={{
            flex: 1,
            fontSize: node.depth === 0 ? 12 : 11,
            fontWeight: node.depth === 0 ? 600 : 500,
            color: node.depth === 0 ? colors.text : colors.textSecondary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {node.label}
        </span>

        {/* Active indicator */}
        {activeCount > 0 && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: "#3d7a2a",
              padding: "1px 5px",
              borderRadius: 4,
              background: "#3d7a2a14",
              border: "1px solid #3d7a2a40",
              flexShrink: 0,
            }}
          >
            {activeCount} active
          </span>
        )}

        {/* Total session count */}
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: colors.textTertiary,
            padding: "1px 5px",
            borderRadius: 4,
            background: colors.bgHover,
            flexShrink: 0,
          }}
        >
          {totalSessions}
        </span>
      </button>

      {/* Expanded content: child directories then sessions */}
      {expanded && (
        <>
          {node.children.map((child) => (
            <DirectoryTreeNodeView
              key={child.fullPath}
              node={child}
              defaultExpanded={node.depth < 1}
              onSelect={onSelect}
              onResume={onResume}
              onDelete={onDelete}
            />
          ))}
          {node.sessions.map((session) => (
            <div key={session.id} style={{ paddingLeft: indent }}>
              <AISessionListItem
                session={session}
                onSelect={onSelect}
                onResume={onResume}
                onDelete={onDelete}
              />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export const DirectoryTreeNodeView = React.memo(DirectoryTreeNodeComponent);
