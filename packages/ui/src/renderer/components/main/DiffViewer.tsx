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

function readCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function DiffViewer({
  filePath,
  repoPath,
  fileStatus,
}: DiffViewerProps): React.ReactElement {
  const { resolved } = useTheme();
  const isDark = resolved === "dark";

  const t = useMemo(() => {
    // react-diff-viewer uses CSS-in-JS and cannot resolve var(--token) directly,
    // so we read concrete values from computed CSS variables.
    return {
      bg: readCssVar("--diff-viewer-bg", colors.bgSurface),
      fg: readCssVar("--diff-viewer-fg", colors.text),
      muted: readCssVar("--diff-viewer-muted", colors.bgMuted),
      mutedFg: readCssVar("--diff-viewer-muted-fg", colors.textTertiary),
      panel: readCssVar("--diff-viewer-panel", colors.bgPanel),
      border: readCssVar("--diff-viewer-border", colors.border),
      addedBg: readCssVar("--diff-added-bg", "color-mix(in srgb, var(--success) 20%, transparent)"),
      removedBg: readCssVar("--diff-removed-bg", "color-mix(in srgb, var(--destructive) 20%, transparent)"),
      addedWordBg: readCssVar("--diff-added-word-bg", "color-mix(in srgb, var(--success) 35%, transparent)"),
      removedWordBg: readCssVar("--diff-removed-word-bg", "color-mix(in srgb, var(--destructive) 35%, transparent)"),
      addedGutterBg: readCssVar("--diff-added-gutter-bg", "color-mix(in srgb, var(--success) 26%, transparent)"),
      removedGutterBg: readCssVar("--diff-removed-gutter-bg", "color-mix(in srgb, var(--destructive) 26%, transparent)"),
      highlightBg: readCssVar("--diff-highlight-bg", "color-mix(in srgb, var(--muted-foreground) 18%, transparent)"),
      highlightGutterBg: readCssVar("--diff-highlight-gutter-bg", "color-mix(in srgb, var(--muted-foreground) 24%, transparent)"),
      addedText: readCssVar("--diff-added-text", colors.success),
      removedText: readCssVar("--diff-removed-text", colors.error),
    };
  }, [resolved]);

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
          gap: 6,
          padding: 20,
          color: colors.textTertiary,
          fontSize: 11,
        }}
      >
        <Loader2
          size={12}
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
          padding: 12,
          color: colors.error,
          fontSize: 11,
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
              <span style={{ fontSize: 11, fontWeight: 600, color: t.addedText, fontFamily: "var(--font-mono)" }}>
                +{diffStats.added}
              </span>
            )}
            {diffStats.removed > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, color: t.removedText, fontFamily: "var(--font-mono)" }}>
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
                addedBackground: t.addedBg,
                addedColor: t.fg,
                removedBackground: t.removedBg,
                removedColor: t.fg,
                wordAddedBackground: t.addedWordBg,
                wordRemovedBackground: t.removedWordBg,
                addedGutterBackground: t.addedGutterBg,
                removedGutterBackground: t.removedGutterBg,
                gutterBackground: t.muted,
                gutterBackgroundDark: t.muted,
                highlightBackground: t.highlightBg,
                highlightGutterBackground: t.highlightGutterBg,
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
                addedBackground: t.addedBg,
                addedColor: t.fg,
                removedBackground: t.removedBg,
                removedColor: t.fg,
                wordAddedBackground: t.addedWordBg,
                wordRemovedBackground: t.removedWordBg,
                addedGutterBackground: t.addedGutterBg,
                removedGutterBackground: t.removedGutterBg,
                gutterBackground: t.muted,
                gutterBackgroundDark: t.muted,
                highlightBackground: t.highlightBg,
                highlightGutterBackground: t.highlightGutterBg,
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
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              lineHeight: "20px",
            },
            gutter: {
              minWidth: "40px",
              padding: "0 8px",
            },
            titleBlock: {
              fontFamily: "var(--font-mono)",
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
