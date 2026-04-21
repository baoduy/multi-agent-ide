import React, { useEffect, useRef } from "react";
import {
  Check,
  ChevronRight,
  GripVertical,
  ImageOff,
  Info as InfoIcon,
  AlertTriangle,
  CheckCircle2,
  Ban,
  Link as LinkIcon,
  Plus,
  X,
} from "lucide-react";
import type { Block, BlockType, CalloutVariant } from "./blockModel";
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
  /** Toggle block collapsed/expanded. */
  onToggleCollapse?: (id: string) => void;
  /** Callout variant cycle. */
  onCalloutVariantChange?: (id: string, variant: CalloutVariant) => void;
  /** Table cell edit. */
  onTableCellChange?: (id: string, row: number, col: number, value: string) => void;
  /** Add a table row/col. */
  onTableAddRow?: (id: string) => void;
  onTableAddCol?: (id: string) => void;
  onTableRemoveRow?: (id: string, row: number) => void;
  onTableRemoveCol?: (id: string, col: number) => void;
  /** Page-link href change. */
  onPageLinkHrefChange?: (id: string, href: string) => void;
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
  callout: "Callout",
  toggle: "Toggle summary",
  table: "",
  columns: "",
  "page-link": "Linked page",
};

const CALLOUT_STYLES: Record<
  CalloutVariant,
  { bg: string; border: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }
> = {
  info: { bg: "color-mix(in srgb, var(--primary) 8%, transparent)", border: "var(--primary)", icon: InfoIcon },
  warn: { bg: "color-mix(in srgb, #f59e0b 12%, transparent)", border: "#f59e0b", icon: AlertTriangle },
  success: { bg: "color-mix(in srgb, #10b981 12%, transparent)", border: "#10b981", icon: CheckCircle2 },
  danger: { bg: "color-mix(in srgb, #ef4444 12%, transparent)", border: "#ef4444", icon: Ban },
};

