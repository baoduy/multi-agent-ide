import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import {
  Type,
  Heading1,
  Heading2,
  Heading3,
  List as ListIcon,
  ListOrdered,
  CheckSquare,
  Quote,
  Code2,
  Minus,
  Image as ImageIcon,
  Activity,
} from "lucide-react";
import type { BlockType } from "./blockModel";
import { colors } from "../../../utils/colors";

export type SlashCommand = {
  type: BlockType;
  label: string;
  hint: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  /** Keyboard-shortcut hint shown on the right of the row. */
  kbd?: string;
  /** Optional language for code-type commands. */
  language?: string;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  { type: "paragraph", label: "Text", hint: "Plain paragraph", icon: Type },
  { type: "heading-1", label: "Heading 1", hint: "Large section heading", icon: Heading1, kbd: "#" },
  { type: "heading-2", label: "Heading 2", hint: "Medium heading", icon: Heading2, kbd: "##" },
  { type: "heading-3", label: "Heading 3", hint: "Small heading", icon: Heading3, kbd: "###" },
  { type: "bulleted", label: "Bulleted list", hint: "Unordered bullets", icon: ListIcon, kbd: "-" },
  { type: "numbered", label: "Numbered list", hint: "Ordered list", icon: ListOrdered, kbd: "1." },
  { type: "todo", label: "To-do", hint: "Checkable task item", icon: CheckSquare, kbd: "[]" },
  { type: "quote", label: "Quote", hint: "Block quote", icon: Quote, kbd: ">" },
  { type: "code", label: "Code block", hint: "Monospaced block", icon: Code2, kbd: "```" },
  { type: "mermaid", label: "Mermaid", hint: "Diagram from ```mermaid", icon: Activity },
  { type: "divider", label: "Divider", hint: "Horizontal rule", icon: Minus, kbd: "---" },
  { type: "image", label: "Image", hint: "Embed an image", icon: ImageIcon },
];

export type SlashMenuProps = {
  anchor: { top: number; left: number };
  query: string;
  onPick: (cmd: SlashCommand) => void;
  onClose: () => void;
};

/**
 * Floating slash-command picker. Mounted to `document.body` so it escapes any
 * overflow-hidden / transform parents in the editor tree. Keyboard navigation
 * (↑ ↓ Enter Esc) is attached to `window` while the menu is open.
 */
export function SlashMenu({ anchor, query, onPick, onClose }: SlashMenuProps): React.ReactElement {
  const [active, setActive] = useState(0);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter(
      (c) => c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    setActive(0);
  }, [filtered.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (filtered.length === 0 && e.key !== "Escape") return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => (a + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => (a - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (filtered[active]) onPick(filtered[active]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [filtered, active, onPick, onClose]);

  useLayoutEffect(() => {
    itemsRef.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (filtered.length === 0) return <></>;

  return ReactDOM.createPortal(
    <div
      role="listbox"
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        top: anchor.top,
        left: anchor.left,
        width: 280,
        maxHeight: 320,
        overflowY: "auto",
        background: colors.dialogBg,
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
        padding: 4,
        fontSize: 12,
        zIndex: 1000,
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: colors.textTertiary,
          padding: "6px 10px 4px",
        }}
      >
        Blocks
      </div>
      {filtered.map((cmd, i) => {
        const Icon = cmd.icon;
        const isActive = i === active;
        return (
          <button
            key={cmd.type + cmd.label}
            ref={(el) => {
              itemsRef.current[i] = el;
            }}
            type="button"
            onMouseEnter={() => setActive(i)}
            onClick={() => onPick(cmd)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "7px 10px",
              border: "none",
              borderRadius: 6,
              textAlign: "left",
              cursor: "pointer",
              background: isActive ? colors.bgMuted : "transparent",
              color: isActive ? colors.text : colors.textMuted,
              fontFamily: "inherit",
              fontSize: 12,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                width: 26,
                height: 26,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 6,
                border: `1px solid ${colors.border}`,
                background: isActive ? colors.bgSurface : "transparent",
                color: isActive ? colors.primary : colors.textTertiary,
              }}
            >
              <Icon size={14} strokeWidth={1.8} />
            </span>
            <span style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: colors.text }}>
                {cmd.label}
              </span>
              <span style={{ fontSize: 11, color: colors.textTertiary }}>{cmd.hint}</span>
            </span>
            {cmd.kbd && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: colors.textTertiary,
                  background: colors.bgMuted,
                  border: `1px solid ${colors.border}`,
                  padding: "1px 6px",
                  borderRadius: 4,
                }}
              >
                {cmd.kbd}
              </span>
            )}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
