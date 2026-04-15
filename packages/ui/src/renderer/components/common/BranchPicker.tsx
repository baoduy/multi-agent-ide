import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, GitBranch } from "lucide-react";

import { colors } from "../../utils/colors";
import { BranchRow } from "./BranchRow";

/* ══════════════════════════════════════════
 * BranchPicker — consistent branch dropdown with icons + search.
 *
 * Replaces raw <select><option> usage for branch selection so the icon,
 * styling, and search behaviour stay consistent with BranchRow list rows.
 * ══════════════════════════════════════════ */

type BranchPickerProps = {
  branches: string[];
  value: string;
  onChange: (branch: string) => void;
  /** Name of the currently-checked-out branch — shown with checkmark */
  currentBranch?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Optional id for label `htmlFor` linkage */
  id?: string;
};

function BranchPickerComponent({
  branches,
  value,
  onChange,
  currentBranch,
  placeholder = "Select branch...",
  disabled = false,
  id,
}: BranchPickerProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    // Delay to avoid the same click that opened us from closing us
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [open]);

  // Focus search on open
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const filtered = useMemo(() => {
    if (!search) return branches;
    const q = search.toLowerCase();
    return branches.filter((b) => b.toLowerCase().includes(q));
  }, [branches, search]);

  const handleSelect = useCallback((b: string) => {
    onChange(b);
    setOpen(false);
    setSearch("");
  }, [onChange]);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      {/* Trigger button — visually matches a <select> field */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 32px 8px 10px",
          fontSize: 13,
          border: `1px solid ${open ? colors.primary : colors.border}`,
          borderRadius: 6,
          background: colors.bgSurface,
          color: value ? colors.text : colors.textTertiary,
          fontFamily: "var(--font-mono)",
          cursor: disabled ? "not-allowed" : "pointer",
          outline: "none",
          textAlign: "left",
          position: "relative",
          transition: "border-color 0.15s",
          boxSizing: "border-box",
        }}
      >
        <GitBranch size={13} color={colors.textMuted} strokeWidth={1.8} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value || placeholder}
        </span>
        <ChevronDown
          size={14}
          color={colors.textTertiary}
          style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
        />
      </button>

      {/* Popover — search + scrollable list of BranchRow */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 20,
            background: colors.bgSurface,
            border: `1px solid ${colors.border}`,
            borderRadius: 6,
            boxShadow: colors.shadowPopover,
            padding: 6,
            maxHeight: 260,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter branches..."
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: 12,
              border: `1px solid ${colors.border}`,
              borderRadius: 4,
              outline: "none",
              background: colors.bgSurface,
              color: colors.text,
              fontFamily: "inherit",
              boxSizing: "border-box",
              marginBottom: 4,
            }}
          />
          <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
            {filtered.length === 0 ? (
              <p style={{ fontSize: 12, color: colors.textTertiary, padding: "8px 10px", margin: 0 }}>
                No matching branches.
              </p>
            ) : (
              filtered.map((b) => (
                <BranchRow
                  key={b}
                  name={b}
                  isSelected={b === value}
                  isCurrent={b === currentBranch}
                  onSelect={handleSelect}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const BranchPicker = React.memo(BranchPickerComponent);
