import React from "react";
import { Sparkles, X } from "lucide-react";
import { colors } from "../../../utils/colors";
import { useAiChatStore } from "../../../store/aiChatStore";
import type { MarkdownEditorMethods } from "../MarkdownEditor";
import { ChatPanel } from "./ChatPanel";

export interface ChatBubbleProps {
  filePath: string;
  repoPath: string;
  editorRef: React.RefObject<MarkdownEditorMethods | null>;
  /**
   * When true, the chat is Ask-only — the mode pills are hidden and
   * "Edit selection" / "Modify document" are unavailable. Used when the
   * editor is in preview mode or the file is not editable (git-ref paths,
   * read-only permissions, etc.) so the user can still discuss the doc
   * without any risk of accidental modification.
   */
  readOnly?: boolean;
}

/**
 * Ambient circular AI button anchored to the bottom-right corner of the
 * Markdown editor. Click toggles the chat panel. The panel itself is a
 * sibling component (`ChatPanel`) so the bubble and panel can render
 * independently.
 *
 * Mounted by `FileViewer` only when the currently-viewed file is a
 * Markdown file in edit mode — the bubble stays out of preview / non-MD
 * contexts to avoid cluttering read-only views.
 */
export function ChatBubble({ filePath, repoPath, editorRef, readOnly = false }: ChatBubbleProps): React.ReactElement {
  const open = useAiChatStore((s) => s.threadsByFile[filePath]?.open ?? false);
  const setOpen = useAiChatStore((s) => s.setOpen);

  return (
    <>
      {open && (
        <ChatPanel
          filePath={filePath}
          repoPath={repoPath}
          editorRef={editorRef}
          readOnly={readOnly}
          onClose={() => setOpen(filePath, false)}
        />
      )}
      <button
        type="button"
        onClick={() => setOpen(filePath, !open)}
        title={open ? "Close AI chat" : "Open AI chat"}
        style={{
          position: "absolute",
          right: 16,
          bottom: 16,
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: open ? colors.bgSurface : colors.primary,
          color: open ? colors.text : "white",
          border: open ? `1px solid ${colors.border}` : "none",
          boxShadow: "0 4px 14px rgba(0, 0, 0, 0.2)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 900,
        }}
      >
        {open ? <X size={18} strokeWidth={2} /> : <Sparkles size={18} strokeWidth={2} />}
      </button>
    </>
  );
}
