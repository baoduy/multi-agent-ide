import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";

import { colors } from "../../utils/colors";
import { ScrollableText } from "./ScrollableText";
import { useDensityTokens } from "../../hooks/useComponentSize";

/* ── Types ── */

export type DoublePickerOption<T extends string = string> = {
  value: T;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  suffix?: React.ReactNode;
  /**
   * When provided, replaces the dropdown item's icon + label + suffix block
   * with this node (description still renders below). The trigger continues
   * to use `icon` + `label`, so those fields should still be set for search
   * and selected-state display.
   */
  content?: React.ReactNode;
};

export type DoublePickerSide<T extends string = string> = {
  options: readonly DoublePickerOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Placeholder when nothing is selected. */
  placeholder?: string;
  /** Enable search input in the dropdown. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Minimum width of the dropdown panel. Default: trigger width. */
  minPanelWidth?: number;
  /** Disable this side — trigger becomes non-interactive and visually muted. */
  disabled?: boolean;
};

type Side = "left" | "right";

type DoublePickerProps<L extends string = string, R extends string = string> = {
  left: DoublePickerSide<L>;
  right: DoublePickerSide<R>;
};

/**
 * Segmented two-button picker where each half is an independent dropdown.
 * Visually similar to a `ButtonGroup`, but each segment opens its own
 * dropdown panel on click (not a mutually-exclusive toggle).
 */
function DoublePickerComponent<L extends string = string, R extends string = string>({
  left,
  right,
}: DoublePickerProps<L, R>): React.ReactElement {
  const [openSide, setOpenSide] = useState<Side | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /* Close on outside click */
  useEffect(() => {
    if (!openSide) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenSide(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openSide]);

  /* Close on Escape */
  useEffect(() => {
    if (!openSide) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenSide(null);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [openSide]);

  const handleToggle = useCallback(
    (side: Side) => setOpenSide((prev) => (prev === side ? null : side)),
    [],
  );

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        display: "flex",
        width: "100%",
        border: `1px solid ${colors.border}`,
        borderRadius: 6,
        overflow: "visible",
        background: colors.bgWhite,
      }}
    >
      <PickerTrigger
        side="left"
        isOpen={openSide === "left"}
        selected={left.options.find((o) => o.value === left.value)}
        placeholder={left.placeholder}
        disabled={left.disabled}
        onClick={() => !left.disabled && handleToggle("left")}
      />
      <div
        aria-hidden
        style={{ width: 1, background: colors.border, alignSelf: "stretch" }}
      />
      <PickerTrigger
        side="right"
        isOpen={openSide === "right"}
        selected={right.options.find((o) => o.value === right.value)}
        placeholder={right.placeholder}
        disabled={right.disabled}
        onClick={() => !right.disabled && handleToggle("right")}
      />

      {openSide === "left" && !left.disabled && (
        <DropdownPanel
          sideConfig={left}
          onClose={() => setOpenSide(null)}
        />
      )}
      {openSide === "right" && !right.disabled && (
        <DropdownPanel
          sideConfig={right}
          onClose={() => setOpenSide(null)}
        />
      )}
    </div>
  );
}

export const DoublePicker = React.memo(DoublePickerComponent) as typeof DoublePickerComponent;

/* ── Trigger ── */

type PickerTriggerProps = {
  side: Side;
  isOpen: boolean;
  selected: DoublePickerOption | undefined;
  placeholder?: string;
  disabled?: boolean;
  onClick: () => void;
};

function PickerTrigger({
  side: _side,
  isOpen,
  selected,
  placeholder,
  disabled,
  onClick,
}: PickerTriggerProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const d = useDensityTokens();
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        background: disabled ? "transparent" : (isOpen || hovered ? colors.bgHover : "transparent"),
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: d.font,
        fontWeight: 500,
        color: disabled ? colors.textTertiary : (selected ? colors.text : colors.textTertiary),
        opacity: disabled ? 0.55 : 1,
        fontFamily: "inherit",
        transition: "background 0.12s",
        minWidth: 0,
      }}
    >
      {selected?.icon && (
        <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
          {selected.icon}
        </span>
      )}
      <ScrollableText
        style={{
          maxWidth: 220,
        }}
      >
        {selected?.label ?? placeholder ?? "Select..."}
      </ScrollableText>
    </button>
  );
}

