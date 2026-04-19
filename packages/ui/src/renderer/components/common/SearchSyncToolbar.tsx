import React from "react";
import { RefreshCw, Search, X } from "lucide-react";

import { colors } from "../../utils/colors";

type SearchSyncToolbarProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSync: () => void;
  isSyncing: boolean;
  /**
   * When falsy, the sync button is disabled. Used to reflect "no repo
   * selected — can't scope the sync" without hiding the button entirely.
   */
  syncEnabled?: boolean;
  searchPlaceholder?: string;
  syncTitle?: string;
  syncAriaLabel?: string;
};

/**
 * Reusable search + manual-sync toolbar shared by the AI Sessions and
 * Worktrees views. The sync button is scoped to the currently-selected repo
 * by the caller — this component is purely presentational.
 */
export function SearchSyncToolbar({
  searchQuery,
  onSearchChange,
  onSync,
  isSyncing,
  syncEnabled = true,
  searchPlaceholder = "Search…",
  syncTitle = "Sync",
  syncAriaLabel = "Sync",
}: SearchSyncToolbarProps): React.ReactElement {
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
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
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
            onClick={() => onSearchChange("")}
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
