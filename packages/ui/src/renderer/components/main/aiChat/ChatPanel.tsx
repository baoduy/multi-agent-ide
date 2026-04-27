import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Send, MoreHorizontal, Scissors } from "lucide-react";
import { colors } from "../../../utils/colors";
import { ProviderIcon } from "../../common/ProviderIcon";
import {
  useAiChatStore,
  type CapturedSelection,
  type ChatMode,
} from "../../../store/aiChatStore";
import type { MarkdownEditorMethods } from "../MarkdownEditor";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { RewritePreviewDialog } from "./RewritePreviewDialog";
import { localStore } from "../../../services/localStorage";

/* ── Resizable panel: persist size across sessions ── */
const PANEL_W_DEFAULT = 360;
const PANEL_H_DEFAULT = 520;
const PANEL_W_MIN = 320;
const PANEL_H_MIN = 360;
const PANEL_W_MAX = 900;
const PANEL_H_MAX = 900;
/** Reserved space at the right edge (panel anchor) and bottom (above the
 *  ChatBubble). Used to clamp the panel against the viewport. */
const PANEL_ANCHOR_RIGHT = 16;
const PANEL_ANCHOR_BOTTOM = 76;

type PanelSize = { width: number; height: number };

function clampPanelSize(s: PanelSize): PanelSize {
  const maxW =
    typeof window !== "undefined"
      ? Math.min(PANEL_W_MAX, Math.max(PANEL_W_MIN, window.innerWidth - PANEL_ANCHOR_RIGHT - 8))
      : PANEL_W_MAX;
  const maxH =
    typeof window !== "undefined"
      ? Math.min(PANEL_H_MAX, Math.max(PANEL_H_MIN, window.innerHeight - PANEL_ANCHOR_BOTTOM - 8))
      : PANEL_H_MAX;
  return {
    width: Math.round(Math.max(PANEL_W_MIN, Math.min(maxW, s.width))),
    height: Math.round(Math.max(PANEL_H_MIN, Math.min(maxH, s.height))),
  };
}

const chatPanelSizeStore = localStore<PanelSize>({
  key: "magenta:chat-panel-size",
  fallback: { width: PANEL_W_DEFAULT, height: PANEL_H_DEFAULT },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") return undefined;
    const r = raw as { width?: unknown; height?: unknown };
    if (typeof r.width !== "number" || !Number.isFinite(r.width)) return undefined;
    if (typeof r.height !== "number" || !Number.isFinite(r.height)) return undefined;
    return clampPanelSize({ width: r.width, height: r.height });
  },
});

export interface ChatPanelProps {
  filePath: string;
  repoPath: string;
  /** Null when the active surface is a diff or non-markdown viewer. */
  editorRef: React.RefObject<MarkdownEditorMethods | null> | null;
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
  const openThreadForFile = useAiChatStore((s) => s.openThreadForFile);
  const archiveActiveAndStartNew = useAiChatStore((s) => s.archiveActiveAndStartNew);
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

  // Phase 8 — auto-resume the per-(file, provider) thread on mount and on
  // provider switch. The store-level resolver handles fallback to a fresh
  // thread when none exists.
  const currentProvider = thread?.provider ?? "claude";
  useEffect(() => {
    void openThreadForFile(filePath, currentProvider);
  }, [filePath, currentProvider, openThreadForFile]);

  const [input, setInput] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [size, setSize] = useState<PanelSize>(() => clampPanelSize(chatPanelSizeStore.get()));

  // Persist size when it settles. The localStore already debounces writes,
  // so it's safe to call on every change.
  useEffect(() => {
    chatPanelSizeStore.set(size);
  }, [size]);

  // Re-clamp if the window shrinks below the panel's current size.
  useEffect(() => {
    const onResize = () => setSize((s) => clampPanelSize(s));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
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
    const sel = editorRef?.current?.getSelection();
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
    const documentText = (await editorRef?.current?.getMarkdown()) ?? "";

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
        editorRef?.current?.setMarkdown(newDoc);
      }
    }
  }, [canSend, input, mode, pendingSelection, filePath, repoPath, editorRef, sendAsk, requestEditSelection, requestModifyDocument]);

  const handleApplyPreview = useCallback(() => {
    if (!preview) return;
    editorRef?.current?.replaceRange(preview.selection, preview.proposed);
    appendSystemMessage(filePath, "Applied edit to selection.", "applied-edit");
    setPendingSelection(filePath, null);
    setPreview(null);
  }, [preview, editorRef, appendSystemMessage, filePath, setPendingSelection]);

  return (
    <div
      style={{
        position: "fixed",
        right: PANEL_ANCHOR_RIGHT,
        bottom: PANEL_ANCHOR_BOTTOM, // leaves room for the bubble below
        width: size.width,
        height: size.height,
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
      <ResizeGrip size={size} setSize={setSize} />
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 10px",
          borderBottom: `1px solid ${colors.border}`,
          background: colors.bgSurface,
        }}
      >
        <ProviderIcon provider={thread?.provider ?? "claude"} size={16} />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            overflowX: "auto",
            overflowY: "hidden",
            whiteSpace: "nowrap",
            scrollbarWidth: "thin",
          }}
          title={filePath}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: colors.text }}>
            {(thread?.provider ?? "claude") === "claude" ? "Claude" : "Copilot"}
          </span>
          <span style={{ fontSize: 12, color: colors.textMuted, fontWeight: 400 }}>
            {" · "}
            {fileName}
          </span>
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
                label="New session"
                onClick={() => {
                  void archiveActiveAndStartNew(filePath, thread?.provider ?? "claude");
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

/* ── ResizeGrip ─────────────────────────────────────────────────────────────
 * Top-left corner grip. Panel is anchored bottom-right, so growing the panel
 * means subtracting cursor delta from the start position (drag up-left → bigger).
 * ────────────────────────────────────────────────────────────────────────── */
function ResizeGrip({
  size,
  setSize,
}: {
  size: PanelSize;
  setSize: React.Dispatch<React.SetStateAction<PanelSize>>;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const draggingRef = useRef(false);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = size.width;
      const startH = size.height;
      document.body.style.cursor = "nwse-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        const next = clampPanelSize({
          width: startW + (startX - ev.clientX),
          height: startH + (startY - ev.clientY),
        });
        setSize(next);
      };
      const onUp = () => {
        draggingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [size.width, size.height, setSize]
  );

  return (
    <div
      role="separator"
      aria-label="Resize chat panel"
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: 14,
        height: 14,
        cursor: "nwse-resize",
        zIndex: 20,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 3,
          left: 3,
          width: 8,
          height: 8,
          borderTop: `2px solid ${hovered ? colors.primary : colors.border}`,
          borderLeft: `2px solid ${hovered ? colors.primary : colors.border}`,
          borderTopLeftRadius: 2,
          transition: "border-color 0.15s",
        }}
      />
    </div>
  );
}
