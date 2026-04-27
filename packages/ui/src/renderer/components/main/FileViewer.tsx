import React, { useCallback, useEffect, useRef, useState } from "react";
import { Eye, FileCode, Check, ChevronDown, Clipboard, Code } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { ipc } from "../../utils/ipc";
import { sendOrThrow } from "../../services/ipcClient";
import { colors } from "../../utils/colors";
import { useTheme } from "../../theme/ThemeProvider";
import {
  getFileName,
  isGitRefPath,
  isMarkdownFile,
  parseGitRef,
} from "./fileViewerUtils";
import { MarkdownEditor, type MarkdownEditorMethods } from "./MarkdownEditor";
import { useMarkdownPreviewStore } from "../../store/markdownPreviewStore";
import { useActiveEditorStore } from "../../store/activeEditorStore";
import { ApproveButton } from "./ApproveButton";
import { ContextMenu, type ContextMenuPosition } from "../common/ContextMenu";
import { threeWayMerge } from "../../services/threeWayMerge";
import { FileChangedBanner, type FileChangedAction } from "./FileChangedBanner";

type ViewMode = "preview" | "edit" | "raw";
type SaveStatus = "idle" | "saving" | "saved";

type FileViewerProps = {
  filePath: string;
  /** Required for reading files from non-current branches (gitref:// paths). */
  repoPath?: string;
};

/* ─────────────────────────────────────────────
   Small UI primitives
   ───────────────────────────────────────────── */

/**
 * Trailing chevron button for the ApproveButton split-button group.
 * Opens a ContextMenu anchored below the button with view-mode toggles
 * (Preview / Edit) and the Copy action.
 * Visually fuses with the ApproveButton — uses solid green while approval is
 * pending and muted-green once the file has been approved, matching the main
 * button's visual state on either side of the seam.
 */
function ApproveActionsChevron({
  content,
  approved,
  viewMode,
  onViewModeChange,
  canEdit,
}: {
  content: string;
  approved: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  canEdit: boolean;
}): React.ReactElement {
  const [menuPos, setMenuPos] = useState<ContextMenuPosition | null>(null);
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleToggle = useCallback(() => {
    if (menuPos) {
      setMenuPos(null);
      return;
    }
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuPos({ x: rect.right - 160, y: rect.bottom + 4 });
  }, [menuPos]);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [content]);

  const baseBg = approved ? colors.successSoft : colors.primary;
  const hoverBg = approved
    ? colors.successSoftBorder
    : `color-mix(in srgb, ${colors.primary} 88%, black)`;
  const fg = approved ? colors.success : colors.primaryForeground;
  const seam = approved
    ? `1px solid ${colors.successSoftBorder}`
    : `1px solid color-mix(in srgb, ${colors.primaryForeground} 25%, transparent)`;

  const items = [
    {
      label: "Preview",
      Icon: (viewMode === "preview" ? Check : Eye) as LucideIcon,
      iconColor: viewMode === "preview" ? colors.primary : undefined,
      action: () => onViewModeChange("preview"),
    },
    ...(canEdit
      ? [
          {
            label: "Edit",
            Icon: (viewMode === "edit" ? Check : FileCode) as LucideIcon,
            iconColor: viewMode === "edit" ? colors.primary : undefined,
            action: () => onViewModeChange("edit"),
          },
        ]
      : []),
    {
      label: "Raw",
      Icon: (viewMode === "raw" ? Check : Code) as LucideIcon,
      iconColor: viewMode === "raw" ? colors.primary : undefined,
      action: () => onViewModeChange("raw"),
    },
    {
      label: copied ? "Copied!" : "Copy content",
      Icon: (copied ? Check : Clipboard) as LucideIcon,
      separator: true,
      action: handleCopy,
    },
  ];

  return (
    <>
    {menuPos && (
        <ContextMenu
          position={menuPos}
          items={items}
          onClose={() => setMenuPos(null)}
        />
      )}
      <button
        ref={buttonRef}
        type="button"
        title="More actions"
        onClick={handleToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "4px 6px",
          color: fg,
          background: hovered || menuPos ? hoverBg : baseBg,
          border: approved ? `1px solid ${colors.successSoftBorder}` : "none",
          borderLeft: seam,
          borderRadius: "0 6px 6px 0",
          cursor: "pointer",
          transition: "background 0.15s",
          fontFamily: "inherit",
        }}
      >
        <ChevronDown size={13} strokeWidth={2} />
      </button>
    </>
  );
}

