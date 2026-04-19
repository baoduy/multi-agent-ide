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
  | "image";

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
const TODO_RE = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/;
const BULLET_RE = /^\s*[-*+]\s+(.*)$/;
const NUMBERED_RE = /^\s*\d+\.\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;
const HR_RE = /^(-{3,}|\*{3,}|_{3,})\s*$/;
const IMAGE_ONLY_RE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;

/** Turn markdown source into a flat list of blocks. */
export function parseMarkdown(md: string): Block[] {
  const lines = md.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block — consume until closing fence.
    const fenceOpen = FENCE_OPEN_RE.exec(line);
    if (fenceOpen) {
      const lang = fenceOpen[1] ?? "";
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE_CLOSE_RE.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // swallow closing fence (or run off EOF, which is fine)
      const content = body.join("\n");
      if (lang.toLowerCase() === "mermaid") {
        blocks.push({ id: makeId(), type: "mermaid", content });
      } else {
        blocks.push({ id: makeId(), type: "code", content, language: lang });
      }
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

    // Todo (matched before bulleted because `- [ ]` would also match bullet).
    const todo = TODO_RE.exec(line);
    if (todo) {
      blocks.push({
        id: makeId(),
        type: "todo",
        content: todo[2],
        checked: todo[1].toLowerCase() === "x",
      });
      i += 1;
      continue;
    }

    // Bulleted list
    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      blocks.push({ id: makeId(), type: "bulleted", content: bullet[1] });
      i += 1;
      continue;
    }

    // Numbered list
    const numbered = NUMBERED_RE.exec(line);
    if (numbered) {
      blocks.push({ id: makeId(), type: "numbered", content: numbered[1] });
      i += 1;
      continue;
    }

    // Quote — absorb consecutive quoted lines into one block with
    // newline-joined content so hard wrapping inside a quote round-trips.
    const quote = QUOTE_RE.exec(line);
    if (quote) {
      const parts = [quote[1]];
      i += 1;
      while (i < lines.length) {
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
    while (i < lines.length) {
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
        IMAGE_ONLY_RE.test(l)
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

  if (blocks.length === 0) {
    blocks.push(makeBlock("paragraph", ""));
  }
  return blocks;
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
        out.push(`- ${block.content}`);
        break;
      case "numbered": {
        let n = 1;
        for (let j = idx - 1; j >= 0 && blocks[j].type === "numbered"; j -= 1) n += 1;
        out.push(`${n}. ${block.content}`);
        break;
      }
      case "todo":
        out.push(`- [${block.checked ? "x" : " "}] ${block.content}`);
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
