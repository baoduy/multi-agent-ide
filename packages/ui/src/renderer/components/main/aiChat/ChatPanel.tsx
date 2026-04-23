import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, X, Send, MoreHorizontal, Scissors } from "lucide-react";
import { colors } from "../../../utils/colors";
import {
  useAiChatStore,
  type CapturedSelection,
  type ChatMode,
} from "../../../store/aiChatStore";
import type { MarkdownEditorMethods } from "../MarkdownEditor";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { RewritePreviewDialog } from "./RewritePreviewDialog";

export interface ChatPanelProps {
  filePath: string;
  repoPath: string;
  editorRef: React.RefObject<MarkdownEditorMethods | null>;
  onClose: () => void;
  /**
   * When true, force Ask-only mode: mode pills are hidden, selection chip
   * is suppressed, and edit-selection / modify-document paths are
   * unreachable. Used when the host file viewer is in preview / read-only
   * mode so the user can chat about the doc without any edit affordances.
   */
  readOnly?: boolean;
}

/**
 * Floating chat panel anchored above the `ChatBubble` button. Contains:
 *   - header (AI icon, title "AI", subtitle = filename, close button)
 *   - scrollable message list
 *   - optional "Editing: …" chip when a selection is captured
 *   - mode pill row (Ask / Edit selection / Modify document)
 *   - input textarea + send button
 *
 * Layout is absolute-positioned inside the editor wrapper; the parent
 * bubble owns the open/close toggle.
 */
