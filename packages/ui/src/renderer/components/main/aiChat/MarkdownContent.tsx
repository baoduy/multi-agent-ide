import React, { useMemo } from "react";
import { colors } from "../../../utils/colors";

/**
 * Minimal inline-markdown renderer: `**bold**`, `*em*`/`_em_`, `` `code` ``,
 * `[text](url)`. Intentionally small — matches the chat-bubble scope.
 */
function renderInline(source: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(source)) !== null) {
    if (m.index > last) out.push(source.slice(last, m.index));
    if (m[2] !== undefined) out.push(<strong key={key++}>{m[2]}</strong>);
    else if (m[3] !== undefined) out.push(<em key={key++}>{m[3]}</em>);
    else if (m[4] !== undefined) out.push(<em key={key++}>{m[4]}</em>);
    else if (m[5] !== undefined)
      out.push(
        <code
          key={key++}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.92em",
            padding: "1px 4px",
            background: colors.bgSurface,
            borderRadius: 3,
          }}
        >
          {m[5]}
        </code>,
      );
    else if (m[6] !== undefined && m[7] !== undefined)
      out.push(
        <a key={key++} href={m[7]} target="_blank" rel="noreferrer">
          {m[6]}
        </a>,
      );
    last = regex.lastIndex;
  }
  if (last < source.length) out.push(source.slice(last));
  return out;
}

/**
 * Small block-level Markdown renderer used by AI chat bubbles. It handles
 * the common set — headings, paragraphs, unordered / ordered lists, fenced
 * code, blockquotes, horizontal rules — and delegates inline formatting
 * (bold/italic/code/links) to the existing `renderInline` helper so the
 * chat output matches how the editor renders the same text.
 *
 * This is intentionally tiny (no external markdown dep). Anything fancier
 * than the block types below will show as a paragraph — acceptable for a
 * chat bubble, which is a summary surface, not a full document renderer.
 */

export function MarkdownContent({ source }: { source: string }): React.ReactElement {
  const blocks = useMemo(() => parseBlocks(source), [source]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      {blocks.map((block, i) => (
        <RenderedBlock key={i} block={block} />
      ))}
    </div>
  );
}

/* ─── Parser ──────────────────────────────────────────────────────── */

type Block =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "code"; language?: string; body: string }
  | { kind: "quote"; text: string }
  | { kind: "hr" };

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fenceMatch = /^```(\w+)?\s*$/.exec(line);
    if (fenceMatch) {
      const language = fenceMatch[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // consume closing fence
      out.push({ kind: "code", language, body: body.join("\n") });
      continue;
    }

    // Horizontal rule
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      out.push({ kind: "hr" });
      i++;
      continue;
    }

    // Heading
    const headingMatch = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      out.push({ kind: "heading", level, text: headingMatch[2] });
      i++;
      continue;
    }

    // Blockquote (greedy — consumes contiguous lines starting with `>`)
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push({ kind: "quote", text: buf.join("\n") });
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      out.push({ kind: "ul", items });
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      out.push({ kind: "ol", items });
      continue;
    }

    // Blank line → skip
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // Paragraph — consume until blank line, heading, fence, list, or quote.
    const paraLines: string[] = [line];
    i++;
    while (i < lines.length && !isBlockBoundary(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    out.push({ kind: "paragraph", text: paraLines.join(" ").trim() });
  }

  return out;
}

function isBlockBoundary(line: string): boolean {
  if (/^\s*$/.test(line)) return true;
  if (/^```/.test(line)) return true;
  if (/^#{1,6}\s+/.test(line)) return true;
  if (/^\s*[-*+]\s+/.test(line)) return true;
  if (/^\s*\d+\.\s+/.test(line)) return true;
  if (/^>\s?/.test(line)) return true;
  if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) return true;
  return false;
}

/* ─── Renderer ────────────────────────────────────────────────────── */

function RenderedBlock({ block }: { block: Block }): React.ReactElement {
  switch (block.kind) {
    case "heading": {
      const sizes: Record<1 | 2 | 3 | 4 | 5 | 6, number> = { 1: 16, 2: 14, 3: 13, 4: 12, 5: 12, 6: 12 };
      const weights: Record<1 | 2 | 3 | 4 | 5 | 6, number> = { 1: 700, 2: 700, 3: 600, 4: 600, 5: 600, 6: 600 };
      const style: React.CSSProperties = {
        margin: 0,
        fontSize: sizes[block.level],
        fontWeight: weights[block.level],
        lineHeight: 1.35,
        color: colors.text,
      };
      const inner = renderInline(block.text);
      switch (block.level) {
        case 1: return <h1 style={style}>{inner}</h1>;
        case 2: return <h2 style={style}>{inner}</h2>;
        case 3: return <h3 style={style}>{inner}</h3>;
        case 4: return <h4 style={style}>{inner}</h4>;
        case 5: return <h5 style={style}>{inner}</h5>;
        case 6: return <h6 style={style}>{inner}</h6>;
      }
      // unreachable
      return <h3 style={style}>{inner}</h3>;
    }
    case "paragraph":
      return (
        <p style={{ margin: 0, lineHeight: 1.5, wordBreak: "break-word" }}>
          {renderInline(block.text)}
        </p>
      );
    case "ul":
      return (
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.5 }}>
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol style={{ margin: 0, paddingLeft: 22, lineHeight: 1.5 }}>
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ol>
      );
    case "code":
      return (
        <pre
          style={{
            margin: 0,
            padding: "8px 10px",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            lineHeight: 1.5,
            color: colors.text,
            background: colors.bgSurface,
            border: `1px solid ${colors.border}`,
            borderRadius: 4,
            overflowX: "auto",
            whiteSpace: "pre",
          }}
        >
          <code>{block.body}</code>
        </pre>
      );
    case "quote":
      return (
        <blockquote
          style={{
            margin: 0,
            padding: "2px 0 2px 10px",
            borderLeft: `3px solid ${colors.border}`,
            color: colors.textMuted,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
          }}
        >
          {renderInline(block.text)}
        </blockquote>
      );
    case "hr":
      return <hr style={{ border: "none", borderTop: `1px solid ${colors.border}`, margin: 0 }} />;
  }
}
