import React, { useEffect, useRef, useState, useCallback } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";

import { colors } from "../../utils/colors";

/* ── Types ── */

export type ContextMenuPosition = { x: number; y: number };

export type ContextMenuAction = {
  label: string;
  Icon?: LucideIcon;
  /** Fallback emoji icon when no lucide Icon is provided */
  emoji?: string;
  /** Click handler. Ignored when `submenu` is provided. */
  action?: () => void;
  /** Optional separator line above this item */
  separator?: boolean;
  /** Child items rendered as a nested menu on hover. When set, `action` is ignored. */
  submenu?: ContextMenuAction[];
};

/* ── ContextMenu ── */

type ContextMenuProps = {
  position: ContextMenuPosition;
  items: ContextMenuAction[];
  onClose: () => void;
};

/**
 * Root context menu — handles click-outside and viewport clipping.
 * Delegates rendering to MenuPanel so submenus can reuse the same panel
 * without duplicating the click-outside handler.
 */
export function ContextMenu({ position, items, onClose }: ContextMenuProps): React.ReactElement {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid the same right-click event closing the menu
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Prevent menu from rendering off-screen
  const [adjustedPos, setAdjustedPos] = useState(position);
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    let { x, y } = position;
    if (rect.right > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (rect.bottom > window.innerHeight) y = window.innerHeight - rect.height - 8;
    if (x < 0) x = 8;
    if (y < 0) y = 8;
    if (x !== position.x || y !== position.y) setAdjustedPos({ x, y });
  }, [position]);

  return <MenuPanel panelRef={menuRef} position={adjustedPos} items={items} onClose={onClose} />;
}

/* ── MenuPanel ── */

type MenuPanelProps = {
  position: ContextMenuPosition;
  items: ContextMenuAction[];
  onClose: () => void;
  panelRef?: React.RefObject<HTMLDivElement | null>;
};

/**
 * Stateless menu panel. Used by both the root ContextMenu and any nested submenus.
 * Does NOT install its own click-outside handler — submenus live inside the root
 * panel's DOM subtree so the root's handler covers them.
 */
function MenuPanel({ position, items, onClose, panelRef }: MenuPanelProps): React.ReactElement {
  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        top: position.y,
        left: position.x,
        zIndex: 9999,
        background: colors.bgSurface,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        boxShadow: colors.shadowContextMenu,
        padding: "4px 0",
        minWidth: 190,
      }}
    >
      {items.map((item, i) => (
        <React.Fragment key={item.label}>
          {item.separator && i > 0 && (
            <div style={{ height: 1, background: colors.border, margin: "4px 0" }} />
          )}
          <ContextMenuItem item={item} onClose={onClose} />
        </React.Fragment>
      ))}
    </div>
  );
}

/* ── ContextMenuItem ── */

/** Small grace period so users can transition between parent item and submenu. */
const SUBMENU_CLOSE_DELAY_MS = 120;

function ContextMenuItem({
  item,
  onClose,
}: {
  item: ContextMenuAction;
  onClose: () => void;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const [submenuPos, setSubmenuPos] = useState<ContextMenuPosition | null>(null);
  const itemRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasSubmenu = !!(item.submenu && item.submenu.length > 0);

  const handleClick = useCallback(() => {
    if (hasSubmenu) return; // submenu items don't trigger actions themselves
    item.action?.();
    onClose();
  }, [hasSubmenu, item, onClose]);

  // Open/close submenu with a grace period for mouse transitions
  const openSubmenu = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (!hasSubmenu || !itemRef.current) return;
    const rect = itemRef.current.getBoundingClientRect();
    setSubmenuPos({ x: rect.right - 2, y: rect.top - 4 });
    setSubmenuOpen(true);
  }, [hasSubmenu]);

  const scheduleCloseSubmenu = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setSubmenuOpen(false);
      setSubmenuPos(null);
    }, SUBMENU_CLOSE_DELAY_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => { setHovered(true); openSubmenu(); }}
      onMouseLeave={() => { setHovered(false); scheduleCloseSubmenu(); }}
    >
      <button
        ref={itemRef}
        type="button"
        onClick={handleClick}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          border: "none",
          background: hovered || submenuOpen ? colors.bgHover : "transparent",
          padding: "7px 14px",
          cursor: hasSubmenu ? "default" : "pointer",
          fontSize: 12,
          color: colors.text,
          textAlign: "left",
          transition: "background 0.08s",
        }}
      >
        <span style={{ display: "inline-flex", width: 18, justifyContent: "center", flexShrink: 0 }}>
          {item.Icon ? <item.Icon size={14} color={colors.textMuted} strokeWidth={1.8} /> : item.emoji ? <span style={{ fontSize: 13 }}>{item.emoji}</span> : null}
        </span>
        <span style={{ flex: 1 }}>{item.label}</span>
        {hasSubmenu && (
          <ChevronRight size={12} color={colors.textMuted} strokeWidth={1.8} style={{ marginLeft: 8, flexShrink: 0 }} />
        )}
      </button>
      {hasSubmenu && submenuOpen && submenuPos && item.submenu && (
        <div
          // Keep submenu open while hovering it; cancel pending close on enter.
          onMouseEnter={openSubmenu}
          onMouseLeave={scheduleCloseSubmenu}
        >
          <MenuPanel position={submenuPos} items={item.submenu} onClose={onClose} />
        </div>
      )}
    </div>
  );
}

/* ── Hook: useContextMenu ── */

export function useContextMenu(): {
  contextMenu: ContextMenuPosition | null;
  openContextMenu: (e: React.MouseEvent) => void;
  closeContextMenu: () => void;
} {
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null);

  const openContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return { contextMenu, openContextMenu, closeContextMenu };
}
