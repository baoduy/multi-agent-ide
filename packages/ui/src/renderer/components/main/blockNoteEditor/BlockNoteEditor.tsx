import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { BlockNoteEditor as BlockNoteCoreEditor } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
// @ts-ignore – esbuild loads .css as text via the "text" loader
import interCss from "@blocknote/core/fonts/inter.css";
// @ts-ignore – esbuild loads .css as text via the "text" loader
import mantineCss from "@blocknote/mantine/style.css";
import { useTheme } from "../../../theme/ThemeProvider";
import { makeImageUploadHandler } from "../markdownImageUpload";

/** Inject BlockNote stylesheets once, at module load. */
function injectStyle(id: string, css: string): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}
injectStyle("blocknote-inter-font", interCss as unknown as string);
injectStyle("blocknote-mantine-style", mantineCss as unknown as string);

/**
 * Captured selection compatible with the previous NotionEditor API so the
 * AI chat flow (`getSelection` → "Edit selection" → `replaceRange`) keeps
 * working. `localStart`/`localEnd` index into the block's flattened text.
 */
export type EditorSelection = {
  blockId: string;
  localStart: number;
  localEnd: number;
  text: string;
};

export type BlockNoteEditorMethods = {
  setMarkdown: (markdown: string) => void;
  /**
   * Like `setMarkdown` but preserves scroll position on a best-effort basis.
   * Used by the file-watcher auto-merge path so when the AI (or any other
   * external process) writes the file on disk and we fold the change back
   * into the buffer, the user's viewport doesn't snap to the top.
   *
   * Cursor position is NOT preserved — BlockNote assigns fresh block ids
   * on each `tryParseMarkdownToBlocks` so any snapshot would be stale.
   * Callers who care about cursor should prefer `replaceRange`, which is
   * block-id–scoped.
   */
  replaceMarkdownPreservingCursor: (markdown: string) => void;
  /** Promise-returning under BlockNote. Callers should `await`. */
  getMarkdown: () => Promise<string>;
  getSelection: () => EditorSelection | null;
  replaceRange: (selection: EditorSelection, newText: string) => void;
};

export type BlockNoteEditorProps = {
  value: string;
  onChange: (markdown: string) => void;
  onBlur?: () => void;
  readOnly?: boolean;
  filePath: string;
  repoPath?: string;
};

type TiptapEditor = { state: { doc: any; selection: { from: number; to: number; empty: boolean } } };

/** Walk the PM document and return `{node, pos}` for the block whose id matches. */
function findBlockNode(doc: any, blockId: string): { node: any; pos: number } | null {
  let hit: { node: any; pos: number } | null = null;
  doc.descendants((node: any, pos: number) => {
    if (hit) return false;
    if (node.attrs && node.attrs.id === blockId) {
      hit = { node, pos };
      return false;
    }
    return true;
  });
  return hit;
}

/** Convert a PM position into a character offset inside the matching block's inline content. */
function pmPosToBlockLocal(doc: any, blockPos: number, blockNode: any, pmPos: number): number {
  const inner = blockPos + 2; // block > blockContent opening tokens
  const innerEnd = blockPos + blockNode.nodeSize - 2;
  if (pmPos <= inner) return 0;
  const clamped = Math.min(pmPos, innerEnd);
  return doc.textBetween(inner, clamped, "\n", "").length;
}

