import React, { useEffect, useMemo, useState } from "react";
import ReactDiffViewer from "react-diff-viewer-continued";
import { Loader2 } from "lucide-react";

import { ipc } from "../../utils/ipc";
import { colors } from "../../utils/colors";
import { useTheme } from "../../theme/ThemeProvider";
import { FileIconBadge } from "../common/fileIcons";
import { FileStatusBadge } from "../common/FileStatusBadge";

export type DiffViewerProps = {
  /** Absolute path to the file on disk (working tree version). */
  filePath: string;
  /** Repo root (used to derive the relative path for `git show HEAD:…`). */
  repoPath: string;
  /** Git status so we can skip fetching the old/new side when appropriate. */
  fileStatus: string;
};

/**
 * Concrete color tokens for the diff viewer, derived from globals.css.
 * react-diff-viewer-continued injects styles via CSS-in-JS, so CSS custom
 * properties (var(--x)) don't resolve — we must supply real values.
 */
const THEME_TOKENS = {
  light: {
    bg: "#ffffff",              // --background: oklch(1 0 0)
    fg: "#1a1a1a",              // --foreground: oklch(0.145 0 0)
    muted: "#f5f4f2",           // --muted: oklch(0.972 0.008 85)
    mutedFg: "#7c7568",         // --muted-foreground: oklch(0.556 0.018 55)
    panel: "#f5f5f5",           // --panel: oklch(0.97 0 0)
    border: "#e5e2de",          // --border: oklch(0.922 0.008 82)
  },
  dark: {
    bg: "#2b2b2b",              // --background: oklch(0.205 0 0)
    fg: "#f5f5f5",              // --foreground: oklch(0.985 0 0)
    muted: "#3a3731",           // --muted: oklch(0.275 0.012 70)
    mutedFg: "#b3a99a",         // --muted-foreground: oklch(0.74 0.018 75)
    panel: "#363636",           // --panel: oklch(0.24 0 0)
    border: "rgba(255,255,255,0.10)", // --border: oklch(1 0 0 / 10%)
  },
} as const;

