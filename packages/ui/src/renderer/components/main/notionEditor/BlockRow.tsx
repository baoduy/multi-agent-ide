import React, { useEffect, useRef } from "react";
import { Check, GripVertical, ImageOff } from "lucide-react";
import type { Block, BlockType } from "./blockModel";
import { renderInline } from "./inlineMarkdown";
import { MermaidDiagram } from "../MermaidDiagram";
import { colors } from "../../../utils/colors";

export type BlockRowProps = {
  block: Block;
  index: number;
  /** 1-based position among contiguous `numbered` blocks; only meaningful
   *  when `block.type === "numbered"`. */
  numberedIndex: number;
  readOnly: boolean;
  registerRef: (id: string, el: HTMLElement | null) => void;
  onInput: (id: string, text: string) => void;
  onKeyDown: (id: string, event: React.KeyboardEvent<HTMLElement>) => void;
  onFocus: (id: string) => void;
  onBlur: () => void;
  onToggleTodo: (id: string) => void;
  onCodeLanguageChange: (id: string, language: string) => void;
  onStartDrag: (id: string) => void;
  /** Resolve `src` against the .md file's directory for relative-path images. */
  resolveImageSrc: (src: string) => string;
};

const PLACEHOLDER_BY_TYPE: Record<BlockType, string> = {
  paragraph: "Type '/' for commands",
  "heading-1": "Heading 1",
  "heading-2": "Heading 2",
  "heading-3": "Heading 3",
  "heading-4": "Heading 4",
  "heading-5": "Heading 5",
  "heading-6": "Heading 6",
  bulleted: "List",
  numbered: "List",
  todo: "To-do",
  quote: "Empty quote",
  code: "Code",
  mermaid: "graph TD…",
  divider: "",
  image: "",
};

type Tag = "div" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "blockquote" | "code";

/** Thin contentEditable wrapper that syncs DOM text → `onInput`. The parent
 *  owns authoritative content; we only push the innerText up on each input
 *  event. React never sets `innerText` back into the DOM after mount — doing
 *  so would break the caret during typing. On type change (e.g. paragraph →
 *  heading) the parent remounts via React key, resetting the element. */
