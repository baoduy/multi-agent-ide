import React, { useCallback, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";

import { useRepoStore } from "../../store/repoStore";
import { useSpecStore } from "../../store/specStore";
import { useConfigStore } from "../../store/configStore";
import { RepoList } from "./RepoList";
import { colors } from "../../utils/colors";

export function Sidebar(): React.ReactElement {
  const activeRepoPath = useRepoStore((state) => state.activeRepoPath);
  const fetchSpecs = useSpecStore((state) => state.fetchSpecs);
  const initializeSubscriptions = useSpecStore((state) => state.initializeSubscriptions);

  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const initializeConfigSubscriptions = useConfigStore((state) => state.initializeSubscriptions);

  /* ── Inline search state ── */
  const searchQuery = useRepoStore((state) => state.searchQuery);
  const setSearchQuery = useRepoStore((state) => state.setSearchQuery);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initializeSubscriptions();
    initializeConfigSubscriptions();
    void fetchConfig();
  }, [initializeSubscriptions, initializeConfigSubscriptions, fetchConfig]);

  useEffect(() => {
    if (activeRepoPath) {
      void fetchSpecs(activeRepoPath);
    }
  }, [activeRepoPath, fetchSpecs]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    searchInputRef.current?.focus();
  }, [setSearchQuery]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Unified search + repositories header */}
      <div
        style={{
          padding: "8px 10px 6px",
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          minHeight: 32,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: colors.bgPanel,
            borderRadius: 6,
            padding: "0 8px",
            border: `1px solid ${searchQuery ? colors.borderStrong : colors.border}`,
            height: 26,
            boxSizing: "border-box",
            transition: "border-color 0.15s",
          }}
        >
          <Search size={13} color={colors.textTertiary} strokeWidth={1.8} style={{ flexShrink: 0 }} />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearchQuery("");
                searchInputRef.current?.blur();
              }
            }}
            placeholder="Repositories"
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              outline: "none",
              fontSize: 12,
              color: colors.textStrong,
              padding: 0,
              lineHeight: "18px",
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={handleClearSearch}
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
              title="Clear search"
            >
              <X size={12} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {/* Repo list — fills remaining space */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 80 }}>
        <RepoList />
      </div>
    </div>
  );
}
