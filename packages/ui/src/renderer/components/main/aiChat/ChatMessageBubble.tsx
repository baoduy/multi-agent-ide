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

  // assistant — pending with no visible content yet. If thinking-channel
  // text has started arriving (tool calls, extended thinking) we surface
  // that live so the user isn't staring at dots while the model works.
  if (message.status === "pending" && !message.text) {
    return (
      <div
        style={{
          alignSelf: "flex-start",
          background: colors.bgMuted,
          padding: "10px 14px",
          borderRadius: "14px 14px 14px 2px",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 6,
          maxWidth: "100%",
        }}
      >
        {message.thinking ? (
          <ThinkingBlock text={message.thinking} defaultOpen />
        ) : (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Dot delay={0} />
            <Dot delay={150} />
            <Dot delay={300} />
          </div>
        )}
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
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {message.thinking && <ThinkingBlock text={message.thinking} defaultOpen={isStreaming} />}
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

/* ─── Thinking block ─────────────────────────────────────────────── */

/**
 * Collapsible preview of the model's intermediate reasoning — extended
 * thinking text plus tool-activity summaries (`→ Read(...)`). Rendered
 * smaller and muted so it sits quietly above the final answer.
 *
 * Uses a native `<details>` so keyboard toggling, accessibility, and
 * preserved open state come for free. `defaultOpen` is true while the
 * turn is still streaming so the user sees progress; once the reply text
 * arrives the block stays in whatever state the user last set it to.
 */
function ThinkingBlock({ text, defaultOpen }: { text: string; defaultOpen: boolean }): React.ReactElement {
  return (
    <details
      open={defaultOpen}
      style={{
        alignSelf: "stretch",
        border: `1px dashed ${colors.border}`,
        borderRadius: 6,
        padding: "4px 8px",
        fontSize: 10,
        color: colors.textMuted,
        background: "transparent",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          listStyle: "none",
          userSelect: "none",
          color: colors.textTertiary,
          fontWeight: 500,
          outline: "none",
        }}
      >
        Thinking
      </summary>
      <div
        style={{
          marginTop: 4,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
          fontSize: 10,
          lineHeight: 1.4,
          color: colors.textMuted,
        }}
      >
        {text}
      </div>
    </details>
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
