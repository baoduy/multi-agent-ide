import React, { useEffect, useRef, useState } from "react";

import { colors } from "../../utils/colors";
import { ScrollableText } from "../common/ScrollableText";
import type { TocHeading } from "./fileViewerUtils";

const TOC_MIN_WIDTH = 120;
const TOC_MAX_WIDTH = 400;
const TOC_DEFAULT_WIDTH = 220;

/**
 * Watches scroll position inside `containerRef` and returns the id of the
 * heading currently at (or just above) the viewport top. Returns null when
 * the container is unmounted, has no headings, or is in a non-preview mode.
 *
 * Heading lookup is DOM-index based rather than id-based: NotionEditor
 * renders heading blocks as real <h1>–<h6> tags but does not attach anchor
 * ids. The source-order index carried on each `TocHeading` matches the
 * position of the heading element in the rendered DOM when the document is
 * free of authored HTML heading overrides — which holds for every markdown
 * path in this app.
 */
export function useActiveHeading(
  containerRef: React.RefObject<HTMLDivElement | null>,
  headings: TocHeading[],
  enabled: boolean,
): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled || headings.length === 0) {
      setActiveId(null);
      return;
    }

    const handleScroll = () => {
      const offset = 80;
      const nodes = container.querySelectorAll<HTMLHeadingElement>(
        "h1,h2,h3,h4,h5,h6",
      );
      let current: string | null = null;

      for (const h of headings) {
        const el = nodes[h.index];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const relativeTop = rect.top - containerRect.top;

        if (relativeTop <= offset) current = h.id;
      }

      setActiveId(current);
    };

    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [containerRef, headings, enabled]);

  return activeId;
}

type Props = {
  headings: TocHeading[];
  activeId: string | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
};

export const MarkdownTableOfContents = React.memo(function MarkdownTableOfContents({
  headings,
  activeId,
  containerRef,
}: Props): React.ReactElement | null {
  const [width, setWidth] = useState(TOC_DEFAULT_WIDTH);
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);

  if (headings.length === 0) return null;

  const minLevel = Math.min(...headings.map((h) => h.level));

  const handleClick = (heading: TocHeading) => {
    const container = containerRef.current;
    if (!container) return;
    const nodes = container.querySelectorAll<HTMLHeadingElement>(
      "h1,h2,h3,h4,h5,h6",
    );
    const el = nodes[heading.index];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onHandleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    lastXRef.current = e.clientX;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      // ToC is on the right: dragging left → delta negative → width grows
      const delta = lastXRef.current - ev.clientX;
      lastXRef.current = ev.clientX;
      setWidth((prev) => Math.min(TOC_MAX_WIDTH, Math.max(TOC_MIN_WIDTH, prev + delta)));
    };

    const onMouseUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div
      style={{
        width,
        minWidth: TOC_MIN_WIDTH,
        maxWidth: TOC_MAX_WIDTH,
        flexShrink: 0,
        position: "sticky",
        top: 0,
        alignSelf: "stretch",
        display: "flex",
        height: "100vh",
      }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={onHandleMouseDown}
        style={{
          width: 5,
          flexShrink: 0,
          cursor: "col-resize",
          position: "relative",
          borderLeft: `1px solid ${colors.border}`,
        }}
      />

      <nav
        style={{
          flex: 1,
          minWidth: 0,
          overflowY: "auto",
          padding: "20px 12px 20px 0",
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
              key={`${h.index}-${h.id}`}
              type="button"
              onClick={() => handleClick(h)}
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
                borderLeft: isActive
                  ? `2px solid ${colors.primary}`
                  : "2px solid transparent",
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
    </div>
  );
});
