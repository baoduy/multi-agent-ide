import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, FileCode, Check, ChevronDown, Clipboard } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { ipc } from "../../utils/ipc";
import { sendOrThrow } from "../../services/ipcClient";
import { colors } from "../../utils/colors";
import { useTheme } from "../../theme/ThemeProvider";
import {
  extractHeadings,
  getFileName,
  isGitRefPath,
  isMarkdownFile,
  parseGitRef,
} from "./fileViewerUtils";
import {
  MarkdownTableOfContents,
  useActiveHeading,
} from "./MarkdownTableOfContents";
import { MarkdownEditor, type MarkdownEditorMethods } from "./MarkdownEditor";
import { ApproveButton } from "./ApproveButton";
import { ContextMenu, type ContextMenuPosition } from "../common/ContextMenu";

type ViewMode = "preview" | "edit";
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

  const baseBg = approved ? colors.successSoft : colors.success;
  const hoverBg = approved ? colors.successSoftBorder : colors.successHover;
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
  const contentRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MarkdownEditorMethods>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  const displayContent = editedContent ?? content;

  const headings = useMemo(
    () => (displayContent ? extractHeadings(displayContent) : []),
    [displayContent],
  );

  const activeHeadingId = useActiveHeading(
    contentRef,
    headings,
    viewMode === "preview",
  );

  const isMd = displayContent !== null && isMarkdownFile(filePath);
  const showToc = isMd && viewMode === "preview" && headings.length > 1;

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
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
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
          </div>
        </div>
      )}

      <div ref={contentRef} style={{ flex: 1, overflow: "auto" }}>
        {isMd ? (
          <div style={{ display: "flex", minHeight: "100%" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
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
            </div>

            {showToc && (
              <MarkdownTableOfContents
                headings={headings}
                activeId={activeHeadingId}
                containerRef={contentRef}
              />
            )}
          </div>
        ) : (
          <pre
            style={{
              margin: 0,
              padding: "10px 14px",
              fontFamily: "var(--font-mono)",
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