/**
 * Replaces the Approve button while the markdown editor is in edit mode.
 * Clicking commits the same path as the chevron menu's Preview entry —
 * `handleViewModeChange("preview")` — which auto-saves any pending edits
 * and flips back to preview, where the Approve button reappears.
 *
 * Visually mirrors the green ApproveButton + rightSlot chevron pair so the
 * header doesn't shift when toggling modes.
 */
function DoneButton({
  onClick,
  rightSlot,
}: {
  onClick: () => void;
  rightSlot?: React.ReactNode;
}): React.ReactElement {
  const grouped = rightSlot != null;
  const leftRadius = grouped ? "6px 0 0 6px" : "6px";
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ display: "inline-flex" }}>
      <button
        type="button"
        title="Finish editing and return to preview"
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 10px",
          fontSize: 11,
          fontWeight: 600,
          color: colors.primaryForeground,
          background: hovered ? `color-mix(in srgb, ${colors.primary} 88%, black)` : colors.primary,
          border: "none",
          borderRadius: leftRadius,
          cursor: "pointer",
          transition: "all 0.15s",
          fontFamily: "inherit",
        }}
      >
        <Check size={13} strokeWidth={2} />
        <span>Done</span>
      </button>
      {rightSlot}
    </div>
  );
}

/* ─────────────────────────────────────────────
   FileViewer
   ───────────────────────────────────────────── */