export function ChatPanel({ filePath, repoPath, editorRef, onClose, readOnly = false }: ChatPanelProps): React.ReactElement {
  const thread = useAiChatStore((s) => s.threadsByFile[filePath]);
  const setMode = useAiChatStore((s) => s.setMode);
  const setPendingSelection = useAiChatStore((s) => s.setPendingSelection);
  const clear = useAiChatStore((s) => s.clear);
  const sendAsk = useAiChatStore((s) => s.sendAsk);
  const requestEditSelection = useAiChatStore((s) => s.requestEditSelection);
  const requestModifyDocument = useAiChatStore((s) => s.requestModifyDocument);
  const appendSystemMessage = useAiChatStore((s) => s.appendSystemMessage);

  // Effective mode — always "ask" when read-only, regardless of any leftover
  // state from a previous editable session on the same file.
  const storedMode = thread?.mode ?? "ask";
  const mode = readOnly ? "ask" : storedMode;
  const messages = thread?.messages ?? [];
  const pendingSelection = readOnly ? null : (thread?.pendingSelection ?? null);
  const sending = thread?.sending ?? false;

  // If read-only mode is turned on while a non-Ask mode was set, snap the
  // store back to "ask" so the panel's state stays consistent after
  // switching into preview mode.
  useEffect(() => {
    if (readOnly && storedMode !== "ask") {
      setMode(filePath, "ask");
    }
  }, [readOnly, storedMode, filePath, setMode]);

  const [input, setInput] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [preview, setPreview] = useState<{ selection: CapturedSelection; proposed: string } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // When the panel first mounts, capture whatever selection is active in the
  // editor so the user can open the bubble *after* selecting text and still
  // end up in a sensible starting state. Also re-captures on input focus.
  // Disabled in read-only mode — selection is irrelevant when only Ask is
  // available, and skipping this avoids the chip flashing in preview mode.
  const captureCurrentSelection = useCallback(() => {
    if (readOnly) return;
    const sel = editorRef.current?.getSelection();
    if (sel) setPendingSelection(filePath, sel);
  }, [editorRef, filePath, setPendingSelection, readOnly]);

  useEffect(() => {
    captureCurrentSelection();
  }, [captureCurrentSelection]);

  // Auto-scroll messages to bottom when new ones arrive.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, sending]);

  const fileName = useMemo(() => filePath.split(/[\\/]/).pop() ?? filePath, [filePath]);

  const canSend = input.trim().length > 0 && !sending && (
    mode !== "edit-selection" || pendingSelection !== null
  );

  const handleSend = useCallback(async () => {
    if (!canSend) return;
    const text = input.trim();
    setInput("");
    const documentText = editorRef.current?.getMarkdown() ?? "";

    if (mode === "ask") {
      await sendAsk(filePath, repoPath, text, documentText);
      return;
    }
    if (mode === "edit-selection") {
      if (!pendingSelection) return;
      const proposed = await requestEditSelection(
        filePath,
        repoPath,
        text,
        documentText,
        pendingSelection,
      );
      if (proposed !== null) {
        setPreview({ selection: pendingSelection, proposed });
      }
      return;
    }
    if (mode === "modify-document") {
      const newDoc = await requestModifyDocument(filePath, repoPath, text, documentText);
      if (newDoc !== null) {
        editorRef.current?.setMarkdown(newDoc);
      }
    }
  }, [canSend, input, mode, pendingSelection, filePath, repoPath, editorRef, sendAsk, requestEditSelection, requestModifyDocument]);

  const handleApplyPreview = useCallback(() => {
    if (!preview) return;
    editorRef.current?.replaceRange(preview.selection, preview.proposed);
    appendSystemMessage(filePath, "Applied edit to selection.", "applied-edit");
    setPendingSelection(filePath, null);
    setPreview(null);
  }, [preview, editorRef, appendSystemMessage, filePath, setPendingSelection]);

  return (
    <div
      style={{
        position: "absolute",
        right: 16,
        bottom: 76, // leaves room for the bubble below
        width: 360,
        height: 520,
        display: "flex",
        flexDirection: "column",
        background: colors.dialogBg,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        boxShadow: "0 12px 40px rgba(0, 0, 0, 0.22)",
        zIndex: 950,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderBottom: `1px solid ${colors.border}`,
          background: colors.bgSurface,
        }}
      >
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: colors.primary,
            color: "white",
            flexShrink: 0,
          }}
        >
          <Sparkles size={16} strokeWidth={2} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: colors.text }}>AI Assistant</div>
          <div
            style={{
              fontSize: 10,
              color: colors.textMuted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={filePath}
          >
            {fileName}
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <IconButton title="More" onClick={() => setMoreOpen((v) => !v)}>
            <MoreHorizontal size={14} strokeWidth={1.8} />
          </IconButton>
          {moreOpen && (
            <div
              style={{
                position: "absolute",
                top: 30,
                right: 0,
                background: colors.dialogBg,
                border: `1px solid ${colors.border}`,
                borderRadius: 4,
                boxShadow: "0 4px 14px rgba(0,0,0,0.2)",
                zIndex: 10,
                minWidth: 140,
                padding: 3,
              }}
            >
              <MoreMenuItem
                label="Clear conversation"
                onClick={() => {
                  clear(filePath);
                  setMoreOpen(false);
                }}
              />
            </div>
          )}
        </div>
        <IconButton title="Close" onClick={onClose}>
          <X size={14} strokeWidth={1.8} />
        </IconButton>
      </div>

      {/* Message list */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 12,
          overflowY: "auto",
          background: colors.bgSurface,
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              alignSelf: "center",
              textAlign: "center",
              color: colors.textTertiary,
              fontSize: 11,
              padding: "16px 8px",
              maxWidth: 280,
            }}
          >
            Ask a question about this document, request a selection edit, or
            tell the AI how to modify the whole file.
          </div>
        )}
        {messages.map((m) => (
          <ChatMessageBubble key={m.id} message={m} />
        ))}
      </div>

      {/* Selection chip + mode pills + input */}
      <div
        style={{
          borderTop: `1px solid ${colors.border}`,
          padding: 8,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          background: colors.dialogBg,
        }}
      >
        {!readOnly && pendingSelection && (
          <SelectionChip
            text={pendingSelection.text}
            onClear={() => setPendingSelection(filePath, null)}
          />
        )}
        {!readOnly && (
          <ModePills
            mode={mode}
            hasSelection={pendingSelection !== null}
            onChange={(next) => setMode(filePath, next)}
          />
        )}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 6,
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onFocus={captureCurrentSelection}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={placeholderFor(mode, pendingSelection !== null)}
            rows={1}
            style={{
              flex: 1,
              resize: "none",
              maxHeight: 120,
              minHeight: 32,
              padding: "7px 10px",
              background: colors.bgSurface,
              color: colors.text,
              border: `1px solid ${colors.border}`,
              borderRadius: 999,
              fontSize: 12,
              fontFamily: "inherit",
              lineHeight: 1.4,
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!canSend}
            title={canSendTitle(mode, pendingSelection !== null, input, sending)}
            style={{
              width: 32,
              height: 32,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: canSend ? colors.primary : colors.bgMuted,
              color: canSend ? "white" : colors.textTertiary,
              border: "none",
              borderRadius: 8,
              cursor: canSend ? "pointer" : "default",
              flexShrink: 0,
            }}
          >
            <Send size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      <RewritePreviewDialog
        isOpen={preview !== null}
        original={preview?.selection.text ?? ""}
        proposed={preview?.proposed ?? ""}
        onApply={handleApplyPreview}
        onCancel={() => setPreview(null)}
      />
    </div>
  );
}

