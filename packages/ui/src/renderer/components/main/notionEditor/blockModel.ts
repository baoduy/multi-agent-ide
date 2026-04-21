/**
 * Block model for the Notion-style markdown editor.
 *
 * A document is a flat array of {@link Block} values. Each block maps to a
 * well-known markdown construct (heading, list item, quote, code fence, …)
 * and owns the raw markdown-source text for its own content. Inline markdown
 * (`**bold**`, `` `code` ``, links) stays unparsed inside `content` — we
 * render it inline only in preview mode so the editor surface stays a
 * predictable character grid that contentEditable can drive reliably.
 *
 * Keeping the block model lossy-but-flat lets us round-trip the editor
 * through markdown on every keystroke without the complexity of a full AST.
 *
 * List-like blocks (bulleted / numbered / todo / paragraph) carry an optional
 * `indent` level (0 by default) so users can Tab/Shift-Tab to nest. Other
 * higher-level Notion-style blocks (callout, toggle, table, columns, page
 * link) are first-class types that round-trip through a stable markdown
 * dialect: GFM alerts for callouts, `<details>` for toggles, GFM pipe tables
 * for tables, and `<!-- columns:N -->` fences for the columns layout.
 */

export type BlockType =
  | "paragraph"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "heading-4"
  | "heading-5"
  | "heading-6"
  | "bulleted"
  | "numbered"
  | "todo"
  | "quote"
  | "code"
  | "mermaid"
  | "divider"
  | "image"
  | "callout"
  | "toggle"
  | "table"
  | "columns"
  | "page-link";

export type CalloutVariant = "info" | "warn" | "success" | "danger";

export interface Block {
  id: string;
  type: BlockType;
  content: string;
  /** Fenced language for `code` blocks; ignored for other types. */
  language?: string;
  /** Checked state for `todo` blocks; ignored for other types. */
  checked?: boolean;
  /** `![alt](src)` components for `image` blocks; ignored for other types. */
  src?: string;
  alt?: string;
  /** Indent level (0..6). Only meaningful on list-like blocks & paragraphs. */
  indent?: number;
  /** Collapsed state for `toggle` blocks. */
  collapsed?: boolean;
  /** Child blocks nested inside a toggle. */
  children?: Block[];
  /** Callout styling variant. */
  calloutVariant?: CalloutVariant;
  /** Rows for `table` blocks — first row is the header. */
  tableRows?: string[][];
  /** Per-column block lists for `columns` blocks. */
  columnChildren?: Block[][];
  /** Target path/URL for `page-link` blocks. */
  href?: string;
}

let idCounter = 0;
/** Module-local unique id. Using an incrementing counter rather than
 *  `crypto.randomUUID` keeps IDs short and stable for React keys without
 *  requiring crypto in tests. */
export function makeId(): string {
  idCounter += 1;
  return `blk-${Date.now().toString(36)}-${idCounter}`;
}

