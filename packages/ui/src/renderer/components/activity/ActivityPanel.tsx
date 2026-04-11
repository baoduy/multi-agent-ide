import React, { useCallback, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { useSpecStore } from "../../store/specStore";
import { useRepoStore } from "../../store/repoStore";
import { SpecFileList } from "./SpecFileList";
import { MagentaTerminal, MagentaTerminalHandle } from "../common/MagentaTerminal";

/* ── Section wrapper ── */

function Section({
  title,
  children,
  action,
  style,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}): React.ReactElement {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderBottom: "1px solid #e5e2da",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: children ? 10 : 0,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#9a958c",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={title}
        >
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/* ── Legend dot ── */

function LegendItem({
  color,
  label,
}: {
  color: string;
  label: string;
}): React.ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 11, color: "#9a958c" }}>{label}</span>
    </div>
  );
}

/* ── Main panel ── */

type ActivityPanelProps = {
  onOpenFile?: (filePath: string) => void;
};

export function ActivityPanel({ onOpenFile }: ActivityPanelProps): React.ReactElement {
  const selectedSpecPath = useSpecStore((state) => state.selectedSpecPath);
  const specs = useSpecStore((state) => state.specs);
  const activeRepoPath = useRepoStore((state) => state.activeRepoPath);
  const terminalRef = useRef<MagentaTerminalHandle>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);

  const selectedSpec = specs.find((s) => s.path === selectedSpecPath) ?? null;

  const handleAddTerminal = useCallback(() => {
    if (!terminalOpen) {
      // First click — mount the component (it auto-creates tab 1)
      setTerminalOpen(true);
    } else {
      // Already mounted — ask the terminal to add a new tab
      terminalRef.current?.createTab();
    }
  }, [terminalOpen]);

  const handleAllTabsClosed = useCallback(() => {
    setTerminalOpen(false);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Spec Files */}
      {selectedSpec ? (
        <Section title={selectedSpec.name} style={{ flex: 1, overflowY: "auto", borderBottom: "none" }}>
          <SpecFileList files={selectedSpec.files} onOpenFile={onOpenFile} />
        </Section>
      ) : activeRepoPath ? (
        <Section title="Files">
          <div style={{ fontSize: 11, color: "#9a958c" }}>Select a spec to view its files.</div>
        </Section>
      ) : (
        <Section title="Files">
          <div style={{ fontSize: 11, color: "#9a958c" }}>Select a repository and spec.</div>
        </Section>
      )}

      {/* Legend */}
      <Section title="Legend" style={{ flexShrink: 0, borderBottom: "none" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <LegendItem color="#C15F3C" label="Claude Code agent" />
          <LegendItem color="#3d7a2a" label="GitHub Copilot agent" />
          <LegendItem color="#d1cec6" label="Idle / queued" />
        </div>
      </Section>

      {/* Terminal — "+" button lives in the section title bar */}
      <Section
        title="Terminal"
        style={{ flexShrink: 0, borderBottom: "none" }}
        action={
          <button
            type="button"
            onClick={handleAddTerminal}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "2px",
              background: "transparent",
              border: "none",
              color: "#3d7a2a",
              cursor: "pointer",
              borderRadius: 4,
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#50a14f")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#3d7a2a")}
            title="New terminal"
          >
            <Plus size={14} strokeWidth={2} />
          </button>
        }
      >
        {terminalOpen ? (
          <MagentaTerminal
            ref={terminalRef}
            readonly={false}
            cwd={activeRepoPath ?? undefined}
            maxHeight={200}
            fontSize={9}
            fontFamily="'SF Mono', 'Fira Code', ui-monospace, monospace"
            enableTabs={true}
            onAllTabsClosed={handleAllTabsClosed}
          />
        ) : undefined}
      </Section>
    </div>
  );
}
