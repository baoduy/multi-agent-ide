import React from "react";

/**
 * Tiny inline-markdown renderer for preview mode. Handles the subset that
 * round-trips safely inside a contentEditable: bold, italic, strikethrough,
 * inline code, and links. Anything more complex (images, tables, block
 * constructs) belongs to the block layer.
 *
 * The implementation HTML-escapes first, then applies ordered regex
 * substitutions, and finally mounts the result through
 * `dangerouslySetInnerHTML`. Safe as long as the escape step runs first.
 */
export function renderInline(text: string): React.ReactNode {
  if (!text) return null;

  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  let html = escape(text);

  // Inline code first — its contents must not be touched by later rules.
  const codeSlots: string[] = [];
  html = html.replace(/`([^`]+)`/g, (_match, code) => {
    codeSlots.push(code);
    return `\u0000CODE${codeSlots.length - 1}\u0000`;
  });

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic (allow leading char, don't greedily eat ** that was already consumed)
  html = html.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  // Strikethrough
  html = html.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  // Links — [text](url)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, label, url) =>
      `<a href="${encodeURI(url)}" target="_blank" rel="noreferrer" class="nm-link">${label}</a>`,
  );

  // Restore inline code slots with formatted HTML.
  html = html.replace(
    /\u0000CODE(\d+)\u0000/g,
    (_m, n) => `<code class="nm-inline-code">${codeSlots[Number(n)]}</code>`,
  );

  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Plain-text extraction, used e.g. by the table-of-contents to strip
 *  inline markdown before slug generation. */
export function stripInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}
