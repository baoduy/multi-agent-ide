import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, FileCode, Copy, Check, Clipboard, CheckCircle, GitBranch } from "lucide-react";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";

import { ipc } from "../../utils/ipc";
import { WorktreeDialog } from "../dialogs/WorktreeDialog";
import { useWorktreeStore } from "../../store/worktreeStore";

/* ═══════════════════════════════════════════════════════
   Marked instance — configured once with highlight.js
   ═══════════════════════════════════════════════════════ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- marked-highlight may carry its own marked types
const marked = new Marked(
  markedHighlight({
    emptyLangClass: "hljs",
    langPrefix: "hljs language-",
    highlight(code: string, lang: string) {
      if (lang === "mermaid") {
        // Don't highlight mermaid — we render it as a diagram
        return code;
      }
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
  }) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
);

marked.setOptions({
  gfm: true,
  breaks: false,
});

// Custom renderer to handle mermaid code blocks, copy buttons, and heading IDs
const renderer = new marked.Renderer();
const origCodeRenderer = renderer.code.bind(renderer);

renderer.code = function (
  token: { type: "code"; raw: string; text: string; lang?: string },
): string {
  if (token.lang === "mermaid") {
    return `<div class="md-mermaid" data-mermaid="${encodeURIComponent(token.text)}">${escapeHtml(token.text)}</div>`;
  }
  const langLabel = token.lang
    ? `<span class="md-code-lang">${escapeHtml(token.lang)}</span>`
    : "";
  const copyBtn = `<button class="md-copy-btn" data-code="${encodeURIComponent(token.text)}" title="Copy code">Copy</button>`;
  const defaultHtml = origCodeRenderer(token);
  return `<div class="md-code-block">${langLabel}${copyBtn}${defaultHtml}</div>`;
};

/** Generate a slug from heading text (for anchor IDs). */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

// Override heading renderer to inject id attributes for ToC navigation
const origHeadingRenderer = renderer.heading.bind(renderer);
renderer.heading = function (
  token: { type: "heading"; raw: string; depth: number; text: string },
): string {
  const id = `heading-${slugify(token.text)}`;
  return `<h${token.depth} id="${id}">${token.text}</h${token.depth}>\n`;
};

marked.use({ renderer });

function renderMarkdownToHtml(md: string): string {
  return marked.parse(md) as string;
}

/* ═══════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════ */

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function isMarkdownFile(filePath: string): boolean {
  return /\.(md|mdx)$/i.test(filePath);
}

function getFileName(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

/**
 * Parses a gitref:// virtual path into its components.
 * Format: gitref://<branch>/relative/path
 * Returns null for regular filesystem paths.
 */
function parseGitRef(filePath: string): { ref: string; relativePath: string } | null {
  const match = filePath.match(/^gitref:\/\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return { ref: match[1], relativePath: match[2] };
}

function isGitRefPath(filePath: string): boolean {
  return filePath.startsWith("gitref://");
}

/* ═══════════════════════════════════════════════════════
   Mermaid rendering hook
   ═══════════════════════════════════════════════════════ */

function useMermaidRendering(containerRef: React.RefObject<HTMLDivElement | null>, content: string | null, viewMode: string) {
  useEffect(() => {
    if (viewMode !== "preview" || !containerRef.current || !content) return;

    const els = containerRef.current.querySelectorAll<HTMLDivElement>(".md-mermaid");
    if (els.length === 0) return;

    let cancelled = false;

    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
          securityLevel: "strict",
        });

        for (let i = 0; i < els.length; i++) {
          if (cancelled) return;
          const el = els[i];
          const source = decodeURIComponent(el.getAttribute("data-mermaid") ?? "");
          if (!source) continue;

          try {
            const id = `mermaid-${Date.now()}-${i}`;
            const { svg } = await mermaid.render(id, source);
            if (!cancelled) {
              el.innerHTML = svg;
              el.classList.add("md-mermaid-rendered");
            }
          } catch {
            // If individual diagram fails, show error inline
            el.innerHTML = `<div class="md-mermaid-error">Mermaid diagram error</div><pre>${escapeHtml(source)}</pre>`;
          }
        }
      } catch {
        // mermaid import failed — leave raw text
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [containerRef, content, viewMode]);
}

/* ═══════════════════════════════════════════════════════
   Copy button handler
   ═══════════════════════════════════════════════════════ */

function useCopyButtons(containerRef: React.RefObject<HTMLDivElement | null>, viewMode: string) {
  useEffect(() => {
    if (viewMode !== "preview" || !containerRef.current) return;

    const handleClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".md-copy-btn");
      if (!btn) return;

      const code = decodeURIComponent(btn.getAttribute("data-code") ?? "");
      void navigator.clipboard.writeText(code).then(() => {
        btn.textContent = "Copied!";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = "Copy";
          btn.classList.remove("copied");
        }, 1500);
      });
    };

    const container = containerRef.current;
    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [containerRef, viewMode]);
}

