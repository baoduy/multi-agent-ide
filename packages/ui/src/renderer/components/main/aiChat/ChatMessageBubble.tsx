import React from "react";
import { Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import { colors } from "../../../utils/colors";
import type { ChatMessage } from "../../../store/aiChatStore";

/**
 * Single chat bubble. Three styles:
 *   - user     → right-aligned, primary background, white text
 *   - assistant → left-aligned, muted gray bubble
 *   - system    → centered, small, for "✓ Applied" / "✓ Updated"
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

  // assistant
  if (message.status === "pending") {
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

  if (message.status === "error") {
    return (
      <div
        style={{
          alignSelf: "flex-start",
          maxWidth: "85%",
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

  return (
    <div
      style={{
        alignSelf: "flex-start",
        maxWidth: "85%",
        background: colors.bgMuted,
        color: colors.text,
        padding: "8px 12px",
        borderRadius: "14px 14px 14px 2px",
        fontSize: 12,
        lineHeight: 1.5,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        display: "flex",
        alignItems: "flex-start",
        gap: 6,
      }}
    >
      <Sparkles size={12} strokeWidth={1.8} color={colors.primary} style={{ marginTop: 3, flexShrink: 0 }} />
      <span>{message.text}</span>
    </div>
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
