import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Check, Search, X } from "lucide-react";

import { colors } from "../../utils/colors";
import { ScrollableText } from "./ScrollableText";

/* ── Types ── */

export type SelectOption<T extends string = string> = {
  /** Unique value for this option. */
  value: T;
  /** Display label. */
  label: string;
  /** Optional secondary description (rendered below label). */
  description?: string;
  /** Optional icon element rendered before the label. */
  icon?: React.ReactNode;
  /** Optional right-side badge/suffix (e.g. "(current)"). */
  suffix?: React.ReactNode;
};

type SelectDropdownProps<T extends string = string> = {
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Placeholder when nothing is selected. */
  placeholder?: string;
  /** Enable search input in the dropdown. */
  searchable?: boolean;
  /** Custom search placeholder text. */
  searchPlaceholder?: string;
  /** Align dropdown to "start" (left) or "end" (right). Default: "start". */
  align?: "start" | "end";
  /** Minimum width of the dropdown panel. Default: trigger width. */
  minWidth?: number;
};

/* ── Component ── */

function SelectDropdownComponent<T extends string = string>({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchable = false,
  searchPlaceholder = "Search...",
  align = "start",
  minWidth,
}: SelectDropdownProps<T>): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    if (!searchable || !search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.description?.toLowerCase().includes(q) ?? false),
    );
  }, [options, search, searchable]);

  /* Close on outside click */
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  /* Focus search input when dropdown opens */
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  const handleSelect = useCallback(
    (val: T) => {
      onChange(val);
      setIsOpen(false);
      setSearch("");
    },
    [onChange],
  );

  const dropdownAlign = align === "end"
    ? { right: 0 } as const
    : { left: 0, right: 0 } as const;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* ── Trigger ── */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderRadius: 6,
          border: `1px solid ${isOpen ? colors.primary : colors.border}`,
          background: colors.bgWhite,
          cursor: "pointer",
          fontSize: 13,
          color: selected ? colors.text : colors.textTertiary,
          fontWeight: 500,
          fontFamily: "inherit",
          transition: "border-color 0.15s",
          textAlign: "left",
          boxSizing: "border-box",
        }}
      >
        {selected?.icon && (
          <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            {selected.icon}
          </span>
        )}
        <ScrollableText
          style={{
            flex: 1,
          }}
        >
          {selected?.label ?? placeholder}
        </ScrollableText>
        <ChevronDown
          size={14}
          color={colors.textTertiary}
          style={{
            flexShrink: 0,
            transform: isOpen ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        />
      </button>

      {/* ── Dropdown panel ── */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            ...dropdownAlign,
            zIndex: 50,
            background: colors.bgWhite,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            boxShadow: colors.shadowPopover,
            maxHeight: 280,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            ...(minWidth ? { minWidth } : {}),
          }}
        >
          {/* Search input (optional) */}
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
                placeholder={searchPlaceholder}
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  fontSize: 12,
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

          {/* Options list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
            {filteredOptions.map((opt) => (
              <SelectDropdownItem
                key={opt.value}
                option={opt}
                isSelected={value === opt.value}
                onSelect={handleSelect}
              />
            ))}
            {filteredOptions.length === 0 && (
              <div
                style={{
                  padding: 12,
                  fontSize: 12,
                  color: colors.textTertiary,
                  textAlign: "center",
                }}
              >
                No results
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const SelectDropdown = React.memo(SelectDropdownComponent) as typeof SelectDropdownComponent;

/* ── Item sub-component ── */

function SelectDropdownItemComponent<T extends string>({
  option,
  isSelected,
  onSelect,
}: {
  option: SelectOption<T>;
  isSelected: boolean;
  onSelect: (value: T) => void;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);

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
        gap: 10,
        padding: "7px 12px",
        border: "none",
        background: hovered || isSelected ? colors.bgHover : "transparent",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.08s",
        fontFamily: "inherit",
      }}
    >
      {/* Icon */}
      {option.icon && (
        <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          {option.icon}
        </span>
      )}

      {/* Label + description */}
      <span style={{ flex: 1, minWidth: 0 }}>
        <ScrollableText
          style={{
            fontSize: 12,
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
              fontSize: 11,
              color: colors.textTertiary,
              marginTop: 1,
              lineHeight: 1.3,
            }}
          >
            {option.description}
          </span>
        )}
      </span>

      {/* Checkmark */}
      {isSelected && (
        <Check size={14} color={colors.primary} strokeWidth={2.5} style={{ flexShrink: 0 }} />
      )}
    </button>
  );
}

const SelectDropdownItem = React.memo(SelectDropdownItemComponent) as typeof SelectDropdownItemComponent;