/* ═══════════════════════════════════════════════════════
   Table of Contents — types, extraction, active tracking
   ═══════════════════════════════════════════════════════ */

type TocHeading = {
  id: string;
  text: string;
  level: number;
};

/** Parse raw markdown and extract headings for the ToC. */
function extractHeadings(md: string): TocHeading[] {
  const headings: TocHeading[] = [];
  // Match lines like "# Heading", "## Sub-heading", etc.
  // but skip headings inside fenced code blocks.
  let inCodeBlock = false;

  for (const line of md.split("\n")) {
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].replace(/\*\*/g, "").replace(/\*/g, "").trim();
      const id = `heading-${slugify(text)}`;
      headings.push({ id, text, level });
    }
  }

  return headings;
}

/**
 * Hook that watches scroll position inside a container and returns
 * the `id` of the heading currently at (or just above) the viewport top.
 */
function useActiveHeading(
  containerRef: React.RefObject<HTMLDivElement | null>,
  headings: TocHeading[],
  viewMode: string,
): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || viewMode !== "preview" || headings.length === 0) {
      setActiveId(null);
      return;
    }

    const handleScroll = () => {
      const offset = 80; // px from top to consider "active"
      let current: string | null = null;

      for (const h of headings) {
        const el = container.querySelector(`#${CSS.escape(h.id)}`);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const relativeTop = rect.top - containerRect.top;

        if (relativeTop <= offset) {
          current = h.id;
        }
      }

      setActiveId(current);
    };

    handleScroll(); // initial check
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [containerRef, headings, viewMode]);

  return activeId;
}

