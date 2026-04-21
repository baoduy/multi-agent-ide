import React from "react";
import { RefreshCw, Search, X } from "lucide-react";

import { colors } from "../../utils/colors";

type ViewToolbarProps = {
  onSync: () => void;
  isSyncing: boolean;
  /**
   * When falsy, the sync button is disabled. Used to reflect "no repo
   * selected — can't scope the sync" without hiding the button entirely.
   */
  syncEnabled?: boolean;
  syncTitle?: string;
  syncAriaLabel?: string;
  /**
   * Custom left-side content (e.g. filter pills). When provided, overrides
   * the built-in search input.
   */
  leftSlot?: React.ReactNode;
  /** Built-in search input — rendered only when `leftSlot` is not provided. */
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
};

/**
 * Standard view toolbar shared by the Specs, Worktrees, and AI Sessions
 * main views. Always shows a refresh button on the right; the left region
 * is either a custom slot (filter pills) or an inline search input.
 */
export function ViewToolbar({
  onSync,
  isSyncing,
  syncEnabled = true,
  syncTitle = "Refresh",
  syncAriaLabel = "Refresh",
  leftSlot,
  searchQuery,
  onSearchChange,
  searchPlaceholder = "Search…",
}: ViewToolbarProps): React.ReactElement {
  const disabled = isSyncing || !syncEnabled;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 8px",
        borderBottom: `1px solid ${colors.border}`,
        flexShrink: 0,
      }}
    >
      <div style={{ flex: 1, display: "flex", alignItems: "center", minWidth: 0 }}>
        {leftSlot ?? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              borderRadius: 4,
              border: `1px solid ${colors.border}`,
              background: colors.bgMuted,
            }}
          >
            <Search size={12} color={colors.textTertiary} style={{ flexShrink: 0 }} />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery ?? ""}
              onChange={(e) => onSearchChange?.(e.target.value)}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 11,
                color: colors.text,
                padding: 0,
                lineHeight: "18px",
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange?.("")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: 0,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: colors.textTertiary,
                  flexShrink: 0,
                }}
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onSync}
        disabled={disabled}
        title={!syncEnabled ? "Select a repository to sync" : syncTitle}
        aria-label={syncAriaLabel}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 8px",
          fontSize: 11,
          color: disabled ? colors.textTertiary : colors.textSecondary,
          background: "transparent",
          border: `1px solid ${colors.border}`,
          borderRadius: 4,
          cursor: disabled ? "default" : "pointer",
          flexShrink: 0,
        }}
      >
        <RefreshCw
          size={12}
          style={{
            animation: isSyncing ? "spin 1s linear infinite" : undefined,
          }}
        />
      </button>
    </div>
  );
}