/* ── Dropdown panel ── */

type DropdownPanelProps<T extends string> = {
  sideConfig: DoublePickerSide<T>;
  onClose: () => void;
};

function DropdownPanel<T extends string>({
  sideConfig,
  onClose,
}: DropdownPanelProps<T>): React.ReactElement {
  const { options, value, onChange, searchable, searchPlaceholder, minPanelWidth } = sideConfig;
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const d = useDensityTokens();

  useEffect(() => {
    if (searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchable]);

  const filtered = useMemo(() => {
    if (!searchable || !search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.description?.toLowerCase().includes(q) ?? false),
    );
  }, [options, search, searchable]);

  const handleSelect = useCallback(
    (v: T) => {
      onChange(v);
      setSearch("");
      onClose();
    },
    [onChange, onClose],
  );

  return (
    <div
      style={{
        position: "absolute",
        top: "calc(100% + 4px)",
        left: 0,
        right: 0,
        zIndex: 50,
        background: colors.bgWhite,
        border: `1px solid ${colors.border}`,
        borderRadius: 6,
        boxShadow: colors.shadowPopover,
        maxHeight: 300,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minWidth: minPanelWidth ?? 200,
      }}
    >
      {searchable && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            borderBottom: `1px solid ${colors.borderLight}`,
          }}
        >
          <Search size={13} color={colors.textTertiary} style={{ flexShrink: 0 }} />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder ?? "Search..."}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              fontSize: d.font,
              color: colors.text,
              background: "transparent",
              fontFamily: "inherit",
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              style={{
                display: "flex",
                alignItems: "center",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <X size={12} color={colors.textTertiary} />
            </button>
          )}
        </div>
      )}

      <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
        {filtered.map((opt) => (
          <DropdownItem
            key={opt.value}
            option={opt}
            isSelected={value === opt.value}
            onSelect={handleSelect}
          />
        ))}
        {filtered.length === 0 && (
          <div
            style={{
              padding: 12,
              fontSize: d.font,
              color: colors.textTertiary,
              textAlign: "center",
            }}
          >
            No results
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Item ── */

function DropdownItemComponent<T extends string>({
  option,
  isSelected,
  onSelect,
}: {
  option: DoublePickerOption<T>;
  isSelected: boolean;
  onSelect: (value: T) => void;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const d = useDensityTokens();

  return (
    <button
      type="button"
      onClick={() => onSelect(option.value)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 12px",
        border: "none",
        background: hovered || isSelected ? colors.bgHover : "transparent",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.08s",
        fontFamily: "inherit",
      }}
    >
      {option.content ? (
        <span style={{ flex: 1, minWidth: 0 }}>
          {option.content}
          {option.description && (
            <span
              style={{
                display: "block",
                fontSize: d.font,
                color: colors.textTertiary,
                marginTop: 1,
                lineHeight: 1.3,
              }}
            >
              {option.description}
            </span>
          )}
        </span>
      ) : (
        <>
          {option.icon && (
            <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
              {option.icon}
            </span>
          )}
          <span style={{ flex: 1, minWidth: 0 }}>
            <ScrollableText
              style={{
                fontSize: d.font,
                fontWeight: 500,
                color: colors.text,
                lineHeight: 1.4,
              }}
            >
              {option.label}
              {option.suffix && (
                <span style={{ fontWeight: 400, color: colors.textTertiary, marginLeft: 6 }}>
                  {option.suffix}
                </span>
              )}
            </ScrollableText>
            {option.description && (
              <span
                style={{
                  display: "block",
                  fontSize: d.font,
                  color: colors.textTertiary,
                  marginTop: 1,
                  lineHeight: 1.3,
                }}
              >
                {option.description}
              </span>
            )}
          </span>
        </>
      )}
      {isSelected && (
        <Check size={14} color={colors.primary} strokeWidth={2.5} style={{ flexShrink: 0 }} />
      )}
    </button>
  );
}

const DropdownItem = React.memo(DropdownItemComponent) as typeof DropdownItemComponent;