/* ─── Small primitives ───────────────────────────────────────────────── */

function IconButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        width: 26,
        height: 26,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        color: colors.textMuted,
        border: "none",
        borderRadius: 4,
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function MoreMenuItem({ label, onClick }: { label: string; onClick: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        padding: "5px 8px",
        textAlign: "left",
        background: "transparent",
        color: colors.text,
        border: "none",
        borderRadius: 3,
        fontSize: 11,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = colors.bgMuted;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {label}
    </button>
  );
}

function SelectionChip({ text, onClear }: { text: string; onClear: () => void }): React.ReactElement {
  const preview = text.length > 40 ? `${text.slice(0, 40).replace(/\s+/g, " ")}…` : text.replace(/\s+/g, " ");
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        alignSelf: "flex-start",
        padding: "3px 8px",
        fontSize: 10,
        background: "color-mix(in srgb, var(--primary) 12%, transparent)",
        color: colors.primary,
        border: `1px solid ${colors.primaryAlpha}`,
        borderRadius: 999,
        maxWidth: "100%",
      }}
      title={text}
    >
      <Scissors size={10} strokeWidth={2} />
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: 220,
        }}
      >
        {preview}
      </span>
      <button
        type="button"
        onClick={onClear}
        style={{
          background: "transparent",
          border: "none",
          color: colors.primary,
          cursor: "pointer",
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
        }}
        title="Clear selection"
      >
        <X size={10} strokeWidth={2.5} />
      </button>
    </div>
  );
}

const MODE_OPTIONS: { id: ChatMode; label: string; needsSelection: boolean }[] = [
  { id: "ask", label: "Ask", needsSelection: false },
  { id: "edit-selection", label: "Edit selection", needsSelection: true },
  { id: "modify-document", label: "Modify document", needsSelection: false },
];

function ModePills({
  mode,
  hasSelection,
  onChange,
}: {
  mode: ChatMode;
  hasSelection: boolean;
  onChange: (mode: ChatMode) => void;
}): React.ReactElement {
  return (
    <div
      style={{
        display: "inline-flex",
        alignSelf: "flex-start",
        padding: 2,
        background: colors.bgMuted,
        border: `1px solid ${colors.border}`,
        borderRadius: 999,
      }}
    >
      {MODE_OPTIONS.map((opt) => {
        const active = opt.id === mode;
        const disabled = opt.needsSelection && !hasSelection;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => !disabled && onChange(opt.id)}
            disabled={disabled}
            title={disabled ? "Select text in the editor first" : ""}
            style={{
              padding: "3px 10px",
              fontSize: 10,
              fontWeight: 500,
              border: "none",
              borderRadius: 999,
              cursor: disabled ? "default" : "pointer",
              background: active ? colors.primary : "transparent",
              color: active ? "white" : disabled ? colors.textTertiary : colors.textMuted,
              opacity: disabled ? 0.6 : 1,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function placeholderFor(mode: ChatMode, hasSelection: boolean): string {
  if (mode === "ask") return "Ask about this document…";
  if (mode === "edit-selection") {
    return hasSelection ? "How should I rewrite the selection?" : "Select text in the editor first";
  }
  return "Describe a change...";
}

function canSendTitle(mode: ChatMode, hasSelection: boolean, input: string, sending: boolean): string {
  if (sending) return "Waiting for response…";
  if (!input.trim()) return "Type a message";
  if (mode === "edit-selection" && !hasSelection) return "Select text in the editor first";
  return "Send (Enter)";
}
