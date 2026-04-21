import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { Bold, Italic, Strikethrough, Code as CodeIcon, Link as LinkIcon } from "lucide-react";
import { colors } from "../../../utils/colors";

type Format = "bold" | "italic" | "strike" | "code" | "link";

const MARKERS: Record<Exclude<Format, "link">, string> = {
  bold: "**",
  italic: "*",
  strike: "~~",
  code: "`",
};

/* ─── Selection offset helpers ──────────────────────────────────────────── */

/**
 * Compute the character offset of (node, offset) within the plaintext of
 * `root`. Handles nested contentEditable subtrees by walking text nodes. The
 * result matches `root.innerText` slicing with reasonable accuracy for the
 * simple block rows the editor produces (no tables or floats).
 */
function textOffset(root: HTMLElement, node: Node, offset: number): number {
  if (!root.contains(node)) return 0;
  let total = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null = walker.nextNode();
  while (n) {
    if (n === node) return total + offset;
    total += (n.nodeValue ?? "").length;
    n = walker.nextNode();
  }
  // Element node — sum length up to offset-th child.
  if (node.nodeType === Node.ELEMENT_NODE) {
    const children = Array.from(node.childNodes).slice(0, offset);
    for (const child of children) {
      total += (child.textContent ?? "").length;
    }
  }
  return total;
}

/** Detect whether the range (startOff, endOff) in `text` is inside the given
 *  marker pair — either surrounding the selection, or included in it. */
function isActiveFormat(
  text: string,
  startOff: number,
  endOff: number,
  marker: string,
): boolean {
  const len = marker.length;
  const selected = text.slice(startOff, endOff);
  // Case A: selection already includes markers.
  if (
    selected.length >= len * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    return true;
  }
  // Case B: markers are immediately outside the selection.
  if (
    startOff >= len &&
    text.slice(startOff - len, startOff) === marker &&
    text.slice(endOff, endOff + len) === marker
  ) {
    return true;
  }
  return false;
}

/** Rewrite the host's plaintext content and fire an input event. Caret is
 *  placed at `caretOffset` (or collapsed to end if not supplied). */
function replaceHostText(host: HTMLElement, next: string, caretOffset?: number): void {
  host.textContent = next;
  host.dispatchEvent(new InputEvent("input", { bubbles: true }));
  // Best-effort caret restore at caretOffset in the new text.
  const sel = window.getSelection();
  if (!sel) return;
  const textNode = host.firstChild;
  if (!textNode) return;
  const offset = Math.min(
    caretOffset ?? (textNode.nodeValue?.length ?? 0),
    textNode.nodeValue?.length ?? 0,
  );
  const range = document.createRange();
  try {
    range.setStart(textNode, offset);
    range.setEnd(textNode, offset);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    // ignore — selection will naturally reset on next focus.
  }
}

/**
 * Apply or remove the markdown marker for `format` around the current
 * selection. Handles three cases:
 *   1. not active → wrap selection in markers
 *   2. active, markers inside selection → strip them from within
 *   3. active, markers just outside selection → remove the surrounding pair
 */
function toggleFormat(format: Format, active: boolean): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  const host = (range.startContainer.parentElement ?? null)?.closest(
    "[contenteditable='true']",
  ) as HTMLElement | null;
  if (!host) return;

  if (format === "link") {
    const url = window.prompt("Link URL", "https://");
    if (!url) return;
    const start = textOffset(host, range.startContainer, range.startOffset);
    const end = textOffset(host, range.endContainer, range.endOffset);
    const text = host.innerText;
    const inner = text.slice(start, end) || "link";
    const next = text.slice(0, start) + `[${inner}](${url})` + text.slice(end);
    replaceHostText(host, next, start + inner.length + url.length + 4);
    return;
  }

  const marker = MARKERS[format];
  const len = marker.length;
  const start = textOffset(host, range.startContainer, range.startOffset);
  const end = textOffset(host, range.endContainer, range.endOffset);
  if (start === end) return;
  const text = host.innerText;
  const selected = text.slice(start, end);

  if (!active) {
    const next = text.slice(0, start) + marker + selected + marker + text.slice(end);
    replaceHostText(host, next, end + len * 2);
    return;
  }

  // Case A: markers inside selection.
  if (
    selected.length >= len * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const stripped = selected.slice(len, selected.length - len);
    const next = text.slice(0, start) + stripped + text.slice(end);
    replaceHostText(host, next, start + stripped.length);
    return;
  }

  // Case B: markers just outside selection.
  if (
    start >= len &&
    text.slice(start - len, start) === marker &&
    text.slice(end, end + len) === marker
  ) {
    const next = text.slice(0, start - len) + selected + text.slice(end + len);
    replaceHostText(host, next, start - len + selected.length);
    return;
  }
}

type ActiveFormats = { bold: boolean; italic: boolean; strike: boolean; code: boolean };

export function SelectionToolbar(): React.ReactElement | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [active, setActive] = useState<ActiveFormats>({
    bold: false,
    italic: false,
    strike: false,
    code: false,
  });
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const update = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setRect(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const host = (range.startContainer.parentElement ?? null)?.closest(
        "[contenteditable='true']",
      ) as HTMLElement | null;
      if (!host) {
        setRect(null);
        return;
      }
      const r = range.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        setRect(null);
        return;
      }
      const text = host.innerText;
      const start = textOffset(host, range.startContainer, range.startOffset);
      const end = textOffset(host, range.endContainer, range.endOffset);
      setActive({
        bold: isActiveFormat(text, start, end, "**"),
        // Italic uses `*` but `**bold**` would also match — require NOT bold.
        italic:
          !isActiveFormat(text, start, end, "**") &&
          isActiveFormat(text, start, end, "*"),
        strike: isActiveFormat(text, start, end, "~~"),
        code: isActiveFormat(text, start, end, "`"),
      });
      setRect(r);
    };
    const onSelection = () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(update);
    };
    document.addEventListener("selectionchange", onSelection);
    return () => {
      document.removeEventListener("selectionchange", onSelection);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!rect) return;
    const onScroll = () => setRect(null);
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [rect]);

  if (!rect) return null;

  const top = Math.max(8, rect.top - 38);
  const left = Math.max(8, rect.left + rect.width / 2 - 110);

  const btn = (
    format: Format,
    Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>,
    label: string,
    isActive: boolean,
  ) => (
    <button
      type="button"
      title={label}
      aria-pressed={isActive}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => toggleFormat(format, isActive)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        border: "none",
        background: isActive
          ? "color-mix(in srgb, var(--primary) 22%, transparent)"
          : "transparent",
        color: isActive ? "var(--primary)" : colors.text,
        borderRadius: 4,
        cursor: "pointer",
      }}
      className="nm-selection-btn"
    >
      <Icon size={14} strokeWidth={isActive ? 2.4 : 1.8} />
    </button>
  );

  return ReactDOM.createPortal(
    <div
      className="nm-selection-toolbar"
      style={{
        position: "fixed",
        top,
        left,
        zIndex: 1100,
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: 3,
        background: colors.dialogBg,
        border: `1px solid ${colors.border}`,
        borderRadius: 6,
        boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
      }}
    >
      {btn("bold", Bold, "Bold (**)", active.bold)}
      {btn("italic", Italic, "Italic (*)", active.italic)}
      {btn("strike", Strikethrough, "Strikethrough (~~)", active.strike)}
      {btn("code", CodeIcon, "Inline code (`)", active.code)}
      <span style={{ width: 1, alignSelf: "stretch", background: colors.border, margin: "0 2px" }} />
      {btn("link", LinkIcon, "Link", false)}
    </div>,
    document.body,
  );
}