/** Table of Contents sidebar component. */
function TableOfContents({
  headings,
  activeId,
  containerRef,
}: {
  headings: TocHeading[];
  activeId: string | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
}): React.ReactElement | null {
  if (headings.length === 0) return null;

  const minLevel = Math.min(...headings.map((h) => h.level));

  const handleClick = (id: string) => {
    const container = containerRef.current;
    if (!container) return;
    const el = container.querySelector(`#${CSS.escape(id)}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <nav
      style={{
        width: 200,
        minWidth: 200,
        flexShrink: 0,
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
        padding: "20px 12px 20px 0",
        borderLeft: "1px solid #e5e2da",
        overflowY: "auto",
        maxHeight: "100%",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#9a958c",
          padding: "0 12px 8px",
        }}
      >
        On this page
      </div>
      {headings.map((h) => {
        const isActive = h.id === activeId;
        const indent = (h.level - minLevel) * 12;

        return (
          <button
            key={h.id}
            type="button"
            onClick={() => handleClick(h.id)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "4px 12px",
              paddingLeft: 12 + indent,
              fontSize: 11,
              lineHeight: 1.4,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? "#C15F3C" : "#6b6560",
              background: "transparent",
              border: "none",
              borderLeft: isActive ? "2px solid #C15F3C" : "2px solid transparent",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "color 0.12s",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={h.text}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.color = "#2c2c2c";
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.color = "#6b6560";
            }}
          >
            {h.text}
          </button>
        );
      })}
    </nav>
  );
}

/* ═══════════════════════════════════════════════════════
   Styles
   ═══════════════════════════════════════════════════════ */

const MARKDOWN_STYLES = `
/* ── Base ── */
.md-viewer {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.7;
  color: #2c2c2c;
  max-width: 820px;
}

/* ── Typography ── */
.md-viewer h1 { font-size: 26px; font-weight: 700; margin: 28px 0 12px; color: #1a1a1a; border-bottom: 1px solid #e5e2da; padding-bottom: 8px; }
.md-viewer h2 { font-size: 21px; font-weight: 650; margin: 24px 0 10px; color: #1a1a1a; border-bottom: 1px solid #f0ede8; padding-bottom: 6px; }
.md-viewer h3 { font-size: 17px; font-weight: 600; margin: 20px 0 8px; color: #2c2c2c; }
.md-viewer h4 { font-size: 15px; font-weight: 600; margin: 16px 0 6px; color: #4a4540; }
.md-viewer h5, .md-viewer h6 { font-size: 14px; font-weight: 600; margin: 12px 0 6px; color: #6b6560; }
.md-viewer p { margin: 8px 0; }
.md-viewer hr { border: none; border-top: 1px solid #e5e2da; margin: 24px 0; }
.md-viewer strong { font-weight: 600; }
.md-viewer em { font-style: italic; }
.md-viewer img { max-width: 100%; border-radius: 6px; margin: 8px 0; }

/* ── Links ── */
.md-viewer a { color: #C15F3C; text-decoration: none; border-bottom: 1px solid #C15F3C40; transition: border-color 0.15s; }
.md-viewer a:hover { border-bottom-color: #C15F3C; }

/* ── Inline code ── */
.md-viewer code:not(pre code) {
  background: #f0ebe4;
  padding: 1px 5px;
  border-radius: 3px;
  font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12.5px;
  color: #C15F3C;
}

/* ── Code blocks ── */
.md-viewer .md-code-block {
  position: relative;
  background: #1e1e2e;
  border-radius: 8px;
  margin: 16px 0;
  overflow: hidden;
}
.md-viewer .md-code-block .md-code-lang {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #7f849c;
  padding: 8px 14px 0;
  font-family: 'SF Mono', 'Fira Code', ui-monospace, monospace;
}
.md-viewer .md-code-block pre {
  margin: 0;
  padding: 12px 14px;
  overflow-x: auto;
}
.md-viewer .md-code-block code {
  font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12.5px;
  color: #cdd6f4;
  line-height: 1.55;
  background: transparent;
  padding: 0;
}
.md-viewer .md-copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  background: #313244;
  color: #9399b2;
  border: 1px solid #45475a;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s, color 0.15s;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  z-index: 2;
}
.md-viewer .md-code-block:hover .md-copy-btn { opacity: 1; }
.md-viewer .md-copy-btn:hover { background: #45475a; color: #cdd6f4; }
.md-viewer .md-copy-btn.copied { background: #16a34a30; color: #16a34a; border-color: #16a34a50; }

/* ── Lists ── */
.md-viewer ul, .md-viewer ol { margin: 6px 0; padding-left: 24px; }
.md-viewer li { margin: 3px 0; }
.md-viewer li::marker { color: #9a958c; }
.md-viewer ul li { list-style-type: disc; }
.md-viewer ul li ul li { list-style-type: circle; }
.md-viewer ul li ul li ul li { list-style-type: square; }

/* ── Task lists ── */
.md-viewer input[type="checkbox"] {
  margin-right: 6px;
  accent-color: #C15F3C;
  pointer-events: none;
}
.md-viewer li.task-list-item { list-style: none; margin-left: -20px; }

/* ── Blockquotes ── */
.md-viewer blockquote {
  border-left: 3px solid #C15F3C;
  padding: 6px 14px;
  margin: 12px 0;
  color: #6b6560;
  background: #f5f4ed;
  border-radius: 0 6px 6px 0;
}
.md-viewer blockquote p { margin: 4px 0; }
.md-viewer blockquote blockquote { border-left-color: #d1cec6; background: #eeece6; }

/* ── Tables ── */
.md-viewer table {
  margin: 16px 0;
  border-radius: 8px;
  border: 1px solid #e5e2da;
  overflow: hidden;
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.md-viewer thead { background: #f5f4ed; }
.md-viewer th {
  text-align: left;
  padding: 8px 12px;
  font-weight: 600;
  color: #4a4540;
  border-bottom: 2px solid #e5e2da;
  white-space: nowrap;
}
.md-viewer td {
  padding: 7px 12px;
  border-bottom: 1px solid #f0ede8;
  color: #2c2c2c;
}
.md-viewer tbody tr:last-child td { border-bottom: none; }
.md-viewer tbody tr:hover { background: #faf9f5; }

/* ── Mermaid diagrams ── */
.md-viewer .md-mermaid {
  background: #faf9f5;
  border: 1px solid #e5e2da;
  border-radius: 8px;
  padding: 16px;
  margin: 16px 0;
  text-align: center;
  overflow-x: auto;
  font-family: 'SF Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 12px;
  color: #6b6560;
  white-space: pre;
}
.md-viewer .md-mermaid-rendered {
  white-space: normal;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  color: #2c2c2c;
}
.md-viewer .md-mermaid-rendered svg { max-width: 100%; height: auto; }
.md-viewer .md-mermaid-error {
  color: #a14a2f;
  font-size: 11px;
  font-weight: 500;
  margin-bottom: 8px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
}

/* ── Definition lists (via HTML in md) ── */
.md-viewer dl { margin: 8px 0; }
.md-viewer dt { font-weight: 600; margin-top: 8px; }
.md-viewer dd { margin-left: 20px; color: #4a4540; }

/* ── Highlight.js theme (Catppuccin Latte-inspired for dark blocks) ── */
.hljs { color: #cdd6f4; }
.hljs-keyword, .hljs-selector-tag, .hljs-built_in { color: #cba6f7; }
.hljs-string, .hljs-attr { color: #a6e3a1; }
.hljs-number, .hljs-literal { color: #fab387; }
.hljs-comment, .hljs-quote { color: #6c7086; font-style: italic; }
.hljs-function .hljs-title, .hljs-title.function_ { color: #89b4fa; }
.hljs-type, .hljs-class .hljs-title { color: #f9e2af; }
.hljs-variable, .hljs-template-variable { color: #f38ba8; }
.hljs-property { color: #89dceb; }
.hljs-meta { color: #f5c2e7; }
.hljs-tag { color: #cba6f7; }
.hljs-name { color: #89b4fa; }
.hljs-attribute { color: #f9e2af; }
.hljs-selector-class { color: #a6e3a1; }
.hljs-selector-id { color: #fab387; }
.hljs-regexp { color: #f38ba8; }
.hljs-symbol { color: #f5e0dc; }
.hljs-params { color: #cdd6f4; }
.hljs-punctuation { color: #9399b2; }
.hljs-addition { color: #a6e3a1; background: #a6e3a110; }
.hljs-deletion { color: #f38ba8; background: #f38ba810; }

/* ── Raw view line numbers ── */
.md-raw-viewer {
  display: flex;
  font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12.5px;
  line-height: 1.55;
  background: #faf9f5;
}
.md-raw-gutter {
  padding: 16px 12px 16px 16px;
  text-align: right;
  color: #d1cec6;
  user-select: none;
  border-right: 1px solid #e5e2da;
  min-width: 36px;
  flex-shrink: 0;
}
.md-raw-content {
  flex: 1;
  padding: 16px 20px;
  color: #2c2c2c;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
}
`;

/* ═══════════════════════════════════════════════════════
   View mode toggle button
   ═══════════════════════════════════════════════════════ */

type ViewMode = "preview" | "raw";

function ViewModeToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}): React.ReactElement {
  return (
    <div
      style={{
        display: "inline-flex",
        borderRadius: 6,
        border: "1px solid #e5e2da",
        overflow: "hidden",
        background: "#f5f4ed",
      }}
    >
      <ToggleBtn
        active={mode === "preview"}
        onClick={() => onChange("preview")}
        title="Preview"
      >
        <Eye size={13} strokeWidth={1.8} />
        <span>Preview</span>
      </ToggleBtn>
      <ToggleBtn
        active={mode === "raw"}
        onClick={() => onChange("raw")}
        title="Raw"
      >
        <FileCode size={13} strokeWidth={1.8} />
        <span>Raw</span>
      </ToggleBtn>
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 10px",
        fontSize: 11,
        fontWeight: active ? 600 : 400,
        color: active ? "#C15F3C" : hovered ? "#4a4540" : "#9a958c",
        background: active ? "#fff" : "transparent",
        border: "none",
        cursor: "pointer",
        transition: "all 0.12s",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════
   Copy content button
   ═══════════════════════════════════════════════════════ */

function CopyContentButton({ content }: { content: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [content]);

  return (
    <button
      type="button"
      title="Copy content"
      onClick={handleCopy}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 10px",
        fontSize: 11,
        fontWeight: 500,
        color: copied ? "#16a34a" : hovered ? "#4a4540" : "#9a958c",
        background: copied ? "#dcfce7" : hovered ? "#f0ede8" : "transparent",
        border: "1px solid",
        borderColor: copied ? "#bbf7d0" : "#e5e2da",
        borderRadius: 6,
        cursor: "pointer",
        transition: "all 0.15s",
        fontFamily: "inherit",
      }}
    >
      {copied ? <Check size={13} strokeWidth={2} /> : <Clipboard size={13} strokeWidth={1.8} />}
      <span>{copied ? "Copied!" : "Copy"}</span>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════
   Approve button
   ═══════════════════════════════════════════════════════ */

function ApproveButton({
  filePath,
  content,
  repoPath,
  onApproved,
}: {
  filePath: string;
  content: string;
  /** Required for gitref:// files — the repo root path */
  repoPath?: string;
  onApproved: (newContent: string) => void;
}): React.ReactElement | null {
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [showWorktreeDialog, setShowWorktreeDialog] = useState(false);
  const [worktreeError, setWorktreeError] = useState<string | null>(null);

  // Look up existing worktree from the global store
  const getWorktreeForBranch = useWorktreeStore((s) => s.getWorktreeForBranch);
  const addWorktree = useWorktreeStore((s) => s.addWorktree);
  const fetchWorktrees = useWorktreeStore((s) => s.fetchWorktrees);

  const isGitRef = isGitRefPath(filePath);
  const gitRef = isGitRef ? parseGitRef(filePath) : null;

  // Check if a worktree already exists for this repo+branch
  const existingWorktree =
    isGitRef && gitRef && repoPath
      ? getWorktreeForBranch(repoPath, gitRef.ref)
      : null;

  // Check if already approved
  const isAlreadyApproved = /\*\*Approved by:\*\*/.test(content);
  if (isAlreadyApproved || approved) {
    const match = content.match(
      /\*\*Approved by:\*\*\s*([^|]+?)\s*\|\s*\*\*Date:\*\*\s*(\S+)/
    );
    const approverName = match ? match[1].trim() : "—";

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 10px",
          fontSize: 11,
          fontWeight: 600,
          color: "#166534",
          background: "#dcfce7",
          border: "1px solid #bbf7d0",
          borderRadius: 6,
        }}
      >
        <CheckCircle size={13} strokeWidth={2} />
        <span>Approved by {approverName}</span>
      </div>
    );
  }

  // Fetch git user name/email when repoPath is available
  const [gitUserName, setGitUserName] = useState<string>("");
  useEffect(() => {
    if (!repoPath) return;
    ipc.send({ type: "git:user", repoPath }).then((resp) => {
      if (resp.type === "git:user:result") {
        setGitUserName(resp.name || resp.email || "Unknown");
      }
    }).catch(() => {
      // Fallback silently
    });
  }, [repoPath]);

  /** Build the new content with the approval line inserted. */
  const buildApprovedContent = (original: string): string => {
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const approvalLine = `**Approved by:** ${gitUserName || "Unknown"} | **Date:** ${dateStr}`;

    const headingMatch = original.match(/^(#[^\n]*\n)/);
    if (headingMatch) {
      const idx = (headingMatch.index ?? 0) + headingMatch[0].length;
      return original.slice(0, idx) + "\n" + approvalLine + "\n" + original.slice(idx);
    }
    return approvalLine + "\n\n" + original;
  };

  /** Approve a local (current-branch) file directly. */
  const handleDirectApprove = async () => {
    setApproving(true);
    try {
      const newContent = buildApprovedContent(content);
      const writeResp = await ipc.send({
        type: "file:write",
        filePath,
        content: newContent,
      });

      if (writeResp.type === "file:write:result" && writeResp.success) {
        setApproved(true);
        onApproved(newContent);
      }
    } catch (err) {
      console.error("Error during approval:", err);
    }
    setApproving(false);
  };

  /**
   * Approve via an existing or newly-created worktree.
   * If worktreePath is provided, use it directly (skip IPC create).
   */
  const handleWorktreeApproveWithPath = async (worktreePath: string) => {
    if (!gitRef) return;

    setApproving(true);
    setWorktreeError(null);

    try {
      const targetFilePath = `${worktreePath}/${gitRef.relativePath}`;

      // Read file from worktree
      const readResp = await ipc.send({ type: "file:read", filePath: targetFilePath });
      if (readResp.type !== "file:read:result") {
        setWorktreeError(`Could not read file in worktree: ${readResp.type === "error" ? readResp.message : "Unknown error"}`);
        setApproving(false);
        return;
      }

      // Write approved content
      const newContent = buildApprovedContent(readResp.content);
      const writeResp = await ipc.send({
        type: "file:write",
        filePath: targetFilePath,
        content: newContent,
      });

      if (writeResp.type === "file:write:result" && writeResp.success) {
        setApproved(true);
        onApproved(newContent);
      } else {
        setWorktreeError("Failed to write approval to the worktree file.");
      }
    } catch (err) {
      console.error("Error during worktree approval:", err);
      setWorktreeError(err instanceof Error ? err.message : String(err));
    }
    setApproving(false);
  };

  /** Approve a gitref file via a new worktree (after user confirms name in dialog). */
  const handleWorktreeApprove = async (worktreeName: string) => {
    if (!gitRef || !repoPath) return;

    setShowWorktreeDialog(false);
    setApproving(true);
    setWorktreeError(null);

    try {
      // 1. Create the worktree
      const wtResp = await ipc.send({
        type: "worktree:create",
        repoPath,
        branch: gitRef.ref,
        name: worktreeName,
      });

      if (wtResp.type === "error") {
        setWorktreeError(wtResp.message);
        setApproving(false);
        return;
      }

      if (wtResp.type !== "worktree:create:result") {
        setWorktreeError("Unexpected response when creating worktree.");
        setApproving(false);
        return;
      }

      // Register the new worktree in the store so future approvals skip the dialog
      addWorktree({
        repoPath,
        worktreePath: wtResp.worktreePath,
        branch: gitRef.ref,
        name: worktreeName,
        createdAt: Date.now(),
      });

      // Also refresh the full list from the daemon
      void fetchWorktrees(repoPath);

      // 2. Approve using the newly created worktree path
      setApproving(false); // handleWorktreeApproveWithPath sets it again
      await handleWorktreeApproveWithPath(wtResp.worktreePath);
    } catch (err) {
      console.error("Error during worktree creation:", err);
      setWorktreeError(err instanceof Error ? err.message : String(err));
      setApproving(false);
    }
  };

  const handleClick = () => {
    if (isGitRef && existingWorktree) {
      // Worktree already exists — approve directly, no dialog
      void handleWorktreeApproveWithPath(existingWorktree.worktreePath);
    } else if (isGitRef) {
      // No worktree yet — show dialog
      setShowWorktreeDialog(true);
    } else {
      // Current branch — approve directly
      void handleDirectApprove();
    }
  };

  // Determine button label
  let buttonLabel = "Approve";
  if (approving) {
    buttonLabel = "Approving...";
  } else if (isGitRef && existingWorktree) {
    buttonLabel = "Approve";
  } else if (isGitRef) {
    buttonLabel = "Approve via Worktree";
  }

  return (
    <>
      <button
        type="button"
        title={
          isGitRef && !existingWorktree
            ? "Create worktree and approve this file"
            : "Approve this file"
        }
        onClick={handleClick}
        disabled={approving}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 10px",
          fontSize: 11,
          fontWeight: 600,
          color: "#fff",
          background: approving ? "#86efac" : hovered ? "#15803d" : "#16A34A",
          border: "none",
          borderRadius: 6,
          cursor: approving ? "wait" : "pointer",
          transition: "all 0.15s",
          fontFamily: "inherit",
        }}
      >
        {isGitRef && !existingWorktree ? (
          <GitBranch size={13} strokeWidth={2} />
        ) : (
          <CheckCircle size={13} strokeWidth={2} />
        )}
        <span>{buttonLabel}</span>
      </button>

      {/* Worktree name dialog — only shown when no existing worktree */}
      {showWorktreeDialog && gitRef && (
        <WorktreeDialog
          branch={gitRef.ref}
          onConfirm={handleWorktreeApprove}
          onCancel={() => setShowWorktreeDialog(false)}
        />
      )}

      {/* Error toast */}
      {worktreeError && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            background: "#fae8e1",
            border: "1px solid #e5b8a5",
            borderRadius: 8,
            padding: "10px 16px",
            fontSize: 12,
            color: "#a14a2f",
            maxWidth: 360,
            zIndex: 10000,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            cursor: "pointer",
          }}
          onClick={() => setWorktreeError(null)}
        >
          {worktreeError}
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   Raw markdown view with line numbers
   ═══════════════════════════════════════════════════════ */

function RawMarkdownView({ content }: { content: string }): React.ReactElement {
  const lines = content.split("\n");

  return (
    <div className="md-raw-viewer">
      <div className="md-raw-gutter">
        {lines.map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <div className="md-raw-content">{content}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FileViewer component
   ═══════════════════════════════════════════════════════ */

type FileViewerProps = {
  filePath: string;
  /** Required for reading files from non-current branches (gitref:// paths). */
  repoPath?: string;
};

export function FileViewer({ filePath, repoPath }: FileViewerProps): React.ReactElement {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const contentRef = useRef<HTMLDivElement>(null);

  const isGitRef = isGitRefPath(filePath);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);

    void (async () => {
      const gitRef = parseGitRef(filePath);

      let response;
      if (gitRef && repoPath) {
        // Read from a non-current branch via git show
        response = await ipc.send({
          type: "gitfile:read",
          repoPath,
          ref: gitRef.ref,
          relativePath: gitRef.relativePath,
        });
      } else {
        // Read from filesystem (current branch)
        response = await ipc.send({ type: "file:read", filePath });
      }

      if (cancelled) return;

      if (response.type === "file:read:result" || response.type === "gitfile:read:result") {
        setContent(response.content);
        setLoading(false);
      } else if (response.type === "error") {
        setError(response.message);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filePath, repoPath]);

  // Render mermaid diagrams after HTML is injected
  useMermaidRendering(contentRef, content, viewMode);

  // Attach copy button handlers
  useCopyButtons(contentRef, viewMode);

  const renderedHtml = useMemo(() => {
    if (!content) return "";
    return renderMarkdownToHtml(content);
  }, [content]);

  // Extract headings for Table of Contents
  const headings = useMemo(() => {
    if (!content) return [];
    return extractHeadings(content);
  }, [content]);

  // Track which heading is currently in view
  const activeHeadingId = useActiveHeading(contentRef, headings, viewMode);

  const isMd = content !== null && isMarkdownFile(filePath);
  const showToc = isMd && viewMode === "preview" && headings.length > 1;

  if (loading) {
    return (
      <div style={{ padding: 20, color: "#9a958c", fontSize: 13 }}>
        Loading {getFileName(filePath)}...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <div
          style={{
            background: "#fae8e1",
            border: "1px solid #e5b8a5",
            borderRadius: 8,
            padding: 12,
            fontSize: 13,
            color: "#a14a2f",
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  if (content === null) return <div />;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <style>{MARKDOWN_STYLES}</style>

      {/* Toolbar — only for markdown files */}
      {isMd && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 20px",
            borderBottom: "1px solid #e5e2da",
            background: "#faf9f5",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11, color: "#9a958c", fontWeight: 500 }}>
            {getFileName(filePath)}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isGitRef && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#7c6a3e",
                  background: "#fef3c7",
                  padding: "3px 8px",
                  borderRadius: 4,
                }}
              >
                remote branch
              </span>
            )}
            <ViewModeToggle mode={viewMode} onChange={setViewMode} />
            <CopyContentButton content={content} />
            <ApproveButton
              filePath={filePath}
              content={content}
              repoPath={repoPath}
              onApproved={(newContent) => setContent(newContent)}
            />
          </div>
        </div>
      )}

      {/* Content area — with optional ToC sidebar */}
      <div ref={contentRef} style={{ flex: 1, overflow: "auto" }}>
        {isMd ? (
          viewMode === "preview" ? (
            <div style={{ display: "flex" }}>
              {/* Main markdown content */}
              <div
                className="md-viewer"
                style={{ padding: "20px 28px", flex: 1, minWidth: 0 }}
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />

              {/* Table of Contents — right sidebar */}
              {showToc && (
                <TableOfContents
                  headings={headings}
                  activeId={activeHeadingId}
                  containerRef={contentRef}
                />
              )}
            </div>
          ) : (
            <RawMarkdownView content={content} />
          )
        ) : (
          <pre
            style={{
              margin: 0,
              padding: "16px 20px",
              fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', ui-monospace, monospace",
              fontSize: 12.5,
              lineHeight: 1.55,
              color: "#2c2c2c",
              background: "#faf9f5",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
