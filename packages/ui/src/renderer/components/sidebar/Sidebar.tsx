import React, { useCallback, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { useRepoStore } from "../../store/repoStore";
import { useSpecStore } from "../../store/specStore";
import { useConfigStore } from "../../store/configStore";
import { useSessionStore } from "../../store/sessionStore";
import { SessionCoordinator } from "../../services/SessionCoordinator";
import { RepoList } from "./RepoList";
import { SpecTree } from "./SpecTree";
import { SettingsDialog } from "../settings/SettingsDialog";

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

  const [showSettings, setShowSettings] = useState(false);
  const [specHeight, setSpecHeight] = useState(storedSpecPanelHeight ?? DEFAULT_SPEC_HEIGHT);

  /* ── Inline search state ── */
  const searchQuery = useRepoStore((state) => state.searchQuery);
  const setSearchQuery = useRepoStore((state) => state.setSearchQuery);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    // Focus after React re-renders
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  const closeSearch = useCallback(() => {
    setSearchQuery("");
    setSearchOpen(false);
  }, [setSearchQuery]);

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
      <SettingsDialog isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* Section header — label toggles into inline search */}
      <div
        style={{
          padding: "8px 10px 6px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
          minHeight: 32,
        }}
      >
        {searchOpen ? (
          /* ── Inline search input ── */
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "#f5f3ef",
              borderRadius: 6,
              padding: "0 8px",
              border: "1px solid #c5c0b8",
              height: 26,
              boxSizing: "border-box",
            }}
          >
            <Search size={13} color="#9a958c" strokeWidth={1.8} style={{ flexShrink: 0 }} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") closeSearch();
              }}
              onBlur={() => {
                if (!searchQuery) setSearchOpen(false);
              }}
              placeholder="Search repositories..."
              style={{
                flex: 1,
                border: "none",
                background: "transparent",
                outline: "none",
                fontSize: 12,
                color: "#2c2c2c",
                padding: 0,
                lineHeight: "18px",
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={closeSearch}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "1px",
                  lineHeight: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  color: "#9a958c",
                  borderRadius: 3,
                }}
                title="Clear search"
              >
                <X size={12} strokeWidth={2} />
              </button>
            )}
          </div>
        ) : (
          /* ── Label + search icon ── */
          <>
            <button
              type="button"
              onClick={openSearch}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "none",
                border: "1px solid transparent",
                cursor: "pointer",
                padding: "0 4px",
                borderRadius: 6,
                height: 26,
                boxSizing: "border-box",
                transition: "background 0.12s",
              }}
              title="Search repositories"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#eae8e1";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "none";
              }}
            >
              <Search size={11} color="#b5b0a6" strokeWidth={2} style={{ flexShrink: 0 }} />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#9a958c",
                }}
              >
                Repositories
              </span>
            </button>
          </>
        )}

        {/* Settings gear — always visible */}
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 16,
            color: "#9a958c",
            padding: "3px 5px",
            borderRadius: 5,
            lineHeight: 1,
            flexShrink: 0,
            transition: "color 0.15s, background 0.15s",
          }}
          title="Settings"
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#2c2c2c";
            e.currentTarget.style.background = "#e5e2da";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#9a958c";
            e.currentTarget.style.background = "none";
          }}
        >
          &#x2699;
        </button>
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
        borderTop: "1px solid #e5e2da",
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
          background: hovered ? "#C15F3C" : "transparent",
          transition: "background 0.15s",
          borderRadius: 1,
        }}
      />
    </div>
  );
}
