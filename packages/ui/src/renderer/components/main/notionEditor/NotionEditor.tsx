import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type Block,
  type BlockType,
  blocksToMarkdown,
  makeBlock,
  parseMarkdown,
} from "./blockModel";
import { BlockRow } from "./BlockRow";
import { SLASH_COMMANDS, SlashMenu, type SlashCommand } from "./SlashMenu";
import { makeImageUploadHandler } from "../markdownImageUpload";
import { colors } from "../../../utils/colors";

export type NotionEditorMethods = {
  /** Replace the editor's markdown content. Used by the Approve flow and
   *  when the parent loads a new file without remounting. */
  setMarkdown: (markdown: string) => void;
  /** Current markdown, computed on demand. */
  getMarkdown: () => string;
};

export type NotionEditorProps = {
  value: string;
  onChange: (markdown: string) => void;
  onBlur?: () => void;
  readOnly?: boolean;
  filePath: string;
  repoPath?: string;
};

type SlashState = {
  blockId: string;
  query: string;
  anchor: { top: number; left: number };
};

/** Block types that are "list-like" — Enter in an empty one reverts to
 *  paragraph, Enter in a non-empty one inserts a new block of the same type. */
const LIST_TYPES: ReadonlySet<BlockType> = new Set(["bulleted", "numbered", "todo"]);