export const BlockNoteEditor = forwardRef<BlockNoteEditorMethods, BlockNoteEditorProps>(
  function BlockNoteEditor({ value, onChange, onBlur, readOnly = false, filePath, repoPath }, ref) {
    const { resolved } = useTheme();
    const uploadFile = useRef(makeImageUploadHandler({ filePath, repoPath })).current;

    // Create editor. Initial content is async-loaded in the effect below — we
    // start empty and replace on mount so the `value` prop source-of-truth wins.
    const editor = useCreateBlockNote({
      uploadFile: async (file: File) => uploadFile(file),
    });

    /** Suppresses the onChange→onChange(md) round-trip when we apply an
     *  externally-provided `value` (boot, Approve, AI modify-document). */
    const applyingExternalRef = useRef(false);
    const lastEmittedRef = useRef<string | null>(null);

    // Seed + sync: whenever `value` changes and differs from what we last
    // emitted, parse markdown → blocks and replace.
    useEffect(() => {
      let cancelled = false;
      void (async () => {
        if (value === lastEmittedRef.current) return;
        const blocks = await editor.tryParseMarkdownToBlocks(value);
        if (cancelled) return;
        applyingExternalRef.current = true;
        editor.replaceBlocks(editor.document, blocks);
        // Release the guard after the resulting onChange fires.
        setTimeout(() => {
          applyingExternalRef.current = false;
        }, 0);
        lastEmittedRef.current = value;
      })();
      return () => {
        cancelled = true;
      };
    }, [value, editor]);

    // Emit markdown on every edit.
    useEffect(() => {
      return editor.onChange(() => {
        if (applyingExternalRef.current) return;
        void Promise.resolve(editor.blocksToMarkdownLossy()).then((md: string) => {
          lastEmittedRef.current = md;
          onChange(md);
        });
      });
    }, [editor, onChange]);

    useImperativeHandle(
      ref,
      (): BlockNoteEditorMethods => ({
        setMarkdown: (md) => {
          void (async () => {
            const blocks = await editor.tryParseMarkdownToBlocks(md);
            applyingExternalRef.current = true;
            editor.replaceBlocks(editor.document, blocks);
            setTimeout(() => {
              applyingExternalRef.current = false;
            }, 0);
            lastEmittedRef.current = md;
          })();
        },
        replaceMarkdownPreservingCursor: (md) => {
          void (async () => {
            // Snapshot the viewport scroll of whichever ancestor is the
            // scroll container for the editor. We restore it on the next
            // tick so the block-replace doesn't yank the user to the top
            // of the document.
            const tt = (editor as unknown as { _tiptapEditor: TiptapEditor & { view?: { dom?: HTMLElement } } })._tiptapEditor;
            const rootEl = tt?.view?.dom ?? null;
            const scrollEl = rootEl ? findScrollParent(rootEl) : null;
            const prevScrollTop = scrollEl?.scrollTop ?? null;

            const blocks = await editor.tryParseMarkdownToBlocks(md);
            applyingExternalRef.current = true;
            editor.replaceBlocks(editor.document, blocks);
            setTimeout(() => {
              applyingExternalRef.current = false;
              if (scrollEl && prevScrollTop !== null) {
                scrollEl.scrollTop = prevScrollTop;
              }
            }, 0);
            lastEmittedRef.current = md;
          })();
        },
        getMarkdown: () => Promise.resolve(editor.blocksToMarkdownLossy()),
        getSelection: () => {
          const tt = (editor as unknown as { _tiptapEditor: TiptapEditor })._tiptapEditor;
          const pm = tt.state.selection;
          if (pm.empty) return null;
          const sel = editor.getSelection();
          if (!sel || sel.blocks.length !== 1) return null;
          const block = sel.blocks[0];
          const found = findBlockNode(tt.state.doc, block.id);
          if (!found) return null;
          const localStart = pmPosToBlockLocal(tt.state.doc, found.pos, found.node, pm.from);
          const localEnd = pmPosToBlockLocal(tt.state.doc, found.pos, found.node, pm.to);
          const text = tt.state.doc.textBetween(pm.from, pm.to, "\n", "");
          return { blockId: block.id, localStart, localEnd, text };
        },
        replaceRange: (selection, newText) => {
          void (async () => {
            const block = editor.getBlock(selection.blockId);
            if (!block) return;
            const currentText = await flattenBlockText(editor, block);
            const before = currentText.slice(0, selection.localStart);
            const after = currentText.slice(selection.localEnd);

            if (newText.includes("\n\n")) {
              // Multi-block reply: parse whole composed markdown and splice.
              const composed = `${before}${newText}${after}`;
              const newBlocks = await editor.tryParseMarkdownToBlocks(composed);
              applyingExternalRef.current = true;
              editor.replaceBlocks([block.id], newBlocks);
              setTimeout(() => {
                applyingExternalRef.current = false;
              }, 0);
              return;
            }

            // Single-block inline replacement.
            const merged = `${before}${newText}${after}`;
            applyingExternalRef.current = true;
            editor.updateBlock(block.id, {
              content: [{ type: "text", text: merged, styles: {} }],
            });
            setTimeout(() => {
              applyingExternalRef.current = false;
            }, 0);
          })();
        },
      }),
      [editor],
    );

    return (
      <BlockNoteView
        editor={editor}
        editable={!readOnly}
        theme={resolved}
        onBlur={onBlur}
      />
    );
  },
);

/**
 * Walk the DOM upward from `el` and return the first ancestor whose CSS
 * overflow makes it a scroll container. Returns null if none found within
 * the document body. Used by `replaceMarkdownPreservingCursor` to snapshot
 * and restore viewport position across a full block-replace.
 */
function findScrollParent(el: HTMLElement): HTMLElement | null {
  let cur: HTMLElement | null = el.parentElement;
  while (cur && cur !== document.body) {
    const style = window.getComputedStyle(cur);
    const oy = style.overflowY;
    if (oy === "auto" || oy === "scroll") return cur;
    cur = cur.parentElement;
  }
  return null;
}

async function flattenBlockText(editor: BlockNoteCoreEditor, block: any): Promise<string> {
  if (Array.isArray(block.content)) {
    return block.content
      .map((c: any) => (typeof c?.text === "string" ? c.text : ""))
      .join("");
  }
  // Fallback: round-trip through markdown.
  const md = await Promise.resolve(editor.blocksToMarkdownLossy([block]));
  return md.trim();
}