export function FileViewer({ filePath, repoPath }: FileViewerProps): React.ReactElement {
  const { resolved } = useTheme();

  const [content, setContent] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  /**
   * Set when the watcher observes a disk change that the 3-way merge can't
   * reconcile with the user's unsaved edits. Holds the new disk content so
   * the banner's "Take disk" action can replace the buffer in one step.
   */
  const [pendingDiskChange, setPendingDiskChange] = useState<
    { newContent: string; mtime: number } | null
  >(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MarkdownEditorMethods>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Latest `content` / `editedContent` exposed to the watcher listener without
  // re-subscribing every keystroke. Without these refs the effect would either
  // capture stale state or have to re-run constantly.
  const contentRefLatest = useRef<string | null>(null);
  const editedContentRefLatest = useRef<string | null>(null);
  contentRefLatest.current = content;
  editedContentRefLatest.current = editedContent;

  const isGitRef = isGitRefPath(filePath);
  const canEdit = !isGitRef && isMarkdownFile(filePath);
  const isDirty = canEdit && editedContent !== null && editedContent !== content;

  const save = useCallback(async () => {
    if (!isDirty || editedContent === null) return;
    setSaveStatus("saving");
    try {
      await sendOrThrow({ type: "file:write", filePath, content: editedContent });
      setContent(editedContent);
      setSaveStatus("saved");
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 1500);
    } catch {
      setSaveStatus("idle");
    }
  }, [isDirty, editedContent, filePath]);

  // Auto-save when switching away from edit mode.
  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      if (mode === "preview" && isDirty) void save();
      setViewMode(mode);
    },
    [isDirty, save],
  );

  // Load file content
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);
    setEditedContent(null);
    setSaveStatus("idle");

    void (async () => {
      const gitRef = parseGitRef(filePath);
      const response =
        gitRef && repoPath
          ? await ipc.send({
              type: "gitfile:read",
              repoPath,
              ref: gitRef.ref,
              relativePath: gitRef.relativePath,
            })
          : await ipc.send({ type: "file:read", filePath });

      if (cancelled) return;

      if (response.type === "file:read:result" || response.type === "gitfile:read:result") {
        setContent(response.content);
        setEditedContent(response.content);
        setLoading(false);
      } else if (response.type === "error") {
        setError(response.message);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filePath, repoPath]);

  useEffect(() => () => clearTimeout(saveTimerRef.current), []);

  /**
   * Watch the open file for external changes. When one arrives, try a 3-way
   * merge against the user's unsaved edits:
   *   - `base`   = last content we read from disk (in `content`)
   *   - `ours`   = current editor buffer (`editedContent`)
   *   - `theirs` = newContent from the push event
   *
   * Clean merge → replace the buffer via `replaceMarkdownPreservingCursor`
   * so the viewport doesn't snap to the top.
   * Conflict → stash the new disk content and show a banner; the user picks
   * a side.
   *
   * Skipped for git-ref paths (read-only views of historical content) and
   * non-markdown files (the editor renders them as plain <pre>).
   */
  useEffect(() => {
    if (isGitRef || !canEdit) return;
    let cancelled = false;
    let watchId: string | null = null;

    void (async () => {
      try {
        const resp = await sendOrThrow({ type: "file:watch", filePath });
        if (cancelled) {
          // If we already unmounted, immediately unwatch; the component will
          // never read the id back and we don't want a dangling watcher.
          void sendOrThrow({ type: "file:unwatch", watchId: resp.watchId }).catch(() => {});
          return;
        }
        watchId = resp.watchId;
      } catch {
        // Watcher is non-critical — file editing still works without it.
        // Swallow errors (likely FILE_WATCH_FAILED on a file that was
        // just deleted, etc.).
      }
    })();

    const off = ipc.on("file:changed-on-disk", (evt) => {
      if (!watchId || evt.watchId !== watchId) return;
      const base = contentRefLatest.current ?? "";
      const ours = editedContentRefLatest.current ?? base;
      const theirs = evt.newContent;
      // No local edits in flight → just take the disk content.
      if (ours === base) {
        setContent(theirs);
        setEditedContent(theirs);
        editorRef.current?.replaceMarkdownPreservingCursor(theirs);
        return;
      }
      const result = threeWayMerge(base, ours, theirs);
      if (result.ok) {
        setContent(theirs);
        setEditedContent(result.merged);
        editorRef.current?.replaceMarkdownPreservingCursor(result.merged);
      } else {
        setPendingDiskChange({ newContent: theirs, mtime: evt.mtime });
      }
    });

    return () => {
      cancelled = true;
      off();
      if (watchId) {
        void sendOrThrow({ type: "file:unwatch", watchId }).catch(() => {});
      }
    };
  }, [filePath, isGitRef, canEdit]);

  /**
   * Banner actions for the conflict case. "Use mine" silently takes the
   * in-editor buffer and bumps `content` to the pending disk content so
   * the next merge uses the right base. "Take disk" discards the buffer
   * and loads the new content.
   */
  const handleConflictAction = useCallback(
    (action: FileChangedAction) => {
      if (!pendingDiskChange) return;
      if (action === "use-mine") {
        // Treat the disk content as the new base — future merges will reason
        // from here even though we didn't adopt it in the editor.
        setContent(pendingDiskChange.newContent);
      } else if (action === "take-disk") {
        setContent(pendingDiskChange.newContent);
        setEditedContent(pendingDiskChange.newContent);
        editorRef.current?.replaceMarkdownPreservingCursor(pendingDiskChange.newContent);
      }
      setPendingDiskChange(null);
    },
    [pendingDiskChange],
  );

  const displayContent = editedContent ?? content;

  const isMd = displayContent !== null && isMarkdownFile(filePath);

  // Register this pane with the global active-editor store so the app-level
  // ChatBubble can find which file is currently on screen and attach itself
  // to the right editor ref. Non-markdown viewers register with `null` so
  // the bubble still shows (Ask-only) but can't reach for document text /
  // selection. Unregisters on unmount or when the filePath changes so stale
  // entries don't linger after a tab close.
  const registerEditor = useActiveEditorStore((s) => s.register);
  const unregisterEditor = useActiveEditorStore((s) => s.unregister);
  useEffect(() => {
    registerEditor(filePath, {
      repoPath: repoPath ?? getFileDir(filePath),
      editorRef: isMd ? editorRef : null,
      readOnly: viewMode === "preview" || !canEdit,
    });
    return () => unregisterEditor(filePath);
  }, [filePath, repoPath, isMd, viewMode, canEdit, registerEditor, unregisterEditor]);

  // Publish the current preview to the right-sidebar TOC panel. Runs only
  // when we're in preview mode on a markdown file — cleared otherwise and
  // on unmount. `clearIf` guards against a late unmount stomping on a
  // newer preview that just took over (tab switches are fast).
  const setPreviewActive = useMarkdownPreviewStore((s) => s.setActive);
  const clearPreviewIf = useMarkdownPreviewStore((s) => s.clearIf);
  useEffect(() => {
    const shouldPublish =
      isMd && viewMode === "preview" && displayContent !== null && contentRef.current !== null;
    if (!shouldPublish) {
      clearPreviewIf(filePath);
      return;
    }
    setPreviewActive({
      filePath,
      content: displayContent,
      scrollEl: contentRef.current!,
    });
    return () => {
      clearPreviewIf(filePath);
    };
  }, [filePath, isMd, viewMode, displayContent, setPreviewActive, clearPreviewIf]);

  if (loading) {
    return (
      <div style={{ padding: 12, color: colors.textTertiary, fontSize: 11 }}>
        Loading {getFileName(filePath)}...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 12 }}>
        <div
          style={{
            background: colors.errorSoft,
            border: `1px solid ${colors.errorSoftBorder}`,
            borderRadius: 6,
            padding: 8,
            fontSize: 11,
            color: colors.errorDark,
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  if (displayContent === null) return <div />;

  return (
    <div
      data-color-mode={resolved}
      style={{ height: "100%", display: "flex", flexDirection: "column", position: "relative" }}
    >
      {isMd && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "4px 12px",
            borderBottom: `1px solid ${colors.border}`,
            background: colors.bgSurface,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: colors.textTertiary, fontWeight: 500 }}>
              {getFileName(filePath)}
            </span>
            {canEdit && saveStatus === "saving" && (
              <span style={{ fontSize: 10, color: colors.textTertiary }}>Saving...</span>
            )}
            {canEdit && saveStatus === "saved" && (
              <span
                style={{
                  fontSize: 10,
                  color: colors.success,
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <Check size={10} /> Saved
              </span>
            )}
            {canEdit && isDirty && saveStatus === "idle" && (
              <span style={{ fontSize: 10, color: colors.warningText }}>Unsaved</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isGitRef && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: colors.warningText,
                  background: colors.warningSoft,
                  padding: "3px 8px",
                  borderRadius: 4,
                }}
              >
                read-only
              </span>
            )}
            {viewMode === "edit" && canEdit ? (
              // While editing, the primary header action is "Done" — it
              // saves any pending edits and flips back to preview mode.
              // The Approve action only matters once the user is reading
              // the rendered document, so we hide it during editing.
              <DoneButton
                onClick={() => handleViewModeChange("preview")}
                rightSlot={
                  <ApproveActionsChevron
                    content={displayContent}
                    approved={/\*\*Approved by:\*\*/.test(displayContent)}
                    viewMode={viewMode}
                    onViewModeChange={handleViewModeChange}
                    canEdit={canEdit}
                  />
                }
              />
            ) : (
              <ApproveButton
                filePath={filePath}
                content={displayContent}
                repoPath={repoPath}
                onApproved={(newContent) => {
                  setContent(newContent);
                  setEditedContent(newContent);
                  editorRef.current?.setMarkdown(newContent);
                }}
                rightSlot={
                  <ApproveActionsChevron
                    content={displayContent}
                    approved={/\*\*Approved by:\*\*/.test(displayContent)}
                    viewMode={viewMode}
                    onViewModeChange={handleViewModeChange}
                    canEdit={canEdit}
                  />
                }
              />
            )}
          </div>
        </div>
      )}

      {pendingDiskChange && (
        <FileChangedBanner
          ours={editedContent ?? content ?? ""}
          theirs={pendingDiskChange.newContent}
          onAction={handleConflictAction}
        />
      )}

      <div ref={contentRef} style={{ flex: 1, overflow: "auto" }}>
        {isMd && viewMode !== "raw" ? (
          <MarkdownEditor
            key={filePath}
            ref={editorRef}
            value={displayContent}
            onChange={(val) => setEditedContent(val)}
            onBlur={() => {
              if (isDirty) void save();
            }}
            readOnly={viewMode === "preview" || !canEdit}
            filePath={filePath}
            repoPath={repoPath}
          />
        ) : (
          <pre
            style={{
              margin: 0,
              padding: "10px 14px",
              fontFamily:
                isMd && viewMode === "raw"
                  ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                  : "var(--font-sans)",
              fontSize: 11,
              lineHeight: 1.55,
              color: colors.text,
              background: colors.bgSurface,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {displayContent}
          </pre>
        )}
      </div>
    </div>
  );
}

/**
 * Fallback repo path for files opened outside a tracked repo. The daemon's
 * `.magenta/ai/config.json` resolver walks from this path; if nothing
 * exists locally it falls back to `~/.magenta/ai/` and built-in defaults.
 */
function getFileDir(filePath: string): string {
  const sep = filePath.includes("/") ? "/" : "\\";
  const idx = filePath.lastIndexOf(sep);
  return idx > 0 ? filePath.slice(0, idx) : filePath;
}