/** Plain-prefix shortcuts run on space / trigger key. */
const SHORTCUT_RULES: { pattern: RegExp; type: BlockType; consume: number }[] = [
  { pattern: /^# $/, type: "heading-1", consume: 2 },
  { pattern: /^## $/, type: "heading-2", consume: 3 },
  { pattern: /^### $/, type: "heading-3", consume: 4 },
  { pattern: /^#### $/, type: "heading-4", consume: 5 },
  { pattern: /^##### $/, type: "heading-5", consume: 6 },
  { pattern: /^###### $/, type: "heading-6", consume: 7 },
  { pattern: /^- $/, type: "bulleted", consume: 2 },
  { pattern: /^\* $/, type: "bulleted", consume: 2 },
  { pattern: /^1\. $/, type: "numbered", consume: 3 },
  { pattern: /^\[\] $/, type: "todo", consume: 3 },
  { pattern: /^> $/, type: "quote", consume: 2 },
];

/** Triggered by the literal sequence, not followed by a space. */
const INSTANT_RULES: { pattern: RegExp; type: BlockType; consume: number }[] = [
  { pattern: /^```$/, type: "code", consume: 3 },
  { pattern: /^---$/, type: "divider", consume: 3 },
];

export const NotionEditor = forwardRef<NotionEditorMethods, NotionEditorProps>(
  function NotionEditor(
    { value, onChange, onBlur, readOnly = false, filePath, repoPath },
    ref,
  ) {
    const [blocks, setBlocks] = useState<Block[]>(() => parseMarkdown(value));
    const [slash, setSlash] = useState<SlashState | null>(null);
    const [focusedId, setFocusedId] = useState<string | null>(null);

    const blocksRef = useRef(blocks);
    useEffect(() => {
      blocksRef.current = blocks;
    }, [blocks]);

    // Refs to each block's editable DOM element keyed by block id. Used for
    // imperative focus, caret placement, and caret-based slash anchoring.
    const elementRefs = useRef<Map<string, HTMLElement>>(new Map());
    const registerRef = useCallback((id: string, el: HTMLElement | null) => {
      if (el) elementRefs.current.set(id, el);
      else elementRefs.current.delete(id);
    }, []);

    const uploadImage = useMemo(
      () => makeImageUploadHandler({ filePath, repoPath }),
      [filePath, repoPath],
    );

    const resolveImageSrc = useCallback(
      (src: string): string => {
        if (!src) return "";
        if (/^(https?:|data:|file:|blob:)/.test(src)) return src;
        if (src.startsWith("/")) return `file://${src}`;
        // relative — resolve against the .md file's directory
        const dir = filePath.slice(0, filePath.lastIndexOf("/"));
        return `file://${dir}/${src}`;
      },
      [filePath],
    );

    /** Re-serialise and push up to the parent. Debouncing is the parent's
     *  responsibility — they can throttle if needed. */
    const pushMarkdown = useCallback(
      (next: Block[]) => {
        onChange(blocksToMarkdown(next));
      },
      [onChange],
    );

    const replaceBlocks = useCallback(
      (updater: (prev: Block[]) => Block[]) => {
        setBlocks((prev) => {
          const next = updater(prev);
          pushMarkdown(next);
          return next;
        });
      },
      [pushMarkdown],
    );

    useImperativeHandle(
      ref,
      () => ({
        setMarkdown: (markdown: string) => {
          const next = parseMarkdown(markdown);
          setBlocks(next);
          // parent already has latest markdown — no onChange needed here.
        },
        getMarkdown: () => blocksToMarkdown(blocksRef.current),
      }),
      [],
    );

    /* ─── Focus helpers ──────────────────────────────────────────────── */

    const focusBlock = useCallback((id: string, toEnd = true) => {
      // Defer one frame so newly inserted DOM nodes exist before we focus.
      requestAnimationFrame(() => {
        const el = elementRefs.current.get(id);
        if (!el) return;
        el.focus();
        if (!toEnd) return;
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      });
    }, []);

    /* ─── Mutations ──────────────────────────────────────────────────── */

    const updateBlock = useCallback(
      (id: string, patch: Partial<Block>) => {
        replaceBlocks((prev) =>
          prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        );
      },
      [replaceBlocks],
    );

    const insertAfter = useCallback(
      (id: string, block: Block) => {
        replaceBlocks((prev) => {
          const idx = prev.findIndex((b) => b.id === id);
          if (idx === -1) return [...prev, block];
          return [...prev.slice(0, idx + 1), block, ...prev.slice(idx + 1)];
        });
        focusBlock(block.id);
      },
      [replaceBlocks, focusBlock],
    );

    const removeBlock = useCallback(
      (id: string) => {
        replaceBlocks((prev) => {
          if (prev.length <= 1) return prev;
          const idx = prev.findIndex((b) => b.id === id);
          if (idx === -1) return prev;
          const next = prev.filter((b) => b.id !== id);
          const focusTarget = next[Math.max(0, idx - 1)];
          if (focusTarget) focusBlock(focusTarget.id);
          return next;
        });
      },
      [replaceBlocks, focusBlock],
    );

    const changeType = useCallback(
      (id: string, type: BlockType, extras?: Partial<Block>) => {
        replaceBlocks((prev) =>
          prev.map((b) =>
            b.id === id
              ? {
                  ...b,
                  type,
                  // Heading → paragraph conversions keep content; block-type
                  // changes that introduce new structure (code, mermaid) wipe
                  // content unless the caller supplies `content` in `extras`.
                  content: extras?.content ?? b.content,
                  language: extras?.language ?? (type === "code" ? b.language : undefined),
                  checked: extras?.checked ?? (type === "todo" ? b.checked ?? false : undefined),
                  src: extras?.src,
                  alt: extras?.alt,
                  ...extras,
                }
              : b,
          ),
        );
        focusBlock(id);
      },
      [replaceBlocks, focusBlock],
    );

    /* ─── Slash menu positioning ─────────────────────────────────────── */

    const openSlashAtCaret = useCallback((blockId: string, query = "") => {
      const sel = window.getSelection();
      let top = 0;
      let left = 0;
      if (sel && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        top = rect.bottom + 6;
        left = rect.left;
      } else {
        const el = elementRefs.current.get(blockId);
        if (el) {
          const rect = el.getBoundingClientRect();
          top = rect.bottom + 6;
          left = rect.left;
        }
      }
      // Clamp so the menu never escapes the viewport.
      const menuWidth = 280;
      const menuHeight = 320;
      left = Math.min(left, window.innerWidth - menuWidth - 16);
      top = Math.min(top, window.innerHeight - menuHeight - 16);
      setSlash({ blockId, query, anchor: { top, left } });
    }, []);

    /* ─── Input handling ─────────────────────────────────────────────── */

    const handleInput = useCallback(
      (id: string, text: string) => {
        const block = blocksRef.current.find((b) => b.id === id);
        if (!block) return;

        // Instant rules (no trailing space): code fence, divider.
        if (block.type === "paragraph") {
          for (const rule of INSTANT_RULES) {
            if (rule.pattern.test(text)) {
              // Clear the editable node so the typed characters disappear.
              const el = elementRefs.current.get(id);
              if (el) el.textContent = "";
              changeType(id, rule.type, { content: "" });
              if (rule.type === "divider") {
                // divider is content-less — drop a paragraph after for
                // continued editing.
                const para = makeBlock("paragraph", "");
                insertAfter(id, para);
              }
              return;
            }
          }
        }

        // Space-triggered shortcuts: `# `, `- `, `1. ` ...
        if (block.type === "paragraph" && text.endsWith(" ")) {
          for (const rule of SHORTCUT_RULES) {
            if (rule.pattern.test(text)) {
              const el = elementRefs.current.get(id);
              if (el) el.textContent = "";
              changeType(id, rule.type, { content: "" });
              return;
            }
          }
        }

        // Slash menu trigger. We look at the whole innerText to find the
        // last `/` and treat everything after it as the filter query. The
        // menu is non-modal — typing continues to live-update the block.
        const slashIdx = text.lastIndexOf("/");
        if (slashIdx !== -1 && (slashIdx === 0 || /\s/.test(text[slashIdx - 1]))) {
          const trailing = text.slice(slashIdx + 1);
          // Cancel if the trailing part contains whitespace (user moved on).
          if (!/\s/.test(trailing) && trailing.length <= 30) {
            if (!slash || slash.blockId !== id) openSlashAtCaret(id, trailing);
            else setSlash({ ...slash, query: trailing });
          } else if (slash) {
            setSlash(null);
          }
        } else if (slash && slash.blockId === id) {
          setSlash(null);
        }

        updateBlock(id, { content: text });
      },
      [changeType, insertAfter, openSlashAtCaret, slash, updateBlock],
    );

    /* ─── Key handling ───────────────────────────────────────────────── */

    const handleKeyDown = useCallback(
      (id: string, e: React.KeyboardEvent<HTMLElement>) => {
        const block = blocksRef.current.find((b) => b.id === id);
        if (!block) return;

        // While slash menu is open it owns Enter / Escape / arrow keys.
        if (slash && slash.blockId === id) {
          if (["Enter", "ArrowUp", "ArrowDown", "Tab", "Escape"].includes(e.key)) {
            return;
          }
        }

        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          // Empty list/quote item → revert to paragraph.
          if (
            (LIST_TYPES.has(block.type) || block.type === "quote") &&
            block.content.trim() === ""
          ) {
            changeType(id, "paragraph");
            return;
          }
          // Continue list-style blocks; otherwise fresh paragraph.
          const repeat = LIST_TYPES.has(block.type);
          const nextType: BlockType = repeat ? block.type : "paragraph";
          const nextBlock = makeBlock(nextType, "");
          if (nextType === "todo") nextBlock.checked = false;
          insertAfter(id, nextBlock);
          return;
        }

        if (e.key === "Backspace") {
          const el = elementRefs.current.get(id);
          const sel = window.getSelection();
          const atStart =
            !!sel && sel.anchorOffset === 0 && sel.focusOffset === 0 && sel.isCollapsed;
          if (atStart && el && el.innerText === "") {
            e.preventDefault();
            if (block.type !== "paragraph") {
              changeType(id, "paragraph");
            } else {
              removeBlock(id);
            }
            return;
          }
          if (atStart && block.type !== "paragraph") {
            e.preventDefault();
            changeType(id, "paragraph");
            return;
          }
        }

        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          const sel = window.getSelection();
          const el = elementRefs.current.get(id);
          if (!sel || !el) return;
          const isUp = e.key === "ArrowUp";
          const atEdge = isUp
            ? sel.anchorOffset === 0
            : sel.anchorOffset === el.innerText.length;
          if (!atEdge) return;
          const idx = blocksRef.current.findIndex((b) => b.id === id);
          const neighbor = blocksRef.current[idx + (isUp ? -1 : 1)];
          if (neighbor) {
            e.preventDefault();
            focusBlock(neighbor.id, !isUp);
          }
        }
      },
      [changeType, focusBlock, insertAfter, removeBlock, slash],
    );

    /* ─── Slash picks ────────────────────────────────────────────────── */

    const pickSlash = useCallback(
      (cmd: SlashCommand) => {
        if (!slash) return;
        const id = slash.blockId;
        const block = blocksRef.current.find((b) => b.id === id);
        if (!block) return;

        // Strip everything from the last `/` onward.
        const el = elementRefs.current.get(id);
        const currentText = el?.innerText ?? block.content;
        const slashIdx = currentText.lastIndexOf("/");
        const keep = slashIdx >= 0 ? currentText.slice(0, slashIdx) : currentText;

        if (cmd.type === "divider") {
          changeType(id, "divider", { content: "" });
          const para = makeBlock("paragraph", "");
          insertAfter(id, para);
        } else if (cmd.type === "image") {
          // Prompt for file via a hidden input — see handleInsertImage below.
          changeType(id, "image", { content: "", src: "", alt: "" });
          void handleInsertImageForBlock(id);
        } else if (cmd.type === "code" || cmd.type === "mermaid") {
          changeType(id, cmd.type, {
            content: "",
            language: cmd.type === "code" ? (cmd.language ?? "ts") : undefined,
          });
        } else {
          // Block-type change; preserve any pre-slash text so `# foo/h1` works.
          changeType(id, cmd.type, { content: keep });
          const el2 = elementRefs.current.get(id);
          if (el2) el2.textContent = keep;
        }
        setSlash(null);
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [slash, changeType, insertAfter],
    );

    /* ─── Image picker ───────────────────────────────────────────────── */

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const pendingImageBlockIdRef = useRef<string | null>(null);

    const handleInsertImageForBlock = useCallback((blockId: string) => {
      pendingImageBlockIdRef.current = blockId;
      fileInputRef.current?.click();
    }, []);

    const onFileInputChange = useCallback(
      async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        const blockId = pendingImageBlockIdRef.current;
        pendingImageBlockIdRef.current = null;
        if (!file || !blockId) return;
        try {
          const src = await uploadImage(file);
          updateBlock(blockId, { src, alt: file.name });
        } catch (err) {
          console.error("image upload failed", err);
        }
      },
      [updateBlock, uploadImage],
    );

    /* ─── Paste & drop for images ────────────────────────────────────── */

    const handlePaste = useCallback(
      async (e: React.ClipboardEvent<HTMLDivElement>) => {
        if (readOnly) return;
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i += 1) {
          const it = items[i];
          if (it.kind === "file" && it.type.startsWith("image/")) {
            const file = it.getAsFile();
            if (!file || !focusedId) continue;
            e.preventDefault();
            try {
              const src = await uploadImage(file);
              // Insert a new image block after the focused block.
              const imgBlock = makeBlock("image", "");
              imgBlock.src = src;
              imgBlock.alt = file.name;
              insertAfter(focusedId, imgBlock);
            } catch (err) {
              console.error("paste image failed", err);
            }
            return;
          }
        }
      },
      [focusedId, insertAfter, readOnly, uploadImage],
    );

    /* ─── Drag to reorder ────────────────────────────────────────────── */

    const dragSourceRef = useRef<string | null>(null);
    const onStartDrag = useCallback((id: string) => {
      dragSourceRef.current = id;
    }, []);

    const onContainerDragOver = useCallback(
      (e: React.DragEvent<HTMLDivElement>) => {
        if (!dragSourceRef.current) return;
        e.preventDefault();
      },
      [],
    );

    const onContainerDrop = useCallback(
      (e: React.DragEvent<HTMLDivElement>) => {
        const srcId = dragSourceRef.current;
        dragSourceRef.current = null;
        if (!srcId) return;
        // Find the nearest block row under the drop point.
        const target = (e.target as HTMLElement).closest<HTMLElement>(".nm-block-row");
        const targetIdx = target?.dataset.index ? Number(target.dataset.index) : -1;
        if (targetIdx < 0) return;
        replaceBlocks((prev) => {
          const srcIdx = prev.findIndex((b) => b.id === srcId);
          if (srcIdx === -1 || srcIdx === targetIdx) return prev;
          const next = [...prev];
          const [moved] = next.splice(srcIdx, 1);
          next.splice(targetIdx, 0, moved);
          return next;
        });
      },
      [replaceBlocks],
    );

    /* ─── Render ─────────────────────────────────────────────────────── */

    // Compute per-block numbered indices once per render so each BlockRow
    // knows its bullet number without re-scanning the array.
    const numberedIndices = useMemo(() => {
      const arr: number[] = new Array(blocks.length).fill(0);
      let run = 0;
      for (let i = 0; i < blocks.length; i += 1) {
        if (blocks[i].type === "numbered") {
          run += 1;
          arr[i] = run;
        } else {
          run = 0;
        }
      }
      return arr;
    }, [blocks]);

    // Close slash on outside click / scroll.
    useLayoutEffect(() => {
      if (!slash) return;
      const onDocClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest("[role='listbox']")) return;
        if (target?.closest(".nm-block-row")) return;
        setSlash(null);
      };
      window.addEventListener("mousedown", onDocClick, true);
      return () => window.removeEventListener("mousedown", onDocClick, true);
    }, [slash]);

    return (
      <div
        data-notion-editor
        data-readonly={readOnly ? "true" : "false"}
        onBlur={(e) => {
          // Only fire up when focus leaves the whole editor, not between blocks.
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          onBlur?.();
        }}
        onPaste={handlePaste}
        onDragOver={onContainerDragOver}
        onDrop={onContainerDrop}
        style={{
          padding: "20px 28px 80px",
          maxWidth: 860,
          margin: "0 auto",
          minHeight: "100%",
          color: colors.text,
        }}
      >
        {blocks.map((block, i) => (
          <BlockRow
            // Keying on `readOnly` forces the editable elements to remount
            // when switching between Preview and Edit, so the contentEditable
            // nodes pick up the current block content on entry into edit
            // mode (the seeding effect only fires on mount).
            key={`${block.id}:${block.type}:${readOnly ? "ro" : "rw"}`}
            block={block}
            index={i}
            numberedIndex={numberedIndices[i]}
            readOnly={readOnly}
            registerRef={registerRef}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onFocus={setFocusedId}
            onBlur={() => undefined}
            onToggleTodo={(id) => {
              const b = blocksRef.current.find((x) => x.id === id);
              if (b) updateBlock(id, { checked: !b.checked });
            }}
            onCodeLanguageChange={(id, language) => updateBlock(id, { language })}
            onStartDrag={onStartDrag}
            resolveImageSrc={resolveImageSrc}
          />
        ))}

        {slash && !readOnly && (
          <SlashMenu
            anchor={slash.anchor}
            query={slash.query}
            onPick={pickSlash}
            onClose={() => setSlash(null)}
          />
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => void onFileInputChange(e)}
        />
      </div>
    );
  },
);
