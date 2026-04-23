import React, { useState } from "react";
import { Sparkles, AlertCircle, CheckCircle2, Copy, Check } from "lucide-react";
import { colors } from "../../../utils/colors";
import type { ChatMessage } from "../../../store/aiChatStore";
import { MarkdownContent } from "./MarkdownContent";

/**
 * Single chat bubble. Three styles:
 *   - user     → right-aligned, primary background, white text (plain text)
 *   - assistant → left-aligned, muted gray bubble (Markdown rendered)
 *   - system    → centered small chip for "✓ Applied" / "✓ Updated"
 *
 * Assistant bubbles get a copy button that exposes the raw Markdown source
 * so the user can paste it elsewhere.
 */
export function ChatMessageBubble({ message }: { message: ChatMessage }): React.ReactElement {
  if (message.role === "system") {
    return (
      <div
        style={{
          alignSelf: "center",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 10px",
          fontSize: 10,
          color: colors.textMuted,
          background: colors.bgMuted,
          border: `1px solid ${colors.border}`,
          borderRadius: 999,
        }}
      >
        <CheckCircle2 size={11} strokeWidth={2} color={colors.primary} />
        {message.text}
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div
        style={{
          alignSelf: "flex-end",
          maxWidth: "80%",
          background: colors.primary,
          color: "white",
          padding: "8px 12px",
          borderRadius: "14px 14px 2px 14px",
          fontSize: 12,
          lineHeight: 1.4,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {message.text}
      </div>
    );
  }

  // assistant — pending with no content yet (show typing dots)
  if (message.status === "pending" && !message.text) {
    return (
      <div
        style={{
          alignSelf: "flex-start",
          background: colors.bgMuted,
          padding: "10px 14px",
          borderRadius: "14px 14px 14px 2px",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
      </div>
    );
  }

  // assistant — error
  if (message.status === "error") {
    return (
      <div
        style={{
          alignSelf: "stretch",
          background: colors.errorSoft,
          color: colors.errorDark,
          border: `1px solid ${colors.errorSoftBorder}`,
          padding: "8px 12px",
          borderRadius: "14px 14px 14px 2px",
          fontSize: 11,
          display: "flex",
          alignItems: "flex-start",
          gap: 6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        <AlertCircle size={12} strokeWidth={2} style={{ marginTop: 2, flexShrink: 0 }} />
        <span>{message.text}</span>
      </div>
    );
  }

  // assistant — done OR streaming-with-text: render Markdown + copy button.
  // A still-streaming message keeps `status: "pending"` but has partial text;
  // we render the partial content so tokens appear live. Copy button is
  // hidden while streaming to avoid copying mid-response.
  const isStreaming = message.status === "pending" && message.text.length > 0;
  return (
    <div
      style={{
        alignSelf: "stretch",
        background: colors.bgMuted,
        color: colors.text,
        padding: "8px 12px",
        borderRadius: "14px 14px 14px 2px",
        fontSize: 12,
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        minWidth: 0,
      }}
    >
      <Sparkles size={12} strokeWidth={1.8} color={colors.primary} style={{ marginTop: 3, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <MarkdownContent source={message.text} />
      </div>
      {!isStreaming && <CopyButton text={message.text} />}
    </div>
  );
}

/* ─── Copy button ─────────────────────────────────────────────────── */

function CopyButton({ text }: { text: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard can fail (permissions, missing API) — fall back to a
      // transient "Copy failed" state so the user sees something went wrong
      // instead of a silent no-op.
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      title={copied ? "Copied!" : "Copy raw markdown"}
      style={{
        width: 20,
        height: 20,
        padding: 0,
        background: "transparent",
        color: copied ? colors.primary : colors.textMuted,
        border: "none",
        borderRadius: 3,
        cursor: "pointer",
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        marginTop: 1,
      }}
    >
      {copied ? <Check size={12} strokeWidth={2.2} /> : <Copy size={12} strokeWidth={1.8} />}
    </button>
  );
}

function Dot({ delay }: { delay: number }): React.ReactElement {
  return (
    <span
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: colors.textMuted,
        animation: "nm-chat-dot 1.2s infinite ease-in-out",
        animationDelay: `${delay}ms`,
      }}
    />
  );
}
