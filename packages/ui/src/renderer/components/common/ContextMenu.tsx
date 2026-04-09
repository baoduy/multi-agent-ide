import React, { useEffect, useRef, useState, useCallback } from "react";
import type { LucideIcon } from "lucide-react";

/* ── Types ── */

export type ContextMenuPosition = { x: number; y: number };

export type ContextMenuAction = {
  label: string;
  Icon?: LucideIcon;
  /** Fallback emoji icon when no lucide Icon is provided */
  emoji?: string;
  action: () => void;
  /** Optional separator line above this item */
  separator?: boolean;
};

/* ── ContextMenu ── */

type ContextMenuProps = {
  position: ContextMenuPosition;
  items: ContextMenuAction[];
  onClose: () => void;
};

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

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: adjustedPos.y,
        left: adjustedPos.x,
        zIndex: 9999,
        background: "#faf9f5",
        border: "1px solid #e5e2da",
        borderRadius: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)",
        padding: "4px 0",
        minWidth: 190,
      }}
    >
      {items.map((item, i) => (
        <React.Fragment key={item.label}>
          {item.separator && i > 0 && (
            <div style={{ height: 1, background: "#e5e2da", margin: "4px 0" }} />
          )}
          <ContextMenuItem
            label={item.label}
            Icon={item.Icon}
            emoji={item.emoji}
            onClick={() => {
              item.action();
              onClose();
            }}
          />
        </React.Fragment>
      ))}
    </div>
  );
}

/* ── ContextMenuItem ── */

function ContextMenuItem({
  label,
  Icon,
  emoji,
  onClick,
}: {
  label: string;
  Icon?: LucideIcon;
  emoji?: string;
  onClick: () => void;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        border: "none",
        background: hovered ? "#eeece6" : "transparent",
        padding: "7px 14px",
        cursor: "pointer",
        fontSize: 12,
        color: "#2c2c2c",
        textAlign: "left",
        transition: "background 0.08s",
      }}
    >
      <span style={{ display: "inline-flex", width: 18, justifyContent: "center", flexShrink: 0 }}>
        {Icon ? <Icon size={14} color="#6b6560" strokeWidth={1.8} /> : emoji ? <span style={{ fontSize: 13 }}>{emoji}</span> : null}
      </span>
      {label}
    </button>
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
