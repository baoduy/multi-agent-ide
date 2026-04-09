import React from "react";

import { useSpecStore } from "../../store/specStore";
import { useRepoStore } from "../../store/repoStore";
import { SpecFileList } from "./SpecFileList";

/* ── Section wrapper ── */

function Section({
  title,
  children,
  style,
}: {
  title: string;
  children: React.ReactNode;
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
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#9a958c",
          marginBottom: 10,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={title}
      >
        {title}
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
      <span style={{ fontSize: 12, color: "#9a958c" }}>{label}</span>
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

  const selectedSpec = specs.find((s) => s.path === selectedSpecPath) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Spec Files */}
      {selectedSpec ? (
        <Section title={selectedSpec.name} style={{ flex: 1, overflowY: "auto", borderBottom: "none" }}>
          <SpecFileList files={selectedSpec.files} onOpenFile={onOpenFile} />
        </Section>
      ) : activeRepoPath ? (
        <Section title="Files">
          <div style={{ fontSize: 12, color: "#9a958c" }}>Select a spec to view its files.</div>
        </Section>
      ) : (
        <Section title="Files">
          <div style={{ fontSize: 12, color: "#9a958c" }}>Select a repository and spec.</div>
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
    </div>
  );
}
