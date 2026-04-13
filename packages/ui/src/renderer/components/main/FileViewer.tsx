import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, FileCode, Copy, Check, Clipboard, CheckCircle, GitBranch } from "lucide-react";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";

import { ipc } from "../../utils/ipc";
import { ScrollableText } from "../common/ScrollableText";
import { WorktreeDialog } from "../dialogs/WorktreeDialog";
import { useWorktreeStore } from "../../store/worktreeStore";
import { colors } from "../../utils/colors";

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
        borderLeft: `1px solid ${colors.border}`,
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
          color: colors.textTertiary,
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
              color: isActive ? colors.primary : colors.textMuted,
              background: "transparent",
              border: "none",
              borderLeft: isActive ? `2px solid ${colors.primary}` : "2px solid transparent",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "color 0.12s",
              overflow: "hidden",
            }}
            title={h.text}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.color = colors.text;
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.color = colors.textMuted;
            }}
          >
            <ScrollableText>{h.text}</ScrollableText>
          </button>
        );
      })}
    </nav>
  );
}

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
        border: `1px solid ${colors.border}`,
        overflow: "hidden",
        background: colors.bgMuted,
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
        color: active ? colors.primary : hovered ? colors.textMuted : colors.textTertiary,
        background: active ? colors.dialogBg : "transparent",
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
        color: copied ? colors.success : hovered ? colors.textMuted : colors.textTertiary,
        background: copied ? colors.successSoft : hovered ? colors.bgHover : "transparent",
        border: "1px solid",
        borderColor: copied ? colors.successSoftBorder : colors.border,
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
          color: colors.success,
          background: colors.successSoft,
          border: `1px solid ${colors.successSoftBorder}`,
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
          color: colors.primaryForeground,
          background: approving ? colors.successMuted : hovered ? colors.successHover : colors.success,
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
            background: colors.errorSoft,
            border: `1px solid ${colors.errorSoftBorder}`,
            borderRadius: 8,
            padding: "10px 16px",
            fontSize: 12,
            color: colors.errorDark,
            maxWidth: 360,
            zIndex: 10000,
            boxShadow: colors.shadowSoft,
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
      <div style={{ padding: 20, color: colors.textTertiary, fontSize: 13 }}>
        Loading {getFileName(filePath)}...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <div
          style={{
            background: colors.errorSoft,
            border: `1px solid ${colors.errorSoftBorder}`,
            borderRadius: 8,
            padding: 12,
            fontSize: 13,
            color: colors.errorDark,
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
      {/* Toolbar — only for markdown files */}
      {isMd && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 20px",
            borderBottom: `1px solid ${colors.border}`,
            background: colors.bgSurface,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11, color: colors.textTertiary, fontWeight: 500 }}>
            {getFileName(filePath)}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isGitRef && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: colors.warningText,
                  background: colors.warningSoft,
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
              color: colors.text,
              background: colors.bgSurface,
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