export function DiffViewer({
  filePath,
  repoPath,
  fileStatus,
}: DiffViewerProps): React.ReactElement {
  const { resolved: theme } = useTheme();
  const isDark = theme === "dark";
  const t = isDark ? THEME_TOKENS.dark : THEME_TOKENS.light;

  const [oldValue, setOldValue] = useState<string>("");
  const [newValue, setNewValue] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const relativePath = filePath.startsWith(repoPath)
    ? filePath.slice(repoPath.length).replace(/^\//, "")
    : filePath;
  const fileName = filePath.split("/").pop() ?? filePath;

  /** Simple line-based diff stats (additions / deletions). */
  const diffStats = useMemo(() => {
    const oldLines = oldValue ? oldValue.split("\n") : [];
    const newLines = newValue ? newValue.split("\n") : [];
    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);
    const added = newLines.filter((l) => !oldSet.has(l)).length;
    const removed = oldLines.filter((l) => !newSet.has(l)).length;
    return { added, removed };
  }, [oldValue, newValue]);

  useEffect(() => {
    let cancelled = false;

    async function fetchContents() {
      setIsLoading(true);
      setError(null);

      try {
        const isNew = fileStatus === "added" || fileStatus === "untracked";
        const isDeleted = fileStatus === "deleted";

        // Fetch old (HEAD) version — skip for new files
        let old = "";
        if (!isNew) {
          try {
            const resp = await ipc.send({
              type: "gitfile:read",
              repoPath,
              ref: "HEAD",
              relativePath,
            });
            if (resp.type === "gitfile:read:result") {
              old = resp.content;
            }
          } catch {
            // File doesn't exist in HEAD (new file) — leave empty
          }
        }

        // Fetch new (working tree) version — skip for deleted files
        let current = "";
        if (!isDeleted) {
          try {
            const resp = await ipc.send({
              type: "file:read",
              filePath,
            });
            if (resp.type === "file:read:result") {
              current = resp.content;
            }
          } catch {
            // File might not be readable — leave empty
          }
        }

        if (!cancelled) {
          setOldValue(old);
          setNewValue(current);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchContents();
    return () => {
      cancelled = true;
    };
  }, [filePath, repoPath, relativePath, fileStatus]);

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: 40,
          color: colors.textTertiary,
          fontSize: 13,
        }}
      >
        <Loader2
          size={16}
          strokeWidth={2}
          style={{ animation: "spin 1s linear infinite" }}
        />
        Loading diff…
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: 20,
          color: colors.error,
          fontSize: 13,
        }}
      >
        Failed to load diff: {error}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: `1px solid ${colors.border}`,
          background: colors.bgPanel,
          flexShrink: 0,
        }}
      >
        <FileIconBadge fileName={fileName} />
        <span style={{ fontSize: 12, fontWeight: 600, color: colors.text }}>
          {fileName}
        </span>
        <span
          style={{
            fontSize: 10,
            color: colors.textTertiary,
            fontFamily: "var(--font-mono)",
          }}
        >
          {relativePath}
        </span>
        <FileStatusBadge status={fileStatus as any} />

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Line change stats */}
        {!isLoading && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {diffStats.added > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, color: "#2ea043", fontFamily: "var(--font-mono)" }}>
                +{diffStats.added}
              </span>
            )}
            {diffStats.removed > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, color: "#f85149", fontFamily: "var(--font-mono)" }}>
                -{diffStats.removed}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Diff content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <ReactDiffViewer
          oldValue={oldValue}
          newValue={newValue}
          splitView={true}
          useDarkTheme={isDark}
          leftTitle="HEAD"
          rightTitle="Working Tree"
          hideSummary
          styles={{
            variables: {
              light: {
                diffViewerBackground: t.bg,
                diffViewerColor: t.fg,
                addedBackground: "rgba(46, 160, 67, 0.10)",
                addedColor: t.fg,
                removedBackground: "rgba(248, 81, 73, 0.10)",
                removedColor: t.fg,
                wordAddedBackground: "rgba(46, 160, 67, 0.30)",
                wordRemovedBackground: "rgba(248, 81, 73, 0.30)",
                addedGutterBackground: "rgba(46, 160, 67, 0.15)",
                removedGutterBackground: "rgba(248, 81, 73, 0.15)",
                gutterBackground: t.muted,
                gutterBackgroundDark: t.muted,
                highlightBackground: "rgba(139, 148, 158, 0.10)",
                highlightGutterBackground: "rgba(139, 148, 158, 0.15)",
                codeFoldGutterBackground: t.muted,
                codeFoldBackground: t.muted,
                emptyLineBackground: t.bg,
                gutterColor: t.mutedFg,
                addedGutterColor: t.fg,
                removedGutterColor: t.fg,
                codeFoldContentColor: t.mutedFg,
              },
              dark: {
                diffViewerBackground: t.bg,
                diffViewerColor: t.fg,
                addedBackground: "rgba(46, 160, 67, 0.15)",
                addedColor: t.fg,
                removedBackground: "rgba(248, 81, 73, 0.15)",
                removedColor: t.fg,
                wordAddedBackground: "rgba(46, 160, 67, 0.40)",
                wordRemovedBackground: "rgba(248, 81, 73, 0.40)",
                addedGutterBackground: "rgba(46, 160, 67, 0.20)",
                removedGutterBackground: "rgba(248, 81, 73, 0.20)",
                gutterBackground: t.muted,
                gutterBackgroundDark: t.muted,
                highlightBackground: "rgba(139, 148, 158, 0.15)",
                highlightGutterBackground: "rgba(139, 148, 158, 0.20)",
                codeFoldGutterBackground: t.muted,
                codeFoldBackground: t.muted,
                emptyLineBackground: t.bg,
                gutterColor: t.mutedFg,
                addedGutterColor: t.fg,
                removedGutterColor: t.fg,
                codeFoldContentColor: t.mutedFg,
              },
            },
            contentText: {
              fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
              fontSize: "12px",
              lineHeight: "20px",
            },
            gutter: {
              minWidth: "40px",
              padding: "0 8px",
            },
            titleBlock: {
              fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
              fontSize: "11px",
              padding: "6px 12px",
              background: t.panel,
              borderBottom: `1px solid ${t.border}`,
            },
          }}
        />
      </div>
    </div>
  );
}