function Editable({
  as = "div",
  refCallback,
  className,
  style,
  placeholder,
  initialText,
  readOnly,
  onInput,
  onKeyDown,
  onFocus,
  onBlur,
  renderAsPreview,
}: {
  as?: Tag;
  refCallback: (el: HTMLElement | null) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder: string;
  initialText: string;
  readOnly: boolean;
  onInput: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
  renderAsPreview?: boolean;
}): React.ReactElement {
  const elRef = useRef<HTMLElement | null>(null);

  // On mount only, seed the editable element with the initial content. We
  // deliberately do NOT re-seed on prop updates because contentEditable is
  // uncontrolled.
  useEffect(() => {
    if (elRef.current && !renderAsPreview) {
      elRef.current.textContent = initialText;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const Tag = as;
  const commonProps = {
    ref: (el: HTMLElement | null) => {
      elRef.current = el;
      refCallback(el);
    },
    className,
    style,
    "data-placeholder": placeholder,
  } as const;

  // In read-only / preview mode we render the formatted HTML instead of the
  // raw text so bold/italic/links appear styled.
  if (renderAsPreview) {
    return React.createElement(
      Tag,
      commonProps,
      initialText ? renderInline(initialText) : null,
    );
  }

  return React.createElement(Tag, {
    ...commonProps,
    contentEditable: !readOnly,
    suppressContentEditableWarning: true,
    spellCheck: false,
    onInput: (e: React.FormEvent<HTMLElement>) =>
      onInput((e.currentTarget as HTMLElement).innerText),
    onKeyDown,
    onFocus,
    onBlur,
  });
}

export function BlockRow(props: BlockRowProps): React.ReactElement {
  const {
    block,
    index,
    readOnly,
    registerRef,
    onInput,
    onKeyDown,
    onFocus,
    onBlur,
    onToggleTodo,
    onCodeLanguageChange,
    onStartDrag,
    resolveImageSrc,
  } = props;

  const editableProps = {
    refCallback: (el: HTMLElement | null) => registerRef(block.id, el),
    placeholder: PLACEHOLDER_BY_TYPE[block.type],
    initialText: block.content,
    readOnly,
    onInput: (text: string) => onInput(block.id, text),
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => onKeyDown(block.id, e),
    onFocus: () => onFocus(block.id),
    onBlur,
    renderAsPreview: readOnly,
  };

  const wrapperStyle: React.CSSProperties = {
    position: "relative",
    display: "flex",
    alignItems: "flex-start",
    gap: 4,
    padding: "1px 0",
  };

  const handle = readOnly ? null : (
    <button
      type="button"
      className="nm-drag-handle"
      title="Drag to reorder"
      onMouseDown={(e) => {
        e.preventDefault();
        onStartDrag(block.id);
      }}
      style={{
        flexShrink: 0,
        width: 18,
        height: 22,
        marginTop: 4,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: colors.textTertiary,
        background: "transparent",
        border: "none",
        borderRadius: 4,
        cursor: "grab",
        opacity: 0,
        transition: "opacity 120ms",
      }}
    >
      <GripVertical size={14} strokeWidth={1.8} />
    </button>
  );

  const renderBody = () => {
    switch (block.type) {
      case "heading-1":
        return (
          <Editable
            {...editableProps}
            as="h1"
            className="nm-h1"
            style={{
              flex: 1,
              minWidth: 0,
              outline: "none",
              fontSize: 30,
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
              margin: "20px 0 6px",
              fontFamily: "var(--font-heading)",
              color: colors.text,
            }}
          />
        );
      case "heading-2":
        return (
          <Editable
            {...editableProps}
            as="h2"
            className="nm-h2"
            style={{
              flex: 1,
              minWidth: 0,
              outline: "none",
              fontSize: 24,
              fontWeight: 600,
              lineHeight: 1.25,
              letterSpacing: "-0.015em",
              margin: "18px 0 4px",
              fontFamily: "var(--font-heading)",
              color: colors.text,
            }}
          />
        );
      case "heading-3":
        return (
          <Editable
            {...editableProps}
            as="h3"
            className="nm-h3"
            style={{
              flex: 1,
              minWidth: 0,
              outline: "none",
              fontSize: 19,
              fontWeight: 600,
              lineHeight: 1.3,
              margin: "14px 0 2px",
              fontFamily: "var(--font-heading)",
              color: colors.text,
            }}
          />
        );
      case "heading-4":
        return (
          <Editable
            {...editableProps}
            as="h4"
            className="nm-h4"
            style={{
              flex: 1,
              minWidth: 0,
              outline: "none",
              fontSize: 16,
              fontWeight: 600,
              margin: "12px 0 2px",
              fontFamily: "var(--font-heading)",
              color: colors.text,
            }}
          />
        );
      case "heading-5":
        return (
          <Editable
            {...editableProps}
            as="h5"
            className="nm-h5"
            style={{
              flex: 1,
              minWidth: 0,
              outline: "none",
              fontSize: 14,
              fontWeight: 600,
              margin: "10px 0 2px",
              fontFamily: "var(--font-heading)",
              color: colors.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          />
        );
      case "heading-6":
        return (
          <Editable
            {...editableProps}
            as="h6"
            className="nm-h6"
            style={{
              flex: 1,
              minWidth: 0,
              outline: "none",
              fontSize: 13,
              fontWeight: 600,
              margin: "10px 0 2px",
              fontFamily: "var(--font-heading)",
              color: colors.textTertiary,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          />
        );

      case "bulleted":
        return (
          <div style={{ display: "flex", flex: 1, minWidth: 0, gap: 10, paddingLeft: 4 }}>
            <span
              style={{
                width: 16,
                textAlign: "center",
                color: colors.textMuted,
                fontSize: 16,
                lineHeight: 1.7,
                userSelect: "none",
                flexShrink: 0,
              }}
            >
              •
            </span>
            <Editable
              {...editableProps}
              style={{ flex: 1, minWidth: 0, outline: "none", fontSize: 15, lineHeight: 1.65 }}
            />
          </div>
        );

      case "numbered":
        return (
          <div style={{ display: "flex", flex: 1, minWidth: 0, gap: 10, paddingLeft: 4 }}>
            <span
              style={{
                width: 20,
                textAlign: "right",
                color: colors.textMuted,
                fontSize: 14,
                lineHeight: 1.75,
                userSelect: "none",
                flexShrink: 0,
              }}
            >
              {props.numberedIndex}.
            </span>
            <Editable
              {...editableProps}
              style={{ flex: 1, minWidth: 0, outline: "none", fontSize: 15, lineHeight: 1.65 }}
            />
          </div>
        );

      case "todo":
        return (
          <div style={{ display: "flex", flex: 1, minWidth: 0, gap: 10, paddingLeft: 4 }}>
            <button
              type="button"
              onClick={() => !readOnly && onToggleTodo(block.id)}
              aria-pressed={block.checked}
              aria-label="Toggle task"
              style={{
                width: 17,
                height: 17,
                marginTop: 5,
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 4,
                border: `1.5px solid ${block.checked ? colors.primary : colors.textTertiary}`,
                background: block.checked ? colors.primary : "transparent",
                color: colors.dialogBg,
                cursor: readOnly ? "default" : "pointer",
                transition: "all 120ms",
              }}
            >
              {block.checked && <Check size={11} strokeWidth={3} />}
            </button>
            <Editable
              {...editableProps}
              style={{
                flex: 1,
                minWidth: 0,
                outline: "none",
                fontSize: 15,
                lineHeight: 1.65,
                color: colors.text,
              }}
            />
          </div>
        );

      case "quote":
        return (
          <Editable
            {...editableProps}
            as="blockquote"
            style={{
              flex: 1,
              minWidth: 0,
              outline: "none",
              fontSize: 15,
              lineHeight: 1.65,
              borderLeft: `3px solid ${colors.primary}`,
              paddingLeft: 14,
              color: colors.textMuted,
              fontStyle: "italic",
              margin: "4px 0",
            }}
          />
        );

      case "code":
        return (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              background: colors.bgMuted,
              overflow: "hidden",
              margin: "4px 0",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "4px 10px",
                borderBottom: `1px solid ${colors.border}`,
                background: colors.bgSurface,
              }}
            >
              <input
                type="text"
                value={block.language ?? ""}
                disabled={readOnly}
                placeholder="language"
                onChange={(e) => onCodeLanguageChange(block.id, e.target.value)}
                style={{
                  border: "none",
                  background: "transparent",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: colors.textMuted,
                  outline: "none",
                  width: 100,
                }}
              />
            </div>
            <Editable
              {...editableProps}
              style={{
                padding: "10px 12px",
                outline: "none",
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                lineHeight: 1.55,
                color: colors.text,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
              renderAsPreview={false}
            />
          </div>
        );

      case "mermaid":
        return (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              background: colors.bgMuted,
              overflow: "hidden",
              margin: "4px 0",
            }}
          >
            <div
              style={{
                padding: "4px 10px",
                borderBottom: `1px solid ${colors.border}`,
                background: colors.bgSurface,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: colors.textMuted,
              }}
            >
              mermaid
            </div>
            {!readOnly && (
              <Editable
                {...editableProps}
                style={{
                  padding: "10px 12px",
                  outline: "none",
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: colors.text,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  borderBottom: `1px solid ${colors.border}`,
                  background: "transparent",
                }}
                renderAsPreview={false}
              />
            )}
            <div style={{ padding: 12, background: colors.bgSurface }}>
              <MermaidDiagram chart={block.content} />
            </div>
          </div>
        );

      case "divider":
        return (
          <hr
            style={{
              flex: 1,
              border: "none",
              borderTop: `1px solid ${colors.border}`,
              margin: "16px 0",
            }}
          />
        );

      case "image":
        if (!block.src) {
          return (
            <div
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 8,
                border: `1px dashed ${colors.border}`,
                color: colors.textTertiary,
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
              }}
            >
              <ImageOff size={14} /> empty image
            </div>
          );
        }
        return (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img
            src={resolveImageSrc(block.src)}
            alt={block.alt ?? ""}
            style={{
              flex: 1,
              minWidth: 0,
              maxWidth: "100%",
              borderRadius: 8,
              border: `1px solid ${colors.border}`,
              margin: "6px 0",
            }}
          />
        );

      case "paragraph":
      default:
        return (
          <Editable
            {...editableProps}
            style={{
              flex: 1,
              minWidth: 0,
              outline: "none",
              fontSize: 15,
              lineHeight: 1.65,
              color: colors.text,
              padding: "2px 0",
            }}
          />
        );
    }
  };

  return (
    <div className="nm-block-row" data-block-type={block.type} data-index={index} style={wrapperStyle}>
      {handle}
      {renderBody()}
    </div>
  );
}

