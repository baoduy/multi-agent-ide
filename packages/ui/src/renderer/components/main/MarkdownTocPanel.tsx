/**
 * MarkdownTocPanel — right-sidebar panel that renders a Table of Contents
 * for the currently-previewed markdown file.
 *
 * Sources data from `markdownPreviewStore`, which is populated by the
 * active FileViewer when (and only when) it is in preview mode. The panel
 * is filtered out of the sidebar entirely by SideContainer when nothing
 * is being previewed, so the visible chrome only appears alongside an
 * active preview.
 *
 * Scroll-spy: observes the FileViewer's scroll container (shared via the
 * store) and highlights the heading currently at or above the viewport
 * top. Click-to-scroll jumps the same container to the chosen heading.
 */

import React, { useEffect, useMemo, useState } from "react";

import { colors } from "../../utils/colors";
import { ScrollableText } from "../common/ScrollableText";
import { extractHeadings, type TocHeading } from "./fileViewerUtils";
import { useMarkdownPreviewStore } from "../../store/markdownPreviewStore";

/**
 * Watches scroll inside `container` and returns the id of the heading
 * currently at (or just above) the viewport top. Indexes into the DOM
 * headings in source order — mirrors the behaviour of the previous
 * inline TOC hook.
 */
function useActiveHeadingForElement(
  container: HTMLElement | null,
  headings: TocHeading[],
): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!container || headings.length === 0) {
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
  }, [container, headings]);

  return activeId;
}

export function MarkdownTocPanel(): React.ReactElement {
  const active = useMarkdownPreviewStore((s) => s.active);

  const headings = useMemo(
    () => (active ? extractHeadings(active.content) : []),
    [active],
  );

  const activeId = useActiveHeadingForElement(active?.scrollEl ?? null, headings);

  if (!active) {
    return <EmptyMessage>Open a markdown file in preview mode to see its outline.</EmptyMessage>;
  }

  if (headings.length === 0) {
    return <EmptyMessage>This document has no headings.</EmptyMessage>;
  }

  const minLevel = Math.min(...headings.map((h) => h.level));

  const handleClick = (h: TocHeading) => {
    const nodes = active.scrollEl.querySelectorAll<HTMLHeadingElement>(
      "h1,h2,h3,h4,h5,h6",
    );
    const el = nodes[h.index];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav style={{ overflowY: "auto", padding: "8px 0" }}>
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
  );
}

function EmptyMessage({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      style={{
        padding: "12px",
        fontSize: 11,
        color: colors.textTertiary,
        fontStyle: "italic",
      }}
    >
      {children}
    </div>
  );
}
