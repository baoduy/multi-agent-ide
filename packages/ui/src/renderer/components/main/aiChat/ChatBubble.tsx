import React, { useRef, useState } from "react";
import { Sparkles, X, Bot } from "lucide-react";
import type { AIProvider } from "@magenta/shared/aiTerminal";
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

type ProviderOption = {
  id: AIProvider;
  label: string;
  icon: React.ReactNode;
  bg: string;
};

const PROVIDER_OPTIONS: ProviderOption[] = [
  { id: "claude", label: "Claude", icon: <Sparkles size={14} strokeWidth={2} />, bg: colors.primary },
  { id: "copilot", label: "Copilot", icon: <Bot size={14} strokeWidth={2} />, bg: colors.textMuted },
];

/**
 * Ambient circular AI button anchored to the bottom-right corner of the
 * Markdown editor. Hovering the bubble while the panel is closed reveals a
 * Claude / Copilot picker; clicking an option opens the chat panel wired
 * to that provider. Clicking the bubble itself toggles the picker (so
 * keyboard / touch users can still reach both options).
 *
 * Mounted by `FileViewer` only when the currently-viewed file is a
 * Markdown file — the bubble stays out of non-MD contexts.
 */
export function ChatBubble({ filePath, repoPath, editorRef, readOnly = false }: ChatBubbleProps): React.ReactElement {
  const open = useAiChatStore((s) => s.threadsByFile[filePath]?.open ?? false);
  const setOpen = useAiChatStore((s) => s.setOpen);
  const openWithProvider = useAiChatStore((s) => s.openWithProvider);
  const [pickerVisible, setPickerVisible] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  const cancelHide = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimerRef.current = window.setTimeout(() => setPickerVisible(false), 120);
  };

  const handleBubbleClick = () => {
    if (open) {
      setOpen(filePath, false);
      setPickerVisible(false);
      return;
    }
    setPickerVisible((v) => !v);
  };

  const handlePick = (provider: AIProvider) => {
    cancelHide();
    setPickerVisible(false);
    openWithProvider(filePath, provider);
  };

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
      <div
        style={{ position: "absolute", right: 16, bottom: 16, zIndex: 900 }}
        onMouseEnter={() => {
          if (!open) {
            cancelHide();
            setPickerVisible(true);
          }
        }}
        onMouseLeave={scheduleHide}
      >
        {!open && pickerVisible && (
          <div
            style={{
              position: "absolute",
              right: 0,
              bottom: 52,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              alignItems: "flex-end",
            }}
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handlePick(opt.id)}
                title={`Open chat with ${opt.label}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 12px 6px 8px",
                  borderRadius: 999,
                  background: opt.bg,
                  color: "white",
                  border: "none",
                  boxShadow: "0 4px 14px rgba(0, 0, 0, 0.2)",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(255, 255, 255, 0.18)",
                  }}
                >
                  {opt.icon}
                </span>
                {opt.label}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={handleBubbleClick}
          title={open ? "Close AI chat" : "Open AI chat"}
          style={{
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
          }}
        >
          {open ? <X size={18} strokeWidth={2} /> : <Sparkles size={18} strokeWidth={2} />}
        </button>
      </div>
    </>
  );
}
