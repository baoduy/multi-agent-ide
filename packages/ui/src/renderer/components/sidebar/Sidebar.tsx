import React, { useCallback, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { useRepoStore } from "../../store/repoStore";
import { useSpecStore } from "../../store/specStore";
import { useConfigStore } from "../../store/configStore";
import { useSessionStore } from "../../store/sessionStore";
import { SessionCoordinator } from "../../services/SessionCoordinator";
import { RepoList } from "./RepoList";
import { SpecTree } from "./SpecTree";
import { colors } from "../../utils/colors";

/* ── Constants ── */

const MIN_SPEC_HEIGHT = 80;
const DEFAULT_SPEC_HEIGHT = 220;
const HANDLE_HEIGHT = 5;

export function Sidebar(): React.ReactElement {
  const activeRepoPath = useRepoStore((state) => state.activeRepoPath);
  const specs = useSpecStore((state) => state.specs);
  const selectedSpecPath = useSpecStore((state) => state.selectedSpecPath);
  const isLoading = useSpecStore((state) => state.isLoading);
  const fetchSpecs = useSpecStore((state) => state.fetchSpecs);
  const initializeSubscriptions = useSpecStore((state) => state.initializeSubscriptions);

  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const initializeConfigSubscriptions = useConfigStore((state) => state.initializeSubscriptions);

  const storedSpecPanelHeight = useSessionStore((state) => state.specPanelHeight);
  const patchSession = useSessionStore((state) => state.patchSession);

  const [specHeight, setSpecHeight] = useState(storedSpecPanelHeight ?? DEFAULT_SPEC_HEIGHT);

  /* ── Inline search state ── */
  const searchQuery = useRepoStore((state) => state.searchQuery);
  const setSearchQuery = useRepoStore((state) => state.setSearchQuery);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Sync from store on initial load
  useEffect(() => {
    if (storedSpecPanelHeight !== null) setSpecHeight(storedSpecPanelHeight);
  }, [storedSpecPanelHeight]);

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

  /* ── Horizontal resize logic ── */

  const clampHeight = useCallback((height: number): number => {
    const container = containerRef.current;
    if (!container) return height;
    const maxHeight = Math.floor(container.offsetHeight * 0.5);
    return Math.max(MIN_SPEC_HEIGHT, Math.min(height, maxHeight));
  }, []);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container || !draggingRef.current) return;
      const rect = container.getBoundingClientRect();
      const newHeight = clampHeight(rect.bottom - e.clientY);
      setSpecHeight(newHeight);
    },
    [clampHeight],
  );

  const onMouseUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    void patchSession({ specPanelHeight: specHeight });
  }, [specHeight, patchSession]);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const startHorizontalDrag = useCallback((_e: React.MouseEvent) => {
    draggingRef.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  const handleSelectSpec = useCallback((path: string | null) => {
    SessionCoordinator.selectSpec(path);
  }, []);

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
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
              onClick={() => {
                setSearchQuery("");
                searchInputRef.current?.focus();
              }}
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

      {/* Spec tree — resizable bottom section */}
      {activeRepoPath && (
        <>
          {/* Horizontal resize handle */}
          <HorizontalResizeHandle onDragStart={startHorizontalDrag} />

          <div
            style={{
              height: specHeight,
              minHeight: MIN_SPEC_HEIGHT,
              flexShrink: 0,
              overflowY: "auto",
            }}
          >
            <SpecTree
              specs={specs}
              isLoading={isLoading}
              selectedSpecPath={selectedSpecPath}
              onSelectSpec={handleSelectSpec}
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ── Horizontal resize handle component ── */

function HorizontalResizeHandle({
  onDragStart,
}: {
  onDragStart: (e: React.MouseEvent) => void;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      onMouseDown={onDragStart}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: HANDLE_HEIGHT,
        cursor: "row-resize",
        position: "relative",
        flexShrink: 0,
        borderTop: `1px solid ${colors.border}`,
        zIndex: 10,
      }}
    >
      {/* Highlight bar on hover */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 2,
          background: hovered ? colors.primary : "transparent",
          transition: "background 0.15s",
          borderRadius: 1,
        }}
      />
    </div>
  );
}
