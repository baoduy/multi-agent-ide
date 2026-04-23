import React, { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, X, Send, MoreHorizontal, FileText } from "lucide-react";
import { colors } from "../../../utils/colors";
import { useAiSpecChatStore } from "../../../store/aiSpecChatStore";
import { useSessionStore } from "../../../store/sessionStore";
import { ChatMessageBubble } from "./ChatMessageBubble";

export interface SpecChatPanelProps {
  specPath: string;
  specName: string;
  specRelPath: string;
  repoPath: string;
  onClose: () => void;
}

/**
 * Read-only chat panel for reviewing a whole spec folder. Visually mirrors
 * the single-file `ChatPanel` but stripped down:
 *   - No mode pills (Ask-only).
 *   - No selection chip or preview dialog.
 *   - Optional "Focused on: <filename>" chip when the user has a file open,
 *     so they can see what the AI is being told about their focus.
 *
 * The daemon spawns `claude -p` with the repo as cwd and scopes the agent's
 * file tools to `specRelPath` via system prompt — no document text is sent
 * from this component.
 */
export function SpecChatPanel({
  specPath,
  specName,
  specRelPath,
  repoPath,
  onClose,
}: SpecChatPanelProps): React.ReactElement {
  const thread = useAiSpecChatStore((s) => s.threadsBySpec[specPath]);
  const clear = useAiSpecChatStore((s) => s.clear);
  const sendAsk = useAiSpecChatStore((s) => s.sendAsk);

  const messages = thread?.messages ?? [];
  const sending = thread?.sending ?? false;

  const selectedFilePath = useSessionStore((s) => s.selectedFilePath);
  const currentFileName = useMemo(() => {
    if (!selectedFilePath) return undefined;
    const basename = selectedFilePath.split(/[\\/]/).pop();
    return basename || undefined;
  }, [selectedFilePath]);

  const [input, setInput] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom on new messages or while waiting for a response.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, sending]);

  const canSend = input.trim().length > 0 && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    const text = input.trim();
    setInput("");
    await sendAsk({
      specPath,
      repoPath,
      specName,
      specRelPath,
      currentFileName,
      userMessage: text,
    });
  };

  return (
    <div
      style={{
        position: "absolute",
        right: 16,
        bottom: 76,
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
          <div style={{ fontSize: 12, fontWeight: 600, color: colors.text }}>
            AI — spec review
          </div>
          <div
            style={{
              fontSize: 10,
              color: colors.textMuted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={specRelPath}
          >
            {specName}
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
                minWidth: 160,
                padding: 3,
              }}
            >
              <MoreMenuItem
                label="Clear conversation"
                onClick={() => {
                  clear(specPath);
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

      {/* Focus chip */}
      {currentFileName && (
        <div
          style={{
            padding: "6px 12px 0",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            color: colors.textMuted,
          }}
        >
          <FileText size={11} strokeWidth={1.8} />
          <span>
            Focused on: <code style={{ color: colors.text }}>{currentFileName}</code>
          </span>
        </div>
      )}

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
            Ask questions about this spec. The assistant reads files in{" "}
            <code>{specRelPath}</code> on its own and cannot modify anything.
          </div>
        )}
        {messages.map((m) => (
          <ChatMessageBubble key={m.id} message={m} />
        ))}
      </div>

      {/* Input */}
      <div
        style={{
          borderTop: `1px solid ${colors.border}`,
          padding: 8,
          display: "flex",
          alignItems: "flex-end",
          gap: 6,
          background: colors.dialogBg,
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Ask about this spec…"
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
          title={sending ? "Waiting for response…" : canSend ? "Send (Enter)" : "Type a message"}
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
  );
}

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
