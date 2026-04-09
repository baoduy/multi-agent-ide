import React, { useCallback, useEffect, useRef, useState } from "react";

import { useRepoStore } from "../../store/repoStore";
import { useSpecStore } from "../../store/specStore";
import { useConfigStore } from "../../store/configStore";
import { useSessionStore } from "../../store/sessionStore";
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
  const setSelectedSpecPath = useSpecStore((state) => state.setSelectedSpecPath);
  const initializeSubscriptions = useSpecStore((state) => state.initializeSubscriptions);

  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const initializeConfigSubscriptions = useConfigStore((state) => state.initializeSubscriptions);

  const storedSpecPanelHeight = useSessionStore((state) => state.specPanelHeight);
  const updateSpecPanelHeight = useSessionStore((state) => state.updateSpecPanelHeight);

  const [showSettings, setShowSettings] = useState(false);
  const [specHeight, setSpecHeight] = useState(storedSpecPanelHeight ?? DEFAULT_SPEC_HEIGHT);

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
    void updateSpecPanelHeight(specHeight);
  }, [specHeight, updateSpecPanelHeight]);

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

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <SettingsDialog isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* Section header */}
      <div
        style={{
          padding: "14px 16px 10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
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
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 18,
            color: "#9a958c",
            padding: "4px 6px",
            borderRadius: 5,
            lineHeight: 1,
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
              onSelectSpec={setSelectedSpecPath}
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