const CALLOUT_CYCLE: CalloutVariant[] = ["info", "warn", "success", "danger"];

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

  const indentLevel = Math.max(0, block.indent ?? 0);
  const wrapperStyle: React.CSSProperties = {
    position: "relative",
    display: "flex",
    alignItems: "flex-start",
    gap: 4,
    padding: "1px 0",
    paddingLeft: indentLevel > 0 ? indentLevel * 22 : undefined,
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
              fontSize: 26,
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
              margin: "18px 0 5px",
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
              fontSize: 20,
              fontWeight: 600,
              lineHeight: 1.25,
              letterSpacing: "-0.015em",
              margin: "16px 0 4px",
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
              fontSize: 17,
              fontWeight: 600,
              lineHeight: 1.3,
              margin: "12px 0 2px",
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
              fontSize: 14.5,
              fontWeight: 600,
              margin: "10px 0 2px",
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
              fontSize: 11,
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
              fontSize: 12,
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
                fontSize: 14,
                lineHeight: 1.7,
                userSelect: "none",
                flexShrink: 0,
              }}
            >
              •
            </span>
            <Editable
              {...editableProps}
              style={{ flex: 1, minWidth: 0, outline: "none", fontSize: 13.5, lineHeight: 1.6 }}
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
                fontSize: 11,
                lineHeight: 1.75,
                userSelect: "none",
                flexShrink: 0,
              }}
            >
              {props.numberedIndex}.
            </span>
            <Editable
              {...editableProps}
              style={{ flex: 1, minWidth: 0, outline: "none", fontSize: 13.5, lineHeight: 1.6 }}
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
                fontSize: 13.5,
                lineHeight: 1.6,
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
              fontSize: 13.5,
              lineHeight: 1.6,
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
                padding: "6px 10px",
                outline: "none",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
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
                  padding: "6px 10px",
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

      case "callout": {
        const variant = block.calloutVariant ?? "info";
        const style = CALLOUT_STYLES[variant];
        const Icon = style.icon;
        return (
          <div
            className="nm-callout"
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 6,
              borderLeft: `3px solid ${style.border}`,
              background: style.bg,
              margin: "6px 0",
            }}
          >
            <button
              type="button"
              aria-label="Change callout style"
              title="Click to change variant"
              disabled={readOnly}
              onClick={() => {
                if (readOnly || !props.onCalloutVariantChange) return;
                const idx = CALLOUT_CYCLE.indexOf(variant);
                const next = CALLOUT_CYCLE[(idx + 1) % CALLOUT_CYCLE.length];
                props.onCalloutVariantChange(block.id, next);
              }}
              style={{
                flexShrink: 0,
                background: "transparent",
                border: "none",
                padding: 0,
                marginTop: 2,
                color: style.border,
                cursor: readOnly ? "default" : "pointer",
                display: "inline-flex",
              }}
            >
              <Icon size={16} strokeWidth={1.8} />
            </button>
            <Editable
              {...editableProps}
              style={{
                flex: 1,
                minWidth: 0,
                outline: "none",
                fontSize: 13.5,
                lineHeight: 1.6,
                color: colors.text,
              }}
            />
          </div>
        );
      }

      case "toggle": {
        const collapsed = block.collapsed ?? true;
        const children = block.children ?? [];
        return (
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <button
                type="button"
                aria-label={collapsed ? "Expand" : "Collapse"}
                aria-expanded={!collapsed}
                onClick={() => props.onToggleCollapse?.(block.id)}
                className="nm-toggle-caret"
                style={{
                  flexShrink: 0,
                  marginTop: 3,
                  width: 18,
                  height: 18,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  border: "none",
                  color: colors.textMuted,
                  cursor: "pointer",
                  borderRadius: 3,
                  transform: collapsed ? "rotate(0deg)" : "rotate(90deg)",
                  transition: "transform 120ms",
                }}
              >
                <ChevronRight size={14} strokeWidth={2} />
              </button>
              <Editable
                {...editableProps}
                style={{
                  flex: 1,
                  minWidth: 0,
                  outline: "none",
                  fontSize: 13.5,
                  fontWeight: 500,
                  lineHeight: 1.6,
                  color: colors.text,
                }}
              />
            </div>
            {!collapsed && (
              <div
                className="nm-toggle-children"
                style={{
                  marginLeft: 24,
                  paddingLeft: 10,
                  borderLeft: `1px solid ${colors.border}`,
                  fontSize: 13,
                  color: colors.textMuted,
                  lineHeight: 1.55,
                }}
              >
                {children.length === 0 ? (
                  <div style={{ fontStyle: "italic", color: colors.textTertiary }}>Empty toggle — edit markdown to add content.</div>
                ) : (
                  children.map((child) => (
                    <div key={child.id} style={{ padding: "2px 0" }}>
                      {renderInline(child.content || "")}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      }

      case "table": {
        const rows = block.tableRows ?? [[""]];
        const cols = rows[0]?.length ?? 1;
        return (
          <div
            className="nm-table-wrap"
            style={{
              flex: 1,
              minWidth: 0,
              overflowX: "auto",
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              margin: "6px 0",
            }}
          >
            <table
              className="nm-table"
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12.5,
              }}
            >
              <tbody>
                {rows.map((row, rIdx) => (
                  <tr key={rIdx} className={rIdx === 0 ? "nm-table-header" : undefined}>
                    {Array.from({ length: cols }, (_, cIdx) => (
                      <td
                        key={cIdx}
                        contentEditable={!readOnly}
                        suppressContentEditableWarning
                        spellCheck={false}
                        onBlur={(e) =>
                          props.onTableCellChange?.(
                            block.id,
                            rIdx,
                            cIdx,
                            e.currentTarget.innerText,
                          )
                        }
                        style={{
                          border: `1px solid ${colors.border}`,
                          padding: "4px 8px",
                          minWidth: 80,
                          outline: "none",
                          fontWeight: rIdx === 0 ? 600 : 400,
                          background: rIdx === 0 ? colors.bgSurface : "transparent",
                          color: colors.text,
                          verticalAlign: "top",
                        }}
                      >
                        {row[cIdx] ?? ""}
                      </td>
                    ))}
                    {!readOnly && (
                      <td style={{ width: 24, border: "none", padding: 2 }}>
                        <button
                          type="button"
                          title="Remove row"
                          onClick={() => props.onTableRemoveRow?.(block.id, rIdx)}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: colors.textTertiary,
                            cursor: "pointer",
                            padding: 2,
                            borderRadius: 3,
                          }}
                        >
                          <X size={11} strokeWidth={1.8} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!readOnly && (
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  padding: 4,
                  borderTop: `1px solid ${colors.border}`,
                  background: colors.bgSurface,
                }}
              >
                <button
                  type="button"
                  onClick={() => props.onTableAddRow?.(block.id)}
                  style={tableActionBtnStyle}
                >
                  <Plus size={11} strokeWidth={1.8} /> Row
                </button>
                <button
                  type="button"
                  onClick={() => props.onTableAddCol?.(block.id)}
                  style={tableActionBtnStyle}
                >
                  <Plus size={11} strokeWidth={1.8} /> Col
                </button>
              </div>
            )}
          </div>
        );
      }

      case "columns": {
        const cols = block.columnChildren ?? [[], []];
        return (
          <div
            className="nm-columns"
            style={{
              flex: 1,
              minWidth: 0,
              display: "grid",
              gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))`,
              gap: 12,
              margin: "6px 0",
            }}
          >
            {cols.map((col, ci) => (
              <div
                key={ci}
                style={{
                  padding: 10,
                  border: `1px dashed ${colors.border}`,
                  borderRadius: 6,
                  minHeight: 60,
                  fontSize: 13,
                  color: colors.textMuted,
                  lineHeight: 1.55,
                }}
              >
                {col.length === 0 ? (
                  <div style={{ color: colors.textTertiary, fontStyle: "italic" }}>
                    Column {ci + 1}
                  </div>
                ) : (
                  col.map((c) => (
                    <div key={c.id} style={{ padding: "2px 0" }}>
                      {renderInline(c.content || "")}
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        );
      }

      case "page-link": {
        return (
          <div
            className="nm-page-link"
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              background: colors.bgMuted,
              margin: "4px 0",
            }}
          >
            <LinkIcon size={13} strokeWidth={1.8} style={{ color: colors.primary, flexShrink: 0 }} />
            <Editable
              {...editableProps}
              style={{
                flex: 1,
                minWidth: 0,
                outline: "none",
                fontSize: 13,
                fontWeight: 500,
                color: colors.text,
              }}
            />
            <input
              type="text"
              placeholder="path/to/page.md"
              value={block.href ?? ""}
              disabled={readOnly}
              onChange={(e) => props.onPageLinkHrefChange?.(block.id, e.target.value)}
              style={{
                border: `1px solid ${colors.border}`,
                borderRadius: 4,
                padding: "2px 6px",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: colors.textMuted,
                background: colors.dialogBg,
                outline: "none",
                width: 200,
              }}
            />
          </div>
        );
      }

      case "paragraph":
      default:
        return (
          <Editable
            {...editableProps}
            style={{
              flex: 1,
              minWidth: 0,
              outline: "none",
              fontSize: 13.5,
              lineHeight: 1.6,
              color: colors.text,
              padding: "2px 0",
            }}
          />
        );
    }
  };

  const tableActionBtnStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    padding: "2px 6px",
    fontSize: 10,
    color: colors.textMuted,
    background: colors.dialogBg,
    border: `1px solid ${colors.border}`,
    borderRadius: 3,
    cursor: "pointer",
  };

  return (
    <div className="nm-block-row" data-block-type={block.type} data-index={index} style={wrapperStyle}>
      {handle}
      {renderBody()}
    </div>
  );
}

