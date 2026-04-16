/**
 * AccordionSection — a single collapsible section inside a SideContainer.
 *
 * Renders a clickable header with chevron + title, and a body that
 * collapses to zero height. Used in left/right sidebars.
 *
 * Supports drag initiation: long-press or drag the grip handle to start
 * a cross-region move via useDockDrag.
 *
 * When `searchable` is true, a search icon appears on the right of the
 * header. Clicking it replaces the title row with an inline search input.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { ChevronRight, ChevronDown, GripVertical, Search, X } from "lucide-react";
import { colors } from "../../utils/colors";
import { ScrollableText } from "../common/ScrollableText";
import { useDockDrag } from "./useDockDrag";
import type { DockRegion } from "./types";

type AccordionSectionProps = {
  viewId: string;
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  /** The region this section belongs to (for drag source tracking) */
  region?: DockRegion;
  /** Whether this section is currently being dragged over */
  isDragOver?: boolean;
  /** Enable the search icon / inline filter input */
  searchable?: boolean;
  /** Controlled search value */
  searchQuery?: string;
  /** Callback when search input changes */
  onSearchChange?: (query: string) => void;
  /** Placeholder text for the search input */
  searchPlaceholder?: string;
};

export const AccordionSection = React.memo(function AccordionSection({
  viewId,
  title,
  icon,
  expanded,
  onToggle,
  children,
  region,
  isDragOver,
  searchable,
  searchQuery,
  onSearchChange,
  searchPlaceholder,
}: AccordionSectionProps): React.ReactElement {
  const [headerHovered, setHeaderHovered] = useState(false);
  const [gripHovered, setGripHovered] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const startDrag = useDockDrag((s) => s.startDrag);
  const isDragging = useDockDrag((s) => s.isDragging);
  const dragViewId = useDockDrag((s) => s.dragViewId);

  // Track mouse down on grip to distinguish click from drag
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const dragStarted = useRef(false);

  // Close search when section is collapsed
  useEffect(() => {
    if (!expanded && searchOpen) {
      setSearchOpen(false);
      onSearchChange?.("");
    }
  }, [expanded, searchOpen, onSearchChange]);

  // Auto-focus the input when search opens
  useEffect(() => {
    if (searchOpen) {
      // Small delay to let React render the input before focusing
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [searchOpen]);

  const handleGripMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      dragStartPos.current = { x: e.clientX, y: e.clientY };
      dragStarted.current = false;

      const onMouseMove = (me: MouseEvent) => {
        if (!dragStartPos.current || dragStarted.current) return;
        const dx = me.clientX - dragStartPos.current.x;
        const dy = me.clientY - dragStartPos.current.y;
        // Start drag after 5px movement threshold
        if (Math.abs(dx) + Math.abs(dy) > 5) {
          dragStarted.current = true;
          if (region) {
            startDrag(viewId, region);
          }
        }
      };

      const onMouseUp = () => {
        dragStartPos.current = null;
        dragStarted.current = false;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [viewId, region, startDrag]
  );

  const handleSearchToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (searchOpen) {
        setSearchOpen(false);
        onSearchChange?.("");
      } else {
        if (!expanded) onToggle();
        setSearchOpen(true);
      }
    },
    [searchOpen, expanded, onToggle, onSearchChange]
  );

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setSearchOpen(false);
        onSearchChange?.("");
      }
    },
    [onSearchChange]
  );

  const isBeingDragged = isDragging && dragViewId === viewId;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        overflow: "hidden",
        borderTop: `1px solid ${colors.border}`,
        opacity: isBeingDragged ? 0.4 : 1,
        transition: "opacity 0.15s",
        ...(isDragOver
          ? { outline: `2px solid ${colors.primary}`, outlineOffset: -2 }
          : {}),
      }}
    >
      {/* Header */}
      <div
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "7px 8px",
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          cursor: "pointer",
          background: headerHovered ? colors.bgHover : "transparent",
          color: colors.textTertiary,
          transition: "background 0.12s, color 0.12s",
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        {/* Drag handle */}
        {region && !searchOpen && (
          <span
            onMouseDown={handleGripMouseDown}
            onMouseEnter={() => setGripHovered(true)}
            onMouseLeave={() => setGripHovered(false)}
            style={{
              display: "inline-flex",
              cursor: "grab",
              color: colors.textTertiary,
              opacity: headerHovered || gripHovered ? 0.7 : 0,
              transition: "opacity 0.15s",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={12} strokeWidth={1.5} />
          </span>
        )}

        {searchOpen ? (
          /* ── Search mode: inline input replaces title ── */
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: colors.bgPanel,
              borderRadius: 4,
              padding: "0 6px",
              border: `1px solid ${searchQuery ? colors.borderStrong : colors.border}`,
              height: 20,
              boxSizing: "border-box",
              transition: "border-color 0.15s",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Search
              size={11}
              color={colors.textTertiary}
              strokeWidth={1.8}
              style={{ flexShrink: 0 }}
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery ?? ""}
              onChange={(e) => onSearchChange?.(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={searchPlaceholder ?? `Filter ${title.toLowerCase()}…`}
              style={{
                flex: 1,
                border: "none",
                background: "transparent",
                outline: "none",
                fontSize: 11,
                color: colors.textStrong,
                padding: 0,
                lineHeight: "16px",
                textTransform: "none",
                letterSpacing: "normal",
                fontWeight: 400,
              }}
            />
            <button
              type="button"
              onClick={handleSearchToggle}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "1px",
                lineHeight: 1,
                display: "inline-flex",
                alignItems: "center",
                color: colors.textTertiary,
                borderRadius: 3,
              }}
              title="Close search"
            >
              <X size={12} strokeWidth={2} />
            </button>
          </div>
        ) : (
          /* ── Normal mode: chevron + icon + title ── */
          <>
            <button
              type="button"
              onClick={onToggle}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                flex: 1,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "inherit",
                font: "inherit",
                textTransform: "inherit",
                letterSpacing: "inherit",
                padding: 0,
              }}
            >
              {/* Chevron */}
              {expanded ? (
                <ChevronDown size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
              ) : (
                <ChevronRight size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
              )}

              {/* Icon */}
              <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
                {icon}
              </span>

              {/* Title */}
              <ScrollableText style={{ flex: 1 }}>
                {title}
              </ScrollableText>
            </button>

            {/* Search toggle button */}
            {searchable && (
              <button
                type="button"
                onClick={handleSearchToggle}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "1px",
                  lineHeight: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  color: colors.textTertiary,
                  borderRadius: 3,
                  opacity: headerHovered ? 0.8 : 0,
                  transition: "opacity 0.15s",
                  flexShrink: 0,
                }}
                title="Search"
              >
                <Search size={12} strokeWidth={2} />
              </button>
            )}
          </>
        )}
      </div>

      {/* Body — collapse via height */}
      {expanded && (
        <div
          style={{
            flex: 1,
            overflow: "auto",
            minHeight: 0,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
});
