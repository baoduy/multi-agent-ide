import React, { useEffect, useMemo, useState } from "react";
import CodeMirrorMerge from "react-codemirror-merge";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import { Loader2 } from "lucide-react";

import { ipc } from "../../utils/ipc";
import { colors } from "../../utils/colors";
import { useTheme } from "../../theme/ThemeProvider";
import { FileIconBadge } from "../common/fileIcons";
import { FileStatusBadge } from "../common/FileStatusBadge";

export type DiffViewerProps = {
  /**
   * Path to the file.
   * - Working-tree mode (`fromRef`/`toRef` unset): absolute path on disk.
   * - Ref-vs-ref mode (both `fromRef` and `toRef` set): repo-relative path.
   */
  filePath: string;
  /** Repo root. Used to derive the relative path for `git show …`. */
  repoPath: string;
  /** Git status so we can skip fetching the old/new side when appropriate. */
  fileStatus: string;
  /**
   * If set together with `toRef`, DiffViewer compares two refs instead of
   * HEAD-vs-working-tree. Old side → `git show <fromRef>:<oldPath ?? filePath>`,
   * new side → `git show <toRef>:<filePath>`.
   */
  fromRef?: string;
  toRef?: string;
  /** Rename support: path of the file on the `fromRef` side (if different). */
  oldPath?: string;
};

/** Pick a CodeMirror language extension based on the file extension. */
function languageExtensions(filePath: string): Extension[] {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "md":
    case "mdx":
      return [markdown()];
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return [javascript()];
    case "ts":
    case "tsx":
      return [javascript({ jsx: true, typescript: true })];
    case "json":
      return [json()];
    case "py":
      return [python()];
    case "html":
    case "htm":
      return [html()];
    case "css":
    case "scss":
    case "less":
      return [css()];
    default:
      return [];
  }
}

export function DiffViewer({
  filePath,
  repoPath,
  fileStatus,
  fromRef,
  toRef,
  oldPath,
}: DiffViewerProps): React.ReactElement {
  const { resolved } = useTheme();
  const isDark = resolved === "dark";

  const [oldValue, setOldValue] = useState<string>("");
  const [newValue, setNewValue] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ref-vs-ref mode when both refs are supplied; otherwise HEAD-vs-working.
  const refMode = Boolean(fromRef && toRef);

  const relativePath = refMode
    ? filePath
    : filePath.startsWith(repoPath)
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

  const extensions = useMemo<Extension[]>(() => {
    return [
      ...languageExtensions(filePath),
      isDark ? githubDark : githubLight,
      EditorView.theme({
        "&": { height: "100%", fontSize: "12px" },
        ".cm-content": { fontFamily: "var(--font-mono)", lineHeight: "1.55" },
      }),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
    ];
  }, [filePath, isDark]);

  useEffect(() => {
    let cancelled = false;

    async function fetchContents() {
      setIsLoading(true);
      setError(null);

      try {
        const isNew = fileStatus === "added" || fileStatus === "untracked";
        const isDeleted = fileStatus === "deleted";

        let old = "";
        let current = "";

        if (refMode) {
          // Compare two arbitrary refs. Either side may be missing (add/delete) —
          // the two reads have no dependency so we fire them in parallel.
          const leftPath = oldPath ?? filePath;
          const [leftResp, rightResp] = await Promise.all([
            ipc.send({ type: "gitfile:read", repoPath, ref: fromRef!, relativePath: leftPath }).catch(() => null),
            ipc.send({ type: "gitfile:read", repoPath, ref: toRef!, relativePath: filePath }).catch(() => null),
          ]);
          if (leftResp && leftResp.type === "gitfile:read:result") old = leftResp.content;
          if (rightResp && rightResp.type === "gitfile:read:result") current = rightResp.content;
        } else {
          if (!isNew) {
            try {
              const resp = await ipc.send({
                type: "gitfile:read",
                repoPath,
                ref: "HEAD",
                relativePath,
              });
              if (resp.type === "gitfile:read:result") old = resp.content;
            } catch {
              // File doesn't exist in HEAD (new file) — leave empty
            }
          }

          if (!isDeleted) {
            try {
              const resp = await ipc.send({ type: "file:read", filePath });
              if (resp.type === "file:read:result") current = resp.content;
            } catch {
              // File might not be readable — leave empty
            }
          }
        }

        if (!cancelled) {
          setOldValue(old);
          setNewValue(current);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void fetchContents();
    return () => {
      cancelled = true;
    };
  }, [filePath, repoPath, relativePath, fileStatus, refMode, fromRef, toRef, oldPath]);

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
                    padding: 12,
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
      <div style={{ padding: 12, color: colors.error, fontSize: 11 }}>
        Failed to load diff: {error}
      </div>
    );
  }

  return (
    <div
      data-color-mode={resolved}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
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
        <span style={{ fontSize: 11, fontWeight: 600, color: colors.text }}>{fileName}</span>
        <span
          style={{
            fontSize: 10,
            color: colors.textTertiary,
            fontFamily: "var(--font-mono)",
          }}
        >
          {refMode
            ? `${fromRef!.slice(0, 7)} → ${toRef!.slice(0, 7)}`
            : relativePath}
        </span>
        <FileStatusBadge status={fileStatus as any} />

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {diffStats.added > 0 && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: colors.success,
                fontFamily: "var(--font-mono)",
              }}
            >
              +{diffStats.added}
            </span>
          )}
          {diffStats.removed > 0 && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: colors.error,
                fontFamily: "var(--font-mono)",
              }}
            >
              -{diffStats.removed}
            </span>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "hidden" }}>
        <CodeMirrorMerge
          orientation="a-b"
          theme={isDark ? "dark" : "light"}
          style={{ height: "100%" }}
        >
          <CodeMirrorMerge.Original value={oldValue} extensions={extensions} />
          <CodeMirrorMerge.Modified value={newValue} extensions={extensions} />
        </CodeMirrorMerge>
      </div>
    </div>
  );
}