export function makeBlock(type: BlockType = "paragraph", content = ""): Block {
  return { id: makeId(), type, content };
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FENCE_OPEN_RE = /^```(\w*)\s*$/;
const FENCE_CLOSE_RE = /^```\s*$/;
const TODO_RE = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/;
const BULLET_RE = /^(\s*)[-*+]\s+(.*)$/;
const NUMBERED_RE = /^(\s*)\d+\.\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;
const CALLOUT_HEADER_RE = /^>\s*\[!(NOTE|TIP|INFO|IMPORTANT|WARN|WARNING|CAUTION|DANGER|SUCCESS)\]\s*$/i;
const HR_RE = /^(-{3,}|\*{3,}|_{3,})\s*$/;
const IMAGE_ONLY_RE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;
const PAGE_LINK_RE = /^\[\[(.+?)(?:\|(.+?))?\]\]\s*$/;
const TABLE_ROW_RE = /^\|(.+)\|\s*$/;
const TABLE_SEP_RE = /^\|(\s*:?-+:?\s*\|)+\s*$/;
const DETAILS_OPEN_RE = /^<details(?:\s+open)?>\s*$/i;
const DETAILS_CLOSE_RE = /^<\/details>\s*$/i;
const SUMMARY_RE = /^<summary>(.*)<\/summary>\s*$/i;
const COLUMNS_OPEN_RE = /^<!--\s*columns:(\d+)\s*-->\s*$/i;
const COLUMNS_SEP_RE = /^<!--\s*column\s*-->\s*$/i;
const COLUMNS_CLOSE_RE = /^<!--\s*\/columns\s*-->\s*$/i;

function indentLevel(whitespace: string): number {
  // Two spaces (or one tab) per level, capped at 6.
  const spaces = whitespace.replace(/\t/g, "  ").length;
  return Math.min(6, Math.floor(spaces / 2));
}

function variantFromAlert(tag: string): CalloutVariant {
  const t = tag.toLowerCase();
  if (t === "warn" || t === "warning" || t === "caution") return "warn";
  if (t === "danger") return "danger";
  if (t === "success" || t === "tip") return "success";
  return "info";
}

function alertTagFromVariant(v: CalloutVariant): string {
  switch (v) {
    case "warn":
      return "WARNING";
    case "danger":
      return "DANGER";
    case "success":
      return "SUCCESS";
    default:
      return "INFO";
  }
}

function parseTableRow(line: string): string[] {
  // strip leading/trailing pipes, then split. Pipes inside cells are not
  // supported (GFM requires escaping) so plain split is fine for round-trip.
  const trimmed = line.replace(/^\|/, "").replace(/\|\s*$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

/** Turn markdown source into a flat list of blocks. */
export function parseMarkdown(md: string): Block[] {
  const lines = md.split("\n");
  return parseLines(lines, 0, lines.length).blocks;
}

/**
 * Parse a slice of lines into blocks. Returns the blocks plus the number of
 * lines consumed so nested constructs (details, columns) can resume. Exported
 * indirectly through {@link parseMarkdown}.
 */
function parseLines(
  lines: string[],
  start: number,
  end: number,
): { blocks: Block[]; consumed: number } {
  const blocks: Block[] = [];
  let i = start;

  while (i < end) {
    const line = lines[i];

    // Fenced code block — consume until closing fence.
    const fenceOpen = FENCE_OPEN_RE.exec(line);
    if (fenceOpen) {
      const lang = fenceOpen[1] ?? "";
      const body: string[] = [];
      i += 1;
      while (i < end && !FENCE_CLOSE_RE.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      const content = body.join("\n");
      if (lang.toLowerCase() === "mermaid") {
        blocks.push({ id: makeId(), type: "mermaid", content });
      } else {
        blocks.push({ id: makeId(), type: "code", content, language: lang });
      }
      continue;
    }

    // <details> toggle block.
    if (DETAILS_OPEN_RE.test(line)) {
      i += 1;
      let summary = "";
      if (i < end) {
        const m = SUMMARY_RE.exec(lines[i]);
        if (m) {
          summary = m[1];
          i += 1;
        }
      }
      const childLines: string[] = [];
      while (i < end && !DETAILS_CLOSE_RE.test(lines[i])) {
        childLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      const children = parseMarkdown(childLines.join("\n")).filter(
        (b) => !(b.type === "paragraph" && b.content === ""),
      );
      blocks.push({
        id: makeId(),
        type: "toggle",
        content: summary,
        collapsed: true,
        children,
      });
      continue;
    }

    // Columns fence.
    const colsOpen = COLUMNS_OPEN_RE.exec(line);
    if (colsOpen) {
      const count = Math.max(2, Math.min(4, Number(colsOpen[1]) || 2));
      i += 1;
      const cols: string[][] = Array.from({ length: count }, () => []);
      let idx = 0;
      while (i < end && !COLUMNS_CLOSE_RE.test(lines[i])) {
        if (COLUMNS_SEP_RE.test(lines[i])) {
          idx = Math.min(count - 1, idx + 1);
        } else {
          cols[idx].push(lines[i]);
        }
        i += 1;
      }
      i += 1;
      const columnChildren = cols.map((colLines) =>
        parseMarkdown(colLines.join("\n")).filter(
          (b) => !(b.type === "paragraph" && b.content === ""),
        ),
      );
      blocks.push({
        id: makeId(),
        type: "columns",
        content: "",
        columnChildren,
      });
      continue;
    }

    // GFM-style callout: `> [!INFO]` header followed by `> body`.
    const calloutHead = CALLOUT_HEADER_RE.exec(line);
    if (calloutHead) {
      const variant = variantFromAlert(calloutHead[1]);
      const bodyParts: string[] = [];
      i += 1;
      while (i < end) {
        const q = QUOTE_RE.exec(lines[i]);
        if (!q) break;
        bodyParts.push(q[1]);
        i += 1;
      }
      blocks.push({
        id: makeId(),
        type: "callout",
        content: bodyParts.join("\n"),
        calloutVariant: variant,
      });
      continue;
    }

    // GFM pipe table: row line + separator line + data rows.
    if (TABLE_ROW_RE.test(line) && i + 1 < end && TABLE_SEP_RE.test(lines[i + 1])) {
      const header = parseTableRow(line);
      i += 2; // skip separator
      const rows: string[][] = [header];
      while (i < end && TABLE_ROW_RE.test(lines[i])) {
        rows.push(parseTableRow(lines[i]));
        i += 1;
      }
      blocks.push({ id: makeId(), type: "table", content: "", tableRows: rows });
      continue;
    }

    // Heading
    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({
        id: makeId(),
        type: `heading-${level}` as BlockType,
        content: heading[2].trim(),
      });
      i += 1;
      continue;
    }

    // Horizontal rule
    if (HR_RE.test(line)) {
      blocks.push({ id: makeId(), type: "divider", content: "" });
      i += 1;
      continue;
    }

    // Page-link (wiki-style `[[path|label]]`).
    const pageLink = PAGE_LINK_RE.exec(line);
    if (pageLink) {
      const target = pageLink[1].trim();
      const label = (pageLink[2] ?? target).trim();
      blocks.push({
        id: makeId(),
        type: "page-link",
        content: label,
        href: target,
      });
      i += 1;
      continue;
    }

    // Todo (matched before bulleted because `- [ ]` would also match bullet).
    const todo = TODO_RE.exec(line);
    if (todo) {
      blocks.push({
        id: makeId(),
        type: "todo",
        content: todo[3],
        checked: todo[2].toLowerCase() === "x",
        indent: indentLevel(todo[1]),
      });
      i += 1;
      continue;
    }

    // Bulleted list
    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      blocks.push({
        id: makeId(),
        type: "bulleted",
        content: bullet[2],
        indent: indentLevel(bullet[1]),
      });
      i += 1;
      continue;
    }

    // Numbered list
    const numbered = NUMBERED_RE.exec(line);
    if (numbered) {
      blocks.push({
        id: makeId(),
        type: "numbered",
        content: numbered[2],
        indent: indentLevel(numbered[1]),
      });
      i += 1;
      continue;
    }

    // Quote — absorb consecutive quoted lines into one block with
    // newline-joined content so hard wrapping inside a quote round-trips.
    const quote = QUOTE_RE.exec(line);
    if (quote) {
      const parts = [quote[1]];
      i += 1;
      while (i < end) {
        const next = QUOTE_RE.exec(lines[i]);
        if (!next) break;
        parts.push(next[1]);
        i += 1;
      }
      blocks.push({ id: makeId(), type: "quote", content: parts.join("\n") });
      continue;
    }

    // Image-only paragraph → dedicated image block (nicer UX than a
    // paragraph the user has to edit as raw markdown).
    const img = IMAGE_ONLY_RE.exec(line);
    if (img) {
      blocks.push({
        id: makeId(),
        type: "image",
        content: "",
        alt: img[1],
        src: img[2],
      });
      i += 1;
      continue;
    }

    // Blank line between blocks — skip.
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // Everything else: paragraph. Greedily consume non-blank, non-structural
    // continuation lines so soft-wrapped paragraphs stay in one block.
    const paraLines = [line];
    i += 1;
    while (i < end) {
      const l = lines[i];
      if (l.trim() === "") break;
      if (
        HEADING_RE.test(l) ||
        FENCE_OPEN_RE.test(l) ||
        TODO_RE.test(l) ||
        BULLET_RE.test(l) ||
        NUMBERED_RE.test(l) ||
        QUOTE_RE.test(l) ||
        HR_RE.test(l) ||
        IMAGE_ONLY_RE.test(l) ||
        PAGE_LINK_RE.test(l) ||
        DETAILS_OPEN_RE.test(l) ||
        COLUMNS_OPEN_RE.test(l) ||
        TABLE_ROW_RE.test(l)
      ) {
        break;
      }
      paraLines.push(l);
      i += 1;
    }
    blocks.push({
      id: makeId(),
      type: "paragraph",
      content: paraLines.join("\n"),
    });
  }

  if (blocks.length === 0 && start === 0) {
    blocks.push(makeBlock("paragraph", ""));
  }
  return { blocks, consumed: i - start };
}

/** Blocks that compact together without a blank separator line. */
const LIST_TYPES: ReadonlySet<BlockType> = new Set([
  "bulleted",
  "numbered",
  "todo",
]);

/** Serialise a block list back to markdown. */
export function blocksToMarkdown(blocks: Block[]): string {
  const out: string[] = [];

  blocks.forEach((block, idx) => {
    const pad = "  ".repeat(Math.max(0, block.indent ?? 0));
    switch (block.type) {
      case "heading-1":
        out.push(`# ${block.content}`);
        break;
      case "heading-2":
        out.push(`## ${block.content}`);
        break;
      case "heading-3":
        out.push(`### ${block.content}`);
        break;
      case "heading-4":
        out.push(`#### ${block.content}`);
        break;
      case "heading-5":
        out.push(`##### ${block.content}`);
        break;
      case "heading-6":
        out.push(`###### ${block.content}`);
        break;
      case "bulleted":
        out.push(`${pad}- ${block.content}`);
        break;
      case "numbered": {
        // Count the contiguous run at the same indent level only.
        let n = 1;
        for (let j = idx - 1; j >= 0; j -= 1) {
          const prev = blocks[j];
          if (prev.type !== "numbered") break;
          if ((prev.indent ?? 0) !== (block.indent ?? 0)) break;
          n += 1;
        }
        out.push(`${pad}${n}. ${block.content}`);
        break;
      }
      case "todo":
        out.push(`${pad}- [${block.checked ? "x" : " "}] ${block.content}`);
        break;
      case "quote":
        block.content.split("\n").forEach((ln) => out.push(`> ${ln}`));
        break;
      case "code":
        out.push("```" + (block.language ?? ""));
        if (block.content) out.push(block.content);
        out.push("```");
        break;
      case "mermaid":
        out.push("```mermaid");
        if (block.content) out.push(block.content);
        out.push("```");
        break;
      case "divider":
        out.push("---");
        break;
      case "image":
        out.push(`![${block.alt ?? ""}](${block.src ?? ""})`);
        break;
      case "callout": {
        const tag = alertTagFromVariant(block.calloutVariant ?? "info");
        out.push(`> [!${tag}]`);
        block.content.split("\n").forEach((ln) => out.push(`> ${ln}`));
        break;
      }
      case "toggle": {
        out.push("<details>");
        out.push(`<summary>${block.content}</summary>`);
        out.push("");
        if (block.children && block.children.length) {
          out.push(blocksToMarkdown(block.children));
          out.push("");
        }
        out.push("</details>");
        break;
      }
      case "table": {
        const rows = block.tableRows ?? [];
        if (rows.length === 0) {
          out.push("| |");
          out.push("|-|");
        } else {
          const cols = rows[0].length;
          rows.forEach((row, rIdx) => {
            const padded = Array.from({ length: cols }, (_, c) => row[c] ?? "");
            out.push(`| ${padded.join(" | ")} |`);
            if (rIdx === 0) {
              out.push(`|${Array.from({ length: cols }, () => "---").join("|")}|`);
            }
          });
        }
        break;
      }
      case "columns": {
        const cols = block.columnChildren ?? [];
        out.push(`<!-- columns:${cols.length || 2} -->`);
        cols.forEach((col, ci) => {
          if (ci > 0) out.push("<!-- column -->");
          if (col.length) out.push(blocksToMarkdown(col));
        });
        out.push("<!-- /columns -->");
        break;
      }
      case "page-link":
        out.push(
          block.content && block.content !== block.href
            ? `[[${block.href ?? ""}|${block.content}]]`
            : `[[${block.href ?? block.content}]]`,
        );
        break;
      case "paragraph":
      default:
        out.push(block.content);
    }

    const next = blocks[idx + 1];
    if (!next) return;
    const bothLists =
      LIST_TYPES.has(block.type) &&
      LIST_TYPES.has(next.type) &&
      block.type === next.type;
    if (!bothLists) out.push("");
  });

  return out.join("\n");
}

/** Return the heading level 1-6, or 0 for non-headings. */
export function headingLevel(block: Block): number {
  if (block.type.startsWith("heading-")) {
    return Number(block.type.slice("heading-".length));
  }
  return 0;
}

/** Block types whose indent level is meaningful for nesting. */
export const INDENTABLE_TYPES: ReadonlySet<BlockType> = new Set([
  "bulleted",
  "numbered",
  "todo",
  "paragraph",
]);
